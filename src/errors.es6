import _ from 'lodash';

Error.prototype.toJSON = function () {
    return {
        $type: 'Error',
        name: this.name,
        code: this.code,
        stack: this.stack,
        message: this.message,
        cause: this.cause,
        inner: this.inner
    };
};

export class ErrorBase extends Error {
    constructor(message, name) {
        super(message);
        Error.call(this, message);
        this.name = name || this.constructor.name;
        this.message = message;
    }
}

export class NotSupportedError extends ErrorBase {
    constructor() {
        super('Operation is not supported', 'NotSupportedError');
        Error.captureStackTrace(this, this.constructor);
    }
}

export class AggregateError extends ErrorBase {
    constructor(inner) {
        super('Multiple errors have occured', 'AggregateError');
        Error.captureStackTrace(this, this.constructor);
        this.inner = inner || [];
    }
}

export class TimeoutError extends ErrorBase {
    constructor() {
        super('Operation timed out', 'TimeoutError');
        Error.captureStackTrace(this, this.constructor);
    }
}

export class AmqpClientError extends ErrorBase {
    static wrap(amqp, cause) {
        const err = new AmqpClientError(
            amqp, 'AMQP client error', 'AmqpClientError', true);
        err.amqpStack = cause.stackAtStateChange || cause.amqpStack;
        err.cause = cause;
        return err;
    }

    constructor(amqp, message, name, capture) {
        super(message, name);
        this.amqp = amqp;
        capture && Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return _.merge(super.toJSON(), {
            $type: 'AmqpClientError',
            amqpStack: this.amqpStack,
            amqp: this.amqp
        });
    }
}

export class AmqpClientClosedError extends AmqpClientError {
    constructor(amqp) {
        super(amqp, 'AMQP server closed the connection', 'AmqpClientClosedError');
        Error.captureStackTrace(this, this.constructor);
    }
}

export class AmqpClientCloseTimeoutError extends AmqpClientError {
    constructor(amqp) {
        super(amqp, 'Failed to close AMQP connection in time', 'AmqpClientCloseTimeoutError');
        Error.captureStackTrace(this, this.constructor);
    }
}

export class AmqpChannelError extends AmqpClientError {
    static wrap(channel, cause) {
        const err = new AmqpChannelError(
            channel, 'AMQP channel error', 'AmqpChannelError', true);
        err.amqpStack = cause.stackAtStateChange || cause.amqpStack;
        err.cause = cause;
        return err;
    }

    constructor(channel, message, name, capture) {
        super(channel.amqp, message, name);
        this.channel = channel;
        capture && Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return _.merge(super.toJSON(), {
            $type: 'AmqpChannelError',
            channel: this.channel
        });
    }
}

export class AmqpChannelClosedError extends AmqpChannelError {
    constructor(channel, hadError) {
        super(channel, 'AMQP server closed the channel (ERROR: ' + (hadError ? 'YES' : 'NO') + ')', 'AmqpChannelClosedError');
        this.hadError = hadError;
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return _.merge(super.toJSON(), {
            $type: 'AmqpChannelClosedError',
            hadError: this.hadError
        });
    }
}

export class AmqpChannelCloseTimeoutError extends AmqpChannelError {
    constructor(channel) {
        super(channel, 'Failed to close AMQP channel in time', 'AmqpChannelCloseTimeoutError');
        Error.captureStackTrace(this, this.constructor);
    }
}

export class AmqpConsumerError extends AmqpChannelError {
    static wrap(consumer, cause) {
        const err = new AmqpConsumerError(
            consumer, 'AMQP consumer error', 'AmqpConsumerError', true);
        err.amqpStack = cause.stackAtStateChange || cause.amqpStack;
        err.cause = cause;
        return err;
    }

    constructor(consumer, message, name, capture) {
        super(consumer.channel, message, name);
        this.consumer = consumer;
        capture && Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return _.merge(super.toJSON(), {
            $type: 'AmqpConsumerError',
            consumer: this.consumer
        });
    }
}

export class AmqpConsumerCanceledError extends AmqpConsumerError {
    constructor(consumer) {
        super(consumer, 'Server canceled the AMQP consumer', 'AmqpConsumerCanceledError');
        Error.captureStackTrace(this, this.constructor);
    }
}

export class AmqpConsumerCancelTimeoutError extends AmqpConsumerError {
    constructor(consumer) {
        super(consumer, 'Failed to cancel AMQP consumer in time', 'AmqpConsumerCancelTimeoutError');
        Error.captureStackTrace(this, this.constructor);
    }
}
