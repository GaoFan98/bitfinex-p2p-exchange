import {PeerRPCClient, PeerRPCServer} from 'grenache-nodejs-http';
import Link from 'grenache-nodejs-link';
import {Order} from '../models/Order';
import {OrderBook, OrderMatch, OrderSubmissionResult} from '../models/OrderBook';
import {LoggerService, LogLevel} from './LoggerService';
import {Mutex} from 'async-mutex';

export enum ServiceAction {
    SUBMIT_ORDER = 'submitOrder',
    SYNC_ORDERBOOK = 'syncOrderbook',
    GET_ORDERBOOK = 'getOrderbook',
    ANNOUNCE_MATCH = 'announceMatch',
    CANCEL_ORDER = 'cancelOrder',
}

interface RPCResponse {
    status: string;
    state?: {
        buyOrders: unknown[];
        sellOrders: unknown[];
        matches: unknown[];
    };
    result?: unknown;
    match?: unknown;
    canceledOrder?: unknown;
    reason?: string;
}

interface RPCHandler {
    reply: (err: Error | null, response?: RPCResponse) => void;
}

interface TransportServer {
    listen: (port: number) => void;

    on(event: 'request', callback: (rid: string, key: string, payload: unknown, handler: RPCHandler) => void): void;

    unlisten: () => void;
}

interface RPCPayload {
    clientId: string;
    action: ServiceAction;
    data: Record<string, unknown>;
}

export interface P2PServiceOptions {
    grapeUrl: string;
    serviceName: string;
    port: number;
    clientId: string;
    logDir: string;
}

export class P2PServiceError extends Error {
    constructor(message: string, public readonly code: string) {
        super(message);
        this.name = 'P2PServiceError';
    }
}

export class P2PService {
    private readonly link: Link;
    private peer!: PeerRPCClient | PeerRPCServer;
    private service: TransportServer | null = null;
    private readonly orderbook: OrderBook;
    private readonly clientId: string;
    private readonly serviceName: string;
    private readonly port: number;
    private announceInterval: NodeJS.Timeout | null = null;
    private readonly isServer: boolean;
    private readonly logger: LoggerService;
    private orderMutex = new Mutex();

    constructor(options: P2PServiceOptions, orderbook: OrderBook, isServer = false) {
        this.orderbook = orderbook;
        this.clientId = options.clientId;
        this.serviceName = options.serviceName;
        this.port = options.port;
        this.isServer = isServer;

        this.logger = LoggerService.getInstance({
            logDir: options.logDir,
            logToConsole: true,
            logToFile: true,
            minLevel: LogLevel.INFO,
        });

        this.link = new Link({
            grape: options.grapeUrl,
        });

        this.logger.info('P2P Service initialized', {
            clientId: this.clientId,
            serviceName: this.serviceName,
            port: this.port,
            isServer: this.isServer,
        });
    }

    public async start(): Promise<void> {
        try {
            this.link.start();
            this.logger.info('Started Grenache link');

            if (this.isServer) {
                await this.startServer();
            } else {
                await this.startClient();
            }
        } catch (error) {
            this.logger.error('Failed to start P2P service', error as Error);
            throw new P2PServiceError('Failed to start P2P service', 'START_FAILED');
        }
    }

    private async startServer(): Promise<void> {
        this.logger.info('Initializing server...');

        this.peer = new PeerRPCServer(this.link, {
            timeout: 300000,
        });
        this.peer.init();

        const server = this.peer.transport('server') as TransportServer;
        if (!server || typeof server.listen !== 'function') {
            throw new P2PServiceError('Failed to create server transport', 'SERVER_INIT_FAILED');
        }

        this.service = server;
        this.service.listen(this.port);

        this.logger.info(`Server listening on port ${this.port}`);

        this.service.on('request', (rid: string, key: string, payload: unknown, handler: RPCHandler) => {
            this.logger.debug(`Received request: ${key}`);
            void this.handleRequest(rid, key, payload as RPCPayload, handler);
        });

        this.announceInterval = setInterval(() => {
            this.link.announce(this.serviceName, this.port, {});
            this.logger.debug(`Re-announced service ${this.serviceName} on port ${this.port}`);
        }, 1000);

        this.logger.info(`Started announcing service ${this.serviceName} on port ${this.port}`);

        await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    private async startClient(): Promise<void> {
        this.logger.info('Initializing client...');

        this.peer = new PeerRPCClient(this.link, {
            timeout: 30000
        });
        this.peer.init();

        this.logger.info('Waiting for servers to be ready...');

        await new Promise((resolve) => setTimeout(resolve, 10000));

        let syncSuccess = false;
        const maxSyncAttempts = 5;

        for (let attempt = 1; attempt <= maxSyncAttempts; attempt++) {
            try {
                this.logger.info(`Attempting initial sync (attempt ${attempt}/${maxSyncAttempts})...`);
                await this.syncOrderbook();
                this.logger.info('Initial sync completed successfully');
                syncSuccess = true;
                break;
            } catch (err) {
                this.logger.warn(`Initial sync attempt ${attempt} failed`, {
                    error: (err as Error).message
                });

                if (attempt < maxSyncAttempts) {
                    const delay = 2000 * Math.pow(1.5, attempt - 1);
                    this.logger.info(`Waiting ${delay}ms before next sync attempt...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        if (!syncSuccess) {
            this.logger.warn(`Initial sync failed after ${maxSyncAttempts} attempts, starting with empty orderbook`);
        }

        setInterval(() => {
            void this.syncOrderbook().catch((err) => {
                this.logger.warn('Periodic sync failed', {
                    error: (err as Error).message
                });
            });
        }, 5000);
    }

    public stop(): void {
        if (this.announceInterval) {
            clearInterval(this.announceInterval);
            this.announceInterval = null;
        }

        if (this.service) {
            try {
                this.service.unlisten();
            } catch (e) {
                this.logger.warn('Error stopping service');
            }
        }

        this.link.stop();
        this.logger.info('P2P service stopped');
    }

    public async submitOrder(order: Order): Promise<OrderSubmissionResult> {
        const release = await this.orderMutex.acquire();
        try {
            this.logger.info(`Submitting new order: ${order.id}`, {
                id: order.id,
                type: order.type,
                price: order.price,
                amount: order.amount
            });

            const result = this.orderbook.addOrder(order);

            const payload = {
                clientId: this.clientId,
                action: ServiceAction.SUBMIT_ORDER,
                data: {
                    order: order.toJSON()
                }
            };

            this.logger.debug('Broadcasting order to network', {orderId: order.id});

            try {
                await this.requestWithTimeout(payload);
                this.logger.debug('Order broadcast completed', {orderId: order.id});
            } catch (err) {
                this.logger.warn('Error broadcasting order, continuing with local result', {
                    error: (err as Error).message,
                    orderId: order.id
                });
            }

            return result;
        } finally {
            release();
        }
    }

    public async cancelOrder(orderId: string): Promise<Order | undefined> {
        const canceledOrder = this.orderbook.cancelOrder(orderId);

        if (canceledOrder && this.peer instanceof PeerRPCClient) {
            try {
                const payload: RPCPayload = {
                    action: ServiceAction.CANCEL_ORDER,
                    data: {orderId},
                    clientId: this.clientId,
                };

                await this.requestWithTimeout(payload);
                this.logger.info('Order cancellation broadcast successful', {orderId});
            } catch (err) {
                this.logger.error('Failed to broadcast order cancellation', err as Error);
                throw new P2PServiceError('Failed to broadcast order cancellation', 'CANCEL_FAILED');
            }
        }

        return canceledOrder;
    }

    public getOrderbookState() {
        const state = this.orderbook.getState();

        return {
            buyOrders: state.buyOrders.map(order => order.toJSON()),
            sellOrders: state.sellOrders.map(order => order.toJSON()),
            matches: state.matches.map(match => ({
                id: match.id,
                buyOrder: match.buyOrder.toJSON(),
                sellOrder: match.sellOrder.toJSON(),
                matchedAmount: match.matchedAmount,
                price: match.price,
                timestamp: match.timestamp
            }))
        };
    }

    private async syncOrderbook(): Promise<void> {
        try {
            if (this.peer instanceof PeerRPCClient) {
                this.logger.debug('Syncing orderbook from network');
                const payload: RPCPayload = {
                    clientId: this.clientId,
                    action: ServiceAction.GET_ORDERBOOK,
                    data: {}
                };

                const response = await this.requestWithTimeout(payload);

                if (response.status !== 'success' || !response.state) {
                    this.logger.warn('Sync response missing state or failed', {
                        status: response.status,
                        hasState: !!response.state
                    });
                    return;
                }

                if (!this.isValidState(response.state)) {
                    throw new Error('Invalid orderbook state format');
                }

                const matches = (response.state.matches || []).map(matchData => {
                    if (typeof matchData !== 'object' || !matchData) {
                        this.logger.warn('Invalid match data in response');
                        return null;
                    }

                    const match = matchData as Record<string, unknown>;

                    if (!match.buyOrder || !match.sellOrder ||
                        typeof match.buyOrder !== 'object' ||
                        typeof match.sellOrder !== 'object') {
                        this.logger.warn('Invalid order data in match');
                        return null;
                    }

                    try {
                        return {
                            id: match.id as string,
                            buyOrder: Order.fromObject(match.buyOrder as Record<string, unknown>),
                            sellOrder: Order.fromObject(match.sellOrder as Record<string, unknown>),
                            matchedAmount: Number(match.matchedAmount),
                            price: Number(match.price),
                            timestamp: Number(match.timestamp)
                        } as OrderMatch;
                    } catch (err) {
                        this.logger.warn('Failed to parse match data', {error: (err as Error).message});
                        return null;
                    }
                }).filter((m): m is OrderMatch => m !== null);

                const state = {
                    buyOrders: this.safelyMapOrders(response.state.buyOrders),
                    sellOrders: this.safelyMapOrders(response.state.sellOrders),
                    matches
                };

                this.orderbook.setState(state);
                this.logger.info('Orderbook synced successfully', {
                    buyOrders: state.buyOrders.length,
                    sellOrders: state.sellOrders.length,
                    matches: state.matches.length
                });
            }
        } catch (err) {
            this.logger.error('Sync error', err as Error);
            throw err;
        }
    }

    /**
     * Safely maps an array of unknown objects to Order instances
     * Improves error handling for malformed order data
     */
    private safelyMapOrders(orders: unknown[]): Order[] {
        // was trowing error when passing non-array
        if (!Array.isArray(orders)) {
            this.logger.warn('Expected array of orders but received non-array', {type: typeof orders});
            return [];
        }

        return orders
            .map((orderData: unknown) => {
                try {
                    if (!orderData || typeof orderData !== 'object') {
                        this.logger.warn('Invalid order data: not an object', {type: typeof orderData});
                        return null;
                    }

                    const data = orderData as Record<string, unknown>;
                    if (data.status === 'filled' && Number(data.amount) === 0) {
                        if (data.originalAmount && Number(data.originalAmount) > 0) {
                            return Order.fromObject(data);
                        } else {
                            this.logger.warn('Invalid filled order: missing or invalid originalAmount', {
                                amount: data.amount,
                                originalAmount: data.originalAmount
                            });
                            return null;
                        }
                    }

                    return Order.fromObject(data);
                } catch (error) {
                    this.logger.warn('Failed to parse order data', {
                        error: error instanceof Error ? error.message : 'Unknown error',
                        data: JSON.stringify(orderData)
                    });
                    return null;
                }
            })
            .filter((order): order is Order => order !== null);
    }

    private async handleRequest(_rid: string, _key: string, rawPayload: unknown, handler: RPCHandler): Promise<void> {
        try {
            if (!rawPayload || typeof rawPayload !== 'object') {
                this.logger.error('Invalid payload received', new Error('Invalid payload format'), {payload: rawPayload});
                return handler.reply(new Error('Invalid payload format'));
            }

            if (!this.isValidRPCPayload(rawPayload)) {
                this.logger.error('Invalid RPC payload', new Error('Invalid RPC payload format'), {payload: rawPayload});
                return handler.reply(new Error('Invalid RPC payload format'));
            }

            if (rawPayload.clientId === this.clientId) {
                return handler.reply(null, {status: 'skipped', reason: 'own request'});
            }

        } catch (err) {
            this.logger.error('Request handling error', err as Error);
            handler.reply(err as Error);
        }
    }

    private isValidRPCPayload(value: unknown): value is RPCPayload {
        if (!value || typeof value !== 'object') {
            return false;
        }

        const payload = value as Record<string, unknown>;

        return (
            typeof payload.clientId === 'string' &&
            typeof payload.action === 'string' &&
            Object.values(ServiceAction).includes(payload.action as ServiceAction) &&
            !!payload.data &&
            typeof payload.data === 'object'
        );
    }

    private isValidState(state: unknown): boolean {
        if (!state || typeof state !== 'object') {
            this.logger.debug('Invalid state: not an object', {state});
            return false;
        }

        const stateObj = state as Record<string, unknown>;

        if (!Array.isArray(stateObj.buyOrders) ||
            !Array.isArray(stateObj.sellOrders) ||
            !Array.isArray(stateObj.matches)) {
            this.logger.debug('Invalid state: arrays missing or not arrays', {
                hasBuyOrders: Array.isArray(stateObj.buyOrders),
                hasSellOrders: Array.isArray(stateObj.sellOrders),
                hasMatches: Array.isArray(stateObj.matches)
            });
            return false;
        }

        try {
            for (const order of stateObj.buyOrders) {
                if (!order || typeof order !== 'object') {
                    this.logger.debug('Invalid buy order in state', {order});
                    return false;
                }
            }

            for (const order of stateObj.sellOrders) {
                if (!order || typeof order !== 'object') {
                    this.logger.debug('Invalid sell order in state', {order});
                    return false;
                }
            }

            for (const match of stateObj.matches) {
                if (!match || typeof match !== 'object') {
                    this.logger.debug('Invalid match in state', {match});
                    return false;
                }

                const matchObj = match as Record<string, unknown>;

                if (!matchObj.id || !matchObj.buyOrder || !matchObj.sellOrder ||
                    matchObj.matchedAmount === undefined || matchObj.price === undefined) {
                    this.logger.debug('Invalid match: missing required fields', {match});
                    return false;
                }
            }

            return true;
        } catch (error) {
            this.logger.error('Error validating state', error as Error);
            return false;
        }
    }

    private async requestWithTimeout(
        payload: RPCPayload,
        timeout = 10000,
        maxRetries = 3,
        retryDelay = 1000,
    ): Promise<RPCResponse> {
        if (!(this.peer instanceof PeerRPCClient)) {
            throw new Error('P2P client not initialized');
        }

        const client = this.peer;
        let lastError: Error | null = null;
        let retryCount = 0;

        // Exponential backoff for retries
        const getBackoffDelay = (attempt: number) => {
            return retryDelay * Math.pow(1.5, attempt - 1);
        };

        // Increase max retries for better resilience
        maxRetries = 5;

        while (retryCount <= maxRetries) {
            try {
                if (retryCount > 0) {
                    const delay = getBackoffDelay(retryCount);
                    this.logger.debug(`Retry attempt ${retryCount}/${maxRetries} for ${payload.action}`, {
                        action: payload.action,
                        delay,
                        clientId: this.clientId
                    });
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                this.logger.debug(`Sending request: ${payload.action}`, {
                    serviceName: this.serviceName,
                    clientId: this.clientId
                });

                return await new Promise<RPCResponse>((resolve, reject) => {
                    const requestTimeout = setTimeout(() => {
                        reject(new Error(`Request timeout after ${timeout}ms`));
                    }, timeout);

                    client.request(
                        this.serviceName,
                        payload,
                        {timeout},
                        (err: Error | null, response: unknown) => {
                            clearTimeout(requestTimeout);

                            if (err) {
                                this.logger.debug(`Request error: ${err.message}`, {
                                    action: payload.action,
                                    error: err.message
                                });
                                reject(err);
                                return;
                            }

                            if (!response || typeof response !== 'object') {
                                reject(new Error('Invalid response format'));
                                return;
                            }

                            this.logger.debug(`Request successful: ${payload.action}`, {
                                action: payload.action
                            });
                            resolve(response as RPCResponse);
                        }
                    );
                });
            } catch (err) {
                lastError = err as Error;

                const isRetryable = !lastError.message.includes('Invalid') &&
                    !lastError.message.includes('INVALID');

                if (!isRetryable || retryCount >= maxRetries) {
                    this.logger.warn(`Request failed after ${retryCount} retries`, {
                        action: payload.action,
                        error: lastError.message,
                        isRetryable
                    });
                    break;
                }

                retryCount++;
            }
        }

        throw lastError || new Error('Unknown error in request');
    }
}