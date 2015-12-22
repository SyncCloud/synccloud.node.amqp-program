import os from 'os';
import {isObject, extend} from 'lodash';
import dgram, {Socket} from 'dgram';
import {Pool} from 'generic-pool';
import {promisify, promisifyAll} from 'bluebird';

promisifyAll(Socket.prototype);

const pool = promisifyAll(Pool({
    name: 'syslog-sockets',
    create: function (done) {
        done(dgram.createSocket('udp4'));
    },
    destroy: function (socket) {
        socket.close();
    },
    max: 10,
    idleTimeoutMillis: 30000
}));

const SYSLOG_FACILITY = {
    kern:   0,
    user:   1,
    mail:   2,
    daemon: 3,
    auth:   4,
    syslog: 5,
    lpr:    6,
    news:   7,
    uucp:   8,
    local0: 16,
    local1: 17,
    local2: 18,
    local3: 19,
    local4: 20,
    local5: 21,
    local6: 22,
    local7: 23
};

const SYSLOG_SEVERITY = {
    emerg:  0,
    alert:  1,
    crit:   2,
    err:    3,
    warn:   4,
    notice: 5,
    info:   6,
    debug:  7
};

export default class SyslogTarget {
    constructor({host = '127.0.0.1', port = 514, applicationName} = {}) {
        this._host = host;
        this._port = port;
        this._appName = applicationName;
        this._hostname = os.hostname();
    }

    async _send(severity, timestamp, json, text) {
        const dt = timestamp.toDate().toISOString();
        let message;
        if (text) {
            message = text + ' ' + json;
        } else {
            message = json;
        }

        const buf = new Buffer(`<${SYSLOG_FACILITY.user * 8 + SYSLOG_SEVERITY[severity]}>${dt} ${this._hostname} [${this._appName}]: ${message}`);

        const sock = await pool.acquireAsync();

        try {
            await sock.sendAsync(buf, 0, buf.length, this._port, this._host);
        }
        finally {
            pool.release(sock);
        }
    }

    post(logger, json, event, reprFn) {
        const level = event.level;

        let syslogServerity = {
            'info': 'info',
            'trace': 'debug',
            'debug': 'debug',
            'error': 'err',
            "warning": 'warn'
        }[level];

        if (syslogServerity) {
            this._send(syslogServerity, event.timestamp, json, reprFn && reprFn())
                .then(() => console.log('sent'))
                .catch((err) => console.error(err, err.stack));
        } else {
            throw new Error(`unmatched syslog serverity for ${level}`);
        }
    }
}