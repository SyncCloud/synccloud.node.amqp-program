import colors from 'colors';
import moment from 'moment';
import stringify from 'json-stringify-safe';
import {decorate, enumerable, lazyInitialize, nonenumerable} from 'core-decorators';
import _, {memoize} from 'lodash';

const DATETIME_FORMAT = 'DD-MM HH:mm:ss.SSSSSSSSS';
const TIME_FORMAT = 'HH:mm:ss.SSSSSSSSS';
const empty = () => '';

class LogEvent {
  timestamp = moment.utc();
  level;

  @enumerable //todo dont work
  get message() {
    return this._getMessage();
  }

  toJSON() {
    return {
      timestamp: this.timestamp.format(DATETIME_FORMAT),
      level: this.level,
      message: this.message
    }
  }

  @nonenumerable
  _messageFn = null;

  @nonenumerable
  _reprFn = null;

  @nonenumerable
  get text() {
    return this._getText();
  }

  @nonenumerable
  get json() {
    return this._stringify();
  }

  constructor(level, messageFn, reprFn) {
    this.level = level;
    this._messageFn = memoize(messageFn);
    this._reprFn = memoize(reprFn || empty);
  }

  //@decorate(memoize)
  _getMessage() {
    return this._messageFn();
  }

  //@decorate(memoize)
  _stringify() {
    try {
      return stringify(this);
    } catch (err) {
      console.error('Failed stringify event: ', err);
      console.error(err.stack);
      return '';
    }
  }

  //@decorate(memoize)
  _getText() {
    if (this._reprFn) {
      try {
        const m = this.message;
        return this._reprFn(this);
      } catch (err) {
        console.error('Failed to repr message: ', err);
        console.error(err.stack);
        return null;
      }
    } else {
      return this.json;
    }
  }
}

class Logger {
  get targets() {
    return this._targets;
  }

  get formatters() {
    return this._formatters;
  }

  constructor() {
    this._targets = new TargetCollection();
    this._formatters = new FormatterCollection();
  }

  format(obj) {
    if (obj === void 0) {
      return '<VOID 0>';
    }
    if (obj === null) {
      return '<NULL>';
    }
    const formatter = this.formatters
      .firstOrDefault(x => x.canFormat(obj));

    if (formatter) {
      return formatter.format(obj);
    }

    if (typeof (obj) === 'function') {
      return 'Function' + (obj.name ? ' ' + obj.name : '');
    }

    if (obj instanceof Error) {
      return this.formatException(obj);
    }

    return obj.toString();
  }

  //noinspection JSMethodCanBeStatic
  formatException(err) {
    const lines = ['' + (err.stack || err)];
    if (err.cause) {
      if (err.cause instanceof Error) {
        lines.push('-> Caused by:');
        lines.push('    ' +
          this.format(err.cause)
            .replace(/\r/g, '')
            .replace(/\n/g, '\n    '));
        lines.push('<- /Caused by');
      }
    }
    if (err.inner && Array.isArray(err.inner) && err.inner.length > 0) {
      for (let i = 0, ii = err.inner.length; i < ii; ++i) {
        const inner = err.inner[i];
        lines.push(`-> Inner error #${i}:`);
        lines.push(this.format(inner)
          .replace(/\r/g, '')
          .replace('\n', '\n    '));
        lines.push(`<- /Inner error #${i}`);
      }
    }
    if (err.amqpStack) {
      lines.push('AMQP state stack:');
      lines.push(('' + err.amqpStack)
        .replace(/\r/g, '')
        .replace(/\n/g, '\n    '));
    }
    if (err.stackAtStateChange) {
      lines.push('AMQP state stack:');
      lines.push(('' + err.stackAtStateChange)
        .replace(/\r/g, '')
        .replace(/\n/g, '\n    '));
    }
    return lines.join('\n');
  }

  info(messageFn, reprFn) {
    return this.post('info', messageFn, reprFn);
  }

  trace(messageFn, reprFn) {
    return this.post('trace', messageFn, reprFn);
  }

  debug(messageFn, reprFn) {
    return this.post('debug', messageFn, reprFn);
  }

  error(messageFn, reprFn) {
    return this.post('error', messageFn, reprFn);
  }

  warning(messageFn, reprFn) {
    return this.post('warning', messageFn, reprFn);
  }

  post(level, messageFn, reprFn) {
    const event = new LogEvent(level, messageFn, reprFn);

    try {
      this._postMulti(event);
    }
    catch (exc) {
      console.warn('Failed to log an event:');
      console.error(exc.stack || exc);
    }
  }

  _postMulti(event) {
    this.targets.forEach((target) => {
      target.post(event);
    });
  }
}

class StreamTarget {
  get stream() {
    return this._stream;
  }

  constructor(stream) {
    this._stream = stream;
  }

  /**
   *
   * @param event {LogEvent}
  */
  post(event) {
    const level = event.level;
    const timestamp = event.timestamp.format(DATETIME_FORMAT);
    const text = event.text;

    if (text) {
      this.stream.write(
        `${padRight(level.toUpperCase(), 10)} [${timestamp}]` +
        `\n  ${indent(text, '  ')}\n\n`);
    }
  }
}

class ConsoleTarget {
  //noinspection JSMethodCanBeStatic
  post(event) {
    const level = event.level;
    const timestamp = event.timestamp.format(DATETIME_FORMAT);
    const text = event.text;

    let color = null;
    let method = console.log.bind(console);

    switch (event.level) {
      case 'info':
        color = colors.green.bind(colors);
        break;
      case 'trace':
        color = colors.gray.bind(colors);
        break;
      case 'debug':
        color = colors.magenta.bind(colors);
        break;
      case 'error':
        color = colors.red.bind(colors);
        method = console.warn.bind(console);
        break;
      case 'warning':
        color = colors.yellow.bind(colors);
        method = console.warn.bind(console);
        break;
    }

    if (text) {
      if (color) {
        method(
          color(`${padRight(level.toUpperCase(), 10)} [${timestamp}]`)
          + `\n  ${indent(text, '  ')}\n`);
      }
      else {
        method(
          `${padRight(level.toUpperCase(), 10)} [${timestamp}]`
          + `\n  ${indent(text, '  ')}\n`);
      }
    }
  }
}

class TargetCollection {
  get targets() {
    return this._targets;
  }

  constructor() {
    this._targets = [];
  }

  add(target) {
    this._targets.push(target);
  }

  forEach(action) {
    this.targets.forEach(action);
  }
}

class FormatterCollection {
  get formatters() {
    return this._formatters;
  }

  constructor() {
    this._formatters = [
      {
        canFormat: (obj) => moment.isMoment(obj),
        format: (obj) => obj.format(DATETIME_FORMAT)
      }
    ];
  }

  prepend(formatter) {
    this._formatters.unshift(formatter);
  }

  append(formatter) {
    this._formatters.push(formatter);
  }

  firstOrDefault(predicateFn) {
    const formatters = this.formatters;
    for (let i = 0, ii = formatters.length; i < ii; ++i) {
      const formatter = formatters[i];
      if (predicateFn(formatter)) {
        return formatter;
      }
    }
    return null;
  }
}

// as of bug with export, we assign exports explicitly
module.exports.Logger = Logger;
module.exports.StreamTarget = StreamTarget;
module.exports.ConsoleTarget = ConsoleTarget;
module.exports.TargetCollection = TargetCollection;
module.exports.FormatterCollection = FormatterCollection;
module.exports.padRight = padRight;
module.exports.indent = indent;
module.exports.LogEvent = LogEvent;

function padRight(str, num, c) {
  return str + new Array(num - str.length + 1).join(c || ' ');
}

function indent(str, prefix) {
  return str.replace(/\r/g, '').replace(/\n/g, '\n' + prefix);
}
