import {v4 as uuidv4} from 'uuid';

export enum OrderType {
    BUY = 'buy',
    SELL = 'sell',
}

export enum OrderStatus {
    OPEN = 'open',
    FILLED = 'filled',
    PARTIALLY_FILLED = 'partially_filled',
    CANCELLED = 'cancelled',
}

export class OrderError extends Error {
    constructor(message: string, public readonly code: string) {
        super(message);
        this.name = 'OrderError';
    }
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
    private _version: number;

    constructor(data: OrderData) {
        this.validateInputs(data);

        this.id = data.id || uuidv4();
        this.type = data.type;
        this.price = data.price;
        this._amount = data.amount;
        this.originalAmount = data.originalAmount || data.amount;
        this.timestamp = data.timestamp || Date.now();
        this._status = data.status || OrderStatus.OPEN;
        this.clientId = data.clientId;
        this._version = 1;
    }

    public get amount(): number {
        return this._amount;
    }

    public get status(): OrderStatus {
        return this._status;
    }

    public updateAfterMatch(filledAmount: number): void {
        this.validateFilledAmount(filledAmount);

        this._amount -= filledAmount;
        this._version++;
        this.updateStatus();
    }

    public cancel(): void {
        if (this._status === OrderStatus.FILLED) {
            throw new OrderError('Cannot cancel a filled order', 'ORDER_FILLED');
        }
        this._status = OrderStatus.CANCELLED;
        this._version++;
    }

    public canMatchWith(order: Order): boolean {
        if (this.type === order.type) {
            return false;
        }

        if (!this.isActive() || !order.isActive()) {
            return false;
        }

        if (this.type === OrderType.BUY) {
            return this.price >= order.price;
        }

        return this.price <= order.price;
    }

    public isActive(): boolean {
        return this._status === OrderStatus.OPEN || this._status === OrderStatus.PARTIALLY_FILLED;
    }

    public clone(): Order {
        return new Order({
            id: this.id,
            type: this.type,
            price: this.price,
            amount: this._amount,
            clientId: this.clientId,
            originalAmount: this.originalAmount,
            timestamp: this.timestamp,
            status: this._status,
        });
    }

    public toJSON(): Record<string, unknown> {
        return {
            id: this.id,
            type: this.type,
            price: this.price,
            amount: this.amount,
            clientId: this.clientId,
            originalAmount: this.originalAmount,
            timestamp: this.timestamp,
            status: this.status,
            version: this._version
        };
    }

    public static isValidOrderData(data: Record<string, unknown>): boolean {
        try {
            console.debug('Validating order data:', JSON.stringify(data));

            if (!data || typeof data !== 'object') {
                console.warn('Invalid order data: not an object');
                return false;
            }

            if (!('type' in data) || !('clientId' in data)) {
                console.warn('Invalid order data: missing required fields (type or clientId)');
                return false;
            }

            const type = data.type as string;
            if (!Object.values(OrderType).includes(type as OrderType)) {
                console.warn(`Invalid order type: ${type}`);
                return false;
            }

            const isFilledOrder = data.status === OrderStatus.FILLED;
            if (isFilledOrder) {
                if (!('amount' in data)) {
                    console.warn('Invalid order data: missing amount field for filled order');
                    return false;
                }

                const amount = Number(data.amount);
                if (isNaN(amount) || amount < 0) {
                    console.warn(`Invalid amount for filled order: ${amount}`);
                    return false;
                }

                if (!('originalAmount' in data)) {
                    console.warn('Invalid filled order: missing originalAmount');
                    return false;
                }

                const originalAmount = Number(data.originalAmount);
                if (isNaN(originalAmount) || originalAmount <= 0) {
                    console.warn(`Invalid originalAmount for filled order: ${originalAmount}`);
                    return false;
                }
            } else {
                if (!('amount' in data)) {
                    console.warn('Invalid order data: missing amount field');
                    return false;
                }

                const amount = Number(data.amount);
                if (isNaN(amount) || amount <= 0) {
                    console.warn(`Invalid amount: ${amount}`);
                    return false;
                }
            }

            if (!('price' in data)) {
                console.warn('Invalid order data: missing price field');
                return false;
            }

            const price = Number(data.price);
            if (isNaN(price) || price <= 0) {
                console.warn(`Invalid price: ${price}`);
                return false;
            }

            if ('status' in data) {
                const status = data.status as string;
                if (!Object.values(OrderStatus).includes(status as OrderStatus)) {
                    console.warn(`Invalid order status: ${status}`);
                    return false;
                }
            }

            return true;
        } catch (error) {
            console.error('Error validating order data:', error);
            return false;
        }
    }

    public static fromObject(data: Record<string, unknown>): Order {
        try {
            if (!Order.isValidOrderData(data)) {
                console.error('Invalid order data in fromObject:', JSON.stringify(data));
                throw new OrderError('Invalid order data', 'INVALID_ORDER_DATA');
            }

            const orderData: OrderData = {
                type: data.type as OrderType,
                price: Number(data.price),
                amount: Number(data.amount),
                clientId: data.clientId as string,
            };

            if (data.id) {
                orderData.id = data.id as string;
            }
            if (data.originalAmount) {
                orderData.originalAmount = Number(data.originalAmount);
            }
            if (data.timestamp) {
                orderData.timestamp = Number(data.timestamp);
            }
            if (data.status) {
                orderData.status = data.status as OrderStatus;
            }

            if (data.status === OrderStatus.FILLED && Number(data.amount) === 0) {
                if (!data.originalAmount) {
                    throw new OrderError('Filled order with zero amount must have originalAmount', 'INVALID_FILLED_ORDER');
                }
            }

            return new Order(orderData);
        } catch (error) {
            console.error('Error in fromObject:', error instanceof Error ? error.message : 'Unknown error', {
                data: JSON.stringify(data)
            });
            throw error;
        }
    }

    private updateStatus(): void {
        if (this._amount === 0) {
            this._status = OrderStatus.FILLED;
        } else if (this._amount < this.originalAmount) {
            this._status = OrderStatus.PARTIALLY_FILLED;
        }
    }

    private validateInputs(data: OrderData): void {
        if (isNaN(data.price) || data.price <= 0) {
            throw new OrderError(`Invalid price: ${data.price}`, 'INVALID_PRICE');
        }
        const isFilledOrder = data.status === OrderStatus.FILLED;
        if (isNaN(data.amount)) {
            throw new OrderError(`Invalid amount: ${data.amount}`, 'INVALID_AMOUNT');
        }
        if (data.amount < 0 || (!isFilledOrder && data.amount === 0)) {
            throw new OrderError(`Invalid amount: ${data.amount}`, 'INVALID_AMOUNT');
        }
        if (typeof data.clientId !== 'string' || data.clientId.trim() === '') {
            throw new OrderError(`Invalid clientId: ${data.clientId}`, 'INVALID_CLIENT_ID');
        }
        if (!Object.values(OrderType).includes(data.type)) {
            throw new OrderError(`Invalid order type: ${data.type}`, 'INVALID_TYPE');
        }
        if (data.status && !Object.values(OrderStatus).includes(data.status)) {
            throw new OrderError(`Invalid status: ${data.status}`, 'INVALID_STATUS');
        }
    }

    private validateFilledAmount(filledAmount: number): void {
        if (isNaN(filledAmount)) {
            throw new OrderError(`Invalid filled amount: ${filledAmount}`, 'INVALID_FILLED_AMOUNT');
        }
        if (filledAmount <= 0) {
            throw new OrderError('Filled amount must be positive', 'NEGATIVE_FILLED_AMOUNT');
        }
        if (filledAmount > this._amount) {
            throw new OrderError(`Filled amount (${filledAmount}) exceeds available amount (${this._amount})`, 'FILLED_AMOUNT_EXCEEDS_AVAILABLE');
        }
    }
}