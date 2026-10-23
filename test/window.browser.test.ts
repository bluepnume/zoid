import { uniqueID } from 'belter';
import { once, send } from 'post-robot';
import { ZalgoPromise } from 'zalgo-promise';

import type { TestComponent } from './common';

import { defineComponent, env, getBody, runOnClick, setupSuite, wrapPromise } from './common';

setupSuite();

type Pair = { readonly simple : TestComponent, readonly remote : TestComponent };

const openFrame = () : Window => {
    const frame = document.createElement('iframe');

    getBody().appendChild(frame);

    if (!frame.contentWindow) {
        throw new Error('Frame has no window');
    }

    return frame.contentWindow;
};

const openPopup = () : Window => runOnClick(() => {
    const win = window.open('', '');

    if (!win) {
        throw new Error('Popup blocked');
    }

    return win;
});

// Sets a value in the given window and reads it back through a child prop.
type ExpectGetter = (name : string, handler : (getUID : () => PromiseLike<unknown>) => unknown) => unknown;

const passUIDGetter = (win : Window, expect : ExpectGetter) : unknown => {
    const uid = uniqueID();

    return expect('passUIDGetter', getUID => send(win, 'eval', { code: `window.uid = ${ JSON.stringify(uid) };` })
        .then(() => getUID())
        .then(childUID => {
            if (childUID !== uid) {
                throw new Error('Expected uid to match');
            }
        }));
};

describe('zoid window prop cases', () => {
    it('should pass a custom iframe to a component', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-custom-iframe',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        const win = openFrame();

        return component({
            window:        win,
            passUIDGetter: passUIDGetter(win, expect),
            run:           () => 'window.xprops.passUIDGetter(() => window.uid);'
        }).render(getBody());
    }));

    it('should pass a custom iframe to a component, and close the zoid component', () => wrapPromise(() => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-custom-iframe-close',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        const frame = document.createElement('iframe');

        getBody().appendChild(frame);

        const win = frame.contentWindow;

        if (!win) {
            throw new Error('Frame has no window');
        }

        const instance = component({ window: win });

        return instance.render(getBody()).then(() => instance.close()).then(() => {
            if (!win.closed) {
                throw new Error('Expected iframe to be closed');
            }

            if (getBody().contains(frame)) {
                throw new Error('Expected iframe to be removed from dom');
            }
        });
    }));

    it('should pass a custom popup to a component', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-custom-popup',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        const win = openPopup();

        return component({
            window:        win,
            passUIDGetter: passUIDGetter(win, expect),
            run:           () => 'window.xprops.passUIDGetter(() => window.uid);'
        }).render(getBody());
    }));

    it('should pass a custom popup to a component, and close the zoid component', () => wrapPromise(() => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-custom-popup-close',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        const win = openPopup();
        const instance = component({ window: win });

        return instance.render(getBody()).then(() => instance.close()).then(() => {
            if (!win.closed) {
                throw new Error('Expected popup to be closed');
            }
        });
    }));

    it('should pass a custom popup to a component and close it', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-custom-close-popup',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        const win = openPopup();

        return component({
            window:  win,
            onClose: expect('onClose'),
            doClose: expect('doClose', () => {
                win.close();
            }),
            run: () => 'window.xprops.doClose();'
        }).render(getBody());
    }));

    it('should pass a custom iframe to a component and close it', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-custom-close-iframe',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        const frame = document.createElement('iframe');

        getBody().appendChild(frame);

        const win = frame.contentWindow;

        if (!win) {
            throw new Error('Frame has no window');
        }

        return component({
            window:  win,
            onClose: expect('onClose'),
            doClose: expect('doClose', () => {
                getBody().removeChild(frame);
            }),
            run: () => 'window.xprops.doClose();'
        }).render(getBody());
    }));

    type CustomWindowCase = { readonly title : string, readonly name : string, readonly popup : boolean };

    const renderToWithCustomWindow = ({ title, name, popup } : CustomWindowCase) : void => {
        it(title, () => wrapPromise(({ expect }) => {
            const { simple } = defineComponent<Pair>(({ zoid: lib, env: testEnv, params }) => ({
                simple: lib.create({
                    tag:    `test-renderto-custom-${ params.name as string }-simple`,
                    url:    testEnv.foreignChildPage,
                    domain: testEnv.foreignOrigin
                }),
                remote: lib.create({
                    tag:    `test-renderto-custom-${ params.name as string }-remote`,
                    url:    testEnv.foreignChildPage,
                    domain: testEnv.foreignOrigin
                })
            }), { name });

            const win = popup
                ? openPopup()
                : openFrame();

            return simple({
                myCustomWindow: win,
                passUIDGetter:  passUIDGetter(win, expect),

                run: () => `
                    window.__component__().remote({
                        window: window.xprops.myCustomWindow,
                        passUIDGetter: window.xprops.passUIDGetter,
                        run: () => 'window.xprops.passUIDGetter(() => window.uid);'
                    }).renderTo(window.parent, 'body');
                `
            }).render(getBody());
        }));
    };

    renderToWithCustomWindow({ title: `should renderTo with a custom iframe passed through an iframe`, name: `iframe`, popup: false });
    renderToWithCustomWindow({ title: `should renderTo with a custom popup passed through an iframe`, name: `popup`, popup: true });

    it('should pass a custom popup to a component with a loaded url', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-custom-popup-loaded-url',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        const win = runOnClick(() => {
            const popup = window.open(`${ env.origin }/test/pages/basic.html`, '__custom_popup_test__');

            if (!popup) {
                throw new Error('Popup blocked');
            }

            return popup;
        });

        return once('initBasicChild', expect('initBasicChild', () => component({
            window:        win,
            passUIDGetter: passUIDGetter(win, expect),
            run:           () => 'window.xprops.passUIDGetter(() => window.uid);'
        }).render(getBody())));
    }));

    it(`should renderTo with a custom popup passed through an iframe, and close the popup`, () => wrapPromise(({ expect }) => {
        const { simple } = defineComponent<Pair>(({ zoid: lib, env: testEnv }) => ({
            simple: lib.create({ tag: `test-renderto-custom-popup-close-simple`, url: testEnv.foreignChildPage, domain: testEnv.foreignOrigin }),
            remote: lib.create({ tag: `test-renderto-custom-popup-close-remote`, url: testEnv.foreignChildPage, domain: testEnv.foreignOrigin })
        }));

        const win = openPopup();

        return simple({
            myCustomWindow:     win,
            customWindowClosed: expect('customWindowClosed'),
            closeCustomWindow:  expect('closeCustomWindow', () => {
                win.close();
            }),

            run: () => `
                window.__component__().remote({
                    window: window.xprops.myCustomWindow,
                    onClose: window.xprops.customWindowClosed,
                    closeCustomWindow: window.xprops.closeCustomWindow,
                    run: () => 'window.xprops.closeCustomWindow();'
                }).renderTo(window.parent, 'body');
            `
        }).render(getBody());
    }));

    it('should error when a non-window is passed', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-bogus-window',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return ZalgoPromise.try(() => {
            component({ window: { location: 'meep' } as unknown as Window });
        }).catch(expect('catch'));
    }));
});
