import {PeerRPCClient, PeerRPCServer} from 'grenache-nodejs-http';
import Link from 'grenache-nodejs-link';
import {Order} from '../models/Order';
import {OrderBook, OrderMatch, OrderSubmissionResult} from '../models/OrderBook';
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
    private orderMutex = new Mutex();

    constructor(options: P2PServiceOptions, orderbook: OrderBook, isServer = false) {
        this.orderbook = orderbook;
        this.clientId = options.clientId;
        this.serviceName = options.serviceName;
        this.port = options.port;
        this.isServer = isServer;
        this.link = new Link({
            grape: options.grapeUrl,
        });
    }

    public async start(): Promise<void> {
        try {
            this.link.start();

            if (this.isServer) {
                await this.startServer();
            } else {
                await this.startClient();
            }
        } catch (error) {
            throw new P2PServiceError('Failed to start P2P service', 'START_FAILED');
        }
    }

    private async startServer(): Promise<void> {
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

        this.service.on('request', (rid: string, key: string, payload: unknown, handler: RPCHandler) => {
            this.handleRequest(rid, key, payload as RPCPayload, handler);
        });

        this.announceInterval = setInterval(() => {
            this.link.announce(this.serviceName, this.port, {});
        }, 1000);

        await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    private async startClient(): Promise<void> {
        this.peer = new PeerRPCClient(this.link, {
            timeout: 30000
        });
        this.peer.init();

        await new Promise((resolve) => setTimeout(resolve, 10000));

        let syncSuccess = false;
        const maxSyncAttempts = 5;

        for (let attempt = 1; attempt <= maxSyncAttempts; attempt++) {
            try {
                await this.syncOrderbook();
                syncSuccess = true;
                break;
            } catch (err) {
                if (attempt < maxSyncAttempts) {
                    const delay = 2000 * Math.pow(1.5, attempt - 1);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
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
            }
        }

        this.link.stop();
    }

    public async submitOrder(order: Order): Promise<OrderSubmissionResult> {
        const release = await this.orderMutex.acquire();
        try {
            const result = this.orderbook.addOrder(order);

            const payload = {
                clientId: this.clientId,
                action: ServiceAction.SUBMIT_ORDER,
                data: {
                    order: order.toJSON()
                }
            };
            await this.requestWithTimeout(payload);

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
            } catch (err) {
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
                const payload: RPCPayload = {
                    clientId: this.clientId,
                    action: ServiceAction.GET_ORDERBOOK,
                    data: {}
                };

                const response = await this.requestWithTimeout(payload);

                // @ts-ignore
                const matches = (response.state.matches || []).map(matchData => {
                    if (typeof matchData !== 'object' || !matchData) {
                        return null;
                    }

                    const match = matchData as Record<string, unknown>;

                    if (!match.buyOrder || !match.sellOrder ||
                        typeof match.buyOrder !== 'object' ||
                        typeof match.sellOrder !== 'object') {
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
                        return null;
                    }
                }).filter((m): m is OrderMatch => m !== null);

                const state = {
                    buyOrders: this.safelyMapOrders(response.state.buyOrders),
                    sellOrders: this.safelyMapOrders(response.state.sellOrders),
                    matches
                };

                this.orderbook.setState(state);

            }
        } catch (err) {
            throw err;
        }
    }

    /**
     * Safely maps an array of unknown objects to Order instances
     * Improves error handling for malformed order data
     */
    private safelyMapOrders(orders: unknown[]): Order[] {
        return orders
            .map((orderData: unknown) => {
                try {
                    if (!orderData || typeof orderData !== 'object') {
                        return null;
                    }

                    const data = orderData as Record<string, unknown>;
                    if (data.status === 'filled' && Number(data.amount) === 0) {
                        if (data.originalAmount && Number(data.originalAmount) > 0) {
                            return Order.fromObject(data);
                        } else {
                            return null;
                        }
                    }

                    return Order.fromObject(data);
                } catch (error) {
                    return null;
                }
            })
            .filter((order): order is Order => order !== null);
    }

    private async handleRequest(_rid: string, _key: string, rawPayload: unknown, handler: RPCHandler): Promise<void> {
        try {
            if (!rawPayload || typeof rawPayload !== 'object') {
                return handler.reply(new Error('Invalid payload format'));
            }

            if (!this.isValidRPCPayload(rawPayload)) {
                return handler.reply(new Error('Invalid RPC payload format'));
            }

            if (rawPayload.clientId === this.clientId) {
                return handler.reply(null, {status: 'skipped', reason: 'own request'});
            }

        } catch (err) {
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

        maxRetries = 5;

        while (retryCount <= maxRetries) {
            try {
                if (retryCount > 0) {
                    const delay = getBackoffDelay(retryCount);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }

                return await new Promise<RPCResponse>((resolve, reject) => {
                    const requestTimeout = setTimeout(() => {
                        reject(new Error(`Request timeout after ${timeout}ms`));
                    }, timeout);

                    client.request(
                        this.serviceName,
                        payload,
                        {timeout},
                        (err: Error | null, response: unknown) => {
                            console.log(err)
                            clearTimeout(requestTimeout);

                            if (!response || typeof response !== 'object') {
                                reject(new Error('Invalid response format'));
                                return;
                            }

                            resolve(response as RPCResponse);
                        }
                    );
                });
            } catch (err) {
                lastError = err as Error;

                const isRetryable = !lastError.message.includes('Invalid') &&
                    !lastError.message.includes('INVALID');

                if (!isRetryable || retryCount >= maxRetries) {

                    break;
                }

                retryCount++;
            }
        }

        throw lastError || new Error('Unknown error in request');
    }
}