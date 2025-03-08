import {Order, OrderStatus, OrderType} from './Order';
import {OrderBook} from './OrderBook';

describe('OrderBook', () => {
    let orderBook: OrderBook;
    const clientId = 'test-client';

    beforeEach(() => {
        orderBook = new OrderBook();
    });

    describe('addOrder', () => {
        it('should add a buy order to the book', () => {
            const order = new Order({
                type: OrderType.BUY,
                price: 100,
                amount: 10,
                clientId
            });

            const result = orderBook.addOrder(order);

            expect(result.matches).toHaveLength(0);
        });

        it('should match a buy order against an existing sell order', () => {
            const sellOrder = new Order({
                type: OrderType.SELL,
                price: 100,
                amount: 10,
                clientId: 'seller'
            });
            orderBook.addOrder(sellOrder);

            const buyOrder = new Order({
                type: OrderType.BUY,
                price: 100,
                amount: 5,
                clientId: 'buyer'
            });
            const result = orderBook.addOrder(buyOrder);

            expect(result.matches).toHaveLength(1);
            expect(result.matches[0].buyOrder.id).toBe(buyOrder.id);
            expect(result.matches[0].sellOrder.id).toBe(sellOrder.id);
            expect(result.matches[0].matchedAmount).toBe(5);
        });

        it('should partially match a buy order and add the remainder to the book', () => {
            const sellOrder = new Order({
                type: OrderType.SELL,
                price: 100,
                amount: 5,
                clientId: 'seller'
            });
            orderBook.addOrder(sellOrder);

            const buyOrder = new Order({
                type: OrderType.BUY,
                price: 100,
                amount: 10,
                clientId: 'buyer'
            });
            const result = orderBook.addOrder(buyOrder);

            expect(result.matches).toHaveLength(1);
            expect(result.matches[0].matchedAmount).toBe(5);
        });
    });

    describe('cancelOrder', () => {
        it('should cancel a buy order', () => {
            const order = new Order({
                type: OrderType.BUY,
                price: 100,
                amount: 10,
                clientId
            });
            orderBook.addOrder(order);

            const canceledOrder = orderBook.cancelOrder(order.id);

            expect(canceledOrder?.id).toBe(order.id);
            expect(canceledOrder?.status).toBe(OrderStatus.CANCELLED);
        });
    });

    describe('getState and setState', () => {
        it('should return the current state of the order book', () => {
            const buy1 = new Order({
                type: OrderType.BUY,
                price: 100,
                amount: 10,
                clientId: 'buyer1'
            });
            const sell1 = new Order({
                type: OrderType.SELL,
                price: 101,
                amount: 8,
                clientId: 'seller1'
            });

            orderBook.addOrder(buy1);
            orderBook.addOrder(sell1);

            const state = orderBook.getState();

            expect(state.buyOrders).toHaveLength(1);
            expect(state.sellOrders).toHaveLength(1);
        });
    });
});