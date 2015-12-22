import amqplib from 'amqplib';
import {Cancellation, CancellationSource} from './cancellation';
import Deferred from './deferred';
import {trace} from './decorators';
import Log from './log';
import {AmqpClientClosedError, AmqpClientCloseTimeoutError} from './errors';
import AmqpChannel from './amqp-channel';

export default class AmqpClient {
    static get defaultOptions() {
        return AmqpClient._defaultOptions || {
            replyQueue: false,
            timeout: 5000,
            heartbeat: 10
        };
    }

    static set defaultOptions(value) {
        AmqpClient._defaultOptions = value;
    }

    get uri() {
        return this._uri;
    }

    get channels() {
        return this._channels;
    }

    get completion() {
        return this._completion.promise;
    }

    get isOpen() {
        return this._completion.isPending && !this._dying;
    }

    constructor(uri) {
        this._uri = uri;

        this._channels = null;
        this._exceptions = null;
        this._completion = null;

        this.toJSON = function toJSON() {
            return {
                $type: 'AmqpClient',
                uri: this.uri,
                channels: this.channels,
                completion: this._completion,
                cancellation: this._cancellation,
                dying: this._dying
            };
        };
    }

    @trace
    async openAsync() {
        let cleanup = () => { };

        this._dying = false;
        this._channels = [];
        this._completion = new Deferred();

        this._clientClose = () => {
            this._completion.reject(
                new AmqpClientClosedError(this));
        };
        this._clientError = (err) => {
            Log.error(
                () => ({
                    msg: 'AMQP client error',
                    amqp: this,
                    exception: err
                }),
                (x) => `Error in AMQP connection to ${x.message.amqp.uri}:\n` +
                        Log.format(x.message.exception));

            this.closeAsync(err);
        };

        try {
            const client = this._client = await amqplib
                .connect(this.uri, AmqpClient.defaultOptions);

            this.completion.then(() => cleanup(), () => cleanup());
            this._client.on('close', this._clientClose);
            this._client.on('error', this._clientError);

            cleanup = () => {
                client.removeListener('close', this._clientClose);
                client.removeListener('error', this._clientError);
            };
        }
        catch (exc) {
            this._completion.reject(exc);
            throw exc;
        }
    }

    //noinspection JSMethodCanBeStatic
    @trace
    async closeAsync(err) {
        if (this.isOpen) {
            this._dying = true;

            setTimeout(() => this._completion.reject(
                new AmqpClientCloseTimeoutError(this)), 10000);

            this._clientClose = () => {
                err ? this._completion.reject(err)
                    : this._completion.resolve();
            };

            await Promise.all(this.channels.map(
                (channel) => channel.closeAsync(err)));

            try {
                await this._client.close();
            }
            catch (exc) {
                Log.warning(
                    () => ({
                        msg: 'Failed to close AMQP connection',
                        amqp: this,
                        exception: exc
                    }),
                    (x) => `${x.message.msg} to ${x.message.amqp.uri}:\n` +
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
    async channelAsync(confirm) {
        const channel = confirm
            ? await this._client.createConfirmChannel()
            : await this._client.createChannel();

        const result = new AmqpChannel(this, channel);
        this.channels.push(result);
        return result;
    }
}
