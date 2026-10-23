/* eslint-disable max-nested-callbacks -- a suite nests describe, it, wrapPromise, prop handlers and promise chains, and zoid props and window hooks return promises by design */
import { destroyElement, noop } from 'belter';
import { ZalgoPromise } from 'zalgo-promise';

import type { OnWindowOpenResult, TestComponent } from './common';

import { defineComponent, env, getBody, onWindowOpen, runOnClick, setupSuite, wrapPromise, zoid } from './common';

setupSuite();

describe('zoid error cases', () => {
    it('should error out when window.open returns a closed window', () => wrapPromise(({ expect, error }) => {
        const windowOpen = window.open.bind(window);

        window.open = () => ({ closed: true, close: error('close') } as unknown as Window);

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-error-popup-closed',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({ onDestroy: expect(`onDestroy`), onError: noop }).render(`body`, zoid.CONTEXT.POPUP).catch(expect(`catch`, (err : unknown) => {
            window.open = windowOpen;

            if (!(err instanceof zoid.PopupOpenError)) {
                throw err;
            }
        }));
    }));

    it(`should enter a component, throw an integration error, and return the error to the parent with the original message`, () => wrapPromise(({ expect, avoid }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-error-from-child',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({
            onDestroy: avoid('onDestroy'),

            onError: expect('onError', (err : unknown) => {
                if (!(err instanceof Error) || !err.message.includes('xxxxx')) {
                    throw new Error('Expected error to contain original error from child window');
                }
            }),

            run: () => 'window.xprops.onError(new Error(\'xxxxx\'));'
        }).render(getBody(), zoid.CONTEXT.IFRAME).catch(noop);
    }));

    it('should enter a component and timeout, then call onError', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-error-from-child-onerror',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({
            timeout:   1,
            onError:   expect('onError'),
            onDestroy: expect('onDestroy')
        }).render(getBody(), zoid.CONTEXT.IFRAME).catch(expect('catch'));
    }));

    it(`should run validate function on props, and pass up error when thrown`, () => wrapPromise(({ expect, expectError }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-error-prop-validate',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin,
            props:  {
                validateProp: {
                    type:     'string',
                    validate: expectError('validate', () => {
                        throw new Error('Invalid prop');
                    })
                }
            }
        }));

        return ZalgoPromise.try(() => {
            component({ validateProp: 'foo' });
        }).catch(expect('catch'));
    }));

    it(`should run validate function on props, and not call onError when error is thrown`, () => wrapPromise(({ expect, avoid, expectError }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-error-prop-validate-onerror',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin,
            props:  {
                validateProp: {
                    type:     'string',
                    validate: expectError('validate', () => {
                        throw new Error('Invalid prop');
                    })
                }
            }
        }));

        return ZalgoPromise.try(() => {
            component({ validateProp: 'foo', onError: avoid('onError') });
        }).catch(expect('catch'));
    }));

    it(`should run validate function on component, and pass up error when thrown`, () => wrapPromise(({ expect, expectError }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:      'test-error-validate',
            url:      testEnv.foreignChildPage,
            domain:   testEnv.foreignOrigin,
            validate: expectError('validate', () => {
                throw new Error('Invalid component');
            })
        }));

        return ZalgoPromise.try(() => {
            component();
        }).catch(expect('catch'));
    }));

    it(`should run validate function on component, and not call onError when error is thrown`, () => wrapPromise(({ expect, avoid, expectError }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:      'test-error-validate-onerror',
            url:      testEnv.foreignChildPage,
            domain:   testEnv.foreignOrigin,
            validate: expectError('validate', () => {
                throw new Error('Invalid component');
            })
        }));

        return ZalgoPromise.try(() => {
            component({ onError: avoid('onError') });
        }).catch(expect('catch'));
    }));

    it('should call onError when a popup is opened without a click event', () => wrapPromise(({ expect, avoid }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-popup-no-onclick',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({
            onClose:   avoid('onClose'),
            onError:   expect('onError'),
            onDestroy: expect('onDestroy')
        }).render('body', zoid.CONTEXT.POPUP).catch(expect('catch'));
    }, { timeout: 5000 }));

    it(`should call onclose when a popup is closed by someone other than zoid`, () => wrapPromise(({ expect, avoid }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-onclose-popup-closed',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        let openedWindow : Window | undefined;

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => {
            openedWindow = win;
        }));

        const instance = component({
            onClose:   expect('onClose'),
            onError:   avoid('onError'),
            onDestroy: expect('onDestroy')
        });

        return runOnClick(() => instance.render('body', zoid.CONTEXT.POPUP)).then(() => {
            if (!openedWindow) {
                throw new Error('Expected window to have been opened');
            }

            openedWindow.close();
        });
    }, { timeout: 5000 }));

    it(`should call onclose when a popup is closed by someone other than zoid during render`, () => wrapPromise(({ expect, avoid }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-onclose-popup-closed-during-render',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win: openedWindow } : OnWindowOpenResult) => {
            setTimeout(() => openedWindow.close(), 1);
        }));

        const instance = component({
            onClose:   expect('onClose'),
            onError:   avoid('onError'),
            onDestroy: expect('onDestroy')
        });

        return runOnClick(() => instance.render('body', zoid.CONTEXT.POPUP)).catch(expect('catch'));
    }, { timeout: 5000 }));

    it(`should call onclose when an iframe is closed by someone other than zoid`, () => wrapPromise(({ expect, avoid }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-onclose-iframe-closed',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        let openedFrame : HTMLIFrameElement | undefined;

        onWindowOpen().then(expect('onWindowOpen', ({ iframe } : OnWindowOpenResult) => {
            openedFrame = iframe?.element;
        }));

        const instance = component({
            onClose:   expect('onClose'),
            onError:   avoid('onError'),
            onDestroy: expect('onDestroy')
        });

        // Removed once rendered: removing it mid-render is the next test's case.
        return runOnClick(() => instance.render('body')).then(() => {
            if (!openedFrame) {
                throw new Error('Expected the frame to have been opened');
            }

            destroyElement(openedFrame);
        });
    }, { timeout: 5000 }));

    it(`should error out when iframe is closed by someone other than zoid during render`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-onclose-iframe-closed-during-render',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ iframe } : OnWindowOpenResult) => {
            if (iframe) {
                destroyElement(iframe.element);
            }
        }));

        return component({ onError: expect('onError') }).render('body', zoid.CONTEXT.IFRAME).catch(expect('catch'));
    }, { timeout: 5000 }));

    it(`should error out when a prerender template is created with the incorrect document`, () => wrapPromise(({ expect, avoid }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-prerender-incorrect-document',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin,

            prerenderTemplate: () => {
                const body = document.createElement('body');
                const html = document.createElement('html');

                html.appendChild(body);

                return html;
            }
        }));

        return component({
            onDestroy:     expect('onDestroy'),
            onError:       noop,
            onPrerender:   expect('onPrerender'),
            onPrerendered: avoid('onPrerendered')
        }).render(getBody()).catch(expect('catch'));
    }));

    type ReloadCase = {
        readonly title : string,
        readonly tag : string,
        readonly popup : boolean,
        readonly delay : number,
    };

    const closedAfterReload = ({ title, tag, popup, delay } : ReloadCase) : void => {
        it(title, () => wrapPromise(({ expect, avoid }) => {
            // Same origin: the test reloads the child's location from here.
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv, params }) => lib.create({
                tag:    params.tag as string,
                url:    testEnv.childPage,
                domain: testEnv.origin
            }), { tag });

            let opened : { readonly win : Window, readonly frame ?: HTMLIFrameElement } | undefined;

            onWindowOpen().then(expect('onWindowOpen', ({ win, iframe } : OnWindowOpenResult) => {
                opened = { win, frame: iframe?.element };
            }));

            const closeIt = () : void => {
                if (!opened) {
                    throw new Error('Expected window to have opened');
                }

                if (popup) {
                    opened.win.close();
                } else if (opened.frame) {
                    destroyElement(opened.frame);
                }
            };

            const instance = component({
                run:    () => 'window.xprops.onLoad();',
                onLoad: expect('onLoad', () => {
                    opened?.win.location.reload();

                    if (delay) {
                        setTimeout(closeIt, delay);
                    } else {
                        closeIt();
                    }
                }),
                onClose:   expect('onClose'),
                onError:   avoid('onError'),
                onDestroy: expect('onDestroy')
            });

            return popup
                ? runOnClick(() => instance.render('body', zoid.CONTEXT.POPUP))
                : instance.render('body', zoid.CONTEXT.IFRAME);
        }, { timeout: 9000 }));
    };

    closedAfterReload({ title: `should call onclose when an iframe is closed immediately after changing location`, tag: `test-onclose-iframe-redirected-during-render`, popup: false, delay: 0 });
    closedAfterReload({ title: `should call onclose when an iframe is closed after changing location after a small delay`, tag: `test-onclose-iframe-immediately-redirected-during-render`, popup: false, delay: 50 });
    closedAfterReload({ title: `should call onclose when a popup is closed immediately after changing location`, tag: `test-onclose-popup-redirected-during-render`, popup: true, delay: 0 });
    closedAfterReload({ title: `should call onclose when a popup is closed after changing location after a small delay`, tag: `test-onclose-popup-immediately-redirected-during-render`, popup: true, delay: 50 });

    it('should error out when a component is created with a duplicate tag', () => wrapPromise(({ expect }) => {
        zoid.create({ tag: 'test-error-duplicate-tag', url: env.foreignChildPage, domain: env.foreignOrigin });

        return ZalgoPromise.try(() => {
            zoid.create({ tag: 'test-error-duplicate-tag', url: env.foreignChildPage, domain: env.foreignOrigin });
        }).catch(expect('catch'));
    }));

    it('should error out where an invalid element is passed', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-invalid-element',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({ onDestroy: expect(`onDestroy`) }).render({} as unknown as HTMLElement).catch(expect(`catch`));
    }));

    it('should error out where an invalid window is passed', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-invalid-window',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({ onDestroy: expect(`onDestroy`) }).renderTo({} as unknown as Window, `body`).catch(expect(`catch`));
    }));

    it('should error out where no element is passed', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-no-element',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({ onDestroy: expect('onDestroy') }).render().catch(expect('catch'));
    }));

    it('should error out where an invalid context is passed', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-invalid-context',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({ onDestroy: expect('onDestroy') }).render('body', 'meep' as never).catch(expect('catch'));
    }));

    it(`should error out when trying to register a child when one is already active`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-xprops-present',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({
            onLoad: expect('onLoad', (message : unknown) => {
                if (typeof message !== 'string' || !message.includes('child already registered')) {
                    throw new Error(`Expected the child to refuse a second registration, got ${ String(message) }`);
                }
            }),

            // The child page has already created the component, and is its child.
            run: () => `
                let message;

                try {
                    zoid.create({
                        tag:    'test-xprops-present',
                        url:    ${ JSON.stringify(env.foreignChildPage) },
                        domain: ${ JSON.stringify(env.foreignOrigin) }
                    });
                } catch (err) {
                    message = err.message;
                }

                window.xprops.onLoad(message);
            `
        }).render(getBody());
    }));

    it('should not set xprops when window name does not contain zoid', () => {
        window.name = '__transformer__test_create_window_name_no_zoid__abc123__';

        zoid.create({ tag: 'test-create-window-name-no-zoid', url: env.foreignChildPage, domain: env.foreignOrigin });

        expect((window as Window & { xprops ?: unknown }).xprops).toBeUndefined();
    });

    it('should not set xprops when window name does not contain a component name', () => {
        window.name = '__zoid__';

        zoid.create({ tag: `test-create-window-name-no-component-name-passed`, url: env.foreignChildPage, domain: env.foreignOrigin });

        expect((window as Window & { xprops ?: unknown }).xprops).toBeUndefined();
    });

    it('should not set xprops when window name does not match component name', () => {
        window.name = '__zoid__some_other_component__abc123__';

        zoid.create({ tag: `test-create-window-name-non-matching-component`, url: env.foreignChildPage, domain: env.foreignOrigin });

        expect((window as Window & { xprops ?: unknown }).xprops).toBeUndefined();
    });

    it('should not set xprops when payload is not sent', () => {
        window.name = '__zoid__test_create_window_name_no_payload__';

        zoid.create({ tag: `test-create-window-name-no-payload`, url: env.foreignChildPage, domain: env.foreignOrigin });

        expect((window as Window & { xprops ?: unknown }).xprops).toBeUndefined();
    });

    it('should throw when the payload is not correctly formatted', () => {
        window.name = '__zoid__test_create_window_name_bad_payload__abc123__';

        expect(() => zoid.create({ tag: `test-create-window-name-bad-payload`, url: env.foreignChildPage, domain: env.foreignOrigin })).toThrow();
    });

    it('should not call onError when the window navigates away', () => wrapPromise(({ expect, avoid }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-error-unload',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({
            onError:   avoid('onError'),
            onDestroy: expect('onDestroy')
        }).render(getBody(), zoid.CONTEXT.IFRAME).then(() => {
            window.dispatchEvent(new Event('pagehide'));
        });
    }));

    it(`should not call onDestroy when the page enters bfcache and enableBfcache is true`, () => wrapPromise(({ expect, avoid }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:           'test-bfcache-enter-enabled',
            url:           testEnv.foreignChildPage,
            domain:        testEnv.foreignOrigin,
            enableBfcache: true
        }));

        const testComplete = expect('testComplete');

        return component({
            onError:   avoid('onError'),
            onDestroy: avoid('onDestroy')
        }).render(getBody(), zoid.CONTEXT.IFRAME).then(() => {
            window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));

            return ZalgoPromise.delay(50);
        }).then(() => {
            testComplete();
        });
    }));

    it(`should call onDestroy when the page enters bfcache but enableBfcache is false (default)`, () => wrapPromise(({ expect, avoid }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-bfcache-enter-disabled',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({
            onError:   avoid('onError'),
            onDestroy: expect('onDestroy')
        }).render(getBody(), zoid.CONTEXT.IFRAME).then(() => {
            window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
        });
    }));

    it(`should call onDestroy on a real unload even when enableBfcache is true`, () => wrapPromise(({ expect, avoid }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:           'test-bfcache-real-unload',
            url:           testEnv.foreignChildPage,
            domain:        testEnv.foreignOrigin,
            enableBfcache: true
        }));

        return component({
            onError:   avoid('onError'),
            onDestroy: expect('onDestroy')
        }).render(getBody(), zoid.CONTEXT.IFRAME).then(() => {
            window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
        });
    }));

    it('should call onDestroy even if component is not eligible', () => wrapPromise(({ expect, avoid }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:      'test-error-ondestroy-ineligible',
            url:      testEnv.foreignChildPage,
            domain:   testEnv.foreignOrigin,
            eligible: () => ({ eligible: false })
        }));

        return component({
            onError:   avoid('onError'),
            onDestroy: expect('onDestroy')
        }).render(getBody(), zoid.CONTEXT.IFRAME).catch(expect('error'));
    }));
});
/* eslint-enable max-nested-callbacks */
