import { Order, OrderStatus, OrderType } from './Order';

describe('Order', () => {
    const clientId = 'test-client';

    describe('constructor', () => {
        it('should create a valid buy order', () => {
            const order = new Order({
                type: OrderType.BUY,
                price: 100,
                amount: 10,
                clientId
            });

            expect(order.id).toBeDefined();
            expect(order.type).toBe(OrderType.BUY);
            expect(order.price).toBe(100);
            expect(order.amount).toBe(10);
            expect(order.status).toBe(OrderStatus.OPEN);
            expect(order.clientId).toBe(clientId);
        });

        it('should create a valid sell order', () => {
            const order = new Order({
                type: OrderType.SELL,
                price: 100,
                amount: 10,
                clientId
            });

            expect(order.type).toBe(OrderType.SELL);
            expect(order.price).toBe(100);
        });

        it('should throw an error if price is less than or equal to zero', () => {
            expect(() => new Order({
                type: OrderType.BUY,
                price: 0,
                amount: 10,
                clientId
            })).toThrow();
        });
    });

    describe('updateAfterMatch', () => {
        it('should update the amount and status correctly for partial fill', () => {
            const order = new Order({
                type: OrderType.BUY,
                price: 100,
                amount: 10,
                clientId
            });
            order.updateAfterMatch(5);

            expect(order.amount).toBe(5);
            expect(order.status).toBe(OrderStatus.PARTIALLY_FILLED);
        });

        it('should update the amount and status correctly for complete fill', () => {
            const order = new Order({
                type: OrderType.BUY,
                price: 100,
                amount: 10,
                clientId
            });
            order.updateAfterMatch(10);

            expect(order.amount).toBe(0);
            expect(order.status).toBe(OrderStatus.FILLED);
        });
    });

    describe('canMatchWith', () => {
        it('should return true for compatible buy and sell orders', () => {
            const buyOrder = new Order({
                type: OrderType.BUY,
                price: 100,
                amount: 10,
                clientId: 'buyer'
            });
            const sellOrder = new Order({
                type: OrderType.SELL,
                price: 100,
                amount: 10,
                clientId: 'seller'
            });

            expect(buyOrder.canMatchWith(sellOrder)).toBe(true);
        });

        it('should return false for a buy order with lower price than sell order', () => {
            const buyOrder = new Order({
                type: OrderType.BUY,
                price: 90,
                amount: 10,
                clientId: 'buyer'
            });
            const sellOrder = new Order({
                type: OrderType.SELL,
                price: 100,
                amount: 10,
                clientId: 'seller'
            });

            expect(buyOrder.canMatchWith(sellOrder)).toBe(false);
        });
    });
});