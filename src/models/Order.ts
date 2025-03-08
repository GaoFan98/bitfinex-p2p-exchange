import {v4 as uuidv4} from 'uuid';
// TODO: move typings to separate file later

export enum OrderType {
    BUY = 'buy',
    SELL = 'sell',
}

export enum OrderStatus {
    OPEN = 'open',
    FILLED = 'filled',
    CANCELLED = 'cancelled',
}

export interface OrderData {
    id?: string;
    type: OrderType;
    price: number;
    amount: number;
    clientId: string;
    originalAmount?: number;
    timestamp?: number;
    status?: OrderStatus;
}

export class Order {
    public readonly id: string;
    public readonly type: OrderType;
    public readonly price: number;
    public readonly originalAmount: number;
    public readonly timestamp: number;
    public readonly clientId: string;
    private _amount: number;
    private _status: OrderStatus;

    constructor(data: OrderData) {

        this.id = data.id || uuidv4();
        this.type = data.type;
        this.price = data.price;
        this._amount = data.amount;
        this.originalAmount = data.originalAmount || data.amount;
        this.timestamp = data.timestamp || Date.now();
        this._status = data.status || OrderStatus.OPEN;
        this.clientId = data.clientId;
    }

    public get amount (): number {
        return this._amount;
    }

    public get status(): OrderStatus {
        return this._status;
    }

    public fill(amount: number): void {
        if (amount > this.amount) {
            throw new Error('Fill amount exceeds available amount');
        }

        this._amount -= amount;

        if (this.amount === 0) {
            this._status = OrderStatus.FILLED;
        } else {
            this._status = OrderStatus.CANCELLED;
        }
    }
}