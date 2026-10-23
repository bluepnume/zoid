// The parent side of props: deriving each value lazily from its definition,
// and turning them into a query string or form body for the child's url.

import type { ZalgoPromise as ZalgoPromiseType } from 'zalgo-promise';

import { base64encode, dotify, isDefined, noop } from 'belter';
import { ZalgoPromise } from 'zalgo-promise';

import { METHOD, PROP_SERIALIZATION, PROP_TYPE } from './constants';

import type { PropHelpers, PropsDefinition } from './props';
import type { AnyProps, Method } from './types';

import { eachProp, mapProps } from './props';

type ExtendPropsOptions = {
    readonly propsDef : PropsDefinition,
    readonly existingProps : AnyProps,
    readonly inputProps : AnyProps,
    readonly helpers : Omit<PropHelpers<AnyProps>, 'props'>,
};

// Defines a lazy getter on `existingProps` for every passed or declared
// prop, so a value, default or decorator runs once, the first time it is
// read, with every other prop already reachable.
export const extendProps = ({ propsDef, existingProps, inputProps, helpers } : ExtendPropsOptions) : void => {
    eachProp(inputProps, propsDef, (key, propDef, inputValue) => {
        let valueDetermined = false;
        let value = inputValue;

        const getDerivedValue = () : unknown => {
            if (!propDef) {
                return value;
            }

            const propHelpers : PropHelpers<AnyProps> = {
                ...helpers,
                props: existingProps as PropHelpers<AnyProps>['props']
            };

            const { alias } = propDef;

            if (alias && !isDefined(inputValue) && isDefined(inputProps[alias])) {
                value = inputProps[alias];
            }

            if (propDef.value) {
                value = propDef.value(propHelpers);
            }

            if (propDef.default && !isDefined(value) && !isDefined(inputProps[key])) {
                value = propDef.default(propHelpers);
            }

            if (isDefined(value)) {
                const wrongType = propDef.type === PROP_TYPE.ARRAY
                    ? !Array.isArray(value)
                    : typeof value !== propDef.type;

                if (wrongType) {
                    throw new TypeError(`Prop is not of type ${ propDef.type }: ${ key }`);
                }
            } else if (propDef.required !== false && !isDefined(inputProps[key])) {
                throw new Error(`Expected prop "${ key }" to be defined`);
            }

            if (isDefined(value) && propDef.validate) {
                propDef.validate({ value, props: inputProps });
            }

            if (isDefined(value) && propDef.decorate) {
                value = propDef.decorate({ ...propHelpers, value });
            }

            return value;
        };

        Object.defineProperty(existingProps, key, {
            configurable: true,
            enumerable:   true,

            get: () => {
                if (valueDetermined) {
                    return value;
                }

                valueDetermined = true;
                value = getDerivedValue();

                return value;
            }
        });
    });

    // Read every prop now, so a missing required prop, a wrong type or a
    // failing validator throws here rather than on first use.
    eachProp(existingProps, propsDef, noop);
};

type Params = Record<string, string | boolean>;

// The props that go in the url (GET) or the form body (POST), each under
// its declared param name and serialization.
type SerializePropsOptions = {
    readonly propsDef : PropsDefinition,
    readonly props : AnyProps,
    readonly method : Method,
};

export const serializeProps = ({ propsDef, props, method } : SerializePropsOptions) : ZalgoPromiseType<Params> => {
    const params : Params = {};

    return ZalgoPromise.all(mapProps(props, propsDef, (key, propDef, value) => ZalgoPromise.resolve().then(() => {
        if (value === null || value === undefined || !propDef) {
            return undefined;
        }

        const getParam = method === METHOD.GET
            ? propDef.queryParam
            : propDef.bodyParam;

        const getValue = method === METHOD.GET
            ? propDef.queryValue
            : propDef.bodyValue;

        if (!getParam) {
            return undefined;
        }

        return ZalgoPromise.hash({
            finalParam: ZalgoPromise.try(() => {
                if (typeof getParam === 'function') {
                    return getParam({ value });
                }

                return typeof getParam === 'string'
                    ? getParam
                    : key;
            }),

            finalValue: ZalgoPromise.try(() => (typeof getValue === 'function'
                ? getValue({ value })
                : value))
        }).then(({ finalParam, finalValue }) => {
            if (typeof finalValue === 'boolean' || typeof finalValue === 'string' || typeof finalValue === 'number') {
                params[finalParam] = typeof finalValue === 'boolean'
                    ? finalValue
                    : String(finalValue);

                return;
            }

            if (typeof finalValue !== 'object' || finalValue === null) {
                return;
            }

            if (propDef.serialization === PROP_SERIALIZATION.JSON) {
                params[finalParam] = JSON.stringify(finalValue);
            } else if (propDef.serialization === PROP_SERIALIZATION.BASE64) {
                params[finalParam] = base64encode(JSON.stringify(finalValue));
            } else {
                Object.assign(params, dotify(finalValue as AnyProps, key));
            }
        });
    }))).then(() => params);
};
