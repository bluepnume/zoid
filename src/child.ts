// The child side: a window that finds its parent through its window name,
// builds `window.xprops` from the payload, and tells the parent it is up.

import type { CrossDomainFunctionType } from 'post-robot';

import { elementReady, noop, onResize } from 'belter';
import { assertSameDomain, getAllFramesInWindow, isSameDomain, matchDomain, onCloseWindow } from 'cross-domain-utils';
import { markWindowKnown } from 'post-robot';
import { ZalgoPromise } from 'zalgo-promise';

import { CONTEXT, MAJOR_VERSION } from './constants';

import type { NormalizedComponentOptions } from './component';
import type { ChildHelpers, ChildProps, Dimensions, Sibling } from './props';
import type { AnyProps } from './types';

import { normalizeChildProps } from './child-props';
import { getGlobal, tryGlobal } from './global';
import { getInitialParentPayload, updateChildWindowNameWithRef } from './window';

// What the child hands the parent once it is up.
export type ChildExports = {
    readonly updateProps : (props : AnyProps) => ZalgoPromise<void>,
    readonly close : () => ZalgoPromise<void>,
    readonly name : string,
};

// The parent's functions, as the child receives them.
export type ParentExportsRemote<X> = {
    readonly init : CrossDomainFunctionType<[ ChildExports ], void>,
    readonly close : CrossDomainFunctionType<[], void>,
    readonly checkClose : CrossDomainFunctionType<[], boolean>,
    readonly resize : CrossDomainFunctionType<[ Dimensions ], void>,
    readonly onError : CrossDomainFunctionType<[ unknown ], void>,
    readonly show : CrossDomainFunctionType<[], void>,
    readonly hide : CrossDomainFunctionType<[], void>,
    readonly export : CrossDomainFunctionType<[ X ], void>,
};

// What the parent writes into the child's window name.
export type InitialChildPayload<P, X> = {
    readonly uid : string,
    readonly tag : string,
    readonly version : string,
    readonly context : typeof CONTEXT[keyof typeof CONTEXT],
    readonly childDomainMatch : unknown,
    readonly props : P,
    readonly exports : ParentExportsRemote<X>,
    readonly enableBfcache : boolean,
};

export type ChildComponent<P, X> = {
    readonly getProps : () => ChildProps<P, X>,
    readonly init : () => ZalgoPromise<void>,
};

const checkParentDomain = (
    allowedParentDomains : NormalizedComponentOptions['allowedParentDomains'],
    domain : string
) : void => {
    if (!matchDomain(allowedParentDomains, domain)) {
        throw new Error(`Can not be rendered by domain: ${ domain }`);
    }
};

const focus = () : ZalgoPromise<void> => ZalgoPromise.try(() => {
    window.focus();
});

const destroy = () : ZalgoPromise<void> => ZalgoPromise.try(() => {
    window.close();
});

type WindowWithProps = Window & { readonly xprops ?: ChildProps<AnyProps, unknown> };

export const childComponent = <P extends AnyProps, X>(
    options : NormalizedComponentOptions<P, X>
) : ChildComponent<P, X> => {
    const { tag, propsDef, autoResize, allowedParentDomains } = options;

    const onPropHandlers : Array<(props : ChildProps<P, X>) => unknown> = [];

    const { parent, payload } = getInitialParentPayload<InitialChildPayload<P, X>>();
    const { win: parentComponentWindow, domain: parentDomain } = parent;

    let props : ChildProps<P, X> | undefined;
    const exportsPromise = new ZalgoPromise<X>();

    const { version, uid, exports: parentExports, context, props: initialProps, enableBfcache } = payload;

    // A parent on another major can not talk to this child.
    if (version.split(/[._]/u)[0] !== MAJOR_VERSION) {
        throw new Error(`Parent window has zoid version ${ version }, child window has version ${ MAJOR_VERSION }`);
    }

    const {
        show, hide, close, onError, checkClose, export: parentExport, resize: parentResize, init: parentInit
    } = parentExports;

    const getParent = () : Window => parentComponentWindow;
    const getParentDomain = () : string => parentDomain;

    const onProps = (handler : (props : ChildProps<P, X>) => unknown) : { readonly cancel : () => void } => {
        onPropHandlers.push(handler);

        return {
            cancel: () => {
                onPropHandlers.splice(onPropHandlers.indexOf(handler), 1);
            }
        };
    };

    const resize = ({ width, height } : Dimensions) : ZalgoPromise<void> =>
        parentResize.fireAndForget({ width, height });

    const xport = (xports : X) : ZalgoPromise<void> => {
        exportsPromise.resolve(xports);

        return parentExport(xports);
    };

    const getSiblings = ({ anyParent } : { readonly anyParent ?: boolean } = {}) : ReadonlyArray<Sibling> => {
        const result : Array<Sibling> = [];
        const currentParent = props?.parent;
        const includeAnyParent = anyParent ?? !currentParent;

        if (!includeAnyParent && !currentParent) {
            throw new Error(`No parent found for ${ tag } child`);
        }

        for (const win of getAllFramesInWindow(window)) {
            if (!isSameDomain(win)) {
                continue;
            }

            const { xprops } = assertSameDomain(win) as WindowWithProps;

            if (xprops?.getParent() !== getParent()) {
                continue;
            }

            const winParent = xprops.parent;

            if (!includeAnyParent && currentParent && winParent?.uid !== currentParent.uid) {
                continue;
            }

            result.push({
                props:   xprops,
                exports: tryGlobal(win, global => global.exports)
            });
        }

        return result;
    };

    const getHelpers = () : ChildHelpers<P, X> => ({
        tag,
        show,
        hide,
        close,
        focus,
        onError,
        resize,
        getSiblings,
        onProps,
        getParent,
        getParentDomain,
        uid,
        export: xport
    });

    const watchForClose = () : void => {
        window.addEventListener('beforeunload', () => {
            checkClose.fireAndForget();
        });

        window.addEventListener('pagehide', event => {
            if (enableBfcache && event.persisted) {
                return;
            }

            checkClose.fireAndForget();
        });

        onCloseWindow({
            win: parentComponentWindow,

            callback: () => {
                destroy();
            }
        });
    };

    type SetPropsOptions = {
        readonly newProps : AnyProps,
        readonly origin : string,
        readonly isUpdate ?: boolean,
    };

    const setProps = ({ newProps, origin, isUpdate = false } : SetPropsOptions) : void => {
        const normalizedProps = normalizeChildProps({
            parentComponentWindow,
            propsDef,
            props:   newProps,
            origin,
            helpers: getHelpers() as ChildHelpers<AnyProps, unknown>,
            isUpdate
        }) as ChildProps<P, X>;

        if (props) {
            Object.assign(props, normalizedProps);
        } else {
            props = normalizedProps;
        }

        for (const handler of onPropHandlers) {
            handler(props);
        }
    };

    const watchForResize = () : ZalgoPromise<void> => {
        const { width = false, height = false, element: elementRef = 'body' } = autoResize;

        return elementReady(elementRef).catch(noop).then(element => {
            if (!element || (!width && !height) || context === CONTEXT.POPUP) {
                return;
            }

            onResize({
                element,
                width,
                height,

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
        });
    };

    const updateProps = (newProps : AnyProps) : ZalgoPromise<void> =>
        ZalgoPromise.try(() => setProps({ newProps, origin: parentDomain, isUpdate: true }));

    const init = () : ZalgoPromise<void> => ZalgoPromise.try(() => {
        const updatedChildName = isSameDomain(parentComponentWindow)
            ? updateChildWindowNameWithRef({ componentName: options.name, parentComponentWindow }) ?? ''
            : '';

        getGlobal(window).exports = options.exports({ getExports: () => exportsPromise });

        checkParentDomain(allowedParentDomains, parentDomain);
        markWindowKnown(parentComponentWindow);
        watchForClose();

        return parentInit({
            name:  updatedChildName,
            updateProps,
            close: destroy
        });
    }).then(() => watchForResize()).catch((err : unknown) => {
        onError(err);
    });

    const getProps = () : ChildProps<P, X> => {
        if (props) {
            return props;
        }

        // Reject a disallowed parent before any props are exposed to the page.
        checkParentDomain(allowedParentDomains, parentDomain);
        setProps({ newProps: initialProps, origin: parentDomain });

        return props as unknown as ChildProps<P, X>;
    };

    return { init, getProps };
};
