import assert from 'assert';

export function assertType(obj, type, annotation) {
    type === 'array'
        ? assert(Array.isArray(obj), `${annotation} is ${type} (GOT: ${obj})`)
        : assert(typeof (obj) === type, `${annotation} is ${type} (GOT: ${obj})`);
}
