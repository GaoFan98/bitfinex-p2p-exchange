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
    const nodeType: NodeType = (process.env.NODE_TYPE as NodeType) || 'client';
    const grapeUrl = LOCALHOST_URL;
    // TODO: specfy node and client id, for now random is fine
    const nodePort =
        Math.floor(1024 + Math.random() * 1000);
    const clientId =`node-${randomUUID()}`;

    const serviceName = 'exchange_service';

    return {
        nodeType,
        grapeUrl,
        nodePort,
        clientId,
        serviceName
    };
}