declare module 'grenache-nodejs-link' {
    export interface LinkOptions {
        grape: string;
    }

    export interface AnnounceOptions {
        timeout?: number;
        interval?: number;
    }

    export class Link {
        constructor(options: LinkOptions);
        public start(): void;
        public stop(): void;
        public announce(name: string, port: number, options?: AnnounceOptions): void;
        public lookup(name: string, callback: (err: Error | null, data?: string[]) => void): void;
    }

    export default Link;
}