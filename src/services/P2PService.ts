import {Link} from 'grenache-nodejs-link';
import {OrderBook} from '../models/OrderBook';

export interface P2PServiceOptions {
    grapeUrl: string;
    serviceName: string;
    port: number;
    clientId: string;
    logDir: string;
}

export class P2PService {
    private readonly link: Link;
    private port: number;
    private readonly orderbook: OrderBook;

    constructor(options: P2PServiceOptions, grapeUrl: string, orderbook: OrderBook,) {
        this.orderbook = orderbook;

        this.link = new Link({
            grape: grapeUrl
        });
        // initialize random port
        this.port = 1024 + Math.floor(Math.random() * 1000);
    }

    async start(): Promise<void> {
        try {
            this.link.start();
            console.log('Started Grenache link');

            // TODO: Initialize peer for either client or server
            await this.startServer()
        } catch (error) {
            console.error(error);
        }
    }

    private async startServer() {
        // TODO implement server start for PeerRPCServer
    }

    async stop(): Promise<void> {
        this.link.stop();
        console.log('Stopped Grenache link');
    }

    public async submitOrder(order: Order) {
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
}