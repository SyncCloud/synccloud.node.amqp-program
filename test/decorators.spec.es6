import time from '../src/decorators/time';
import Log from '../src/log';
import {ConsoleTarget, Logger} from '../src/logging';
import B from 'bluebird';

const logger = new Logger();
logger.targets.add(new ConsoleTarget());
Log.setup(logger);

describe('decorators', function () {
  describe('time', function () {

    class Sloupok {
      @time
      async helloWorldAsync() {
        await new Promise(resolve => {
          setTimeout(resolve, 20);
        });

        return 'Hello World!';
      }

      @time
      async passArgsAsync(...args) {
        await new Promise(resolve => {
          setTimeout(resolve, 20);
        });

        return args;
      }

      @time
      passArgs(...args) {
        return args;
      }

      @time('bar')
      helloWorld() {
        return 'Hello World!';
      }
    }

    const sloupok = new Sloupok();

    describe('async methods', () => {

      it('should pass result', async () => {
        const res = await sloupok.helloWorldAsync();
        expect(res).to.eql('Hello World!');
      });

      it('should pass arguments', async () => {
        const res = await sloupok.passArgsAsync(1, 2, 3);
        expect(res).to.eql([1, 2, 3]);
      });

    });

    describe('plain methods', () => {

      it('should return result', async () => {
        expect(sloupok.helloWorld()).to.eql('Hello World!');
      });

      it('should pass args', async () => {
        expect(sloupok.passArgs(1, 2, 3)).to.eql([1, 2, 3]);
      });

    });

    //describe('graphite', () => {
    //  it('should setup graphite', async ()=> {
    //    await time.setupGraphiteAsync();
    //    for (var i = 0, len = 100; i < len; i++) {
    //      await sloupok.helloWorldAsync()
    //    }
    //  });
    //})

  });
});
