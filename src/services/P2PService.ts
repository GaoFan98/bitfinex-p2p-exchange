import {Link} from 'grenache-nodejs-link';

export class P2PService {
    private readonly link: Link;
    private port: number;

    constructor(grapeUrl: string) {
        this.link = new Link({
            grape: grapeUrl
        });
        // initialize random port
        this.port = 1024 + Math.floor(Math.random() * 1000);
    }

    async start(): Promise<void> {
        try{
            this.link.start();
            console.log('Started Grenache link');

            // TODO: Initialize peer for either client or server
            await this.startServer()
        } catch (error) {
            console.error(error);
        }
    }

    private async startServer() {
        // TODO implement server start for PeerRPCServer
    }

    async stop(): Promise<void> {
        this.link.stop();
        console.log('Stopped Grenache link');
    }
}