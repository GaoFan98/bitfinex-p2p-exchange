import {getConfig} from './config';
import {Order, OrderType} from './models/Order';
import {OrderBook, OrderSubmissionResult} from './models/OrderBook';
import {P2PService, P2PServiceOptions} from './services/P2PService';
import {LoggerService, LogLevel} from './services/LoggerService';

const config = getConfig();

const logger = LoggerService.getInstance({
    logDir: './logs',
    logToConsole: true,
    logToFile: true,
    minLevel: LogLevel.INFO,
});

const orderbook = new OrderBook();

const p2pOptions: P2PServiceOptions = {
    grapeUrl: config.grapeUrl,
    serviceName: config.serviceName,
    port: config.nodePort,
    clientId: config.clientId,
    logDir: './logs',
};

const p2pService = new P2PService(p2pOptions, orderbook, false);

function createRandomOrder(): Order {
    const type = Math.random() > 0.5 ? OrderType.BUY : OrderType.SELL;
    const price = parseFloat((50 + Math.random() * 50).toFixed(2));
    const amount = parseFloat((1 + Math.random() * 10).toFixed(2));

    return new Order({
        type,
        price,
        amount,
        clientId: config.clientId,
    });
}

function displayOrderbook(): void {
    const state = orderbook.getState();

    logger.info('\n==== ORDERBOOK STATE ====');
    logger.info('BUY ORDERS:');
    state.buyOrders.forEach(order => {
        logger.info(`  ID: ${order.id.slice(0, 8)}, Price: $${order.price.toFixed(2)}, Amount: ${order.amount.toFixed(2)}, Client: ${order.clientId}`);
    });

    logger.info('\nSELL ORDERS:');
    state.sellOrders.forEach(order => {
        logger.info(`  ID: ${order.id.slice(0, 8)}, Price: $${order.price.toFixed(2)}, Amount: ${order.amount.toFixed(2)}, Client: ${order.clientId}`);
    });

    logger.info('\nRECENT MATCHES:');
    state.matches.slice(-5).forEach(match => {
        logger.info(`  Amount: ${match.matchedAmount.toFixed(2)}, Price: $${match.price.toFixed(2)}, Buy: ${match.buyOrder.id.slice(0, 8)}, Sell: ${match.sellOrder.id.slice(0, 8)}`);
    });
    logger.info('=========================\n');
}

async function main(): Promise<void> {
    logger.info(`Starting client with ID: ${config.clientId}`);

    try {
        await p2pService.start();
        logger.info('P2P service started, connected to Grape');

        logger.info('Initial orderbook state:');
        displayOrderbook();

        setInterval(async () => {
            try {
                const randomOrder = createRandomOrder();
                logger.info(`Submitting new ${randomOrder.type} order: $${randomOrder.price.toFixed(2)} x ${randomOrder.amount.toFixed(2)}`);

                const result: OrderSubmissionResult = await p2pService.submitOrder(randomOrder);

                if (result.matches.length > 0) {
                    logger.info(`Order matched with ${result.matches.length} existing orders!`);
                } else {
                    logger.info('Order added to the orderbook');
                }

                displayOrderbook();
            } catch (err) {
                logger.error('Error submitting order', err as Error);
            }
        }, 5000);

        setInterval(() => {
            displayOrderbook();
        }, 10000);

    } catch (err) {
        logger.error('Error starting client', err as Error);
        process.exit(1);
    }
}

process.on('SIGINT', () => {
    logger.info('Shutting down client...');
    p2pService.stop();
    process.exit(0);
});

process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', err);
    p2pService.stop();
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', reason as Error);
    p2pService.stop();
    process.exit(1);
});

void main();