// refer to https://github.com/bitfinexcom/grenache-nodejs-http
declare module 'grenache-nodejs-http' {
    import {Link} from 'grenache-nodejs-link';

    export interface PeerRPCServerOptions {
        timeout?: number;
    }

    export interface PeerRPCClientOptions {
        timeout?: number;
    }

    // refer to https://github.com/bitfinexcom/grenache-nodejs-http/blob/master/lib/PeerRPCServer.js
    export class PeerRPCServer {
        constructor(link: Link, options?: PeerRPCServerOptions);

        public init(): void;

        public transport(type: 'server'): any;
    }

    // refer to https://github.com/bitfinexcom/grenache-nodejs-http/blob/master/lib/PeerRPCClient.js
    export class PeerRPCClient {
        constructor(link: Link, options?: PeerRPCClientOptions);

        public init(): void;

        public request(
            key: string,
            payload: unknown,
            options: any,
            callback: (err: Error | null, data?: unknown) => void
        ): void;
    }
}