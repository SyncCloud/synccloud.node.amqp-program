export default class Log {
    static setup(logger) {
        Log.logger = logger;
    }

    static format(obj) {
        return Log.logger.format(obj);
    }

    static info(messageFn, reprFn) {
        Log.logger.info(messageFn, reprFn);
    }

    static debug(messageFn, reprFn) {
        Log.logger.debug(messageFn, reprFn);
    }

    static error(messageFn, reprFn) {
        Log.logger.error(messageFn, reprFn);
    }

    static warning(messageFn, reprFn) {
        Log.logger.warning(messageFn, reprFn);
    }
}
