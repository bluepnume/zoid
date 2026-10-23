// The harness: a definition every window can ask for, expectations that
// settle a test, and ways to watch windows open and containers come and go.
import { assertExists, noop, uniqueID } from 'belter';
import { getParent, isWindowClosed } from 'cross-domain-utils';
import { on } from 'post-robot';
import { ZalgoPromise } from 'zalgo-promise';

import type { ZoidComponent } from '../src';

// eslint-disable-next-line import/no-namespace -- the whole module is what a definition receives
import * as zoidModule from '../src';

import type { ComponentFactory, Definition, Params, Zoid } from './env';

import { collectChildCoverage } from './coverage';
import { COMPONENT_MESSAGE, getTestEnv } from './env';

collectChildCoverage();

export { runOnClick } from './click';

export type { ComponentFactory, Params, Zoid } from './env';

export const zoid : Zoid = zoidModule;

// Suites type their components loosely: props are whatever the test passes.
export type TestComponent = ZoidComponent<Record<string, unknown>>;

export type TestInstance = ReturnType<TestComponent>;

export const expectParent = (win : Window) : void => {
    if (getParent(win) !== window) {
        throw new Error('Expected window parent to be current window');
    }
};

// A test that expects a call to throw synchronously or reject.
export const expectError = (description : string, method : () => unknown) : Promise<void> =>
    ZalgoPromise.try(method).then(
        () => {
            throw new Error(`Expected Error for use case: ${ description }`);
        },
        (err : unknown) => {
            if (!(err instanceof Error)) {
                throw new TypeError(`Expected Error for use case: ${ description }`);
            }
        }
    ).toPromise();

export const env = getTestEnv();

type TestWindow = Window & {
    __component__ ?: ComponentFactory,
    __params__ ?: Params,
    zoid ?: Zoid,
};

const testWindow = window as TestWindow;

testWindow.zoid = zoidModule;

// A child page asks for the definition the test put on this window, as
// source: it has to be a function of `zoid` alone.
on(COMPONENT_MESSAGE, () : Definition => {
    const factory = testWindow.__component__;

    if (!factory) {
        throw new Error('No component definition on the test window');
    }

    return { source: factory.toString(), params: testWindow.__params__ ?? {} };
});

export const setComponent = (factory : ComponentFactory, params : Params = {}) : void => {
    testWindow.__component__ = factory;
    testWindow.__params__ = params;
};

export const getComponent = <T>() : T => {
    const factory = testWindow.__component__;

    if (!factory) {
        throw new Error('No component definition on the test window');
    }

    return factory({ zoid: zoidModule, env, side: 'parent', params: testWindow.__params__ ?? {} }) as T;
};

// Registers a definition and returns what it makes here.
export const defineComponent = <T>(factory : ComponentFactory, params : Params = {}) : T => {
    setComponent(factory, params);

    return getComponent<T>();
};

type AnyFunction = (...args : ReadonlyArray<never>) => unknown;

type AnyArgs = ReadonlyArray<unknown>;

type Expect = {
    (name : string) : (...args : AnyArgs) => ZalgoPromise<void>,
    <F extends AnyFunction>(
        name : string,
        handler : F
    ) : (...args : Parameters<F>) => ZalgoPromise<Awaited<ReturnType<F>>>,
};

type Avoid = {
    (name : string) : (...args : AnyArgs) => void,
    <F extends AnyFunction>(name : string, handler : F) : (...args : Parameters<F>) => ReturnType<F>,
};

type ExpectError = {
    (name : string) : (...args : AnyArgs) => never,
    <F extends AnyFunction>(name : string, handler : F) : (...args : Parameters<F>) => never,
};

export type WrapPromiseHelpers = {
    readonly expect : Expect,
    readonly avoid : Avoid,
    // The old name for `avoid`.
    readonly error : Avoid,
    readonly expectError : ExpectError,
};

const delay = (time : number) : Promise<void> => new Promise(resolve => {
    setTimeout(resolve, time);
});

// Runs a test body that hands out `expect`-wrapped callbacks, and settles
// once every one of them has been called and everything they returned has
// resolved; a callback that throws, an `avoid` that fires, or the timeout
// fails it.
type WrapPromiseOptions = {
    readonly timeout ?: number,
};

export const wrapPromise = async (
    method : (helpers : WrapPromiseHelpers) => unknown,
    { timeout = 5000 } : WrapPromiseOptions = {}
) : Promise<void> => {
    const expected : Array<string> = [];
    const pending : Array<PromiseLike<unknown>> = [];
    let failure : { readonly err : unknown } | undefined;

    const fail = (err : unknown) : void => {
        failure ??= { err };
    };

    const expect = ((name : string, handler : AnyFunction = noop) => {
        expected.push(name);

        return (...args : AnyArgs) => {
            const index = expected.indexOf(name);

            if (index !== -1) {
                expected.splice(index, 1);
            }

            const result = ZalgoPromise.try(() => (handler as (...innerArgs : AnyArgs) => unknown)(...args))
                .catch((err : unknown) => {
                    fail(err);
                    throw err;
                });

            pending.push(result.then(noop, noop));

            return result;
        };
    }) as Expect;

    const avoid = ((name : string, handler : AnyFunction = noop) => (...args : AnyArgs) => {
        fail(new Error(`Expected ${ name } to not be called`));

        return (handler as (...innerArgs : AnyArgs) => unknown)(...args);
    }) as Avoid;

    const expectThrow = ((name : string, handler : AnyFunction = noop) => {
        expected.push(name);

        return (...args : AnyArgs) => {
            const index = expected.indexOf(name);

            if (index !== -1) {
                expected.splice(index, 1);
            }

            // The handler must throw; the throw carries on to the caller, the
            // way a failing validator stops whatever called it.
            const result = (handler as (...innerArgs : AnyArgs) => unknown)(...args);

            fail(new Error(`Expected ${ name } to throw an error`));

            return result;
        };
    }) as ExpectError;

    const helpers : WrapPromiseHelpers = { expect, avoid, error: avoid, expectError: expectThrow };

    pending.push(ZalgoPromise.try(() => method(helpers)).then(noop, (err : unknown) => {
        fail(err);
    }));

    const deadline = Date.now() + timeout;
    let settled = 0;

    // Work settles as the handlers run, so the wait is a loop; it never runs past the deadline.
    /* eslint-disable no-await-in-loop -- each pass waits on what the last one added */
    for (;;) {
        const batch = pending.slice(settled);

        await Promise.race([ Promise.all(batch), delay(Math.max(deadline - Date.now(), 0)) ]);

        if (failure) {
            throw failure.err;
        }

        const outcomes = await Promise.all(batch.map(item => Promise.race([
            Promise.resolve(item).then(() => true),
            delay(0).then(() => false)
        ])));

        if (outcomes.every(Boolean)) {
            settled = pending.length;

            if (!expected.length && settled === pending.length) {
                const latest = pending.slice(settled);

                if (!latest.length) {
                    return;
                }
            }
        }

        if (Date.now() >= deadline) {
            throw new Error(`Expected ${ expected[0] ?? 'pending work' } to be called within ${ timeout }ms`);
        }

        await delay(20);
    }
    /* eslint-enable no-await-in-loop */
};

type MonkeyPatchHandler<Args, Result> = (opts : { readonly call : () => Result, readonly args : Args }) => void;

type Patched = {
    readonly monkeyPatch ?: { readonly handlers : Array<MonkeyPatchHandler<unknown, unknown>> },
};

export const monkeyPatchFunction = <Args extends ReadonlyArray<unknown>, Result>(
    obj : object,
    name : string,
    handler : MonkeyPatchHandler<Args, Result>
) : { readonly cancel : () => void } => {
    const holder = obj as Record<string, unknown>;
    const original = assertExists(holder[name], name) as ((...args : Args) => Result) & Patched;

    if (!original.monkeyPatch) {
        const handlers : Array<MonkeyPatchHandler<unknown, unknown>> = [];

        Object.assign(original, { monkeyPatch: { handlers } });

        holder[name] = function monkeyPatched(this : unknown, ...args : Args) : Result {
            let called = false;
            let result : Result;

            const call = () : Result => {
                if (!called) {
                    called = true;
                    result = original.call(this, ...args);
                }

                return result;
            };

            for (const monkeyHandler of handlers) {
                monkeyHandler({ args, call });
            }

            return call();
        };
    }

    const { handlers } = assertExists(original.monkeyPatch, 'monkeyPatch');

    handlers.push(handler as MonkeyPatchHandler<unknown, unknown>);

    return {
        cancel: () => {
            handlers.splice(handlers.indexOf(handler as MonkeyPatchHandler<unknown, unknown>), 1);
        }
    };
};

export type OnWindowOpenResult = {
    readonly win : Window,
    readonly url : string | undefined,
    readonly name : string | undefined,
    readonly iframe : { readonly element : HTMLIFrameElement } | undefined,
    readonly popup : { readonly args : ReadonlyArray<unknown> } | undefined,
};

// Resolves with the next zoid window opened: a popup through `window.open`,
// or an iframe once it is in the document.
type OnWindowOpenOptions = {
    readonly win ?: Window,
    readonly doc ?: Document,
    readonly time ?: number,
    readonly namePattern ?: RegExp,
};

export const onWindowOpen = ({
    win = window, doc = win.document, time = 500, namePattern = /.*/u
} : OnWindowOpenOptions = {}) : ZalgoPromise<OnWindowOpenResult> => new ZalgoPromise<OnWindowOpenResult>((
    resolve,
    reject
) => {
    const winOpenMonkeyPatch = monkeyPatchFunction<[ string, string, string ], Window | null>(win, `open`, ({ call, args }) => {
        const popup = call();
        const [ url, name ] = args;

        if (namePattern.test(name)) {
            winOpenMonkeyPatch.cancel();

            if (!popup) {
                reject(new Error('Popup was blocked'));

                return;
            }

            resolve({ win: popup, url, name, popup: { args }, iframe: undefined });
        }
    });

    const createElementMonkeyPatch = monkeyPatchFunction<[ string ], HTMLElement>(doc, `createElement`, ({ call, args: [ tagName ] }) => {
        const el = call();

        if (tagName.toLowerCase() !== 'iframe') {
            return;
        }

        const frame = el as HTMLIFrameElement;
        const cleanups : Array<() => void> = [];

        const cleanup = () : void => {
            for (const fn of cleanups) {
                fn();
            }
        };

        const check = () : void => {
            if (frame.contentWindow && frame.name.startsWith('__zoid_') && namePattern.test(frame.name)) {
                cleanup();

                resolve({
                    win:    frame.contentWindow,
                    url:    frame.src,
                    name:   frame.name,
                    iframe: { element: frame },
                    popup:  undefined
                });
            }
        };

        const elementClass = (win as unknown as { readonly HTMLElement : typeof HTMLElement }).HTMLElement;

        const appendChildMonkeyPatch = monkeyPatchFunction<[ Node ], Node>(elementClass.prototype, `appendChild`, ({ call: callAppend }) => {
            callAppend();
            check();
        });

        const timer = setTimeout(() => {
            cleanup();
            reject(new Error(`Window not opened in ${ time }ms`));
        }, time);

        cleanups.push(
            () => createElementMonkeyPatch.cancel(),
            () => appendChildMonkeyPatch.cancel(),
            () => clearTimeout(timer)
        );
    });
}).then(result => {
    if (isWindowClosed(result.win)) {
        throw new Error('Expected win to be open');
    }

    return result;
});

export type Container = {
    readonly container : HTMLElement,
    readonly destroy : () => void,
};

// A container div, plain or inside shadow DOM (with or without slots, one
// or two levels deep).
type GetContainerOptions = {
    readonly parent ?: HTMLElement,
    readonly shadow ?: boolean,
    readonly slots ?: boolean,
    readonly nested ?: boolean,
};

export const getContainer = ({
    parent, shadow = false, slots = false, nested = false
} : GetContainerOptions = {}) : Container => {
    const parentContainer = parent ?? document.body;

    const container = document.createElement('div');

    parentContainer.appendChild(container);

    if (!shadow) {
        return {
            container,

            destroy: () => {
                parentContainer.removeChild(container);
            }
        };
    }

    const customElementName = `zoid-custom-element-${ uniqueID() }`;
    const customSlotName = `zoid-custom-slot-${ uniqueID() }`;
    const innerWrapperName = `zoid-inner-wrapper-${ uniqueID() }`;

    const shadowContainer = document.createElement(slots
        ? 'slot'
        : 'div');

    shadowContainer.setAttribute('name', customSlotName);

    customElements.define(customElementName, class extends HTMLElement {
        connectedCallback() : void {
            this.attachShadow({ mode: 'open' }).appendChild(shadowContainer);
        }
    });

    customElements.define(innerWrapperName, class extends HTMLElement {
        connectedCallback() : void {
            this.attachShadow({ mode: 'open' }).appendChild(shadowContainer);
        }
    });

    const customElement = document.createElement(customElementName);

    parentContainer.appendChild(customElement);

    if (nested) {
        const innerWrapper = document.createElement(innerWrapperName);

        customElement.shadowRoot?.appendChild(innerWrapper);

        const innerWrapperContainer = document.createElement('div');

        innerWrapper.shadowRoot?.appendChild(innerWrapperContainer);

        return {
            container: innerWrapperContainer,

            destroy: () => {
                parentContainer.removeChild(customElement);
            }
        };
    }

    if (!slots) {
        return {
            container: shadowContainer,

            destroy: () => {
                parentContainer.removeChild(customElement);
            }
        };
    }

    const slotProviderElement = document.createElement('div');

    slotProviderElement.setAttribute('slot', customSlotName);
    parentContainer.appendChild(slotProviderElement);

    return {
        container: slotProviderElement,

        destroy: () => {
            parentContainer.removeChild(slotProviderElement);
            parentContainer.removeChild(customElement);
        }
    };
};

export const getBody = (win : Window = window) : HTMLElement => {
    const body = win.document.querySelector('body');

    if (!body) {
        throw new Error('Window has no body');
    }

    return body;
};

// Every suite file starts the same way: a wide page, a named window, and a
// clean slate after each test.
export const setupSuite = () : void => {
    beforeAll(() => {
        document.body.style.width = '1000px';
        document.body.style.height = '1000px';
    });

    beforeEach(() => {
        window.name = '__zoid_test_parent_window__';
    });

    afterEach(async () => {
        window.name = '';
        delete testWindow.__component__;
        delete testWindow.__params__;
        await zoidModule.destroyAll();
    });
};
