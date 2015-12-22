import moment from 'moment';
import {indent} from '../logging';

function trace(target, name, descriptor) {
    if (typeof (descriptor.value) === 'function') {
        const func = descriptor.value;
        descriptor.value = function traced(...args) {
            const instance = this;
            trace.onEnter(target, name, descriptor, func, instance, args);
            let result;
            try {
                result = func.apply(instance, args);
            }
            catch (exc) {
                trace.onError(target, name, descriptor, func, instance, args, exc);
                throw exc;
            }
            Promise.resolve(result).then(
                (result) => {
                    trace.onSuccess(target, name, descriptor, func, instance, args, result);
                },
                (reason) => {
                    trace.onError(target, name, descriptor, func, instance, args, reason);
                });
            return result;
        };
        return descriptor;
    }
    throw new Error(`descriptor.value should be function, got ${typeof (descriptor.value)}`);
}

export default trace;

trace.setup = (logger) => {
    trace.logger = logger;
};

trace.timestamp = () => moment.utc().format('HH:mm:ss.SSSSSSSSS');

trace.format = (obj) => {
    return trace.logger.format(obj);
};

trace.onEnter = (target, name, descriptor, func, instance, args) => {
    trace.logger.trace(
        () => ({
            event: 'call',
            method: {
                target: target && {
                    name: target.name,
                    constructor: target.constructor && {
                        name: target.constructor.name
                    }
                },
                name: name
            },
            instance: instance,
            arguments: args
        }),
        (x) => `=> ${trace.formatSignature(x.message.method)}`
                + trace.formatArguments(x.message.arguments)
                + trace.formatInstance(x.message.instance));
};

trace.onError = (target, name, descriptor, func, instance, args, error) => {
    trace.logger.trace(
        () => ({
            event: 'error',
            method: {
                target: target && {
                    name: target.name,
                    constructor: target.constructor && {
                        name: target.constructor.name
                    }
                },
                name: name
            },
            instance: instance,
            arguments: args,
            exception: error
        }),
        (x) => `!! ${trace.formatSignature(x.message.method)}`
                + trace.formatArguments(x.message.arguments)
                + trace.formatInstance(x.message.instance)
                + trace.formatException(x.message.exception));
};

trace.onSuccess = (target, name, descriptor, func, instance, args, result) => {
    trace.logger.trace(
        () => ({
            event: 'exit',
            method: {
                target: target && {
                    name: target.name,
                    constructor: target.constructor && {
                        name: target.constructor.name
                    }
                },
                name: name
            },
            instance: instance,
            arguments: args,
            returnValue: result
        }),
        (x) => `<= ${trace.formatSignature(x.message.method)}`
                + trace.formatArguments(x.message.arguments)
                + trace.formatInstance(x.message.instance)
                + trace.formatReturnValue(x.message.returnValue));
};

trace.formatSignature = (method) => {
    if (method.target && method.target.constructor && method.target.constructor.name) {
        return `${method.target.constructor.name}.${method.name}()`;
    }
    return `${method.name}()`;
};

trace.formatArguments = (args) => {
    return args.length > 0 ? '\n' + args.map(trace.formatArgument).join('\n') : '';
};

trace.formatArgument = (arg, index) => {
    return `    args[${index}] = ${indent(trace.format(arg), '    ')}`;
};

trace.formatInstance = (instance) => {
    return instance ? `\n    THIS = ${indent(trace.format(instance), '        ')}` : '';
};

trace.formatReturnValue = (returnValue) => {
    return `\n    RESULT = ${indent(trace.format(returnValue), '             ')}`;
};

trace.formatException = (exception) => {
    return `\n    ${indent(trace.logger.formatException(exception), '    ')}`;
};
