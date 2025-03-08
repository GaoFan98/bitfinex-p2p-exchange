// refer to https://github.com/bitfinexcom/grenache-nodejs-link

declare module 'grenache-nodejs-http' {
    interface LinkOptions {
        grape: string
    }

    export class Link {
        constructor(options: LinkOptions)

        public start(): void;

        public stop(): void;

        public announce(name: string, port: number, options: any): void;

        public lookup(name: string, callback: (err: Error | null, data?: string[]) => void): void;
    }

    export default Link;
}