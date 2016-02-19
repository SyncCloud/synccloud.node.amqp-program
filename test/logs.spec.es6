import {LogEvent, Logger} from '../src/logging';
import Log from '../src/log';
import _ from 'lodash';

describe('logging', function() {
	describe('log event', function() {
    it('should call only once', async function() {
      let msgCalled = 0;
      let reprCalled = 0;

      const event = new LogEvent('debug', function msg() {
        msgCalled++;
        return {a:7};
      }, ({message:m}) => {
        reprCalled++;
        return `${m.a} days in a week`
      });

      _.times(10, () => event.message);
      _.times(10, () => event.json);
      _.times(10, () => event.text);

      expect(event.text).to.eql('7 days in a week');
      expect(msgCalled).to.eql(1);
      expect(reprCalled).to.eql(1);
    });

    it('should log multiple events separately', async function() {
      let writes = [];
      class StubTarget {
        post(event) {
          writes.push(event.text);
        }
      }
      const logger = new Logger();
      logger.targets.add(new StubTarget());
      Log.setup(logger);

      Log.info(() => ({foo:'bar'}), ({message})=>`${message.foo}`);
      Log.info(() => ({foo:'zoo'}), ({message})=>`${message.foo}`);
      expect(writes).to.eql(['bar', 'zoo']);
    });
	});
});
