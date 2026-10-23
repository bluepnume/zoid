// The parent side: opens the child window (an iframe or a popup), renders
// the container and prerender around it, hands it the props through its
// window name, and keeps the two sides in step until one of them goes away.

import type { EventEmitter } from 'belter';
import type { DomainMatcher } from 'cross-domain-utils';
import type { CrossDomainFunctionType } from 'post-robot';

import {
    addEventListener, assertExists, awaitFrameWindow, cleanup, destroyElement,
    elementReady, eventEmitter, extendUrl, getElementSafe, hideElement,
    iframe, insertShadowSlot, isElementClosed, isShadowElement, memoize,
    noop, normalizeDimension, onResize, popup, showElement,
    stringifyError, uniqueID, watchElementForClose, writeElementToWindow
} from 'belter';
import {
    assertSameDomain, closeWindow, getAncestor, getDistanceFromTop, getDomain,
    getDomainFromUrl, isBlankDomain, isSameDomain, isSameTopWindow, isWindowClosed,
    matchDomain, onCloseWindow
} from 'cross-domain-utils';
import { cleanUpWindow, ProxyWindow, send, toProxyWindow } from 'post-robot';
import { ZalgoPromise } from 'zalgo-promise';

import {
    COMPONENT_ERROR, CONTEXT, DEFAULT_DIMENSIONS, EVENT, MAJOR_VERSION,
    METHOD, POST_MESSAGE, WINDOW_REFERENCE, ZOID
} from './constants';

import type { InitialChildPayload, ParentExportsRemote } from './child';
import type { AttributesType, NormalizedComponentOptions } from './component';
import type { Dimensions, PropsInput, PropsType } from './props';
import type { ProxyObject } from './serialize';
import type { AnyProps, Context, CssDimensions, Method } from './types';
import type { WindowRef } from './window';

import { getGlobal } from './global';
import { extendProps, serializeProps } from './parent-props';
import { crossDomainSerialize, getProxyObject } from './serialize';
import { buildChildWindowName } from './window';

// What a container or prerender template is given.
export type RenderOptions<P> = {
    readonly uid : string,
    readonly props : PropsType<P>,
    readonly tag : string,
    readonly context : Context,
    readonly close : (err ?: unknown) => ZalgoPromise<void>,
    readonly focus : () => ZalgoPromise<void>,
    readonly doc : Document,
    readonly container ?: HTMLElement,
    readonly dimensions : CssDimensions,
    readonly state : Record<string, unknown>,
    readonly event : EventEmitter,
    readonly frame ?: HTMLIFrameElement,
    readonly prerenderFrame ?: HTMLIFrameElement,
};

// The child's functions, as the parent receives them.
type ChildExportsRemote = {
    readonly updateProps : CrossDomainFunctionType<[ AnyProps ], void>,
    readonly close : CrossDomainFunctionType<[], void>,
    readonly name : string,
};

// The parent's functions, as it hands them to the child.
type ParentExports<X> = {
    readonly init : (
        this : { readonly origin ?: unknown } | undefined,
        childExports : ChildExportsRemote
    ) => ZalgoPromise<void>,
    readonly close : () => ZalgoPromise<void>,
    readonly checkClose : () => ZalgoPromise<boolean>,
    readonly resize : (dimensions : Dimensions) => ZalgoPromise<void>,
    readonly onError : (err : unknown) => ZalgoPromise<void>,
    readonly show : () => ZalgoPromise<void>,
    readonly hide : () => ZalgoPromise<void>,
    readonly export : (exports : X) => ZalgoPromise<void>,
};

export type ParentHelpers<P> = {
    readonly state : Record<string, unknown>,
    readonly close : () => ZalgoPromise<void>,
    readonly focus : () => ZalgoPromise<void>,
    readonly resize : (dimensions : Dimensions) => ZalgoPromise<void>,
    readonly onError : (err : unknown) => ZalgoPromise<void>,
    readonly updateProps : (props : PropsInput<P>) => ZalgoPromise<void>,
    readonly event : EventEmitter,
    readonly show : () => ZalgoPromise<void>,
    readonly hide : () => ZalgoPromise<void>,
};

type InternalState = {
    readonly visible : boolean,
};

type Rerender = () => ZalgoPromise<void>;

type RenderContainerOptions = {
    readonly context : Context,
    readonly proxyFrame : ProxyObject<HTMLIFrameElement> | undefined,
    readonly proxyPrerenderFrame : ProxyObject<HTMLIFrameElement> | undefined,
    readonly rerender : Rerender,
};

type OpenOptions = {
    readonly proxyWin : ProxyWindow,
    readonly proxyFrame : ProxyObject<HTMLIFrameElement> | undefined,
    readonly windowName : string,
};

type OpenPrerenderOptions = {
    readonly proxyWin : ProxyWindow,
    readonly proxyPrerenderFrame : ProxyObject<HTMLIFrameElement> | undefined,
};

type GetProxyContainer = (container : string | HTMLElement) => ZalgoPromise<ProxyObject<HTMLElement>>;
type Show = () => ZalgoPromise<void>;
type Hide = () => ZalgoPromise<void>;
type Close = () => ZalgoPromise<void>;
type OnError = (err : unknown) => ZalgoPromise<void>;

type RenderContainer = (
    proxyContainer : ProxyObject<HTMLElement>,
    options : RenderContainerOptions
) => ZalgoPromise<ProxyObject<HTMLElement> | undefined>;

type SetProxyWin = (proxyWin : ProxyWindow) => ZalgoPromise<void>;
type GetProxyWindow = () => ZalgoPromise<ProxyWindow>;

type OpenFrame = (
    context : Context,
    options : { readonly windowName : string }
) => ZalgoPromise<ProxyObject<HTMLIFrameElement> | undefined>;

type OpenPrerenderFrame = (context : Context) => ZalgoPromise<ProxyObject<HTMLIFrameElement> | undefined>;
type Prerender = (proxyPrerenderWin : ProxyWindow, options : { readonly context : Context }) => ZalgoPromise<void>;
type Open = (context : Context, options : OpenOptions) => ZalgoPromise<ProxyWindow>;
type OpenPrerender = (context : Context, options : OpenPrerenderOptions) => ZalgoPromise<ProxyWindow>;
type WatchForUnload = () => ZalgoPromise<void>;
type GetInternalState = () => ZalgoPromise<InternalState>;
type SetInternalState = (state : InternalState) => ZalgoPromise<InternalState>;

// What a parent rendering into another window hands the parent that does
// the work there.
export type ParentDelegateOverrides<P> = {
    readonly props ?: PropsType<P>,
    readonly event ?: EventEmitter,
    readonly close ?: Close & { readonly __source__ ?: Window | ProxyWindow },
    readonly onError ?: OnError,
    readonly getProxyContainer ?: GetProxyContainer,
    readonly show ?: Show,
    readonly hide ?: Hide,
    readonly renderContainer ?: RenderContainer,
    readonly getProxyWindow ?: GetProxyWindow,
    readonly setProxyWin ?: SetProxyWin,
    readonly openFrame ?: OpenFrame,
    readonly openPrerenderFrame ?: OpenPrerenderFrame,
    readonly prerender ?: Prerender,
    readonly open ?: Open,
    readonly openPrerender ?: OpenPrerender,
    readonly watchForUnload ?: WatchForUnload,
    readonly getInternalState ?: GetInternalState,
    readonly setInternalState ?: SetInternalState,
    readonly resolveInitPromise ?: () => ZalgoPromise<void>,
    readonly rejectInitPromise ?: (err : unknown) => ZalgoPromise<void>,
};

// What the parent in the other window hands back.
export type DelegateOverrides = {
    readonly getProxyContainer : GetProxyContainer,
    readonly show : Show,
    readonly hide : Hide,
    readonly renderContainer : RenderContainer,
    readonly getProxyWindow : GetProxyWindow,
    readonly setProxyWin : SetProxyWin,
    readonly openFrame : OpenFrame,
    readonly openPrerenderFrame : OpenPrerenderFrame,
    readonly prerender : Prerender,
    readonly open : Open,
    readonly openPrerender : OpenPrerender,
    readonly watchForUnload : WatchForUnload,
};

export type ParentRenderOptions = {
    readonly target : Window,
    readonly container : string | HTMLElement,
    readonly context : Context,
    readonly rerender : Rerender,
};

export type ParentComponent<P, X> = {
    readonly init : () => void,
    readonly render : (options : ParentRenderOptions) => ZalgoPromise<void>,
    readonly getProps : () => PropsType<P>,
    readonly setProps : (newProps ?: PropsInput<P>) => void,
    readonly export : (exports : X) => ZalgoPromise<void>,
    readonly destroy : (err ?: unknown) => ZalgoPromise<void>,
    readonly getHelpers : () => ParentHelpers<P>,
    readonly getDelegateOverrides : () => ZalgoPromise<DelegateOverrides>,
    readonly getExports : () => X,
};

type RemoteParentComponent = {
    readonly destroy : CrossDomainFunctionType<[ unknown ], void>,
    readonly getDelegateOverrides : CrossDomainFunctionType<[], DelegateOverrides>,
};

type ParentComponentOptions<P, X> = {
    readonly uid : string,
    readonly options : NormalizedComponentOptions<P, X>,
    readonly overrides ?: ParentDelegateOverrides<P>,
    readonly parentWin ?: Window,
};

export const parentComponent = <P extends AnyProps, X>({
    uid, options, overrides = {}, parentWin = window
} : ParentComponentOptions<P, X>) : ParentComponent<P, X> => {
    const {
        propsDef, containerTemplate, prerenderTemplate, tag, name, attributes, dimensions, autoResize, url,
        domain: domainMatch, validate, exports: xports, enableBfcache
    } = options;

    const initPromise = new ZalgoPromise<void>();
    const handledErrors : Array<unknown> = [];
    const clean = cleanup();
    const state : Record<string, unknown> = {};
    const inputProps : AnyProps = {};
    let internalState : InternalState = { visible: true };
    const event = overrides.event ?? eventEmitter();
    const props : PropsType<P> = overrides.props ?? {} as PropsType<P>;

    let currentProxyWin : ProxyWindow | undefined;
    let currentProxyContainer : ProxyObject<HTMLElement> | undefined;
    let childComponent : ChildExportsRemote | undefined;
    let currentChildDomain : string | undefined;
    let currentContainer : HTMLElement | undefined;
    let isRenderFinished = false;

    // Set once the container has been taken out of the page: its watcher then
    // decides between closing and re-rendering, and the child window's own
    // close check, which fires as its iframe unloads, stands aside.
    let containerDetached = false;

    const onErrorOverride = overrides.onError;
    let getProxyContainerOverride = overrides.getProxyContainer;
    let showOverride = overrides.show;
    let hideOverride = overrides.hide;
    const closeOverride = overrides.close;
    let renderContainerOverride = overrides.renderContainer;
    let getProxyWindowOverride = overrides.getProxyWindow;
    let setProxyWinOverride = overrides.setProxyWin;
    let openFrameOverride = overrides.openFrame;
    let openPrerenderFrameOverride = overrides.openPrerenderFrame;
    let prerenderOverride = overrides.prerender;
    let openOverride = overrides.open;
    let openPrerenderOverride = overrides.openPrerender;
    let watchForUnloadOverride = overrides.watchForUnload;
    const getInternalStateOverride = overrides.getInternalState;
    const setInternalStateOverride = overrides.setInternalState;

    const getDimensions = () : CssDimensions => (typeof dimensions === 'function'
        ? dimensions({ props })
        : dimensions);

    const resolveInitPromise = () : ZalgoPromise<void> => ZalgoPromise.try(() => {
        if (overrides.resolveInitPromise) {
            return overrides.resolveInitPromise();
        }

        initPromise.resolve();

        return undefined;
    });

    const rejectInitPromise = (err : unknown) : ZalgoPromise<void> => ZalgoPromise.try(() => {
        if (overrides.rejectInitPromise) {
            return overrides.rejectInitPromise(err);
        }

        initPromise.reject(err);

        return undefined;
    });

    // The props the child may see: not the ones kept parent-side, and not
    // the ones reserved for a same-domain or trusted child.
    const getPropsForChild = (initialChildDomain : string) : ZalgoPromise<AnyProps> => {
        const result : AnyProps = {};

        for (const key of Object.keys(props)) {
            const prop = propsDef[key];

            if (prop?.sendToChild === false) {
                continue;
            }

            const trustedChild = prop?.trustedDomains?.length
                ? prop.trustedDomains.some(domain => matchDomain(domain, initialChildDomain))
                : matchDomain(initialChildDomain, getDomain(window));

            if (!trustedChild && prop?.sameDomain) {
                continue;
            }

            if (!trustedChild && prop?.trustedDomains) {
                continue;
            }

            result[key] = (props as AnyProps)[key];
        }

        return ZalgoPromise.hash(result);
    };

    const setupEvents = () : void => {
        event.on(EVENT.RENDER, () => props.onRender());
        event.on(EVENT.PRERENDER, () => props.onPrerender());
        event.on(EVENT.DISPLAY, () => props.onDisplay());
        event.on(EVENT.RENDERED, () => props.onRendered());
        event.on(EVENT.PRERENDERED, () => props.onPrerendered());
        event.on(EVENT.CLOSE, () => props.onClose());
        event.on(EVENT.DESTROY, () => props.onDestroy());
        event.on(EVENT.RESIZE, () => props.onResize());
        event.on(EVENT.FOCUS, () => props.onFocus());
        event.on(EVENT.BFCACHE_CACHE, () => props.onBfcacheCache());
        event.on(EVENT.BFCACHE_RESTORE, data => props.onBfcacheRestore(data as { cachedDurationMs ?: number }));
        event.on(EVENT.PROPS, newProps => props.onProps?.(newProps as PropsType<P>));

        event.on(EVENT.ERROR, err => {
            const { onError: handler } = props;

            if (handler) {
                return handler(err);
            }

            return rejectInitPromise(err).then(() => {
                setTimeout(() => {
                    throw err;
                }, 1);
            });
        });

        clean.register(event.reset);
    };

    const getInternalState = () : ZalgoPromise<InternalState> => ZalgoPromise.try(() => {
        return getInternalStateOverride
            ? getInternalStateOverride()
            : internalState;
    });

    const setInternalState = (newInternalState : InternalState) : ZalgoPromise<InternalState> => ZalgoPromise.try(
        () => {
            if (setInternalStateOverride) {
                return setInternalStateOverride(newInternalState);
            }

            internalState = { ...internalState, ...newInternalState };

            return internalState;
        }
    );

    const getProxyWindow = () : ZalgoPromise<ProxyWindow> => {
        if (getProxyWindowOverride) {
            return getProxyWindowOverride();
        }

        return ZalgoPromise.try(() => {
            const windowProp = props.window;

            if (windowProp) {
                const proxyWin = toProxyWindow(windowProp);

                clean.register(() => windowProp.close());

                return proxyWin;
            }

            return new ProxyWindow({ send });
        });
    };

    const setProxyWin = (proxyWin : ProxyWindow) : ZalgoPromise<void> => {
        if (setProxyWinOverride) {
            return setProxyWinOverride(proxyWin);
        }

        return ZalgoPromise.try(() => {
            currentProxyWin = proxyWin;
        });
    };

    const show = () : ZalgoPromise<void> => {
        if (showOverride) {
            return showOverride();
        }

        return ZalgoPromise.hash({
            setState:    setInternalState({ visible: true }),
            showElement: currentProxyContainer?.get().then(showElement)
        }).then(noop);
    };

    const hide = () : ZalgoPromise<void> => {
        if (hideOverride) {
            return hideOverride();
        }

        return ZalgoPromise.hash({
            setState:    setInternalState({ visible: false }),
            hideElement: currentProxyContainer?.get().then(hideElement)
        }).then(noop);
    };

    const getUrl = () : string => (typeof url === 'function'
        ? url({ props })
        : url);

    const getAttributes = () : AttributesType => (typeof attributes === 'function'
        ? attributes({ props })
        : attributes);

    const buildQuery = () : ZalgoPromise<Record<string, string | boolean>> =>
        serializeProps({ propsDef, props, method: METHOD.GET });

    const buildBody = () : ZalgoPromise<Record<string, string | boolean>> =>
        serializeProps({ propsDef, props, method: METHOD.POST });

    const buildUrl = () : ZalgoPromise<string> => buildQuery().then(query => extendUrl(getUrl(), { query }));

    const getInitialChildDomain = () : string => getDomainFromUrl(getUrl());

    const getDomainMatcher = () : DomainMatcher => domainMatch ?? getInitialChildDomain();

    const openFrame : OpenFrame = (context, { windowName }) => {
        if (openFrameOverride) {
            return openFrameOverride(context, { windowName });
        }

        return ZalgoPromise.try(() => {
            if (context !== CONTEXT.IFRAME) {
                return undefined;
            }

            return getProxyObject(iframe({
                attributes: {
                    name:  windowName,
                    title: name,
                    ...getAttributes().iframe
                }
            }));
        });
    };

    const openPrerenderFrame : OpenPrerenderFrame = context => {
        if (openPrerenderFrameOverride) {
            return openPrerenderFrameOverride(context);
        }

        return ZalgoPromise.try(() => {
            if (context !== CONTEXT.IFRAME) {
                return undefined;
            }

            return getProxyObject(iframe({
                attributes: {
                    name:  `__${ ZOID }_prerender_frame__${ name }_${ uniqueID() }__`,
                    title: `prerender__${ name }`,
                    ...getAttributes().iframe
                }
            }));
        });
    };

    const openPrerender : OpenPrerender = (context, { proxyWin, proxyPrerenderFrame }) => {
        if (openPrerenderOverride) {
            return openPrerenderOverride(context, { proxyWin, proxyPrerenderFrame });
        }

        return ZalgoPromise.try(() => {
            if (context === CONTEXT.POPUP) {
                return proxyWin;
            }

            if (!proxyPrerenderFrame) {
                throw new Error('Expected proxy frame to be passed');
            }

            return proxyPrerenderFrame.get().then(prerenderFrame => {
                clean.register(() => destroyElement(prerenderFrame));

                return awaitFrameWindow(prerenderFrame)
                    .then(prerenderFrameWindow => assertSameDomain(prerenderFrameWindow))
                    .then(win => toProxyWindow(win));
            });
        });
    };

    const focus = () : ZalgoPromise<void> => ZalgoPromise.try(() => {
        return currentProxyWin
            ? ZalgoPromise.all([ event.trigger(EVENT.FOCUS), currentProxyWin.focus() ]).then(noop)
            : undefined;
    });

    // Registers this window under the instance uid, so a same-origin child
    // can find it by scanning its ancestor's frames.
    const getCurrentWindowReferenceUID = () : string => {
        const global = getGlobal(window);

        global.windows ??= {};
        global.windows[uid] = window;

        clean.register(() => {
            delete global.windows?.[uid];
        });

        return uid;
    };

    type GetWindowRefOptions = {
        readonly target : Window,
        readonly initialChildDomain : string,
        readonly context : Context,
        readonly proxyWin : ProxyWindow,
    };

    const getWindowRef = ({ target, initialChildDomain, context, proxyWin } : GetWindowRefOptions) : WindowRef => {
        if (initialChildDomain === getDomain(window)) {
            return { type: WINDOW_REFERENCE.GLOBAL, uid: getCurrentWindowReferenceUID() };
        }

        if (target !== window) {
            throw new Error('Can not construct cross-domain window reference for different target window');
        }

        if (props.window) {
            const actualComponentWindow = proxyWin.getWindow();

            if (!actualComponentWindow) {
                throw new Error('Can not construct cross-domain window reference for lazy window prop');
            }

            if (getAncestor(actualComponentWindow) !== window) {
                throw new Error(`Can not construct cross-domain window reference for window prop with different ancestor`);
            }
        }

        return context === CONTEXT.POPUP
            ? { type: WINDOW_REFERENCE.OPENER }
            : { type: WINDOW_REFERENCE.PARENT, distance: getDistanceFromTop(window) };
    };

    const runTimeout = () : ZalgoPromise<void> => ZalgoPromise.try(() => {
        const { timeout } = props;

        return timeout
            ? initPromise.timeout(timeout, new Error(`Loading component timed out after ${ timeout } milliseconds`))
            : undefined;
    });

    const initChild = (
        childDomain : string,
        childExports : ChildExportsRemote
    ) : ZalgoPromise<void> => ZalgoPromise.try(
        () => {
            currentChildDomain = childDomain;
            childComponent = childExports;

            const proxyWin = currentProxyWin;

            if (!proxyWin) {
                resolveInitPromise();
                clean.register(() => childExports.close.fireAndForget().catch(noop));

                return;
            }

            // A popup that renamed itself (a same-origin child rewrites its name
            // once it is up) is tracked under the new name.
            proxyWin.isPopup().then(isPopup => {
                if (isPopup && childExports.name !== '') {
                    proxyWin.setName(childExports.name);
                }
            }).finally(() => {
                resolveInitPromise();
                clean.register(() => childExports.close.fireAndForget().catch(noop));
            });
        }
    );

    const resize = ({ width, height } : Dimensions) : ZalgoPromise<void> => ZalgoPromise.try(() => {
        event.trigger(EVENT.RESIZE, { width, height });
    });

    // eslint-disable-next-line promise/no-promise-in-callback -- the teardown chain is the point
    const destroy = (err ?: unknown) : ZalgoPromise<void> => ZalgoPromise.try(() => event.trigger(EVENT.DESTROY))
        .catch(noop)
        .then(() => clean.all(err))
        .then(() => {
            const error = err ?? new Error(COMPONENT_ERROR.COMPONENT_DESTROYED);

            const expected = error instanceof Error &&
                (Object.values(COMPONENT_ERROR) as ReadonlyArray<string>).includes(error.message);

            if (expected || (currentContainer && isElementClosed(currentContainer))) {
                initPromise.resolve();
            } else {
                initPromise.asyncReject(error);
            }
        });

    const close = memoize((err ?: unknown) : ZalgoPromise<void> => ZalgoPromise.try(() => {
        if (closeOverride) {
            // The delegating window's close; skipped once that window is gone.
            const source = closeOverride.__source__
                ? ProxyWindow.unwrap(closeOverride.__source__)
                : undefined;

            return source && !ProxyWindow.isProxyWindow(source) && isWindowClosed(source)
                ? undefined
                : closeOverride();
        }

        return ZalgoPromise.try(() => event.trigger(EVENT.CLOSE))
            .then(() => destroy(err ?? new Error(COMPONENT_ERROR.COMPONENT_CLOSED)));
    }));

    const open : Open = (context, { proxyWin, proxyFrame, windowName }) => {
        if (openOverride) {
            return openOverride(context, { proxyWin, proxyFrame, windowName });
        }

        return ZalgoPromise.try(() : ZalgoPromise<Window> | Window => {
            if (context === CONTEXT.IFRAME) {
                if (!proxyFrame) {
                    throw new Error('Expected proxy frame to be passed');
                }

                return proxyFrame.get().then(frame => awaitFrameWindow(frame).then(win => {
                    clean.register(() => destroyElement(frame));
                    clean.register(() => cleanUpWindow(win));

                    return win;
                }));
            }

            const { width = DEFAULT_DIMENSIONS.WIDTH, height = DEFAULT_DIMENSIONS.HEIGHT } = getDimensions();

            const win = popup('', {
                name:   windowName,
                width:  normalizeDimension(width, window.outerWidth),
                height: normalizeDimension(height, window.outerWidth),
                ...getAttributes().popup
            });

            clean.register(() => closeWindow(win));
            clean.register(() => cleanUpWindow(win));

            return win;
        }).then(win => {
            proxyWin.setWindow(win, { send });

            return proxyWin.setName(windowName).then(() => proxyWin);
        });
    };

    const watchForUnload = () : ZalgoPromise<void> => ZalgoPromise.try(() => {
        let bfcacheEnterTime : number | undefined;

        const unloadWindowListener = addEventListener(window, 'pagehide', evt => {
            if (enableBfcache && (evt as PageTransitionEvent).persisted) {
                bfcacheEnterTime = Date.now();
                event.trigger(EVENT.BFCACHE_CACHE);

                return;
            }

            destroy(new Error(COMPONENT_ERROR.NAVIGATED_AWAY));
        });

        clean.register(unloadWindowListener.cancel);

        if (enableBfcache) {
            const pageshowListener = addEventListener(window, 'pageshow', evt => {
                if ((evt as PageTransitionEvent).persisted) {
                    const cachedDurationMs = bfcacheEnterTime === undefined
                        ? undefined
                        : Date.now() - bfcacheEnterTime;

                    bfcacheEnterTime = undefined;
                    event.trigger(EVENT.BFCACHE_RESTORE, { cachedDurationMs });
                }
            });

            clean.register(pageshowListener.cancel);
        }

        const closeParentWindowListener = onCloseWindow({
            win:   parentWin,
            delay: 3000,

            callback: () => {
                destroy();
            }
        });

        clean.register(closeParentWindowListener.cancel);

        return watchForUnloadOverride
            ? watchForUnloadOverride()
            : undefined;
    });

    const watchForClose = (proxyWin : ProxyWindow, context : Context) : ZalgoPromise<void> => {
        let cancelled = false;

        clean.register(() => {
            cancelled = true;
        });

        return ZalgoPromise.delay(2000).then(() => proxyWin.isClosed()).then(isClosed => {
            if (cancelled) {
                return undefined;
            }

            if (isClosed && context === CONTEXT.POPUP) {
                return close(new Error('Detected popup close'));
            }

            const isCurrentContainerClosed = Boolean(currentContainer && isElementClosed(currentContainer));

            return isClosed && context === CONTEXT.IFRAME && (isCurrentContainerClosed || isRenderFinished)
                ? close(new Error(COMPONENT_ERROR.IFRAME_CLOSE))
                : watchForClose(proxyWin, context);
        });
    };

    const checkWindowClose = (proxyWin : ProxyWindow) : ZalgoPromise<boolean> => {
        let closed = false;

        if (containerDetached) {
            return ZalgoPromise.resolve(false);
        }

        return proxyWin.isClosed().then(isClosed => {
            if (isClosed) {
                closed = true;

                return close(new Error(COMPONENT_ERROR.WINDOW_CLOSED));
            }

            return ZalgoPromise.delay(200).then(() => proxyWin.isClosed()).then(secondIsClosed => {
                if (secondIsClosed) {
                    closed = true;

                    return close(new Error(COMPONENT_ERROR.WINDOW_CLOSED));
                }

                return undefined;
            });
        }).then(() => closed);
    };

    const onError = (err : unknown) : ZalgoPromise<void> => {
        if (onErrorOverride) {
            return onErrorOverride(err);
        }

        return ZalgoPromise.try(() => {
            if (handledErrors.includes(err)) {
                return undefined;
            }

            handledErrors.push(err);
            initPromise.asyncReject(err);

            return event.trigger(EVENT.ERROR, err);
        });
    };

    const exportsPromise = new ZalgoPromise<X>();

    const getExports = () : X => xports({ getExports: () => exportsPromise });

    const xport = (actualExports : X) : ZalgoPromise<void> => ZalgoPromise.try(() => {
        exportsPromise.resolve(actualExports);
    });

    const buildParentExports = (win : ProxyWindow) : ParentExports<X> => ({
        // Called from the child, so `this` is the request's context: the
        // origin it came from is the child's domain.
        init(
            this : { readonly origin ?: unknown } | undefined,
            childExports : ChildExportsRemote
        ) : ZalgoPromise<void> {
            return initChild(String(assertExists(this?.origin, 'child origin')), childExports);
        },

        close,
        checkClose: () => checkWindowClose(win),
        resize,
        onError,
        show,
        hide,
        export:     xport
    });

    type BuildChildPayloadOptions = {
        readonly proxyWin : ProxyWindow,
        readonly initialChildDomain : string,
        readonly childDomainMatch : DomainMatcher,
        readonly context : Context,
    };

    const buildInitialChildPayload = ({
        proxyWin, initialChildDomain, childDomainMatch, context
    } : BuildChildPayloadOptions) : ZalgoPromise<InitialChildPayload<AnyProps, X>> =>
        getPropsForChild(initialChildDomain).then(childProps => ({
            uid,
            context,
            tag,
            childDomainMatch,
            version: MAJOR_VERSION,
            props:   childProps,
            exports: buildParentExports(proxyWin) as unknown as ParentExportsRemote<X>,
            enableBfcache
        }));

    type BuildWindowNameOptions = BuildChildPayloadOptions & {
        readonly target : Window,
    };

    const buildWindowName = ({
        proxyWin, initialChildDomain, childDomainMatch, target, context
    } : BuildWindowNameOptions) : ZalgoPromise<string> =>
        buildInitialChildPayload({ proxyWin, initialChildDomain, childDomainMatch, context }).then(childPayload => {
            const { serializedData, cleanReference } = crossDomainSerialize({
                data:     childPayload,
                metaData: {
                    windowRef: getWindowRef({ target, initialChildDomain, context, proxyWin })
                },
                sender:   { domain: getDomain(window) },
                receiver: { win: proxyWin, domain: childDomainMatch },

                passByReference: initialChildDomain === getDomain()
            });

            clean.register(cleanReference);

            return buildChildWindowName({ name, serializedPayload: serializedData });
        });

    type RenderTemplateOptions = {
        readonly context : Context,
        readonly container ?: HTMLElement,
        readonly doc : Document,
        readonly frame ?: HTMLIFrameElement,
        readonly prerenderFrame ?: HTMLIFrameElement,
    };

    const renderTemplate = (
        renderer : (opts : RenderOptions<P>) => HTMLElement | undefined,
        { context, container, doc, frame, prerenderFrame } : RenderTemplateOptions
    ) : HTMLElement | undefined => renderer({
        uid,
        container,
        context,
        doc,
        frame,
        prerenderFrame,
        focus,
        close,
        state,
        props,
        tag,
        dimensions: getDimensions(),
        event
    });

    const prerender : Prerender = (proxyPrerenderWin, { context }) => {
        if (prerenderOverride) {
            return prerenderOverride(proxyPrerenderWin, { context });
        }

        return ZalgoPromise.try(() => {
            if (!prerenderTemplate) {
                return;
            }

            event.trigger(EVENT.PRERENDER);

            const prerenderWindow = proxyPrerenderWin.getWindow();

            if (!prerenderWindow || !isSameDomain(prerenderWindow) || !isBlankDomain(prerenderWindow)) {
                return;
            }

            const doc = assertSameDomain(prerenderWindow).document;
            const el = renderTemplate(prerenderTemplate, { context, doc });

            if (!el) {
                return;
            }

            if (el.ownerDocument !== doc) {
                throw new Error('Expected prerender template to have been created with document from child window');
            }

            writeElementToWindow(prerenderWindow, el);

            const { width = false, height = false, element: elementRef = 'body' } = autoResize;
            const element = getElementSafe(elementRef, doc);

            if (element && (width || height)) {
                const prerenderResizeListener = onResize({
                    element,
                    width,
                    height,
                    win: prerenderWindow,

                    handler: ({ width: newWidth, height: newHeight }) => {
                        resize({
                            width: width
                                ? newWidth
                                : undefined,
                            height: height
                                ? newHeight
                                : undefined
                        });
                    }
                });

                event.on(EVENT.RENDERED, prerenderResizeListener.cancel);
            }

            event.trigger(EVENT.PRERENDERED);
        });
    };

    const renderContainer : RenderContainer = (
        proxyContainer,
        { proxyFrame, proxyPrerenderFrame, context, rerender }
    ) => {
        if (renderContainerOverride) {
            return renderContainerOverride(proxyContainer, { proxyFrame, proxyPrerenderFrame, context, rerender });
        }

        return ZalgoPromise.hash({
            container:      proxyContainer.get(),
            frame:          proxyFrame?.get(),
            prerenderFrame: proxyPrerenderFrame?.get(),
            internalState:  getInternalState()
        }).then(({ container, frame, prerenderFrame, internalState: { visible } }) => {
            const innerContainer = renderTemplate(containerTemplate, {
                context,
                container,
                frame,
                prerenderFrame,
                doc: document
            });

            if (!innerContainer) {
                return undefined;
            }

            if (!visible) {
                hideElement(innerContainer);
            }

            container.appendChild(innerContainer);

            const containerWatcher = watchElementForClose({
                element: innerContainer,

                handler: () => {
                    const removeError = new Error('Detected container element removed from DOM');

                    containerDetached = true;

                    return ZalgoPromise.delay(1).then(() => {
                        if (isElementClosed(innerContainer)) {
                            close(removeError);

                            return undefined;
                        }

                        clean.all(removeError);

                        return rerender().then(resolveInitPromise, rejectInitPromise);
                    });
                }
            });

            clean.register(() => containerWatcher.cancel());
            clean.register(() => destroyElement(innerContainer));
            currentProxyContainer = getProxyObject(innerContainer);

            return currentProxyContainer;
        });
    };

    const getHelpers = () : ParentHelpers<P> => ({
        state,
        event,
        close,
        focus,
        resize,
        onError,
        // eslint-disable-next-line @typescript-eslint/no-use-before-define -- the helpers are built before updateProps is called
        updateProps,
        show,
        hide
    });

    const getProps = () : PropsType<P> => props;

    const setProps = (newInputProps : PropsInput<P> = {}) : void => {
        validate?.({ props: newInputProps });

        Object.assign(inputProps, newInputProps);

        extendProps({
            propsDef,
            existingProps: props,
            inputProps,

            helpers: {
                state,
                close,
                focus,
                event,
                onError,
                container: currentContainer
            }
        });
    };

    const updateProps = (newProps : PropsInput<P>) : ZalgoPromise<void> => {
        setProps(newProps);

        return initPromise.then(() => {
            const child = childComponent;
            const proxyWin = currentProxyWin;
            const childDomain = currentChildDomain;

            if (!child || !proxyWin || !childDomain) {
                return undefined;
            }

            return getPropsForChild(childDomain).then(childProps =>
                child.updateProps(childProps).catch((err : unknown) => checkWindowClose(proxyWin).then(closed => {
                    if (!closed) {
                        throw err;
                    }
                })));
        });
    };

    const getProxyContainer : GetProxyContainer = container => {
        if (getProxyContainerOverride) {
            return getProxyContainerOverride(container);
        }

        return ZalgoPromise.try(() => elementReady(container)).then(containerElement => {
            const element = isShadowElement(containerElement)
                ? insertShadowSlot(containerElement)
                : containerElement;

            currentContainer = element;

            return getProxyObject(element);
        });
    };

    // Rendering into another window: that window's copy of the component
    // does the DOM work, and hands back the functions this side routes to.
    const delegate = (context : Context, target : Window) : ZalgoPromise<DelegateOverrides> => {
        const delegateProps : AnyProps = {};

        for (const propName of Object.keys(props)) {
            if (propsDef[propName]?.allowDelegate) {
                delegateProps[propName] = (props as AnyProps)[propName];
            }
        }

        const childOverridesPromise = send(target, `${ POST_MESSAGE.DELEGATE }_${ name }`, {
            uid,

            overrides: {
                props: delegateProps,
                event,
                close,
                onError,
                getInternalState,
                setInternalState,
                resolveInitPromise,
                rejectInitPromise
            }
        }).then(({ data }) => {
            const { parent: parentComp } = data as { readonly parent : RemoteParentComponent };

            clean.register(err => {
                return isWindowClosed(target)
                    ? undefined
                    : parentComp.destroy(err);
            });

            return parentComp.getDelegateOverrides();
        }).catch((err : unknown) => {
            throw new Error(`Unable to delegate rendering. Possibly the component is not loaded in the target window.\n\n${
                stringifyError(err) }`);
        });

        const route = <Args extends ReadonlyArray<unknown>, Result>(
            pick : (childOverrides : DelegateOverrides) => (...args : Args) => ZalgoPromise<Result>
        ) : (...args : Args) => ZalgoPromise<Result> =>
            (...args) => childOverridesPromise.then(childOverrides => pick(childOverrides)(...args));

        getProxyContainerOverride = route(childOverrides => childOverrides.getProxyContainer);
        renderContainerOverride = route(childOverrides => childOverrides.renderContainer);
        showOverride = route(childOverrides => childOverrides.show);
        hideOverride = route(childOverrides => childOverrides.hide);
        watchForUnloadOverride = route(childOverrides => childOverrides.watchForUnload);

        if (context === CONTEXT.IFRAME) {
            getProxyWindowOverride = route(childOverrides => childOverrides.getProxyWindow);
            openFrameOverride = route(childOverrides => childOverrides.openFrame);
            openPrerenderFrameOverride = route(childOverrides => childOverrides.openPrerenderFrame);
            prerenderOverride = route(childOverrides => childOverrides.prerender);
            openOverride = route(childOverrides => childOverrides.open);
            openPrerenderOverride = route(childOverrides => childOverrides.openPrerender);
        } else {
            setProxyWinOverride = route(childOverrides => childOverrides.setProxyWin);
        }

        return childOverridesPromise;
    };

    const getDelegateOverrides = () : ZalgoPromise<DelegateOverrides> => ZalgoPromise.try(() => ({
        getProxyContainer,
        show,
        hide,
        renderContainer,
        getProxyWindow,
        watchForUnload,
        openFrame,
        openPrerenderFrame,
        prerender,
        open,
        openPrerender,
        setProxyWin
    }));

    type CheckAllowRenderOptions = {
        readonly target : Window,
        readonly childDomainMatch : DomainMatcher,
    };

    const checkAllowRender = ({ target, childDomainMatch } : CheckAllowRenderOptions) : void => {
        if (target === window) {
            return;
        }

        if (!isSameTopWindow(window, target)) {
            throw new Error('Can only renderTo an adjacent frame');
        }

        const origin = getDomain();

        if (!matchDomain(childDomainMatch, origin) && !isSameDomain(target)) {
            throw new Error(`Can not render remotely to ${ String(childDomainMatch) } - can only render to ${ origin }`);
        }
    };

    const init = () : void => {
        setupEvents();
    };

    const render = (renderOptions : ParentRenderOptions) : ZalgoPromise<void> => ZalgoPromise.try(() => {
        const { target, container, context, rerender } = renderOptions;

        const initialChildDomain = getInitialChildDomain();
        const childDomainMatch = getDomainMatcher();

        checkAllowRender({ target, childDomainMatch });

        const delegatePromise = ZalgoPromise.try(() => (target === window
            ? undefined
            : delegate(context, target)));

        const windowProp = props.window;

        const watchForUnloadPromise = watchForUnload();
        const buildBodyPromise = buildBody();
        const onRenderPromise = event.trigger(EVENT.RENDER);

        const getProxyContainerPromise = getProxyContainer(container);
        const getProxyWindowPromise = getProxyWindow();

        const finalSetPropsPromise = getProxyContainerPromise.then(() => setProps());
        const buildUrlPromise = finalSetPropsPromise.then(() => buildUrl());

        const buildWindowNamePromise = getProxyWindowPromise.then(proxyWin =>
            buildWindowName({ proxyWin, initialChildDomain, childDomainMatch, target, context }));

        const openFramePromise = buildWindowNamePromise.then(windowName => openFrame(context, { windowName }));
        const openPrerenderFramePromise = openPrerenderFrame(context);

        const renderContainerPromise = ZalgoPromise.hash({
            proxyContainer:      getProxyContainerPromise,
            proxyFrame:          openFramePromise,
            proxyPrerenderFrame: openPrerenderFramePromise
        }).then(({ proxyContainer, proxyFrame, proxyPrerenderFrame }) =>
            renderContainer(proxyContainer, { context, proxyFrame, proxyPrerenderFrame, rerender }));

        const openPromise = ZalgoPromise.hash({
            windowName: buildWindowNamePromise,
            proxyFrame: openFramePromise,
            proxyWin:   getProxyWindowPromise
        }).then(({ windowName, proxyWin, proxyFrame }) => (windowProp
            ? proxyWin
            : open(context, { windowName, proxyWin, proxyFrame })));

        const openPrerenderPromise = ZalgoPromise.hash({
            proxyWin:            openPromise,
            proxyPrerenderFrame: openPrerenderFramePromise
        }).then(({ proxyWin, proxyPrerenderFrame }) => openPrerender(context, { proxyWin, proxyPrerenderFrame }));

        const setStatePromise = openPromise.then(proxyWin => {
            currentProxyWin = proxyWin;

            return setProxyWin(proxyWin);
        });

        const prerenderPromise = ZalgoPromise.hash({
            proxyPrerenderWin: openPrerenderPromise,
            state:             setStatePromise
        }).then(({ proxyPrerenderWin }) => prerender(proxyPrerenderWin, { context }));

        const setWindowNamePromise = ZalgoPromise.hash({
            proxyWin:   openPromise,
            windowName: buildWindowNamePromise
        }).then(({ proxyWin, windowName }) => (windowProp
            ? proxyWin.setName(windowName).then(noop)
            : undefined));

        const getMethodPromise = buildBodyPromise.then((body) : Method => {
            if (options.method) {
                return options.method;
            }

            return Object.keys(body).length
                ? METHOD.POST
                : METHOD.GET;
        });

        const loadUrlPromise = ZalgoPromise.hash({
            proxyWin:   openPromise,
            windowUrl:  buildUrlPromise,
            body:       buildBodyPromise,
            method:     getMethodPromise,
            windowName: setWindowNamePromise,
            prerender:  prerenderPromise
        }).then(({ proxyWin, windowUrl, body, method }) => proxyWin.setLocation(windowUrl, { method, body }));

        const watchForClosePromise = openPromise.then(proxyWin => {
            watchForClose(proxyWin, context);
        });

        const onDisplayPromise = ZalgoPromise.hash({
            container: renderContainerPromise,
            prerender: prerenderPromise
        }).then(() => event.trigger(EVENT.DISPLAY));

        const runTimeoutPromise = loadUrlPromise.then(() => runTimeout());

        const onRenderedPromise = initPromise.then(() => {
            isRenderFinished = true;

            return event.trigger(EVENT.RENDERED);
        });

        return ZalgoPromise.hash({
            initPromise,
            buildUrlPromise,
            onRenderPromise,
            getProxyContainerPromise,
            openFramePromise,
            openPrerenderFramePromise,
            renderContainerPromise,
            openPromise,
            openPrerenderPromise,
            setStatePromise,
            prerenderPromise,
            loadUrlPromise,
            buildWindowNamePromise,
            setWindowNamePromise,
            watchForClosePromise,
            onDisplayPromise,
            runTimeoutPromise,
            onRenderedPromise,
            delegatePromise,
            watchForUnloadPromise,
            finalSetPropsPromise
        });
    }).catch((err : unknown) => ZalgoPromise.all([ onError(err), destroy(err) ]).then(
        () => {
            throw err;
        },
        () => {
            throw err;
        }
    )).then(noop);

    return {
        init,
        render,
        destroy,
        getProps,
        setProps,
        export: xport,
        getHelpers,
        getDelegateOverrides,
        getExports
    };
};

