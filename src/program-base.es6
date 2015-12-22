import fs from 'fs';
import net from 'net';
import path from 'path';
import assert from 'assert';
import stringify from 'json-stringify-safe';
import AmqpClient from './amqp-client';
import Backend from './backend';
import {CancellationSource} from './cancellation';
import Config from './config';
import {trace} from './decorators';
import Deferred from './deferred';
import Log from './log';
import {ConsoleTarget, Logger, StreamTarget} from './logging';

export default class ProgramBase {
    get mixins() {
        return this._mixins;
    }

    get configDir() {
        return this._configDir;
    }

    get options() {
        return this._options;
    }

    get completion() {
        return this._completion.promise;
    }

    get cancellation() {
        return this._cancellation.token;
    }

    get backend() {
        return this._backend;
    }

    get amqp() {
        return this._amqp;
    }

    get channel() {
        return this._channel;
    }

    get consumer() {
        return this._consumer;
    }

    constructor(mixins, configDir) {
        this._mixins = mixins;
        this._configDir = configDir;
    }

    toJSON() {
        return {
            options: this.options,
            completion: this._completion,
            cancellation: this._cancellation,
            amqp: this.amqp,
            channel: this.channel,
            backend: this.backend,
            consumer: this.consumer
        };
    }

    async _setupAsync() {
        await this._setupLoggingAsync();
        await this._setupOptionsAsync();
    }

    async _setupLoggingAsync() {
        const consoleTarget = new ConsoleTarget();
        const traceFileTarget = this.mixins.trace &&
            new StreamTarget(fs.createWriteStream('./trace.log'));

        const traceLogger = new Logger();
        this.mixins.trace && traceLogger.targets.add(traceFileTarget);
        traceLogger.formatters.append({
            canFormat: (obj) => typeof (obj) !== 'function' && !(obj instanceof Error),
            format: (obj) => stringify(obj, null, 2)
        });
        trace.setup(traceLogger);

        const mainLogger = new Logger();
        mainLogger.targets.add(consoleTarget);
        mainLogger.formatters.append({
            canFormat: (obj) => typeof (obj) !== 'function' && !(obj instanceof Error),
            format: (obj) => stringify(obj, null, 2)
        });
        Log.setup(mainLogger);
    }

    @trace
    async _setupOptionsAsync() {
        const options = await Config.getOptionsAsync(this.configDir);
        assert(options, 'options');
        await this._assertOptionsAsync(options);
        this._options = options;
    }

    @trace
    async _assertOptionsAsync(options) {
        this.mixins.healthCheck && this._assertHealthCheckOptions(options, this.mixins.healthCheck);
        this.mixins.amqp && this._assertAmqpOptions(options, this.mixins.amqp);
        this.mixins.backend && this._assertBackendOptions(options, this.mixins.backend);
    }

    //noinspection JSMethodCanBeStatic
    @trace
    _assertHealthCheckOptions(options) {
        assertType(options.healthCheck, 'object', 'options.healthCheck');
        assertType(options.healthCheck.port, 'number', 'options.healthCheck.port');
    }

    //noinspection JSMethodCanBeStatic
    @trace
    _assertAmqpOptions(options, {queue, exchange, routingKey, prefetch}) {
        assertType(options.amqp, 'object', 'options.amqp');
        assertType(options.amqp.uri, 'string', 'options.amqp.uri');

        queue && assertType(options.amqp.queue, 'string', 'options.amqp.queue');
        exchange && assertType(options.amqp.exchange, 'string', 'options.amqp.exchange');
        routingKey && assertType(options.amqp.routingKey, 'string', 'options.amqp.routingKey');
        queue && assertType(options.amqp.maxRedeliveredCount, 'number', 'options.amqp.maxRedeliveredCount');
        prefetch && assertType(options.amqp.prefetch, 'number', 'options.amqp.prefetch');
    }

    //noinspection JSMethodCanBeStatic
    @trace
    async _assertBackendOptions(options) {
        assertType(options.backend, 'object', 'options.backend');
        assertType(options.backend.uri, 'string', 'options.backend.uri');
        assertType(options.backend.key, 'string', 'options.backend.key');
    }

    @trace
    start() {
        assertType(this.options, 'object', 'this.options');

        Log.info(
            () => ({
                msg: 'Starting',
                app: this
            }),
            (x) => x.message.msg);

        this._completion = new Deferred();
        this._cancellation = new CancellationSource();
        this._runAsync();
    }

    //noinspection JSUnusedGlobalSymbols
    @trace
    async stopAsync() {
        Log.info(
            () => ({
                msg: 'Stopping',
                app: this
            }),
            (x) => x.message.msg);

        this._cancellation.cancel();
        await this.completion;
    }

    @trace
    async _runAsync() {
        try {
            this.cancellation.assert();
            if (this.mixins.backend) {
                this._backend = new Backend(
                    this.options.backend.uri,
                    this.options.backend.key);
            }
            try {
                this.cancellation.assert();
                if (this.mixins.amqp) {
                    this._amqp = new AmqpClient(this.options.amqp.uri);
                    await this.amqp.openAsync();
                }
                try {
                    this.cancellation.assert();
                    if (this.mixins.amqp) {
                        this._channel = await this.amqp.channelAsync(!!'confirm');
                    }
                    try {
                        this.cancellation.assert();

                        if (this.mixins.amqp.prefetch) {
                            await this.channel.prefetchAsync(this.options.amqp.prefetch);
                        }

                        Log.info(
                            () => ({
                                msg: 'Started',
                                app: this
                            }),
                            (x) => x.message.msg);

                        if (this.mixins.healthCheck) {
                            await this._beginHealthCheckAsync();
                        }
                        try {
                            await this._mainAsync();
                        }
                        finally {
                            if (this.mixins.healthCheck) {
                                await this._endHealthCheckAsync();
                            }
                        }
                        this._completion.resolve();
                    }
                    finally {
                        if (this.mixins.amqp) {
                            await this.channel.closeAsync();
                        }
                    }
                }
                finally {
                    if (this.mixins.amqp) {
                        await this.amqp.closeAsync();
                    }
                }
            }
            finally {
                if (this.mixins.backend) {
                }
            }
        }
        catch (exc) {
            Log.error(
                () => ({
                    msg: 'Fatal error',
                    app: this,
                    exception: exc
                }),
                (x) => `${x.message.msg}:\n` +
                Log.format(x.message.exception));

            this._completion.reject(exc);
        }
        finally {
            Log.info(
                () => ({
                    msg: 'Stopped',
                    app: this
                }),
                (x) => x.message.msg);
        }
    }

    @trace
    async _mainAsync() {
    }

    @trace
    async _beginHealthCheckAsync() {
        await new Promise((resolve, reject) => {
            this._healthCheckSocket = net.createServer((connection) => {
                connection.end('alive\r\n');

            });
            this._healthCheckSocket.listen(
                this.options.healthCheck.port, (err) => {
                    err ? reject(err) : resolve();
                });
        });
    }

    @trace
    async _endHealthCheckAsync() {
        await new Promise((resolve) => {
            setTimeout(resolve, 5000);
            this._healthCheckSocket
                .close((err) => resolve());
        });
    }

    //noinspection JSUnusedGlobalSymbols
    @trace
    async _listenAsync(handler) {
        this.cancellation.assert();

        this._consumer = await this.channel.consumeAsync(this.options.amqp.queue,
            (consumer, message) => this._consumeAsync(message, handler), this.cancellation);

        this.cancellation.then(
            () => this.consumer.cancelAsync(),
            (err) => this.consumer.cancelAsync(err));

        await this.consumer.completion;
    }

    @trace
    async _consumeAsync(message, handler) {
        Log.info(
            () => ({
                msg: 'Received AMQP message',
                app: this,
                message: message
            }),
            (x) => `${x.message.msg} (TAG=${x.message.message.fields.deliveryTag}) ` +
                    `of ${x.message.app.consumer.queue} at ${x.message.app.amqp.uri}`);

        this.cancellation.assert();
        let error = null;
        try {
            await Promise.resolve(handler(message));
        }
        catch (exc) {
            await this._handleErrorAsync(message, exc);
            error = exc;
            throw exc;
        }
        finally {
            //await this._finalizeHandlerAsync(message, error);
        }
    }

    @trace
    async _handleErrorAsync(message) {
        if (message.redeliveredCount < this.options.amqp.maxRedeliveredCount) {
            try {
                await message.redeliverAsync();
            }
            catch (exc) {
                Log.warning(
                    () => ({
                        msg: 'Failed to redeliver AMQP message',
                        app: this,
                        message: message,
                        exception: exc
                    }),
                    (x) => `${x.message.msg} (TAG=${x.message.message.fields.deliveryTag}` +
                            `):\n${Log.format(x.message.exception)}`);
            }

            try {
                await message.ackAsync();
            }
            catch (exc) {
                Log.warning(
                    () => ({
                        msg: 'Failed to ack AMQP message after re-delivery',
                        app: this,
                        message: message,
                        exception: exc
                    }),
                    (x) => `Failed to ack AMQP message (TAG=${x.message.message.fields.deliveryTag}` +
                            `) after re-delivery:\n${Log.format(x.message.exception)}`);
            }
        }
        else {
            try {
                await message.dequeueAsync();
            }
            catch (exc) {
                Log.warning(
                    () => ({
                        msg: 'Failed to dequeue AMQP message',
                        app: this,
                        message: message,
                        exception: exc
                    }),
                    (x) => `${x.message.msg} (TAG=${x.message.message.fields.deliveryTag}` +
                            `):\n${Log.format(x.message.exception)}`);
            }
        }
    }

    @trace
    async _finalizeHandlerAsync(message, error) {
        let err = error;
        //try {
        //    await message.tryRequeueAsync();
        //}
        //catch (exc) {
        //    Log.error(
        //        () => ({
        //            msg: 'Failed to requeue AMQP message',
        //            app: this,
        //            message: message,
        //            exception: exc
        //        }),
        //        (x) => `${x.message.msg} (TAG=${x.message.message.fields.deliveryTag}` +
        //                `):\n${Log.format(x.message.exception)}`);
        //
        //    err || (err = exc);
        //}

        if (err) {
            //this._cancellation.cancel(error);
            throw err;
        }
    }
}

function assertType(obj, type, annotation) {
    assert(typeof (obj) === type, `${annotation} is ${type}`);
}
