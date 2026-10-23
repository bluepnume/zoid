/* eslint-disable max-nested-callbacks, @typescript-eslint/no-misused-promises -- a suite nests describe, it, wrapPromise, prop handlers and promise chains, and zoid props and window hooks return promises by design */
import { onCloseWindow } from 'cross-domain-utils';

import type { OnWindowOpenResult, TestComponent } from './common';

import { defineComponent, getBody, onWindowOpen, runOnClick, setupSuite, wrapPromise, zoid } from './common';

setupSuite();

type Helpers = Window & {
    closeComponent ?: () => PromiseLike<unknown>,
    focusComponent ?: () => PromiseLike<unknown>,
};

const helpers = window as Helpers;

// Popups here are same-origin so their focus and close can be replaced.
describe('zoid actions', () => {
    it('should close a zoid iframe', () => wrapPromise(({ expect }) => {
        let win : Window | undefined;

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-container-close-iframe',
            url:    testEnv.childPage,
            domain: testEnv.origin,

            containerTemplate: ({ doc, close, frame, prerenderFrame }) => {
                (window as Helpers).closeComponent = close;

                const div = doc.createElement('div');

                if (frame && prerenderFrame) {
                    div.appendChild(frame);
                    div.appendChild(prerenderFrame);
                }

                return div;
            }
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win: openedWindow } : OnWindowOpenResult) => {
            win = openedWindow;
        }));

        return component().render(getBody(), zoid.CONTEXT.IFRAME).then(() => {
            if (!win || !helpers.closeComponent) {
                throw new Error('Expected window and close helper');
            }

            const onClosed = expect('onCloseWindow');

            onCloseWindow({
                win,
                delay: 50,

                callback: () => {
                    onClosed();
                }
            });

            return helpers.closeComponent();
        });
    }));

    type PopupCase = {
        readonly title : string,
        readonly tag : string,
        readonly action : 'close' | 'focus',
        readonly breakClose : boolean,
    };

    const popupAction = ({ title, tag, action, breakClose } : PopupCase) : void => {
        it(title, () => wrapPromise(({ expect }) => {
            let win : Window | undefined;

            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv, params }) => lib.create({
                tag:    params.tag as string,
                url:    testEnv.childPage,
                domain: testEnv.origin,

                containerTemplate: ({ doc, close, focus }) => {
                    (window as Helpers).closeComponent = close;
                    (window as Helpers).focusComponent = focus;

                    return doc.createElement('div');
                }
            }), { tag });

            onWindowOpen().then(expect('onWindowOpen', ({ win: openedWindow } : OnWindowOpenResult) => {
                win = openedWindow;
            }));

            const instance = component();

            return runOnClick(() => instance.render(getBody(), zoid.CONTEXT.POPUP)).then(() => {
                if (!win || !helpers.closeComponent || !helpers.focusComponent) {
                    throw new Error('Expected window and helpers');
                }

                if (action === 'focus') {
                    win.focus = expect('windowFocus');

                    return helpers.focusComponent();
                }

                const onClosed = expect('onCloseWindow');

                onCloseWindow({
                    win,
                    delay: 50,

                    callback: () => {
                        onClosed();
                    }
                });

                if (breakClose) {
                    const popup = win;
                    const winClose = popup.close.bind(popup);

                    popup.close = expect('close', () => {
                        popup.close = winClose;
                    });
                }

                return helpers.closeComponent();
            });
        }));
    };

    popupAction({ title: `should close a zoid popup`, tag: `test-container-close-popup`, action: `close`, breakClose: false });

    popupAction({
        title:      'should close a zoid popup even when win.close does not work',
        tag:        'test-container-close-popup-from-child',
        action:     'close',
        breakClose: true
    });

    popupAction({ title: `should focus a zoid popup`, tag: `test-container-focus-popup`, action: `focus`, breakClose: false });

    it('should close a zoid iframe using the helper', () => wrapPromise(({ expect }) => {
        let win : Window | undefined;

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-container-helper-close-iframe',
            url:    testEnv.childPage,
            domain: testEnv.origin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win: openedWindow } : OnWindowOpenResult) => {
            win = openedWindow;
        }));

        const instance = component();

        return instance.render(getBody(), zoid.CONTEXT.IFRAME).then(() => {
            if (!win) {
                throw new Error('Expected window');
            }

            const onClosed = expect('onCloseWindow');

            onCloseWindow({
                win,
                delay: 50,

                callback: () => {
                    onClosed();
                }
            });

            return instance.close();
        });
    }));

    it('should focus a zoid popup using the helper', () => wrapPromise(({ expect }) => {
        let win : Window | undefined;

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-container-helper-focus-popup',
            url:    testEnv.childPage,
            domain: testEnv.origin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win: openedWindow } : OnWindowOpenResult) => {
            win = openedWindow;
        }));

        const instance = component();

        return runOnClick(() => instance.render(getBody(), zoid.CONTEXT.POPUP)).then(() => {
            if (!win) {
                throw new Error('Expected window');
            }

            win.focus = expect('windowFocus');

            return instance.focus();
        });
    }));
});
/* eslint-enable max-nested-callbacks, @typescript-eslint/no-misused-promises */
