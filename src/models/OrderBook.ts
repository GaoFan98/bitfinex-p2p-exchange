import {Order, OrderType} from './Order';

export class OrderBook {
    public buyOrders: Order[] = [];
    public sellOrders: Order[] = [];

    public addOrder(order: Order): void {
        if (order.type === OrderType.BUY) {
            this.buyOrders.push(order);
        } else {
            this.sellOrders.push(order);
        }
    }

    public removeOrder(orderId: string): boolean {
        const buyIndex = this.buyOrders.findIndex(o => o.id === orderId);
        if (buyIndex !== -1) {
            this.buyOrders.splice(buyIndex, 1);
            return true;
        }

        const sellIndex = this.sellOrders.findIndex(o => o.id === orderId);
        if (sellIndex !== -1) {
            this.sellOrders.splice(sellIndex, 1);
            return true;
        }

        return false;
    }

    public getOrder(orderId: string): Order | undefined {
        return this.buyOrders.find(o => o.id === orderId) ||
            this.sellOrders.find(o => o.id === orderId);
    }

    // TODO: Implement order matching logic
}