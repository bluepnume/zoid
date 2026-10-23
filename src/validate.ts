// Checks on the options passed to `create`, so a bad definition fails at
// registration with a clear message rather than at render.

import { isPerc, isPx } from 'belter';

import { CONTEXT, PROP_TYPE } from './constants';

import type { ComponentOptions } from './component';
import type { AnyProps } from './types';

// The options as JavaScript callers may pass them: every field unchecked.
type RawOptions = {
    readonly [Key in keyof ComponentOptions<AnyProps, unknown, unknown, unknown>] ?: unknown
};

const PROP_TYPE_LIST : ReadonlyArray<string> = Object.values(PROP_TYPE);

const validatePropsDefinitions = ({ props } : RawOptions) : void => {

    if (props === undefined) {
        return;
    }

    if (typeof props !== 'object' || props === null) {
        throw new TypeError('Expected options.props to be an object');
    }

    for (const [ key, prop ] of Object.entries(props as Record<string, unknown>)) {
        if (typeof prop !== 'object' || prop === null) {
            throw new TypeError(`Expected options.props.${ key } to be an object`);
        }

        const { type, required, default: defaultValue, queryParam, queryValue } = prop as Record<string, unknown>;

        if (!type) {
            throw new Error('Expected prop.type');
        }

        if (typeof type !== 'string' || !PROP_TYPE_LIST.includes(type)) {
            throw new Error(`Expected prop.type to be one of ${ PROP_TYPE_LIST.join(', ') }`);
        }

        if (required && defaultValue) {
            throw new Error('Required prop can not have a default value');
        }

        if (queryParam && !queryValue && type === PROP_TYPE.FUNCTION) {
            throw new Error('Do not pass queryParam for function prop');
        }
    }
};

const TAG_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/u;

export const validateOptions = (options : RawOptions | undefined) : void => {
    if (!options) {
        throw new Error('Expected options to be passed');
    }

    if (typeof options.tag !== 'string' || !TAG_PATTERN.test(options.tag)) {
        throw new Error(`Invalid options.tag: ${ String(options.tag) }`);
    }

    validatePropsDefinitions(options);

    const { dimensions } = options;

    if (dimensions !== undefined && typeof dimensions !== 'function') {
        if (typeof dimensions !== 'object' || dimensions === null) {
            throw new TypeError('Expected dimensions to be a function or object');
        }

        const { width, height } = dimensions as Record<string, unknown>;

        if (!isPx(height) && !isPerc(height)) {
            throw new Error('Expected options.dimensions.height to be a px or % string value');
        }

        if (!isPx(width) && !isPerc(width)) {
            throw new Error('Expected options.dimensions.width to be a px or % string value');
        }
    }

    const { defaultContext } = options;

    if (defaultContext && defaultContext !== CONTEXT.IFRAME && defaultContext !== CONTEXT.POPUP) {
        throw new Error(`Unsupported context type: ${
            typeof defaultContext === 'string'
                ? defaultContext
                : typeof defaultContext
            }`);
    }

    if (!options.url) {
        throw new Error('Must pass url');
    }

    if (typeof options.url !== 'string' && typeof options.url !== 'function') {
        throw new TypeError('Expected url to be string or function');
    }

    if (options.prerenderTemplate && typeof options.prerenderTemplate !== 'function') {
        throw new TypeError('Expected options.prerenderTemplate to be a function');
    }

    if (options.containerTemplate && typeof options.containerTemplate !== 'function') {
        throw new TypeError('Expected options.containerTemplate to be a function');
    }
};
