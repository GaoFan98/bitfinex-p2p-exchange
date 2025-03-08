import {P2PService, ServiceAction} from './P2PService';
import {OrderBook, OrderMatch} from '../models/OrderBook';
import {Order, OrderType} from '../models/Order';
import path from 'path';
import os from 'os';
import {LoggerService} from './LoggerService';

jest.mock('grenache-nodejs-link');
jest.mock('grenache-nodejs-http');
jest.mock('../models/OrderBook');
jest.mock('../models/Order');
jest.mock('./LoggerService');

describe('P2PService', () => {
    let p2pService: P2PService;
    let mockOrderBook: jest.Mocked<OrderBook>;
    const tempDir = path.join(os.tmpdir(), 'p2p-service-test');
    const LOCALHOST_URL: string = 'http://127.0.0.1:30001';
    const mockOptions = {
        grapeUrl: LOCALHOST_URL,
        serviceName: 'test-service',
        port: 1337,
        clientId: 'test-client',
        logDir: tempDir
    };

    const mockBuyOrder = new Order({
        type: OrderType.BUY,
        price: 100,
        amount: 10,
        clientId: 'test-client'
    });

    const mockSellOrder = new Order({
        type: OrderType.SELL,
        price: 100,
        amount: 5,
        clientId: 'test-client'
    });

    const mockOrderMatch: OrderMatch = {
        id: 'match-1',
        buyOrder: mockBuyOrder,
        sellOrder: mockSellOrder,
        matchedAmount: 5,
        price: 100,
        timestamp: Date.now()
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockOrderBook = new OrderBook() as jest.Mocked<OrderBook>;
        mockOrderBook.addOrder = jest.fn().mockReturnValue({
            order: mockBuyOrder,
            matches: [mockOrderMatch],
            remainingOrder: null
        });
        mockOrderBook.cancelOrder = jest.fn().mockReturnValue(mockBuyOrder);
        mockOrderBook.getState = jest.fn().mockReturnValue({
            buyOrders: [mockBuyOrder],
            sellOrders: [mockSellOrder],
            matches: [mockOrderMatch]
        });

        // services mock
        (Order.fromObject as jest.Mock).mockImplementation((data) => {
            if (data.type === 'buy') return mockBuyOrder;
            return mockSellOrder;
        });
        (LoggerService.getInstance as jest.Mock).mockImplementation(() => ({
            info: jest.fn(),
            debug: jest.fn(),
            warn: jest.fn(),
            error: jest.fn()
        }));
        mockBuyOrder.toJSON = jest.fn().mockReturnValue({id: 'buy-1', type: 'buy'});
        mockSellOrder.toJSON = jest.fn().mockReturnValue({id: 'sell-1', type: 'sell'});
    });

    describe('Core P2P functionality', () => {
        test('submitting an order adds it to the orderbook and attempts to broadcast', async () => {
            p2pService = new P2PService(mockOptions, mockOrderBook, false);

            // Mock the requestWithTimeout method
            // @ts-ignore - private method mock
            p2pService.requestWithTimeout = jest.fn().mockResolvedValue({status: 'success'});
            const result = await p2pService.submitOrder(mockBuyOrder);

            expect(mockOrderBook.addOrder).toHaveBeenCalledWith(mockBuyOrder);
            // @ts-ignore - accessing private method
            expect(p2pService.requestWithTimeout).toHaveBeenCalledWith(
                expect.objectContaining({
                    action: ServiceAction.SUBMIT_ORDER
                })
            );

            expect(result).toEqual({
                order: mockBuyOrder,
                matches: [mockOrderMatch],
                remainingOrder: null
            });
        });

        test('should handle and recover from network errors during order submission', async () => {
            p2pService = new P2PService(mockOptions, mockOrderBook, false);

            // Mock the requestWithTimeout method to simulate network error
            // @ts-ignore - private method mock
            p2pService.requestWithTimeout = jest.fn().mockRejectedValueOnce(new Error('Network error'));

            const result = await p2pService.submitOrder(mockBuyOrder);

            expect(mockOrderBook.addOrder).toHaveBeenCalledWith(mockBuyOrder);
            // @ts-ignore - accessing private method
            expect(p2pService.requestWithTimeout).toHaveBeenCalled();
            expect(result).toEqual({
                order: mockBuyOrder,
                matches: [mockOrderMatch],
                remainingOrder: null
            });
        });

        test('should get orderbook state properly', () => {
            p2pService = new P2PService(mockOptions, mockOrderBook, false);

            const state = p2pService.getOrderbookState();

            expect(mockOrderBook.getState).toHaveBeenCalled();

            expect(state).toMatchObject({
                buyOrders: expect.any(Array),
                sellOrders: expect.any(Array),
                matches: expect.any(Array)
            });
        });

        test('should cancel an order locally', async () => {
            p2pService = new P2PService(mockOptions, mockOrderBook, true);

            const result = await p2pService.cancelOrder('test-order-id');

            expect(mockOrderBook.cancelOrder).toHaveBeenCalledWith('test-order-id');
            expect(result).toBe(mockBuyOrder);
        });
    });
});