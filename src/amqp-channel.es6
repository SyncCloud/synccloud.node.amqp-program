import _ from 'lodash';
import {Cancellation, CancellationSource} from './cancellation';
import Deferred from './deferred';
import {trace} from './decorators';
import Log from './log';
import {AmqpChannelClosedError, AmqpChannelCloseTimeoutError} from './errors';
import AmqpConsumer from './amqp-consumer';

export default class AmqpChannel {
    get amqp() {
        return this._amqp;
    }

    get consumers() {
        return this._consumers;
    }

    get completion() {
        return this._completion.promise;
    }

    get isOpen() {
        return this._completion.isPending && !this._dying;
    }

    constructor(amqp, channel) {
        this._amqp = amqp;
        this._channel = channel;
        this._consumers = [];
        this._completion = new Deferred();
        this._dying = false;

        this._channelClose = (hadError) => {
            this._completion.reject(
                new AmqpChannelClosedError(this, hadError));
        };
        this._channelError = (err) => {
            Log.error(
                () => ({
                    msg: 'AMQP channel error',
                    amqp: this.amqp,
                    channel: this,
                    exception: err
                }),
                (x) => `${x.message.msg} on ${x.message.amqp.uri}:\n` +
                        Log.format(x.message.exception));

            this.closeAsync(err);
        };

        this._channel.on('close', this._channelClose);
        this._channel.on('error', this._channelError);

        this.toJSON = function toJSON() {
            return {
                $type: 'AmqpChannel',
                consumers: this.consumers,
                completion: this._completion
            };
        };
    }

    @trace
    async closeAsync(err) {
        if (this.isOpen) {
            this._dying = true;

            setTimeout(() => this._completion.reject(
                new AmqpChannelCloseTimeoutError(this)), 5000);

            this._clientClose = () => {
                err ? this._completion.reject(err)
                    : this._completion.resolve();
            };

            await Promise.all(this.consumers.map(
                (consumer) => consumer.cancelAsync(err)));

            if (typeof (this._channel.waitForConfirms) === 'function') {
                try {
                    await this._channel.waitForConfirms();
                }
                catch (exc) {
                    Log.warning(
                        () => ({
                            msg: 'Failed to wait for AMQP publish confirmations',
                            amqp: this.amqp,
                            channel: this,
                            exception: exc
                        }),
                        (x) => `${x.message.msg} on ${x.message.amqp.uri}:\n` +
                                Log.format(x.message.exception));
                }
            }

            try {
                await this._channel.close();
            }
            catch (exc) {
                Log.warning(
                    () => ({
                        msg: 'Failed to close AMQP channel',
                        amqp: this.amqp,
                        channel: this,
                        exception: exc
                    }),
                    (x) => `${x.message.msg} on ${x.message.amqp.uri}:\n` +
                            Log.format(x.message.exception));
            }
        }

        try {
            await this.completion;
        }
        catch (exc) {
            // ignore
        }
    }

    @trace
    async prefetchAsync(count) {
        await Promise.resolve(this._channel.prefetch(count));
    }

    @trace
    async publishAsync(exchange, routingKey, body, headers) {
        const deferred = new Deferred();
        const error = (err) => deferred.reject(err);
        this._channel.once('error', error);
        try {
            try {
                await this._channel.publish(
                    exchange, routingKey, body, {
                        persistent: true,
                        headers: headers || {}
                    });

                if (typeof (this._channel.waitForConfirms) === 'function') {
                    await this._channel.waitForConfirms();
                }
            }
            catch (exc) {
                deferred.reject(exc);
            }
            deferred.resolve();
            await deferred.promise;
        }
        finally {
            this._channel.removeListener('error', error);
        }
    }

    async publishAsync2({exchange, routingKey, body, options}) {
        const deferred = new Deferred();
        const error = (err) => deferred.reject(err);
        this._channel.once('error', error);
        try {
            try {
                await this._channel.publish(
                    exchange, routingKey, body, options);

                if (typeof (this._channel.waitForConfirms) === 'function') {
                    await this._channel.waitForConfirms();
                }
            }
            catch (exc) {
                deferred.reject(exc);
            }
            deferred.resolve();
            await deferred.promise;
        }
        finally {
            this._channel.removeListener('error', error);
        }
    }

    @trace
    async consumeAsync(queue, handler, options) {
        const consumer = new AmqpConsumer(this, queue, handler);
        const response = await this._channel.consume(
            queue, (message) => consumer._handle(message), options);
        consumer._consumerTag = response.consumerTag;
        this._consumers.push(consumer);
        return consumer;
    }

    @trace
    async handleRpcAsync(exchange, queue, routingKey, handler) {
        const response = await this._channel.assertQueue(
            queue, {exclusive: true, autoDelete: true});

        try {
            await this._channel.bindQueue(response.queue, exchange, routingKey);
            const consumer = await this.consumeAsync(response.queue, handler);

            const cleanup = async () => {
                try {
                    await this._channel.deleteQueue(response.queue);
                }
                catch (exc) {
                    Log.warning(
                        () => ({
                            msg: 'Failed to delete consumed RPC queue',
                            amqp: this.amqp,
                            channel: this,
                            exception: exc
                        }),
                        (x) => `${x.message.msg}:\n${Log.format(x.message.exception)}`);
                }
            };

            consumer.completion.then(cleanup, cleanup);
            return consumer;
        }
        catch (exc) {
            try {
                await this._channel.deleteQueue(response.queue);
            }
            catch (exc2) {
                Log.warning(
                    () => ({
                        msg: 'Failed to delete faulted RPC queue',
                        amqp: this.amqp,
                        channel: this,
                        exception: exc2
                    }),
                    (x) => `${x.message.msg}:\n${Log.format(x.message.exception)}`);
            }
            throw exc;
        }
    }
}
