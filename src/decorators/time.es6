import _ from 'lodash';
import {decorate} from './utils';
import Log from '../log';
import humanize from 'humanize-number';
import colors from 'colors';
import dgram from 'dgram';
import {assertType} from '../assert-type.es6';

const noop = () => {};
let graphiteClient;

export default time;

function time(...args) {
  return decorate(handleDescriptor, args);
}

function handleDescriptor(target, name, descriptor, [customLabel]) {
  if (descriptor) {
    if (!_.isFunction(descriptor.value)) {
      throw new Error('@time decorator can be applied only to functions');
    }

    const fn = descriptor.value;
    const label = customLabel || `${target.constructor.name}.${fn.name}`;

    descriptor.value = function timeDecorator() {
      const start = new Date;
      let result;
      try {
        result = fn.apply(this, arguments)
      } catch (err) {
        timeEnd(label, start);
        throw err;
      }

      Promise.resolve(result).then(() => timeEnd(label, start), () => timeEnd(label, start)).catch;
      return result;
    }
  }
}

time.setupGraphiteAsync = async (options) => {
  graphiteClient = new Stats(options);
};

time.pickColor = (time) => {
  if (time < 100) {
    return 'green'
  } else if (time < 300) {
    return 'cyan';
  } else if (time < 500) {
    return 'yellow'
  } else {
    return 'red';
  }
};

function timeEnd(label, start) {
  let delta = new Date - start;

  const color = time.pickColor(delta);
  const deltaStr = delta < 10000
    ? delta + 'ms'
    : Math.round(delta / 1000) + 's';

  Log.info(noop, () => `${label}: ${colors[color](humanize(deltaStr))}`);

  if (graphiteClient) {
    try {
      graphiteClient.write(label, delta);
    } catch (err) {
      console.error(err);
    }
  }
}

class Stats {
  constructor(options) {
    assertType(options, 'object', 'options should be an object');
    assertType(options.host, 'string', 'options.host should be a string');
    assertType(options.port, 'number', 'options.port should be a number');
    options.prefix && assertType(options.prefix, 'string', 'options.prefix should be a string');

    this.options = options;
    const client = this.client = dgram.createSocket('udp4');

    client.on('close', function () {
      console.log('UDP socket closed');
    });

    client.on('error', function (err) {
      Log.error(() => ({
        msg: 'StatsD client exited wit error',
        err
      }), ({message:m}) => `${m.msg}: ${Log.format(m.err)}`);
    });

    Log.info(() => ({
      msg: 'StatsD client inited',
      options
    }), ({message:m}) => `${m.msg} ${Log.format(m.options)}`);
  }

  write(metric, value) {
    const str = (this.options.prefix ? this.options.prefix  + '.' : '') + metric + ':' + value + '|c';
    const buf = new Buffer(str, 'ascii');
    this.client.send(buf, 0, buf.length, this.options.port, this.options.host);
  }
}



