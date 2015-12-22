import _ from 'lodash';
import fs from 'fs';
import path from 'path';
import Log from './log';
import request from 'request';

export default class Config {
    static async getOptionsAsync(rootPath) {
        const options = {};
        let success = false;

        if (await Config.fetchRemoteAsync(options)) {
            success = true;
        }
        if (await Config.fetchEnvironmentConfig(options)) {
            success = true;
        }
        if (rootPath && await Config.fetchSideBySideAsync(rootPath, options)) {
            success = true;
        }
        if (await Config.fetchWorkingDirAsync(options)) {
            success = true;
        }
        if (!success) {
            throw new Error('Unable to fetch configuration options');
        }
        const camelized = camelize(options);

        Log.info(
            () => ({
                msg: 'Configured',
                options: camelized
            }),
            (x) => `Configured options: ${JSON.stringify(x.message.options, null, 2)}`);

        return camelized;
    }

    static async fetchRemoteAsync(options) {
        if (!process.env.SYNCCLOUD_CONFIGURATION) {
            return;
        }

        Log.info(
            () => ({
                msg: 'Fetching remote configuration options',
                uri: process.env.SYNCCLOUD_CONFIGURATION
            }),
            (x) => `${x.message.msg} from ${x.message.uri}`);

        try {
            return await new Promise((resolve, reject) => {
               request.get({url: process.env.SYNCCLOUD_CONFIGURATION, json: true}, function (err, resp, body) {
                    if (err) {
                        reject(err);
                        return;
                    }
                    _.merge(options, body);
                    resolve(true);
               });
            });
        }
        catch (exc) {
            Log.warning(
                () => ({
                    msg: 'Failed to read remote options',
                    uri: process.env.SYNCCLOUD_CONFIGURATION,
                    exception: exc
                }),
                (x) => `${x.message.msg} from ${x.message.uri}:\n`
                        + `${Log.format(x.message.exception)}`);
        }
        return false;
    }

    static async fetchSideBySideAsync(rootPath, options) {
        try {
            return await new Promise((resolve, reject) => {
                const filePath = path.join(rootPath, 'options.json');
                fs.readFile(filePath, {encoding: 'utf8'}, (err, data) => {
                    if (err) {
                        err.code === 'ENOENT' ? resolve(false) : reject(err);
                    }
                    else {
                        try {
                            _.merge(options, JSON.parse(data));
                            resolve(true);
                        }
                        catch (exc) {
                            reject(exc);
                        }
                    }
                });
            });
        }
        catch (exc) {
            Log.warning(
                () => ({
                    msg: 'Failed to read side-by-side configuration options',
                    path: path.join(rootPath, './options.json'),
                    exception: exc
                }),
                (x) => `${x.message.msg} from ${x.message.path}:\n`
                        + `${Log.format(x.message.exception)}`);
        }
    }

    static async fetchWorkingDirAsync(options) {
        try {
            return await new Promise((resolve, reject) => {
                const filePath = path.resolve('./options.json');
                fs.readFile(filePath, {encoding: 'utf8'}, (err, data) => {
                    if (err) {
                        err.code === 'ENOENT' ? resolve(false) : reject(err);
                    }
                    else {
                        try {
                            _.merge(options, JSON.parse(data));
                            resolve(true);
                        }
                        catch (exc) {
                            reject(exc);
                        }
                    }
                });
            });
        }
        catch (exc) {
            Log.warning(
                () => ({
                    msg: 'Failed to read working directory configuration options',
                    path: path.resolve('./options.json'),
                    exception: exc
                }),
                (x) => `${x.message.msg} from ${x.message.path}:\n`
                        + `${Log.format(x.message.exception)}`);
        }
    }

    static async fetchEnvironmentConfig(options) {
        const filePath = process.env.SYNCCLOUD_CONFIGURATION_FILE;
        if (!filePath) {
            return;
        }

        Log.info(
            () => ({
                msg: 'Fetching file from env.SYNCCLOUD_CONFIGURATION_FILE',
                path: filePath
            }),
            (x) => `${x.message.msg} from ${x.message.path}`);

        try {
            return await new Promise((resolve, reject) => {
                fs.readFile(filePath, {encoding: 'utf8'}, (err, data) => {
                    if (err) {
                        err.code === 'ENOENT' ? resolve(false) : reject(err);
                    }
                    else {
                        try {
                            _.merge(options, JSON.parse(data));
                            resolve(true);
                        }
                        catch (exc) {
                            reject(exc);
                        }
                    }
                });
            });
        }
        catch (exc) {
            Log.warning(
                () => ({
                    msg: 'Failed to read options path from environment variable',
                    path: filePath,
                    exception: exc
                }),
                (x) => `${x.message.msg} in ${x.message.path}:\n`
                + `${Log.format(x.message.exception)}`);
        }
    }
}

function camelize(obj) {
    const result = {};
    Object.getOwnPropertyNames(obj).forEach((source) => {
        const value = obj[source];
        const target = source.replace(/\-(.)/g, (_, x) => x.toUpperCase());
        if (typeof (value) === 'object' && !Array.isArray(value)) {
            result[target] = camelize(value);
        }
        else {
            result[target] = value;
        }
    });
    return result;
}
