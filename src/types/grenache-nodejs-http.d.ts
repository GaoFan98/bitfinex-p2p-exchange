// refer to https://github.com/bitfinexcom/grenache-nodejs-http
declare module 'grenache-nodejs-http' {
    import { Link } from 'grenache-nodejs-link';
    import { EventEmitter } from 'events';

    export interface PeerRPCServerOptions {
        timeout?: number;
    }

    export interface PeerRPCClientOptions {
        timeout?: number;
    }

    export interface RequestOptions {
        timeout?: number;
    }

    export interface TransportServer extends EventEmitter {
        listen(port: number): void;
        unlisten(): void;
        on(event: 'request', listener: (rid: string, key: string, payload: unknown, handler: ResponseHandler) => void): this;
    }

    export interface ResponseHandler {
        reply(err: Error | null, data?: unknown): void;
    }

    // refer to https://github.com/bitfinexcom/grenache-nodejs-http/blob/master/lib/PeerRPCServer.js
    export class PeerRPCServer {
        constructor(link: Link, options?: PeerRPCServerOptions);
        public init(): void;
        public transport(type: 'server'): TransportServer;
    }

    // refer to https://github.com/bitfinexcom/grenache-nodejs-http/blob/master/lib/PeerRPCClient.js
    export class PeerRPCClient {
        constructor(link: Link, options?: PeerRPCClientOptions);
        public init(): void;
        public request(
            key: string,
            payload: unknown,
            options: RequestOptions,
            callback: (err: Error | null, data?: unknown) => void
        ): void;
    }
} 