import _, {isArray, isString} from 'lodash';
import assert from 'assert';

export default function validate(rules) {
  return validate.named(rules);
}

validate.named = function(rules) {
  return function (target, name, descriptor) {
    if (typeof (descriptor.value) === 'function') {
      const fn = descriptor.value;

      descriptor.value = function validate_params(options) {

        const errors = validateAllError(options, rules);
        assert(!errors.length, `validation errors:\n${errors.join('\n')}`);

        // if all assertions pass – invoke function
        return fn.apply(this, [options]);
      }
    } else {
      throw new Error(`descriptor.value should be a function, but was ${typeof (descriptor.value)}`)
    }
  }
};

validate.positional = function (...rules) {
  return function (target, name, descriptor) {
    if (typeof (descriptor.value) === 'function') {
      const fn = descriptor.value;

      descriptor.value = function validate_params(...args) {

        let i = 0;
        for (let param of args) {
          if (rules[i]) {
            const errors = validateAllError({[`param${i}`]: param}, {[`param${i}`]: rules[i]});
            assert(!errors.length, `validation errors:\n${errors.join('\n')}`);
          }

          i++;
        }

        // if all assertions pass – invoke function
        return fn.apply(this, args);
      }
    } else {
      throw new Error(`descriptor.value should be a function, but was ${typeof (descriptor.value)}`)
    }
  }
};

const rules = validate.rules = {
  number(propValue, propName, context) {
    if (propValue && !_.isNumber(propValue)) {
      return `${propName} expected to be a number, got ${typeof propValue}`;
    }
  },
  string(propValue, propName, context) {
    if (propValue && !_.isString(propValue)) {
      return `${propName} expected to be a string, got ${typeof propValue}`;
    }
  },
  exists(propValue, propName, context) {
    if (_.isEmpty(propValue)) {
      return `${propName} expected to be not empty, got ${propValue}`;
    }
  },
  date(propValue, propName, context) {
    if (propValue && !(propValue instanceof Date)) {
      return `${propName} expected to be an instance of Date, got ${propValue.constructor.name}`;
    }
  },
};

const supportedRules = _.keys(rules);


function *lazyValidateObject(obj, ruleSet) {
  for (let [key, rules] of _.pairs(ruleSet)) {
    rules = _.isArray(rules) ? rules : [rules];
    //console.log(`${key}: ${rules} `);
    for (let validator of rules) {
      //console.log(`${validator.name}`);
      if (_.isFunction(validator)) {
        if (supportedRules.indexOf(validator.name) < 0) {
          throw new Error(`not supported rule ${rule.name}. list of all rule functions:\n${supportedRules.join('\n')}`)
        }
        const result = validator(obj[key], key, obj);
        if (result) {
          yield result;
        }
      } else if (_.isPlainObject(validator)) {
        if (!_.isObject(obj[key])) {
          throw new Error(`there are nested rules for property '${key}' but property value is not an object type, got ${typeof value}`)
        }
        yield* lazyValidateObject(obj[key], validator)
      } else {
        throw new Error(`rule ${validator} is neither function not object: ${typeof validator}`);
      }
    }
  }
}

function validateAllError(obj, ruleSet) {
  const gen = lazyValidateObject(obj, ruleSet);

  const errors = [];
  let next;

  while(!(next = gen.next()).done) {
    errors.push(next.value);
    //console.log(next);
  }

  return errors;
}
