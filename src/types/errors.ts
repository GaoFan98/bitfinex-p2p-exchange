export class P2PExchangeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'P2PExchangeError';
    }
}

export class NetworkError extends P2PExchangeError {
    constructor(message: string, public readonly cause?: Error) {
        super(message);
        this.name = 'NetworkError';
    }
}

export class ServiceDiscoveryError extends P2PExchangeError {
    constructor(message: string) {
        super(message);
        this.name = 'ServiceDiscoveryError';
    }
}

export class OrderError extends P2PExchangeError {
    constructor(message: string) {
        super(message);
        this.name = 'OrderError';
    }
}

export class SyncError extends P2PExchangeError {
    constructor(message: string) {
        super(message);
        this.name = 'SyncError';
    }
}