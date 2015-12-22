import _ from 'lodash';
import AmqpChannel from './amqp-channel';
import AmqpClient from './amqp-client';
import AmqpConsumer from './amqp-consumer';
const assertType = require('./assert-type');
// import cancellation from './cancellation';
const cancellation = require('./cancellation');
import Config from './config';
// import decorators from './decorators';
const decorators = require('./decorators');
import Deferred from './deferred';
// import errors from './errors';
const errors = require('./errors');
import Log from './log';
// import logging from './logging';
const logging = require('./logging');
import ProgramBase from './program-base';

export default _.merge(
    {}, {AmqpChannel}, {AmqpClient}, {AmqpConsumer},
    assertType, cancellation, {Config}, decorators,
    {Deferred}, errors, {Log}, logging, {ProgramBase});
