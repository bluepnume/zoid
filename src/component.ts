// `create`: the component definition both windows share. In the parent it
// makes instances to render; in a child window it recognises itself from
// the window name and builds `window.xprops`.

import type { DomainMatcher } from 'cross-domain-utils';

import { assertExists, cleanup, identity, isElement, memoize, noop, uniqueID } from 'belter';
import { getDomain, getDomainFromUrl, isWindow, matchDomain } from 'cross-domain-utils';
import { destroy as destroyPostRobot, on, send, toProxyWindow } from 'post-robot';
import { ZalgoPromise } from 'zalgo-promise';

import { CONTEXT, POST_MESSAGE, PROP_TYPE, WILDCARD, ZOID } from './constants';

import type { ChildComponent } from './child';
import type { ParentComponent, ParentDelegateOverrides, ParentHelpers, RenderOptions } from './parent';
import type { ChildProps, ParentProp, PropsDefinition, PropsInput, PropsType, UserPropsDefinition } from './props';
import type { AnyProps, Context, CssDimensions, Method } from './types';

import { childComponent } from './child';
import { destroyGlobal, getGlobal } from './global';
import { parentComponent } from './parent';
import { getBuiltInProps } from './props';
import { defaultContainerTemplate, defaultPrerenderTemplate } from './templates';
import { validateOptions } from './validate';
import { getInitialParentPayload, isChildComponentWindow } from './window';

export type AttributesType = {
    readonly iframe ?: Readonly<Record<string, string>>,
    readonly popup ?: Readonly<Record<string, string | number | boolean>>,
};

type AutoResize = {
    readonly width ?: boolean,
    readonly height ?: boolean,
    readonly element ?: string,
};

type Eligibility = {
    readonly eligible : boolean,
    readonly reason ?: string,
};

type ExportsConfigDefinition = Readonly<Record<string, { readonly type : typeof PROP_TYPE[keyof typeof PROP_TYPE] }>>;

export type ExportsMapper<X> = (opts : { readonly getExports : () => ZalgoPromise<X> }) => X;

type PropsOption<P, T> = T | ((opts : { readonly props : PropsType<P> }) => T);

export type ComponentOptions<P, X, C, Ext> = {
    readonly tag : string,
    readonly url : PropsOption<P, string>,
    readonly domain ?: DomainMatcher,
    readonly method ?: Method,
    readonly props ?: UserPropsDefinition<P, X>,
    readonly dimensions ?: PropsOption<P, CssDimensions>,
    readonly autoResize ?: AutoResize,
    readonly allowedParentDomains ?: DomainMatcher,
    readonly attributes ?: PropsOption<P, AttributesType>,
    readonly eligible ?: (opts : { readonly props : PropsInput<P> }) => Eligibility,
    readonly defaultContext ?: Context,
    readonly containerTemplate ?: (opts : RenderOptions<P>) => HTMLElement | undefined,
    readonly prerenderTemplate ?: (opts : RenderOptions<P>) => HTMLElement | undefined,
    readonly validate ?: (opts : { readonly props : PropsInput<P> }) => void,
    readonly children ?: () => C,
    readonly exports ?: ExportsConfigDefinition | ExportsMapper<X>,
    readonly enableBfcache ?: boolean,
    readonly getExtensions ?: (parent : ParentComponent<P, X>) => Ext,
};

export type NormalizedComponentOptions<P = AnyProps, X = unknown, C = unknown, Ext = unknown> = {
    readonly tag : string,
    readonly name : string,
    readonly url : PropsOption<P, string>,
    readonly domain : DomainMatcher | undefined,
    readonly method : Method | undefined,
    readonly propsDef : PropsDefinition,
    readonly dimensions : PropsOption<P, CssDimensions>,
    readonly autoResize : AutoResize,
    readonly allowedParentDomains : DomainMatcher,
    readonly attributes : PropsOption<P, AttributesType>,
    readonly eligible : (opts : { readonly props : PropsInput<P> }) => Eligibility,
    readonly defaultContext : Context,
    readonly containerTemplate : (opts : RenderOptions<P>) => HTMLElement | undefined,
    readonly prerenderTemplate : ((opts : RenderOptions<P>) => HTMLElement | undefined) | undefined,
    readonly validate : ((opts : { readonly props : PropsInput<P> }) => void) | undefined,
    readonly children : () => C,
    readonly exports : ExportsMapper<X>,
    readonly enableBfcache : boolean,
    readonly getExtensions : (parent : ParentComponent<P, X>) => Ext,
};

export type CloneOptions<P> = {
    readonly decorate ?: (props : PropsInput<P>) => PropsInput<P>,
};

export type ZoidComponentInstance<P, X = unknown, C = unknown, Ext = unknown> = Ext & X & C & ParentHelpers<P> & {
    readonly isEligible : () => boolean,
    readonly clone : (options ?: CloneOptions<P>) => ZoidComponentInstance<P, X, C, Ext>,
    readonly render : (container ?: string | HTMLElement, context ?: Context) => ZalgoPromise<void>,
    readonly renderTo : (target : Window, container ?: string | HTMLElement, context ?: Context) => ZalgoPromise<void>,
};

export type ZoidComponent<P, X = unknown, C = unknown, Ext = unknown> = {
    (props ?: PropsInput<P>) : ZoidComponentInstance<P, X, C, Ext>,
    readonly isChild : () => boolean,
    readonly canRenderTo : (win : Window) => ZalgoPromise<boolean>,
    readonly instances : ReadonlyArray<ZoidComponentInstance<P, X, C, Ext>>,
    xprops ?: ChildProps<P, X>,
};

export type ZoidProps<P, X = unknown> = ChildProps<P, X>;

const normalizeOptions = <P extends AnyProps, X, C, Ext>(
    options : ComponentOptions<P, X, C, Ext>
) : NormalizedComponentOptions<P, X, C, Ext> => {
    const {
        tag,
        url,
        domain,
        props = {},
        getExtensions = () => ({} as Ext),
        dimensions = {},
        autoResize = {},
        allowedParentDomains = WILDCARD,
        attributes = {},
        defaultContext = CONTEXT.IFRAME,
        containerTemplate = defaultContainerTemplate,
        prerenderTemplate = defaultPrerenderTemplate,
        validate,
        eligible = () => ({ eligible: true }),
        exports: exportsDefinition = noop as unknown as ExportsMapper<X>,
        method,
        enableBfcache = false,
        children = () => ({} as C)
    } = options;

    const name = tag.replaceAll('-', '_');

    const propsDef = {
        ...getBuiltInProps(),
        ...props
    } as PropsDefinition;

    // A config of exports becomes a mapper: a promise per key, or a function
    // that calls through once the child has exported.
    const exports : ExportsMapper<X> = typeof exportsDefinition === 'function'
        ? exportsDefinition
        : ({ getExports }) => {
            const result : Record<string, unknown> = {};

            for (const [ key, { type } ] of Object.entries(exportsDefinition)) {
                const valuePromise = getExports().then(res => (res as Record<string, unknown>)[key]);

                result[key] = type === PROP_TYPE.FUNCTION
                    ? (...args : ReadonlyArray<unknown>) =>
                        valuePromise.then(value => (value as (...args : ReadonlyArray<unknown>) => unknown)(...args))
                    : valuePromise;
            }

            return result as X;
        };

    return {
        name,
        tag,
        url,
        domain,
        method,
        propsDef,
        dimensions,
        autoResize,
        allowedParentDomains,
        attributes,
        defaultContext,
        containerTemplate,
        prerenderTemplate,
        validate,
        eligible,
        children,
        exports,
        getExtensions,
        enableBfcache
    };
};

let cleanInstances = cleanup();
const cleanZoid = cleanup();

type Component<P, X, C, Ext> = {
    readonly init : (props ?: PropsInput<P>) => ZoidComponentInstance<P, X, C, Ext>,
    readonly instances : ReadonlyArray<ZoidComponentInstance<P, X, C, Ext>>,
    readonly isChild : () => boolean,
    readonly canRenderTo : (win : Window) => ZalgoPromise<boolean>,
    readonly registerChild : () => ChildComponent<P, X> | undefined,
};

type DelegateRequest = {
    readonly uid : string,
    readonly overrides : ParentDelegateOverrides<AnyProps>,
};

const component = <P extends AnyProps, X, C, Ext>(opts : ComponentOptions<P, X, C, Ext>) : Component<P, X, C, Ext> => {
    validateOptions(opts);

    const options = normalizeOptions(opts);
    const { name, tag, url, domain, defaultContext, eligible, children, getExtensions } = options;

    const global = getGlobal(window);
    const instances : Array<ZoidComponentInstance<P, X, C, Ext>> = [];

    const isChild = () : boolean => {
        if (!isChildComponentWindow(name)) {
            return false;
        }

        const { payload } = getInitialParentPayload<{ tag : string, childDomainMatch : DomainMatcher }>();

        return payload.tag === tag && matchDomain(payload.childDomainMatch, getDomain());
    };

    const registerChild = memoize(() : ChildComponent<P, X> | undefined => {
        if (!isChild()) {
            return undefined;
        }

        if ((window as Window & { xprops ?: unknown }).xprops) {
            delete global.components?.[tag];
            throw new Error(`Can not register ${ name } as child - child already registered`);
        }

        const child = childComponent<P, X>(options);

        child.init();

        return child;
    });

    const getDelegateDomainMatcher = () : DomainMatcher => {
        if (domain) {
            return domain;
        }

        if (typeof url === 'string') {
            return getDomainFromUrl(url);
        }

        // A url function that ignores its props (the common case) gives the
        // domain at registration time; one that needs them does not.
        let resolvedUrl : string | undefined;

        try {
            resolvedUrl = url({ props: {} as PropsType<P> });
        } catch {
            resolvedUrl = undefined;
        }

        if (resolvedUrl) {
            return getDomainFromUrl(resolvedUrl);
        }

        throw new Error(`${ name }: a \`domain\` option is required when \`url\` cannot be resolved without instance props`);
    };

    const listenForDelegate = () : void => {
        const domainMatcher = getDelegateDomainMatcher();

        if (domainMatcher === WILDCARD) {
            throw new Error(`${ name }: delegate listeners must not register with a wildcard domain matcher`);
        }

        const allowDelegateListener = on(`${ POST_MESSAGE.ALLOW_DELEGATE }_${ name }`, { domain: domainMatcher }, () => true);

        const delegateListener = on(`${ POST_MESSAGE.DELEGATE }_${ name }`, { domain: domainMatcher }, ({ source, data }) => {
            const { uid, overrides } = data as DelegateRequest;

            return {
                parent: parentComponent<P, X>({
                    uid,
                    options,
                    overrides: overrides as ParentDelegateOverrides<P>,
                    parentWin: source
                })
            };
        });

        cleanZoid.register(allowDelegateListener.cancel);
        cleanZoid.register(delegateListener.cancel);
    };

    const canRenderTo = (win : Window) : ZalgoPromise<boolean> =>
        send(win, `${ POST_MESSAGE.ALLOW_DELEGATE }_${ name }`)
            .then(({ data }) => Boolean(data))
            .catch(() => false);

    const getDefaultContainer = (context : Context, container ?: string | HTMLElement) : string | HTMLElement => {
        if (container) {
            if (typeof container !== 'string' && !isElement(container)) {
                throw new TypeError('Expected string or element selector to be passed');
            }

            return container;
        }

        if (context === CONTEXT.POPUP) {
            return 'body';
        }

        throw new Error('Expected element to be passed to render iframe');
    };

    const getDefaultContext = (props : PropsInput<P>, context ?: Context) : ZalgoPromise<Context> => ZalgoPromise.try(
        () => {
            if (props.window) {
                return toProxyWindow(props.window).getType().then(type => {
                    if (!type) {
                        throw new Error('Could not determine the type of the window prop');
                    }

                    return type;
                });
            }

            if (context) {
                if (!(Object.values(CONTEXT) as ReadonlyArray<string>).includes(context)) {
                    throw new Error(`Unrecognized context: ${ context }`);
                }

                return context;
            }

            return defaultContext;
        }
    );

    const init = (inputProps ?: PropsInput<P>) : ZoidComponentInstance<P, X, C, Ext> => {
        const uid = `${ ZOID }-${ tag }-${ uniqueID() }`;
        const props : PropsInput<P> = inputProps ?? {};

        const { eligible: eligibility, reason } = eligible({ props });
        const isEligible = () : boolean => eligibility;

        const { onDestroy } = props;
        const holder : { instance ?: ZoidComponentInstance<P, X, C, Ext> } = {};

        (props as { onDestroy ?: unknown }).onDestroy = () : unknown => {
            if (eligibility && holder.instance) {
                instances.splice(instances.indexOf(holder.instance), 1);
            }

            return onDestroy?.();
        };

        const parent = parentComponent<P, X>({ uid, options });

        parent.init();

        if (eligibility) {
            parent.setProps(props);
        } else {
            props.onDestroy?.();
        }

        cleanInstances.register(err => parent.destroy(err ?? new Error('zoid destroyed all components')));

        const clone = ({ decorate = identity } : CloneOptions<P> = {}) : ZoidComponentInstance<P, X, C, Ext> =>
            init(decorate(props));

        const getChildren = () : C => {
            const childComponents = children() as Record<string, ZoidComponent<AnyProps>>;
            const result : Record<string, unknown> = {};

            for (const [ childName, Child ] of Object.entries(childComponents)) {
                result[childName] = (childInputProps ?: AnyProps) => {
                    const childParent : ParentProp = {
                        uid,
                        props:  parent.getProps(),
                        export: parent.export as (exports : unknown) => ZalgoPromise<void>
                    };

                    return Child({ ...childInputProps, parent: childParent });
                };
            }

            return result as C;
        };

        const render = (target : Window, container ?: string | HTMLElement, context ?: Context) : ZalgoPromise<void> =>
            ZalgoPromise.try(() => {
                if (!eligibility) {
                    const err = new Error(reason ?? `${ name } component is not eligible`);

                    return parent.destroy(err).then(() => {
                        throw err;
                    });
                }

                if (!isWindow(target)) {
                    throw new Error('Must pass window to renderTo');
                }

                return getDefaultContext(props, context);
            }).then(finalContext => {
                const finalContainer = getDefaultContainer(finalContext, container);

                if (target !== window && typeof finalContainer !== 'string') {
                    throw new Error('Must pass string element when rendering to another window');
                }

                return parent.render({
                    target,
                    container: finalContainer,
                    context:   finalContext,

                    rerender: () => {
                        const newInstance = clone();

                        Object.assign(assertExists(holder.instance, 'instance'), newInstance);

                        return newInstance.renderTo(target, finalContainer, context);
                    }
                });
            }).catch((err : unknown) => parent.destroy(err).then(() => {
                throw err;
            }));

        const instance = {
            ...getExtensions(parent),
            ...parent.getExports(),
            ...parent.getHelpers(),
            ...getChildren(),
            isEligible,
            clone,
            render:   (container ?: string | HTMLElement, context ?: Context) => render(window, container, context),
            renderTo: render
        };

        holder.instance = instance;

        if (eligibility) {
            instances.push(instance);
        }

        return instance;
    };

    // A child refuses a second registration of itself first; anywhere else
    // a repeated tag is refused before its delegate listener is taken.
    registerChild();

    global.components ??= {};

    if (global.components[tag]) {
        throw new Error(`Can not register multiple components with the same tag: ${ tag }`);
    }

    listenForDelegate();

    global.components[tag] = true;

    return { init, instances, isChild, canRenderTo, registerChild };
};

export const create = <P extends AnyProps = AnyProps, X = unknown, C = unknown, Ext = unknown>(
    options : ComponentOptions<P, X, C, Ext>
) : ZoidComponent<P, X, C, Ext> => {
    const comp = component(options);

    const init = ((props ?: PropsInput<P>) => comp.init(props)) as ZoidComponent<P, X, C, Ext>;

    Object.assign(init, {
        isChild:     () => comp.isChild(),
        canRenderTo: (win : Window) => comp.canRenderTo(win),
        instances:   comp.instances
    });

    const child = comp.registerChild();

    if (child) {
        const xprops = child.getProps();

        (window as Window & { xprops ?: unknown }).xprops = xprops;
        init.xprops = xprops;
    }

    return init;
};

// Tears down every instance; the component definitions stay registered.
export const destroyComponents = (err ?: unknown) : ZalgoPromise<void> => {
    const destroyPromise = cleanInstances.all(err);

    cleanInstances = cleanup();

    return destroyPromise;
};

export const destroyAll = destroyComponents;

// Tears down everything, including the definitions and post-robot's listeners.
export const destroy = (err ?: unknown) : ZalgoPromise<void> => {
    destroyAll();
    destroyGlobal();
    destroyPostRobot();

    return cleanZoid.all(err);
};
