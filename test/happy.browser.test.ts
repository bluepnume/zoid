/* eslint-disable max-nested-callbacks -- a suite nests describe, it, wrapPromise, prop handlers and promise chains, and zoid props and window hooks return promises by design */
import { getOpener, getParent } from 'cross-domain-utils';
import { ZalgoPromise } from 'zalgo-promise';

import type { ZoidComponent } from '../src';

import type { OnWindowOpenResult } from './common';

import {
    defineComponent, env, getBody, getContainer, onWindowOpen,
    runOnClick, setupSuite, wrapPromise, zoid
} from './common';

type TestComponent = ZoidComponent<Record<string, unknown>>;

const expectParent = (win : Window) : void => {
    if (getParent(win) !== window) {
        throw new Error('Expected window parent to be current window');
    }
};

const expectOpener = (win : Window) : void => {
    if (getOpener(win) !== window) {
        throw new Error('Expected window opener to be current window');
    }
};

setupSuite();

describe('zoid happy cases', () => {
    it('should render a component where the url is a function', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-url-function',
            url:    () => testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        return component({ onRendered: expect('onRendered') }).render(getBody());
    }));

    it('should render a component with default context', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-default',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        return component({ onRendered: expect('onRendered') }).render(getBody());
    }));

    it('should render a component with iframe context', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-iframe',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        return component({ onRendered: expect('onRendered') }).render(getBody(), zoid.CONTEXT.IFRAME);
    }));

    it('should render a component with popup context', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-popup',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectOpener(win)));

        const instance = component({ onRendered: expect('onRendered') });

        return runOnClick(() => instance.render(getBody(), zoid.CONTEXT.POPUP));
    }));

    it('should render a component with popup context and no element', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:            'test-render-popup-no-element',
            url:            testEnv.foreignChildPage,
            domain:         testEnv.foreignOrigin,
            defaultContext: 'popup'
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectOpener(win)));

        const instance = component({ onRendered: expect('onRendered') });

        return runOnClick(() => instance.render());
    }));

    it('should render a component to a string element selector', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-string-selector',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        return component({ onRendered: expect('onRendered') }).render('body');
    }));

    it('should enter a component rendered as an iframe and call a prop', () => wrapPromise(({ expect }) => {
        const expectedValue = 'bar';

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-iframe-with-prop',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({
            foo: expect('foo', (bar : unknown) => {
                if (bar !== expectedValue) {
                    throw new Error(`Expected bar to be ${ JSON.stringify(expectedValue) }, got ${ JSON.stringify(bar) }`);
                }
            }),

            run: () => `
                window.xprops.foo(${ JSON.stringify(expectedValue) });
            `
        }).render(getBody());
    }));

    it('should enter a component rendered as a popup and call a prop', () => wrapPromise(({ expect }) => {
        const expectedValue = 'bar';

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-popup-with-prop',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        const instance = component({
            foo: expect('foo', (bar : unknown) => {
                if (bar !== expectedValue) {
                    throw new Error(`Expected bar to be ${ JSON.stringify(expectedValue) }, got ${ JSON.stringify(bar) }`);
                }
            }),

            run: () => `
                window.xprops.foo(${ JSON.stringify(expectedValue) });
            `
        });

        return runOnClick(() => instance.render(getBody(), zoid.CONTEXT.POPUP));
    }));

    it('should render a component where the domain is a regex', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-domain-regex',
            url:    testEnv.foreignChildPage,
            domain: new RegExp(`^${ testEnv.foreignOrigin.replaceAll(/[.[\]]/gu, String.raw`\$&`) }$`, 'u')
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        return component({ onRendered: expect('onRendered') }).render(getBody());
    }));

    it('should correctly identify the component as being the child', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-ischild',
            url:    () => testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({
            isChildResult: expect('isChildResult', (result : unknown) => {
                if (result !== true) {
                    throw new Error('Expected result to be true');
                }
            }),

            run: () => `
                window.xprops.isChildResult(window.__component__().isChild());
            `
        }).render(getBody());
    }));

    it('should correctly identify the component as not being the child', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-ischild-negative',
            url:    () => testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({
            isChildResult: expect('isChildResult', (result : unknown) => {
                if (result !== false) {
                    throw new Error('Expected result to be false');
                }
            }),

            run: () => `
                const component = zoid.create({
                    tag:    'test-render-ischild-negative-second',
                    url:    () => ${ JSON.stringify(env.foreignChildPage) },
                    domain: ${ JSON.stringify(env.foreignOrigin) }
                });

                window.xprops.isChildResult(component.isChild());
            `
        }).render(getBody());
    }));

    it(`should enter a component rendered as an iframe inside another iframe and call a prop`, () => wrapPromise(({ expect, avoid }) => {
        const expectedValue = 'bar';

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-iframe-in-iframe-with-prop',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin,

            // The frames go inside another iframe, once that one is in the page.
            containerTemplate: ({ doc, frame, prerenderFrame }) => {
                const div = doc.createElement('div');
                const wrapper = doc.createElement('iframe');

                div.appendChild(wrapper);

                setTimeout(() => {
                    const body = wrapper.contentDocument?.body;

                    if (!body || !frame || !prerenderFrame) {
                        throw new Error('Expected wrapper frame to be in the document');
                    }

                    body.appendChild(frame);
                    body.appendChild(prerenderFrame);
                }, 1);

                return div;
            }
        }));

        return component({
            foo: expect('foo', (bar : unknown) => {
                if (bar !== expectedValue) {
                    throw new Error(`Expected bar to be ${ JSON.stringify(expectedValue) }, got ${ JSON.stringify(bar) }`);
                }
            }),

            onClose: avoid('onClose'),

            run: () => `
                window.xprops.foo(${ JSON.stringify(expectedValue) });
            `
        }).render(getBody());
    }));

    it('should prerender to an iframe', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-prerender-iframe',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin,

            prerenderTemplate: ({ doc }) => {
                const html = doc.createElement('html');
                const body = doc.createElement('body');
                const script = doc.createElement('script');

                script.text = 'window.parent.prerenderScriptLoaded();';
                html.appendChild(body);
                body.appendChild(script);

                return html;
            }
        }));

        (window as Window & { prerenderScriptLoaded ?: unknown }).prerenderScriptLoaded = expect(`prerenderScriptLoaded`);

        return component({
            onPrerender:   expect('onPrerender'),
            onPrerendered: expect('onPrerendered')
        }).render(getBody());
    }));

    it('should prerender to a popup', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-prerender-popup',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin,

            prerenderTemplate: ({ doc }) => {
                const html = doc.createElement('html');
                const body = doc.createElement('body');
                const script = doc.createElement('script');

                script.text = 'window.opener.prerenderScriptLoaded();';
                html.appendChild(body);
                body.appendChild(script);

                return html;
            }
        }));

        (window as Window & { prerenderScriptLoaded ?: unknown }).prerenderScriptLoaded = expect(`prerenderScriptLoaded`);

        const instance = component({
            onPrerender:   expect('onPrerender'),
            onPrerendered: expect('onPrerendered')
        });

        return runOnClick(() => instance.render(getBody(), zoid.CONTEXT.POPUP));
    }));

    it('should render a component into the shadow dom', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-shadow-dom',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        const { container, destroy } = getContainer({ shadow: true });

        return component({ onRendered: expect('onRendered', destroy) }).render(container);
    }));

    it('should render a component into a nested shadow dom', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-nested-shadow-dom',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        const { container, destroy } = getContainer({ shadow: true, nested: true });

        return component({ onRendered: expect('onRendered', destroy) }).render(container);
    }));

    it('should render a component into the shadow dom with slots', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-shadow-dom-slots',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        const { container, destroy } = getContainer({ shadow: true, slots: true });

        return component({ onRendered: expect('onRendered', destroy) }).render(container);
    }));

    it('should render a component with iframe context and a zoid window name', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-iframe-window-name',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win, iframe } : OnWindowOpenResult) => {
            if (!iframe) {
                throw new Error('Expected iframe to be opened');
            }

            const name = iframe.element.getAttribute('name');

            if (!name || name === 'about:blank' || !name.startsWith('__zoid__')) {
                throw new Error('Expected window name to be set when calling window.open');
            }

            expectParent(win);
        }));

        return component({ onRendered: expect('onRendered') }).render(getBody(), zoid.CONTEXT.IFRAME);
    }));

    it('should render a component with popup context and a zoid window name', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-popup-window-name',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win, popup } : OnWindowOpenResult) => {
            if (!popup) {
                throw new Error('Expected popup to be rendered');
            }

            const [ , name ] = popup.args;

            if (typeof name !== 'string' || name === 'about:blank' || !name.startsWith('__zoid__')) {
                throw new Error('Expected window name to be set when calling window.open');
            }

            expectOpener(win);
        }));

        const instance = component({ onRendered: expect('onRendered') });

        return runOnClick(() => instance.render(getBody(), zoid.CONTEXT.POPUP));
    }));

    it('should enter a component rendered as an iframe and call a promise prop', () => wrapPromise(({ expect }) => {
        const expectedValue = 'bar';

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-iframe-with-promise-prop',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({
            foo: ZalgoPromise.resolve(expect('foo', (bar : unknown) => {
                if (bar !== expectedValue) {
                    throw new Error(`Expected bar to be ${ JSON.stringify(expectedValue) }, got ${ JSON.stringify(bar) }`);
                }
            })),

            run: () => `
                window.xprops.foo(${ JSON.stringify(expectedValue) });
            `
        }).render(getBody());
    }));

    it('should enter a component rendered as a popup and call a promise prop', () => wrapPromise(({ expect }) => {
        const expectedValue = 'bar';

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-popup-with-promise-prop',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        const instance = component({
            foo: ZalgoPromise.resolve(expect('foo', (bar : unknown) => {
                if (bar !== expectedValue) {
                    throw new Error(`Expected bar to be ${ JSON.stringify(expectedValue) }, got ${ JSON.stringify(bar) }`);
                }
            })),

            run: () => `
                window.xprops.foo(${ JSON.stringify(expectedValue) });
            `
        });

        return runOnClick(() => instance.render(getBody(), zoid.CONTEXT.POPUP));
    }));

    it('should render an iframe component on the same domain and call a prop', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-iframe-samedomain',
            url:    `${ testEnv.childPage }?firstLoad`,
            domain: testEnv.origin
        }));

        return component({
            callProp: expect('callProp', (origin : unknown) => {
                if (origin !== env.origin) {
                    throw new Error(`Expected domain to be '${ env.origin }', got '${ String(origin) }'`);
                }
            }),

            run: () => `
                window.xprops.callProp(window.location.origin);
            `
        }).render(getBody());
    }));

    it('should render a popup component on the same domain and call a prop', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-popup-samedomain',
            url:    `${ testEnv.childPage }?firstLoad`,
            domain: testEnv.origin
        }));

        const instance = component({
            callProp: expect('callProp', (origin : unknown) => {
                if (origin !== env.origin) {
                    throw new Error(`Expected domain to be '${ env.origin }', got '${ String(origin) }'`);
                }
            }),

            run: () => `
                window.xprops.callProp(window.location.origin);
            `
        });

        return runOnClick(() => instance.render(getBody(), zoid.CONTEXT.POPUP));
    }));

    const urlChangeRun = (secondUrl : string) : string => `
        if (location.href.indexOf('firstLoad') !== -1) {
            window.xprops.firstLoad().then(() => {
                window.location = ${ JSON.stringify(secondUrl) };
            });
        }

        if (location.href.indexOf('secondLoad') !== -1) {
            window.xprops.secondLoad();
        }
    `;

    it('should render an iframe component, change url, and complete', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-iframe-url-change',
            url:    `${ testEnv.foreignChildPage }?firstLoad`,
            domain: testEnv.foreignOrigin
        }));

        return component({
            firstLoad:  expect('firstLoad'),
            secondLoad: expect('secondLoad'),
            run:        () => urlChangeRun(`${ env.foreignChildPage }?secondLoad`)
        }).render(getBody());
    }));

    it('should render a popup component, change url, and complete', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-popup-url-change',
            url:    `${ testEnv.foreignChildPage }?firstLoad`,
            domain: testEnv.foreignOrigin
        }));

        const instance = component({
            firstLoad:  expect('firstLoad'),
            secondLoad: expect('secondLoad'),
            run:        () => urlChangeRun(`${ env.foreignChildPage }?secondLoad`)
        });

        return runOnClick(() => instance.render(getBody(), zoid.CONTEXT.POPUP));
    }));

    it(`should render an iframe component on the same domain, change url, and complete`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-iframe-samedomain-url-change',
            url:    `${ testEnv.childPage }?firstLoad`,
            domain: testEnv.origin
        }));

        return component({
            firstLoad:  expect('firstLoad'),
            secondLoad: expect('secondLoad'),
            run:        () => urlChangeRun(`${ env.childPage }?secondLoad`)
        }).render(getBody());
    }));

    it(`should render a popup component on the same domain, change url, and complete`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-popup-samedomain-url-change',
            url:    `${ testEnv.childPage }?firstLoad`,
            domain: testEnv.origin
        }));

        const instance = component({
            firstLoad:  expect('firstLoad'),
            secondLoad: expect('secondLoad'),
            run:        () => urlChangeRun(`${ env.childPage }?secondLoad`)
        });

        return runOnClick(() => instance.render(getBody(), zoid.CONTEXT.POPUP));
    }));

    it(`should render an iframe component, change url to a different domain, and complete`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-iframe-url-change-diffdomain',
            url:    `${ testEnv.foreignChildPage }?firstLoad`,
            domain: [ testEnv.foreignOrigin, testEnv.origin ]
        }));

        return component({
            firstLoad:  expect('firstLoad'),
            secondLoad: expect('secondLoad'),
            run:        () => urlChangeRun(`${ env.childPage }?secondLoad`)
        }).render(getBody());
    }));

    it(`should render a popup component, change url to a different domain, and complete`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-popup-url-change-diffdomain',
            url:    `${ testEnv.foreignChildPage }?firstLoad`,
            domain: [ testEnv.foreignOrigin, testEnv.origin ]
        }));

        const instance = component({
            firstLoad:  expect('firstLoad'),
            secondLoad: expect('secondLoad'),
            run:        () => urlChangeRun(`${ env.childPage }?secondLoad`)
        });

        return runOnClick(() => instance.render(getBody(), zoid.CONTEXT.POPUP));
    }));

    it(`should render an iframe component on the same domain, change url to a different domain, and complete`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-iframe-samedomain-url-change-diffdomain',
            url:    `${ testEnv.childPage }?firstLoad`,
            domain: [ testEnv.origin, testEnv.foreignOrigin ]
        }));

        return component({
            firstLoad:  expect('firstLoad'),
            secondLoad: expect('secondLoad'),
            run:        () => urlChangeRun(`${ env.foreignChildPage }?secondLoad`)
        }).render(getBody());
    }));

    it(`should render a popup component on the same domain, change url to a different domain, and complete`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-popup-samedomain-url-change-diffdomain',
            url:    `${ testEnv.childPage }?firstLoad`,
            domain: [ testEnv.origin, testEnv.foreignOrigin ]
        }));

        const instance = component({
            firstLoad:  expect('firstLoad'),
            secondLoad: expect('secondLoad'),
            run:        () => urlChangeRun(`${ env.foreignChildPage }?secondLoad`)
        });

        return runOnClick(() => instance.render(getBody(), zoid.CONTEXT.POPUP));
    }));
});
/* eslint-enable max-nested-callbacks */
