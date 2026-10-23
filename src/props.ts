// Prop definitions: what a component declares, the built-ins every
// component has, and how both sides walk them.

import type { EventEmitter } from 'belter';
import type { DomainMatcher } from 'cross-domain-utils';
import type { ZalgoPromise } from 'zalgo-promise';

import { once } from 'belter';
import { isSameDomain, isWindow, isWindowClosed } from 'cross-domain-utils';
import { ProxyWindow, toProxyWindow } from 'post-robot';

import { PROP_TYPE } from './constants';

import type { AnyProps, PropSerialization, PropType } from './types';

export type EventHandler<T = void> = (data : T) => unknown;

export type Sibling = {
    readonly props : unknown,
    readonly exports : unknown,
};

export type Dimensions = {
    readonly width ?: number,
    readonly height ?: number,
};

export type ParentProp = {
    readonly uid : string,
    readonly props : AnyProps,
    readonly export : (exports : unknown) => ZalgoPromise<void>,
};

export type OnProps<P> = (handler : (props : P) => unknown) => { readonly cancel : () => void };

// What an integrator may pass when creating an instance, beyond their own props.
export type BuiltInInputProps<P> = {
    readonly parent ?: ParentProp,
    readonly timeout ?: number,
    readonly window ?: Window | ProxyWindow,
    readonly cspNonce ?: string,
    readonly onDisplay ?: EventHandler,
    readonly onRendered ?: EventHandler,
    readonly onRender ?: EventHandler,
    readonly onPrerendered ?: EventHandler,
    readonly onPrerender ?: EventHandler,
    readonly onClose ?: EventHandler,
    readonly onDestroy ?: EventHandler,
    readonly onResize ?: EventHandler,
    readonly onFocus ?: EventHandler,
    readonly onBfcacheCache ?: EventHandler,
    readonly onBfcacheRestore ?: EventHandler<{ readonly cachedDurationMs ?: number }>,
    readonly onError ?: EventHandler<unknown>,
    readonly onProps ?: (props : PropsType<P>) => unknown,
};

export type PropsInput<P> = BuiltInInputProps<P> & Partial<P>;

// The parent's view of an instance's props, every built-in handler present.
export type PropsType<P> = P & {
    readonly timeout ?: number,
    readonly window ?: Window | ProxyWindow,
    readonly cspNonce ?: string,
    readonly onDisplay : EventHandler,
    readonly onRendered : EventHandler,
    readonly onRender : EventHandler,
    readonly onPrerendered : EventHandler,
    readonly onPrerender : EventHandler,
    readonly onClose : EventHandler,
    readonly onDestroy : EventHandler,
    readonly onResize : EventHandler,
    readonly onFocus : EventHandler,
    readonly onBfcacheCache : EventHandler,
    readonly onBfcacheRestore : EventHandler<{ readonly cachedDurationMs ?: number }>,
    readonly onError ?: EventHandler<unknown>,
    readonly onProps ?: (props : PropsType<P>) => unknown,
};

// What the child sees as `window.xprops`.
export type ChildHelpers<P, X> = {
    readonly uid : string,
    readonly tag : string,
    readonly close : () => ZalgoPromise<void>,
    readonly focus : () => ZalgoPromise<void>,
    readonly resize : (dimensions : Dimensions) => ZalgoPromise<void>,
    readonly onError : (err : unknown) => ZalgoPromise<void>,
    readonly onProps : OnProps<ChildProps<P, X>>,
    readonly getParent : () => Window,
    readonly getParentDomain : () => string,
    readonly show : () => ZalgoPromise<void>,
    readonly hide : () => ZalgoPromise<void>,
    readonly export : (exports : X) => ZalgoPromise<void>,
    readonly getSiblings : (opts ?: { readonly anyParent ?: boolean }) => ReadonlyArray<Sibling>,
};

export type ChildProps<P, X> = P & ChildHelpers<P, X> & {
    readonly parent ?: ParentProp,
    readonly timeout ?: number,
    readonly cspNonce ?: string,
};

export type PropHelpers<P> = {
    readonly props : PropsType<P>,
    readonly state : Record<string, unknown>,
    readonly close : () => ZalgoPromise<void>,
    readonly focus : () => ZalgoPromise<void>,
    readonly onError : (err : unknown) => ZalgoPromise<void>,
    readonly container : HTMLElement | undefined,
    readonly event : EventEmitter,
};

type ParamOption<T> = boolean | string | ((opts : { readonly value : T }) => string | ZalgoPromise<string>);

type ValueOption<T> = (opts : { readonly value : T }) => unknown;

export type PropDefinition<T, P = AnyProps, X = unknown> = {
    readonly type : PropType,
    readonly alias ?: string,
    readonly value ?: (helpers : PropHelpers<P>) => T | undefined,
    readonly default ?: (helpers : PropHelpers<P>) => T | undefined,
    readonly decorate ?: (helpers : PropHelpers<P> & { readonly value : T }) => T,
    readonly childDecorate ?: (helpers : ChildHelpers<P, X> & { readonly value : T | undefined }) => T | undefined,
    readonly required ?: boolean,
    readonly queryParam ?: ParamOption<T>,
    readonly bodyParam ?: ParamOption<T>,
    readonly queryValue ?: ValueOption<T>,
    readonly bodyValue ?: ValueOption<T>,
    readonly sendToChild ?: boolean,
    readonly allowDelegate ?: boolean,
    readonly validate ?: (opts : { readonly value : T, readonly props : PropsInput<P> }) => void,
    readonly sameDomain ?: boolean,
    readonly serialization ?: PropSerialization,
    readonly trustedDomains ?: ReadonlyArray<DomainMatcher>,
};

export type UserPropsDefinition<P, X> = {
    readonly [Key in keyof P & string] ?: PropDefinition<P[Key], P, X>
};

export type PropsDefinition<P = AnyProps, X = unknown> = Readonly<Record<string, PropDefinition<unknown, P, X>>>;

const defaultNoop = () : EventHandler => () => undefined;

type DecorateOnceOptions<F extends (...args : ReadonlyArray<unknown>) => unknown> = { readonly value : F };

const decorateOnce = <F extends (...args : ReadonlyArray<unknown>) => unknown>(
    { value } : DecorateOnceOptions<F>
) : F =>
    once(value) as unknown as F;

type BuiltInProp = PropDefinition<unknown>;

const lifecycle = (allowDelegate : boolean) : BuiltInProp => ({
    type:        PROP_TYPE.FUNCTION,
    required:    false,
    sendToChild: false,
    allowDelegate,
    default:     defaultNoop,
    decorate:    decorateOnce as BuiltInProp['decorate']
});

const repeating = () : BuiltInProp => ({
    type:          PROP_TYPE.FUNCTION,
    required:      false,
    sendToChild:   false,
    allowDelegate: true,
    default:       defaultNoop
});

const childHelper = (name : keyof ChildHelpers<AnyProps, unknown>) : BuiltInProp => ({
    type:          PROP_TYPE.FUNCTION,
    required:      false,
    sendToChild:   false,
    childDecorate: helpers => helpers[name]
});

export const getBuiltInProps = () : PropsDefinition => ({
    window: {
        type:          PROP_TYPE.OBJECT,
        sendToChild:   false,
        required:      false,
        allowDelegate: true,

        validate: ({ value }) => {
            if (!isWindow(value) && !ProxyWindow.isProxyWindow(value)) {
                throw new Error('Expected Window or ProxyWindow');
            }

            if (isWindow(value)) {
                if (isWindowClosed(value)) {
                    throw new Error('Window is closed');
                }

                if (!isSameDomain(value)) {
                    throw new Error('Window is not same domain');
                }
            }
        },

        decorate: ({ value }) => toProxyWindow(value as Window | ProxyWindow)
    },

    timeout: {
        type:        PROP_TYPE.NUMBER,
        required:    false,
        sendToChild: false
    },

    cspNonce: {
        type:     PROP_TYPE.STRING,
        required: false
    },

    onDisplay:     lifecycle(true),
    onRendered:    lifecycle(false),
    onRender:      lifecycle(false),
    onPrerendered: lifecycle(false),
    onPrerender:   lifecycle(false),
    onClose:       lifecycle(true),
    onDestroy:     lifecycle(true),
    onResize:      repeating(),
    onFocus:       repeating(),

    // These fire every time the page enters and leaves the bfcache.
    onBfcacheCache:   repeating(),
    onBfcacheRestore: repeating(),

    close:           childHelper('close'),
    focus:           childHelper('focus'),
    resize:          childHelper('resize'),
    getParent:       childHelper('getParent'),
    getParentDomain: childHelper('getParentDomain'),
    show:            childHelper('show'),
    hide:            childHelper('hide'),
    export:          childHelper('export'),
    onError:         childHelper('onError'),
    onProps:         childHelper('onProps'),
    getSiblings:     childHelper('getSiblings'),

    uid: {
        type:          PROP_TYPE.STRING,
        required:      false,
        sendToChild:   false,
        childDecorate: ({ uid }) => uid
    },

    tag: {
        type:          PROP_TYPE.STRING,
        required:      false,
        sendToChild:   false,
        childDecorate: ({ tag }) => tag
    }
});

type PropCallback<R> = (key : string, propDef : BuiltInProp | undefined, value : unknown) => R;

// Every key that is either passed or declared.
export const eachProp = (props : AnyProps, propsDef : PropsDefinition, handler : PropCallback<void>) : void => {
    for (const key of Object.keys({ ...props, ...propsDef })) {
        handler(key, propsDef[key], props[key]);
    }
};

export const mapProps = <R>(
    props : AnyProps,
    propsDef : PropsDefinition,
    handler : PropCallback<R>
) : ReadonlyArray<R> => {
    const results : Array<R> = [];

    eachProp(props, propsDef, (key, propDef, value) => {
        results.push(handler(key, propDef, value));
    });

    return results;
};
