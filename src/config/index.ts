import {randomUUID} from 'crypto';

type NodeType = 'server' | 'client';

export interface Config {
    nodeType: NodeType;
    grapeUrl: string;
    nodePort: number;
    clientId: string;
    serviceName: string;
}

const LOCALHOST_URL: string = 'http://127.0.0.1:30001'

export function getConfig(): Config {
    const nodeType = (process.env.NODE_TYPE as NodeType) || 'client';
    const grapeUrl = process.env.GRAPE_URL || LOCALHOST_URL;
    const nodePort = parseInt(process.env.NODE_PORT || '0', 10) ||
        Math.floor(1024 + Math.random() * 1000);
    const clientId = process.env.CLIENT_ID || `node-${randomUUID()}`;

    const serviceName = 'exchange_service';

    return {
        nodeType,
        grapeUrl,
        nodePort,
        clientId,
        serviceName
    };
}