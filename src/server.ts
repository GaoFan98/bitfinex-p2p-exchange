import {getConfig} from './config';
import {OrderBook} from './models/OrderBook';
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

const p2pService = new P2PService(p2pOptions, orderbook, true);

function displayOrderbookSummary(): void {
    const state = orderbook.getState();
    logger.info('\n==== ORDERBOOK SUMMARY ====');
    logger.info(`Buy Orders: ${state.buyOrders.length}`);
    logger.info(`Sell Orders: ${state.sellOrders.length}`);
    logger.info(`Total Matches: ${state.matches.length}`);
    logger.info('============================\n');
}

async function main(): Promise<void> {
    logger.info(`Starting server with ID: ${config.clientId}`);
    logger.info(`Listening on port: ${config.nodePort}`);

    try {
        await p2pService.start();
        logger.info('P2P service started, connected to Grape');
        logger.info(`Announcing service: ${config.serviceName}`);

        setInterval(() => {
            displayOrderbookSummary();
        }, 10000);

    } catch (err) {
        logger.error('Error starting server', err as Error);
        process.exit(1);
    }
}

process.on('SIGINT', () => {
    logger.info('Shutting down server...');
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