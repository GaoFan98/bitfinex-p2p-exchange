import {getConfig} from './config';
import {OrderBook} from './models/OrderBook';
import {P2PService, P2PServiceOptions} from './services/P2PService';

const config = getConfig();

const orderbook = new OrderBook();

const p2pOptions: P2PServiceOptions = {
    grapeUrl: config.grapeUrl,
    serviceName: config.serviceName,
    port: config.nodePort,
    clientId: config.clientId,
};

const p2pService = new P2PService(p2pOptions, orderbook, false);

process.on('SIGINT', () => {
    p2pService.stop();
    process.exit(0);
});
