import _ from 'lodash';
import Deferred from './deferred';
import {trace} from './decorators';
import Log from './log';
import {AmqpConsumerError, AmqpConsumerCanceledError, AmqpConsumerCancelTimeoutError} from './errors';

export default class AmqpConsumer {
    get amqp() {
        return this.channel.amqp;
    }

    get channel() {
        return this._channel;
    }

    get queue() {
        return this._queue;
    }

    get completion() {
        return this._completion.promise;
    }

    get pending() {
        return this._pending;
    }

    get consumerTag() {
        return this._consumerTag;
    }

    get isOpen() {
        return this._completion.isPending && !this._dying;
    }

    constructor(channel, queue, handler) {
        this._channel = channel;
        this._queue = queue;
        this._handler = handler;
        this._completion = new Deferred();
        this._pending = [];

        this.toJSON = function toJSON() {
            return {
                $type: 'AmqpConsumer',
                queue: this.queue,
                consumerTag: this.consumerTag,
                completion: this._completion,
                isOpen: this.isOpen,
                handler: this._handler
            };
        };
    }

    @trace
    init(consumerTag) {
        this._consumerTag = consumerTag;
    }

    @trace
    async cancelAsync(err) {
        if (this.isOpen) {
            this._dying = true;

            await this._waitForPendingHandlersAsync();
            await this._cancelAsync();

            err ? this._completion.reject(err)
                : this._completion.resolve();
        }
    }

    @trace
    async _waitForPendingHandlersAsync() {
        const pending = new Deferred();
        Promise.all(this.pending).then(
            () => pending.resolve(),
            () => pending.resolve());
        setTimeout(() => pending.resolve(), 2000);
        await pending.promise;
    }

    @trace
    async _cancelAsync() {
        try {
            await new Promise((resolve, reject) => {
                setTimeout(() => {
                    reject(new AmqpConsumerCancelTimeoutError(this));
                }, 3000);

                this.channel._channel.cancel(this.consumerTag)
                    .then(() => resolve(), (err) => reject(err));
            });
        }
        catch (exc) {
            Log.warning(
                () => ({
                    msg: 'Failed to cancel AMQP consumer',
                    amqp: this.amqp,
                    channel: this.channel,
                    consumer: this,
                    exception: AmqpConsumerError.wrap(this, exc)
                }),
                (x) => `${x.message.msg} of ${x.message.consumer.queue} at ` +
                        `${x.message.amqp.uri}:\n${Log.format(x.message.exception)}`);
        }
    }

    @trace
    _handle(message) {
        if (!this.consumerTag) {
            process.nextTick(() => this._handle(message));
        }
        else if (message) {
            process.nextTick(() => this._handleAsync(message));
        }
        else {
            this.cancelAsync(new AmqpConsumerCanceledError(this));
        }
    }

    @trace
    async _handleAsync(message) {
        let pending;
        try {
            pending = new Promise((resolve) => {
                Object.setPrototypeOf(message, new AmqpMessage(this));
                resolve(this._handler(this, message));
            });
            this.pending.push(pending);
            //noinspection BadExpressionStatementJS
            await pending;
        }
        catch (exc) {
            const index = this.pending.indexOf(pending);
            (index >= 0) && this.pending.splice(index, 1);

            Log.error(
                () => ({
                    msg: 'Failed to handle AMQP message',
                    amqp: this.amqp,
                    channel: this.channel,
                    consumer: this,
                    message: message,
                    exception: exc
                }),
                (x) => `${x.message.msg} from ${x.message.consumer.queue} TAG=${x.message.message.fields.deliveryTag} at ${x.message.amqp.uri}:\n` +
                        Log.format(x.message.exception));

            try {
                this.channel._channel
                    .reject(message, !'requeue');
            }
            catch (exc2) {
                Log.warning(
                    () => ({
                        msg: 'Failed to dequeue AMQP message',
                        amqp: this.amqp,
                        channel: this.channel,
                        consumer: this,
                        message: message,
                        exception: exc2
                    }),
                    (x) => `${x.message.msg} from ${x.message.consumer.queue} at ${x.message.amqp.uri}:\n` +
                            Log.format(x.message.exception));
            }

            try {
                await this.cancelAsync(exc);
            }
            catch (ignore) {
            }
        }
    }
}

class AmqpMessage {
    get consumer() {
        return this._consumer;
    }

    get status() {
        return this._status || 'non-acked';
    }

    get redeliveredCount() {
        return (this.properties && this.properties.headers &&
            parseInt(this.properties.headers['x-redelivered-count'])) || 0;
    }

    constructor(consumer) {
        this._consumer = consumer;
    }

    toJSON() {
        return {
            fields: this.fields,
            properties: this.properties,
            content: this.content ? {
                $type: 'byte[]',
                length: this.content.length
            } : void 0
        };
    }

     @trace
    async ackAsync() {
        if (this.status !== 'non-acked') {
            throw new Error(`Can not ack message with status ${this.status}`);
        }
        try {
            this._status = 'acked';
            this.consumer.channel._channel.ack(this);
        }
        catch (exc) {
            throw AmqpConsumerError.wrap(this.consumer, exc);
        }
    }

    @trace
    async dequeueAsync() {
        if (this.status !== 'non-acked') {
            throw new Error(`Can not dequeue message with status ${this.status}`);
        }
        try {
            this._status = 'dequeued';
            this.consumer.channel._channel.reject(this, !'requeue');
        }
        catch (exc) {
            throw AmqpConsumerError.wrap(this.consumer, exc);
        }
    }

    @trace
    async requeueAsync() {
        if (this.status !== 'non-acked') {
            throw new Error(`Can not requeue message with status ${this.status}`);
        }
        try {
            this._status = 'requeued';
            this.consumer.channel._channel.reject(this, !!'requeue');
        }
        catch (exc) {
            throw AmqpConsumerError.wrap(this.consumer, exc);
        }
    }

    @trace
    async tryRequeueAsync() {
        if (this.status === 'non-acked') {
            await this.requeueAsync();
        }
    }

    @trace
    async redeliverAsync() {
        const properties = _.merge(this.properties, {
            headers: {'x-redelivered-count': this.redeliveredCount + 1}
        });

        await this.consumer
            .channel._channel.publish(
                this.fields.exchange,
                this.fields.routingKey,
                this.content, properties);

        await this.consumer
            .channel._channel
            .waitForConfirms();
    }
}
