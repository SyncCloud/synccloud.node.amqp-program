import url from 'url';
import _ from 'lodash';
import request from 'request';
import Log from './log';

export default class Backend {
    get uri() {
        return this._uri;
    }

    get key() {
        return this._key;
    }

    constructor(uri, key) {
        this._uri = uri;
        this._key = key;

        this.toJSON = function toJSON() {
            return {
                $type: 'Backend',
                uri: this.uri,
                key: this.key
            }
        };
    }

    async uploadAsync(model) {
        return await this.request({
            method: 'POST',
            uri: 'api/email/upload',
            query: {
                key: this.key
            },
            form: void 0
        }, {
            json: false,
            formData: _.mapValues(
                model, (each) => ({
                    value: each.data,
                    filename: each.name,
                    contentType: each.type,
                    knownLength: each.length
                }))
        });
    }

    async taskAsync(model) {
        return await this.request({
            method: 'POST',
            uri: 'api/email/task',
            query: {
                key: this.key
            },
            form: model
        });
    }

    async replyAsync(model) {
        return await this.request({
            method: 'POST',
            uri: 'api/email/reply',
            query: {
                key: this.key
            },
            form: model
        });
    }

    async userAsync(email) {
        return await this.request({
            method: 'GET',
            uri: 'api/email/user',
            query: {
                key: this.key,
                email: email
            }
        });
    }

    async execute(commands) {
        const data = await this.request({
            method: 'POST',
            uri: 'api/email/execute',
            query: {
                key: this.key
            },
            form: _.zipObject(Object.entries(commands).filter(
                ([key, value]) => value && value.name)) // exclude falsy and non-command properties
        });

        Log.debug(
            () => ({
                msg: 'Received response from backend',
                response: data
            }),
            (x) => `Received response from backend: ${JSON.stringify(data, null, 2)}`);

        var errors = [],
            results = {},
            keys = Object.getOwnPropertyNames(commands);

        for (var i = 0, ii = keys.length; i < ii; ++i) {
            const key = keys[i];
            if (data.hasOwnProperty(key)) {
                const value = data[key];
                if (value && value.status === 'success') {
                    results[key] = value.data;
                }
                else {
                    errors.push(value && value.error);
                }
            }
            else {
                results[key] = commands[key];
            }
        }

        if (errors.length > 0) {
            const exc = new Error('Multiple errors have occured');
            exc.name = 'Aggregate Backend Error';
            exc.inner = errors;
            throw exc;
        }
        return results;
    }

    async request({method, uri, query, form}, options = {}) {
        return new Promise((resolve, reject) => {
            //const uriObj = url.parse(
            //    this.uri + '/' + uri,
            //    !!'parseQueryString');
            //_.merge(uriObj.query, query || {});

            Log.debug(
                () => ({
                    msg: 'Sending request to backend',
                    method: method,
                    base: this.uri,
                    uri: uri,
                    query: query,
                    form: form
                }),
                (x) => `Sending request to backend [${x.message.base}/${x.message.uri}] ${JSON.stringify(form, null, 2)}`);


            const opts = _.defaults({}, {
                baseUrl: this.uri,
                method: method,
                uri: uri,
                qs: query || {},
                body: form
            }, options || {}, {json: true});

            request(opts, (err, message, response) => {
                if (err) {
                    Log.error(
                        () => ({
                            msg: 'Backend request failed',
                            method: method,
                            base: this.uri,
                            uri: uri,
                            query: query,
                            form: form,
                            exception: err
                        }),
                        (x) => `${x.message.msg}:\n${Log.format(x.message.exception)}`);

                    reject(err);
                    return;
                }


                if (typeof (response) === 'object') {
                    Log.debug(
                        () => ({
                            msg: 'Backend response received',
                            method: method,
                            base: this.uri,
                            uri: uri,
                            query: query,
                            form: form,
                            response: response
                        }),
                        (x) => `${x.message.msg}: ${JSON.stringify(x.message.response, null, 2)}`);

                    if (response.result === 'ok') {
                        resolve(response.data);
                    }
                    else {
                        reject(response.error);
                    }
                }
                else {
                    Log.debug(
                        () => ({
                            msg: 'Backend response received',
                            method: method,
                            base: this.uri,
                            uri: uri,
                            query: query,
                            form: form,
                            response: response
                        }),
                        (x) => `${x.message.msg}: ${x.message.response}`);

                    resolve(response);
                }
            });
        });
    }
}
