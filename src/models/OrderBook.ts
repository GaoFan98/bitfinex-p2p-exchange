import {v4 as uuidv4} from 'uuid';
import {Order, OrderType, OrderStatus} from './Order';

export interface OrderMatch {
    id: string;
    buyOrder: Order;
    sellOrder: Order;
    matchedAmount: number;
    price: number;
    timestamp: number;
}

export interface OrderSubmissionResult {
    order: Order;
    matches: OrderMatch[];
    remainingOrder: Order | null;
}

export class OrderBookError extends Error {
    constructor(message: string, public readonly code: string) {
        super(message);
        this.name = 'OrderBookError';
    }
}

export interface OrderBookState {
    buyOrders: Order[];
    sellOrders: Order[];
    matches: OrderMatch[];
}

export class OrderBook {
    private readonly buyOrders: Order[] = [];
    private readonly sellOrders: Order[] = [];
    private readonly matches: OrderMatch[] = [];


    public addOrder(order: Order): OrderSubmissionResult {
        if (!order) {
            throw new OrderBookError('Cannot add null order', 'NULL_ORDER');
        }

        if (!order.isActive()) {
            throw new OrderBookError(`Cannot add order with status ${order.status}`, 'INVALID_ORDER_STATUS');
        }

        if (this.findOrderById(order.id)) {
            throw new OrderBookError(`Order with ID ${order.id} already exists`, 'DUPLICATE_ORDER_ID');
        }

        const matches: OrderMatch[] = [];
        let remainingOrder: Order | null = order;
        const matchingOrders = this.findMatchingOrders(order);

        // Sort matching orders by price (best price first), then by timestamp (oldest first),
        // then by ID (for determinism when orders have same price and timestamp)
        if (order.type === OrderType.BUY) {
            matchingOrders.sort((a, b) => {
                const priceDiff = a.price - b.price;
                if (priceDiff !== 0) return priceDiff;

                const timeDiff = a.timestamp - b.timestamp;
                if (timeDiff !== 0) return timeDiff;

                return a.id.localeCompare(b.id);
            });
        } else {
            matchingOrders.sort((a, b) => {
                const priceDiff = b.price - a.price;
                if (priceDiff !== 0) return priceDiff;

                const timeDiff = a.timestamp - b.timestamp;
                if (timeDiff !== 0) return timeDiff;

                return a.id.localeCompare(b.id);
            });
        }

        for (const matchingOrder of matchingOrders) {
            if (!remainingOrder || !remainingOrder.isActive()) {
                break;
            }

            if (!matchingOrder.isActive()) {
                continue;
            }

            const matchAmount = Math.min(remainingOrder.amount, matchingOrder.amount);
            const matchPrice = matchingOrder.price;

            const match: OrderMatch = {
                id: uuidv4(),
                buyOrder: order.type === OrderType.BUY ? remainingOrder : matchingOrder,
                sellOrder: order.type === OrderType.SELL ? remainingOrder : matchingOrder,
                matchedAmount: matchAmount,
                price: matchPrice,
                timestamp: Date.now()
            };

            if (!this.isValidMatch(match)) {
                console.warn('Skipping invalid match:', match);
                continue;
            }

            matches.push(match);
            this.matches.push(match);

            try {
                matchingOrder.updateAfterMatch(matchAmount);
                if (matchingOrder.status === OrderStatus.FILLED) {
                    if (order.type === OrderType.BUY) {
                        this.removeOrder(this.sellOrders, matchingOrder.id);
                    } else {
                        this.removeOrder(this.buyOrders, matchingOrder.id);
                    }
                }

                remainingOrder.updateAfterMatch(matchAmount);
                if (remainingOrder.status === OrderStatus.FILLED) {
                    remainingOrder = null;
                    break;
                }
            } catch (err) {
                console.error('Error updating orders after match:', err);
            }
        }

        if (remainingOrder && remainingOrder.isActive()) {
            if (order.type === OrderType.BUY) {
                this.buyOrders.push(remainingOrder);
                this.sortBuyOrders();
            } else {
                this.sellOrders.push(remainingOrder);
                this.sortSellOrders();
            }
        }

        this.sortBuyOrders();
        this.sortSellOrders();

        return {
            order,
            matches,
            remainingOrder
        };
    }

    public cancelOrder(orderId: string): Order | undefined {
        if (!orderId) {
            throw new OrderBookError('Order ID is required', 'MISSING_ORDER_ID');
        }

        let order = this.removeOrder(this.buyOrders, orderId);
        if (!order) {
            order = this.removeOrder(this.sellOrders, orderId);
        }

        if (order) {
            try {
                order.cancel();
            } catch (err) {
                console.error(`Error cancelling order ${orderId}:`, err);
                throw new OrderBookError(`Failed to cancel order: ${(err as Error).message}`, 'CANCEL_ERROR');
            }
        }

        return order;
    }

    public getState(): OrderBookState {
        return {
            buyOrders: this.buyOrders.map(order => order.clone()),
            sellOrders: this.sellOrders.map(order => order.clone()),
            matches: [...this.matches]
        };
    }

    public setState(state: OrderBookState): void {
        if (!this.isValidState(state)) {
            throw new OrderBookError('Invalid orderbook state', 'INVALID_STATE');
        }

        this.buyOrders.length = 0;
        this.sellOrders.length = 0;
        this.matches.length = 0;

        this.buyOrders.push(...state.buyOrders);
        this.sellOrders.push(...state.sellOrders);
        this.matches.push(...state.matches);

        this.sortBuyOrders();
        this.sortSellOrders();
    }

    public findOrderById(orderId: string): Order | undefined {
        return this.buyOrders.find(o => o.id === orderId) ||
            this.sellOrders.find(o => o.id === orderId);
    }

    private findMatchingOrders(order: Order): Order[] {
        const orders = order.type === OrderType.BUY ? this.sellOrders : this.buyOrders;
        return orders.filter(o => o.canMatchWith(order)).map(o => o.clone());
    }

    private removeOrder(orders: Order[], orderId: string): Order | undefined {
        const index = orders.findIndex(o => o.id === orderId);
        if (index !== -1) {
            return orders.splice(index, 1)[0];
        }
        return undefined;
    }

    private sortBuyOrders(): void {
        this.buyOrders.sort((a, b) => {
            const priceDiff = b.price - a.price;
            if (priceDiff !== 0) return priceDiff;

            const timeDiff = a.timestamp - b.timestamp;
            if (timeDiff !== 0) return timeDiff;

            return a.id.localeCompare(b.id);
        });
    }

    private sortSellOrders(): void {
        this.sellOrders.sort((a, b) => {
            const priceDiff = a.price - b.price;
            if (priceDiff !== 0) return priceDiff;

            const timeDiff = a.timestamp - b.timestamp;
            if (timeDiff !== 0) return timeDiff;

            return a.id.localeCompare(b.id);
        });
    }

    private isValidState(state: unknown): state is OrderBookState {
        if (!state || typeof state !== 'object') {
            console.warn('Invalid state: not an object');
            return false;
        }

        const {buyOrders, sellOrders, matches} = state as Record<string, unknown>;

        if (!Array.isArray(buyOrders)) {
            console.warn('Invalid state: buyOrders is not an array');
            return false;
        }

        if (!Array.isArray(sellOrders)) {
            console.warn('Invalid state: sellOrders is not an array');
            return false;
        }

        if (!Array.isArray(matches)) {
            console.warn('Invalid state: matches is not an array');
            return false;
        }

        try {
            return true;
        } catch (error) {
            console.error('Error validating orderbook state:', error);
            return false;
        }
    }

    private isValidMatch(match: OrderMatch): boolean {
        if (!match || typeof match !== 'object') {
            console.error('Invalid match: not an object');
            return false;
        }

        if (!match.id || !match.buyOrder || !match.sellOrder ||
            match.matchedAmount === undefined || match.price === undefined ||
            match.timestamp === undefined) {
            console.error('Invalid match: missing required fields', {
                id: !!match.id,
                buyOrder: !!match.buyOrder,
                sellOrder: !!match.sellOrder,
                matchedAmount: match.matchedAmount !== undefined,
                price: match.price !== undefined,
                timestamp: match.timestamp !== undefined
            });
            return false;
        }

        if (match.buyOrder.type !== OrderType.BUY || match.sellOrder.type !== OrderType.SELL) {
            console.error('Invalid match: incorrect order types', {
                buyOrderType: match.buyOrder.type,
                sellOrderType: match.sellOrder.type
            });
            return false;
        }

        if (match.matchedAmount <= 0 ||
            match.matchedAmount > match.buyOrder.amount ||
            match.matchedAmount > match.sellOrder.amount) {
            console.error('Invalid match: invalid amount', {
                matchedAmount: match.matchedAmount,
                buyOrderAmount: match.buyOrder.amount,
                sellOrderAmount: match.sellOrder.amount
            });
            return false;
        }

        if (match.price <= 0 || match.sellOrder.price > match.buyOrder.price) {
            console.error('Invalid match: invalid price', {
                matchPrice: match.price,
                buyOrderPrice: match.buyOrder.price,
                sellOrderPrice: match.sellOrder.price
            });
            return false;
        }

        return true;
    }
}