import {LogEvent, ConsoleTarget, Logger} from '../src/logging';
import Log from '../src/log';
import _ from 'lodash';

describe('format logs', function() {

  const logger = new Logger();
  logger.targets.add(new ConsoleTarget());
  Log.setup(logger);

  it('should format', async () => {
    console.log(Log.format({a: {b: 1}}));
  });
});
