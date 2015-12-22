import Deferred from './deferred';

export class Cancellation {
    //noinspection ReservedWordAsName
    static get default() {
        return new DefaultCancellation();
    }

    get canceled() {
        return !this._deferred.isPending;
    }

    get reason() {
        return this._reason;
    }

    constructor() {
        this._deferred = new Deferred();
        this._deferred.promise.then(
            (reason) => this._reason = reason);

        this.toJSON = function toJSON() {
            return {
                $type: 'Cancellation',
                canceled: this.canceled,
                reason: this.reason
            };
        };
    }

    then(handler) {
        return this._deferred.promise.then(handler);
    }

    owns(exception) {
        return exception instanceof OperationCanceledError
            && exception.cancellation == this;
    }

    assert() {
        if (this.canceled) {
            throw new OperationCanceledError(this, this.reason);
        }
    }
}

export class DefaultCancellation extends Cancellation {
    get canceled() {
        return false;
    }

    constructor() {
        super();
        this._deferred = {
            resolve: () => { },
            promise: new EmptyPromise()
        }
    }

    toJSON() {
        return {
            $type: 'DefaultCancellation'
        };
    }

    then() {
        return new EmptyPromise();
    }

    owns() {
        return false;
    }

    throwIfCanceled() {
    }
}

export class CancellationSource {
    get token() {
        return this._cancellation;
    }

    constructor() {
        this._cancellation = new Cancellation();
    }

    toJSON() {
        return {
            $type: 'CancellationSource',
            token: this.token
        };
    }

    cancel(reason) {
        this._cancellation._deferred.resolve(reason);
    }
}

export class OperationCanceledError extends Error {
    get cancellation() {
        return this._cancellation;
    }

    get cancellationReason() {
        return this._cancellationReason;
    }

    constructor(cancellation, reason) {
        super('Operation was canceled');
        this.name = this.constructor.name;
        this.message = 'Operation was canceled';
        Error.captureStackTrace(this, this.constructor.name);
        this._cancellation = cancellation;
        this._cancellationReason = reason;
    }

    toJSON() {
        return {
            name: this.name,
            stack: this.stack,
            message: this.message,
            cause: this.cause,
            inner: this.inner,
            cancellation: this.cancellation,
            cancellationReason: this.cancellationReason
        };
    }
}

export class EmptyPromise {
    //noinspection JSMethodCanBeStatic
    then() {
        return new EmptyPromise();
    }

    //noinspection JSMethodCanBeStatic,ReservedWordAsName
    catch() {
        return new EmptyPromise();
    }

    //noinspection JSMethodCanBeStatic
    chain() {
        return new EmptyPromise();
    }
}
