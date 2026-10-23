/* eslint-disable max-nested-callbacks -- a suite nests describe, it, wrapPromise, prop handlers and promise chains, and zoid props and window hooks return promises by design */
import { base64decode, destroyElement } from 'belter';
import { getOpener, getParent, isWindowClosed, onCloseWindow } from 'cross-domain-utils';

import type { OnWindowOpenResult, TestComponent } from './common';

import { defineComponent, env, getBody, getContainer, onWindowOpen, setupSuite, wrapPromise } from './common';

type Pair = { readonly simple : TestComponent, readonly remote : TestComponent };

// The `run` prop is invoked from the child, so `this` is that request's
// context: the child window is `this.source`.
type RunContext = { readonly source : Window };

setupSuite();

const expectParent = (win : Window) : void => {
    if (getParent(win) !== window) {
        throw new Error('Expected window parent to be current window');
    }
};

const expectNoSecret = (name : string | undefined) : void => {
    if (!name) {
        throw new Error('Expected window name');
    }

    const serializedPayload = name.split('__')[3] ?? '';

    if (base64decode(serializedPayload).includes('secret12345')) {
        throw new Error('Expected payload to not contain secret value');
    }
};

const pair = (name : string, extra : Record<string, unknown> = {}) : Pair => defineComponent<Pair>(({
    zoid: lib, env: testEnv, params
}) => ({
    simple: lib.create({
        tag:    `test-renderto-${ params.name as string }-simple`,
        url:    testEnv.foreignChildPage,
        domain: testEnv.foreignOrigin
    }),

    remote: lib.create({
        tag:    `test-renderto-${ params.name as string }-remote`,
        url:    testEnv.foreignChildPage,
        domain: testEnv.foreignOrigin,
        ...(params.extra as Record<string, unknown>)
    })
}), { name, extra });

// Both components on this page's origin, for tests whose child code reaches
// into the parent page (its frameElement), as zoid 10's same-origin mock
// domains allowed.
const sameOriginPair = (name : string, extra : Record<string, unknown> = {}) : Pair => defineComponent<Pair>(({
    zoid: lib, env: testEnv, params
}) => ({
    simple: lib.create({ tag: `test-renderto-${ params.name as string }-simple`, url: testEnv.childPage, domain: testEnv.origin }),

    remote: lib.create({
        tag:    `test-renderto-${ params.name as string }-remote`,
        url:    testEnv.childPage,
        domain: testEnv.origin,
        ...(params.extra as Record<string, unknown>)
    })
}), { name, extra });

describe('zoid renderto cases', () => {
    it('should render a component to the parent as an iframe and call a prop', () => wrapPromise(({ expect }) => {
        const { simple } = pair('iframe');

        return simple({
            foo: expect('foo'),

            run: () => {
                onWindowOpen({ namePattern: /^__zoid__test_renderto_iframe_remote/u }).then(expect(`onWindowOpen`, ({ win, name } : OnWindowOpenResult) => {
                    expectParent(win);
                    expectNoSecret(name);
                }));

                return `
                    window.__component__().remote({
                        secret: 'secret12345',
                        foo: window.xprops.foo,
                        run: () => 'window.xprops.foo();'
                    }).renderTo(window.parent, 'body');
                `;
            }
        }).render(getBody());
    }));

    it('should render a component to the parent as a popup and call a prop', () => wrapPromise(({ expect }) => {
        const { simple } = sameOriginPair('popup');

        return simple({
            foo:        expect('foo'),
            runOnClick: true,

            run(this : RunContext) : string {
                const { source } = this;

                onWindowOpen({ win: source, namePattern: /^__zoid__test_renderto_popup_remote/u }).then(expect(`onWindowOpen`, ({ win, name } : OnWindowOpenResult) => {
                    if (getOpener(win) !== source) {
                        throw new Error('Expected window opener to be child frame');
                    }

                    expectNoSecret(name);
                }));

                return `
                    const instance = window.__component__().remote({
                        secret: 'secret12345',
                        foo: window.xprops.foo,
                        run: () => 'window.xprops.foo();'
                    });

                    return instance.renderTo(window.parent, 'body', zoid.CONTEXT.POPUP);
                `;
            }
        }).render(getBody());
    }));

    it('should prerender to a remotely rendered popup', () => wrapPromise(({ expect }) => {
        const { simple } = defineComponent<Pair>(({ zoid: lib, env: testEnv }) => ({
            simple: lib.create({ tag: `test-renderto-prerender-popup-simple`, url: testEnv.foreignChildPage, domain: testEnv.foreignOrigin }),
            remote: lib.create({
                tag:    'test-renderto-prerender-popup-remote',
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
            })
        }));

        return simple({
            prerenderScriptLoaded: expect('prerenderScriptLoaded'),
            runOnClick:            true,
            done:                  expect('done'),

            run: expect('run', () => `
                window.prerenderScriptLoaded = window.xprops.prerenderScriptLoaded;
                window.__component__().remote({
                    done: window.xprops.done,
                    run: () => 'window.xprops.done();'
                }).renderTo(window.parent, 'body', zoid.CONTEXT.POPUP);
            `)
        }).render(getBody());
    }, { timeout: 5000 }));

    it('should prerender to a remotely rendered iframe', () => wrapPromise(({ expect }) => {
        const { simple } = defineComponent<Pair>(({ zoid: lib, env: testEnv }) => ({
            simple: lib.create({ tag: `test-renderto-prerender-iframe-simple`, url: testEnv.foreignChildPage, domain: testEnv.foreignOrigin }),
            remote: lib.create({
                tag:    'test-renderto-prerender-iframe-remote',
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
            })
        }));

        (window as Window & { prerenderScriptLoaded ?: unknown }).prerenderScriptLoaded = expect(`prerenderScriptLoaded`);

        return simple({
            done: expect('done'),
            run:  expect('run', () => `
                window.__component__().remote({
                    done: window.xprops.done,
                    run: () => 'window.xprops.done();'
                }).renderTo(window.parent, 'body');
            `)
        }).render(getBody());
    }, { timeout: 5000 }));

    it(`should render a component to the parent as an iframe and close after a delay`, () => wrapPromise(({ expect }) => {
        const { simple } = sameOriginPair('close-iframe');
        let componentWindow : Window | undefined;

        return simple({
            onClose: expect('onClose', () => {
                if (!componentWindow || !isWindowClosed(componentWindow)) {
                    throw new Error('Expected component window to be closed');
                }
            }),

            run: () => {
                onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => {
                    componentWindow = win;
                }));

                return `
                    window.__component__().remote({
                        onClose: function() {
                            setTimeout(() => {
                                window.frameElement.parentNode.removeChild(window.frameElement)
                            }, 100);
                        },
                        run: () => \`
                            setTimeout(() => {
                                window.frameElement.parentNode.removeChild(window.frameElement)
                            }, 100);
                        \`
                    }).renderTo(window.parent, 'body');
                `;
            }
        }).render(getBody());
    }, { timeout: 5000 }));

    it('should render a component to the parent as a popup and close after a delay', () => wrapPromise(({ expect }) => {
        const { simple } = sameOriginPair('close-popup');
        let componentWindow : Window | undefined;

        return simple({
            onClose: expect('onClose', () => {
                if (!componentWindow || !isWindowClosed(componentWindow)) {
                    throw new Error('Expected component window to be closed');
                }
            }),

            runOnClick: true,

            run(this : RunContext) : string {
                onWindowOpen({ win: this.source }).then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => {
                    componentWindow = win;
                }));

                return `
                    window.__component__().remote({
                        onClose: function() {
                            setTimeout(() => {
                                window.frameElement.parentNode.removeChild(window.frameElement);
                            }, 100);
                        },
                        run: () => \`
                            setTimeout(() => {
                                window.close();
                            }, 100);
                        \`
                    }).renderTo(window.parent, 'body', zoid.CONTEXT.POPUP);
                `;
            }
        }).render(getBody());
    }, { timeout: 5000 }));

    type CloseFromPrerenderCase = { readonly title : string, readonly name : string, readonly popup : boolean };

    const closeFromPrerender = ({ title, name, popup } : CloseFromPrerenderCase) : void => {
        it(title, () => wrapPromise(({ expect }) => {
            const { simple } = defineComponent<Pair>(({ zoid: lib, env: testEnv, params }) => ({
                simple: lib.create({
                    tag:    `test-renderto-prerender-close-${ params.name as string }-simple`,
                    url:    testEnv.childPage,
                    domain: testEnv.origin
                }),
                remote: lib.create({
                    tag:    `test-renderto-prerender-close-${ params.name as string }-remote`,
                    url:    testEnv.childPage,
                    domain: testEnv.origin,

                    prerenderTemplate: ({ close, doc }) => {
                        const html = doc.createElement('html');

                        html.appendChild(doc.createElement('body'));

                        setTimeout(() => {
                            close();
                        }, 300);

                        return html;
                    }
                })
            }), { name });

            return simple({
                runOnClick: popup,

                // A popup opens from the child, so watch that window's open.
                run(this : RunContext) : string {
                    const onClosed = expect('onCloseWindow');

                    onWindowOpen(popup
                        ? { win: this.source }
                        : {}).then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => {
                        onCloseWindow({
                            win,
                            delay: 50,

                            callback: () => {
                                onClosed();
                            }
                        });
                    }));

                    return popup
                        ? 'window.__component__().remote().renderTo(window.parent, \'body\', zoid.CONTEXT.POPUP);'
                        : 'window.__component__().remote().renderTo(window.parent, \'body\');';
                }
            }).render(getBody());
        }, { timeout: 5000 }));
    };

    closeFromPrerender({ title: `should close a zoid renderToParent iframe on call of close from prerender template`, name: `iframe`, popup: false });
    closeFromPrerender({ title: `should close a zoid renderToParent popup on call of close from prerender template`, name: `popup`, popup: true });

    it(`should focus a zoid renderToParent popup on call of focus from container template`, () => wrapPromise(({ expect }) => {
        let doFocus : (() => unknown) | undefined;

        const { simple } = defineComponent<Pair>(({ zoid: lib, env: testEnv }) => ({
            simple: lib.create({ tag: `test-renderto-container-focus-popup-simple`, url: testEnv.foreignChildPage, domain: testEnv.foreignOrigin }),
            remote: lib.create({
                tag:    'test-renderto-container-focus-popup-remote',
                url:    testEnv.foreignChildPage,
                domain: testEnv.foreignOrigin,

                containerTemplate: ({ doc, focus }) => {
                    (window as Window & { doFocus ?: unknown }).doFocus = focus;

                    return doc.createElement('div');
                }
            })
        }));

        return simple({
            doFocus: expect('doFocus', () => {
                doFocus = (window as Window & { doFocus ?: () => unknown }).doFocus;

                if (!doFocus) {
                    throw new Error('Expected container template to have run');
                }

                return doFocus();
            }),
            onFocused:  expect('onFocused'),
            runOnClick: true,

            run: expect('run', () => `
                let win;

                let winOpen = window.open;
                window.open = function windowOpen() {
                    win = winOpen.apply(this, arguments);
                    return win;
                }

                window.__component__().remote().renderTo(window.parent, 'body', zoid.CONTEXT.POPUP).then(() => {
                    win.focus = window.xprops.onFocused;
                    return window.xprops.doFocus();
                });
            `)
        }).render(getBody());
    }, { timeout: 5000 }));

    it(`should focus a zoid renderToParent popup on call of focus from prerender template`, () => wrapPromise(({ expect }) => {
        const { simple } = defineComponent<Pair>(({ zoid: lib, env: testEnv }) => ({
            simple: lib.create({ tag: `test-renderto-prerender-focus-popup-simple`, url: testEnv.foreignChildPage, domain: testEnv.foreignOrigin }),
            remote: lib.create({
                tag:    'test-renderto-prerender-focus-popup-remote',
                url:    testEnv.foreignChildPage,
                domain: testEnv.foreignOrigin,

                prerenderTemplate: ({ doc, focus }) => {
                    const html = doc.createElement('html');

                    html.appendChild(doc.createElement('body'));
                    (window as Window & { doFocus ?: unknown }).doFocus = focus;

                    return html;
                }
            })
        }));

        return simple({
            onFocused:  expect('onFocused'),
            runOnClick: true,

            run: expect('run', () => `
                let win;

                let winOpen = window.open;
                window.open = function windowOpen() {
                    win = winOpen.apply(this, arguments);
                    return win;
                }

                window.__component__().remote().renderTo(window.parent, 'body', zoid.CONTEXT.POPUP).then(() => {
                    win.focus = window.xprops.onFocused;
                    window.doFocus();
                });
            `)
        }).render(getBody());
    }, { timeout: 5000 }));

    it('should error out when trying to renderTo with an element reference', () => wrapPromise(({ expect }) => {
        const { simple } = pair('element-reference');

        return simple({
            childRenderError: expect('childRenderError'),

            run: () => `
                window.__component__().remote().renderTo(window.parent, document.body)
                    .catch(window.xprops.childRenderError);
            `
        }).render(getBody());
    }));

    it('should error out when trying to renderTo to a different popup', () => wrapPromise(({ expect }) => {
        const { simple } = defineComponent<Pair>(({ zoid: lib, env: testEnv }) => ({
            simple: lib.create({ tag: `test-renderto-different-popup-simple`, url: testEnv.foreignChildPage, domain: testEnv.foreignOrigin }),
            remote: lib.create({ tag: `test-renderto-different-popup-remote`, url: testEnv.foreignChildPage, domain: `http://www.foobar.com` })
        }));

        return simple({
            childRenderError: expect('childRenderError'),

            run: () => `
                const win = window.open('', '', 'width=500,height=500');

                window.__component__().remote().renderTo(win, 'body')
                    .catch(err => {
                        win.close();
                        return window.xprops.childRenderError(err);
                    });
            `
        }).render(getBody());
    }));

    it(`should error out when using renderto with a different domain to the current domain`, () => wrapPromise(({ expect }) => {
        const { simple } = defineComponent<Pair>(({ zoid: lib, env: testEnv }) => ({
            simple: lib.create({ tag: `test-renderto-iframe-different-domain-error-simple`, url: testEnv.foreignChildPage, domain: testEnv.foreignOrigin }),
            remote: lib.create({ tag: `test-renderto-iframe-different-domain-error-remote`, url: testEnv.foreignChildPage, domain: `http://www.foobar.com` })
        }));

        return simple({
            childRenderError: expect('childRenderError'),

            run: () => `
                window.__component__().remote().renderTo(window.parent, 'body')
                    .catch(window.xprops.childRenderError);
            `
        }).render(getBody());
    }));

    it(`should error out when using renderto with an iframe without the component loaded`, () => wrapPromise(({ expect }) => {
        const { simple } = defineComponent<{ simple : TestComponent }>(({ zoid: lib, env: testEnv }) => ({
            simple: lib.create({ tag: `test-renderto-iframe-bad-window-error-simple`, url: testEnv.foreignChildPage, domain: testEnv.foreignOrigin })
        }));

        return simple({
            childRenderError: expect('childRenderError'),

            run: () => `
                const remoteComponent = zoid.create({
                    tag:    'test-renderto-iframe-bad-window-error-remote',
                    url:    ${ JSON.stringify(env.foreignChildPage) },
                    domain: ${ JSON.stringify(env.foreignOrigin) }
                });

                remoteComponent().renderTo(window.parent, 'body')
                    .catch(window.xprops.childRenderError);
            `
        }).render(getBody());
    }));

    it(`should render a component to the parent as an iframe and close when the original window closes`, () => wrapPromise(({ expect }) => {
        const { simple } = pair('close-on-parent-close-iframe');

        let simpleFrame : HTMLIFrameElement | undefined;
        let remoteWindow : Window | undefined;

        onWindowOpen().then(expect('onSimpleWindowOpen', ({ iframe } : OnWindowOpenResult) => {
            simpleFrame = iframe?.element;
        }));

        return simple({
            onLoad: expect('onLoad', () => {
                onWindowOpen().then(expect('onRemoteWindowOpen', ({ win } : OnWindowOpenResult) => {
                    remoteWindow = win;
                }));
            }),

            onRemoteLoad: expect('onRemoteLoad', () => {
                if (!remoteWindow || !simpleFrame) {
                    throw new Error('Expected remote window to be populated');
                }

                destroyElement(simpleFrame);

                const onClosed = expect('onCloseWindow');

                return onCloseWindow({
                    win: remoteWindow,

                    callback: () => {
                        onClosed();
                    }
                });
            }),

            run: () => `
                return window.xprops.onLoad().then(() => {
                    return window.__component__().remote().renderTo(window.parent, 'body');
                }).then(() => {
                    return window.xprops.onRemoteLoad();
                });
            `
        }).render(getBody());
    }, { timeout: 5000 }));

    it('should get a successful result from canrenderto', () => wrapPromise(({ expect }) => {
        const { simple } = pair('canrenderto');

        return simple({
            canRenderToResult: expect('canRenderTo', (result : unknown) => {
                if (result !== true) {
                    throw new Error('Expected positive result for canRenderTo');
                }
            }),

            run: () => `
                window.__component__().remote.canRenderTo(window.parent)
                    .then(window.xprops.canRenderToResult)
            `
        }).render(getBody());
    }));

    it('should get a negative result from canrenderto', () => wrapPromise(({ expect }) => {
        const { simple } = defineComponent<{ simple : TestComponent }>(({ zoid: lib, env: testEnv }) => ({
            simple: lib.create({ tag: `test-renderto-canrenderto-negative-simple`, url: testEnv.foreignChildPage, domain: testEnv.foreignOrigin })
        }));

        return simple({
            canRenderToResult: expect('canRenderTo', (result : unknown) => {
                if (result !== false) {
                    throw new Error('Expected negative result for canRenderTo');
                }
            }),

            run: () => `
                const component = zoid.create({
                    tag:    'test-renderto-canrenderto-negative-remote',
                    url:    ${ JSON.stringify(env.foreignChildPage) },
                    domain: ${ JSON.stringify(env.foreignOrigin) }
                });

                component.canRenderTo(window.parent)
                    .then(window.xprops.canRenderToResult)
            `
        }).render(getBody());
    }));

    it(`should render a component to the parent as an iframe inside an iframe and call a prop`, () => wrapPromise(({ expect }) => {
        const { simple } = defineComponent<Pair>(({ zoid: lib, env: testEnv }) => ({
            simple: lib.create({ tag: `test-renderto-iframe-in-iframe-simple`, url: testEnv.foreignChildPage, domain: testEnv.foreignOrigin }),
            remote: lib.create({
                tag:    'test-renderto-iframe-in-iframe-remote',
                url:    testEnv.foreignChildPage,
                domain: testEnv.foreignOrigin,

                containerTemplate: ({ doc, frame, prerenderFrame }) => {
                    const div = doc.createElement('div');
                    const wrapper = doc.createElement('iframe');

                    div.appendChild(wrapper);

                    setTimeout(() => {
                        const body = wrapper.contentDocument?.body;

                        if (body && frame && prerenderFrame) {
                            body.appendChild(frame);
                            body.appendChild(prerenderFrame);
                        }
                    }, 1);

                    return div;
                }
            })
        }));

        return simple({
            foo: expect('foo'),

            run: () => `
                window.__component__().remote({
                    foo: window.xprops.foo,
                    run: () => 'window.xprops.foo();'
                }).renderTo(window.parent, 'body');
            `
        }).render(getBody());
    }));

    it(`should render a component to the parent with a required prop without allowDelegate`, () => wrapPromise(({ expect }) => {
        const { simple } = pair('iframe-required-prop', { props: { foo: { type: 'function', required: true } } });

        return simple({
            foo: expect('foo'),

            run: () => {
                onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

                return `
                    window.__component__().remote({
                        foo: window.xprops.foo,
                        run: () => 'window.xprops.foo();'
                    }).renderTo(window.parent, 'body');
                `;
            }
        }).render(getBody());
    }));

    type ShadowCase = {
        readonly title : string,
        readonly name : string,
        readonly popup : boolean,
        readonly slots : boolean,
    };

    const fromShadow = ({ title, name, popup, slots } : ShadowCase) : void => {
        it(title, () => wrapPromise(({ expect, avoid }) => {
            const { simple } = popup
                ? sameOriginPair(name)
                : pair(name);

            const { container, destroy } = getContainer({ shadow: true, slots });

            return simple({
                foo:        expect('foo', destroy),
                onError:    avoid('onError'),
                runOnClick: true,

                run(this : RunContext) : string {
                    const { source } = this;

                    if (popup) {
                        onWindowOpen({ win: source }).then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => {
                            if (getOpener(win) !== source) {
                                throw new Error('Expected window opener to be child frame');
                            }
                        }));
                    } else {
                        onWindowOpen().then(expect(`onWindowOpen`, ({ win } : OnWindowOpenResult) => expectParent(win)));
                    }

                    return `
                        const instance = window.__component__().remote({
                            foo: window.xprops.foo,
                            onError: window.xprops.onError,
                            run: () => 'window.xprops.foo();'
                        });

                        return instance.renderTo(window.parent, 'body', ${
                            popup
                                ? 'zoid.CONTEXT.POPUP'
                                : 'zoid.CONTEXT.IFRAME'
                        });
                    `;
                }
            }).render(container);
        }));
    };

    fromShadow({ title: `should render a component to the parent as a popup from the shadow-dom and call a prop`, name: `popup-shadow`, popup: true, slots: false });
    fromShadow({ title: `should render a component to the parent as an iframe from the shadow-dom and call a prop`, name: `iframe-shadow`, popup: false, slots: false });
    fromShadow({ title: `should render a component to the parent as a popup from the shadow-dom using slots and call a prop`, name: `popup-shadow-slots`, popup: true, slots: true });
    fromShadow({ title: `should render a component to the parent as an iframe from the shadow-dom using slots and call a prop`, name: `iframe-shadow-slots`, popup: false, slots: true });

    type Dimensions = { readonly width : number, readonly height : number };

    type ShowHideProps = {
        readonly show ?: () => PromiseLike<unknown>,
        readonly hide ?: () => PromiseLike<unknown>,
        readonly createElementWithDimensions : () => PromiseLike<Dimensions>,
    };

    const expectDimensions = ({ width, height } : Dimensions, expected : number) : void => {
        if (width !== expected || height !== expected) {
            throw new Error(`Expected width and height to be ${ expected }, got ${ width } and ${ height }`);
        }
    };

    const measure = `
        createElementWithDimensions: () => {
            const el = document.createElement('div');
            el.style.height = '50px';
            el.style.width = '50px';
            document.body.appendChild(el);

            return {
                height: el.offsetWidth,
                width: el.offsetWidth
            };
        }
    `;

    it('should render a component to the parent as an iframe and hide and show', () => wrapPromise(({ expect }) => {
        const { simple } = pair('iframe-showhide');

        const instance = simple({
            foo: expect('foo', ({ show, hide, createElementWithDimensions } : ShowHideProps) => {
                if (!show || !hide) {
                    throw new Error('Expected show and hide');
                }

                return hide()
                    .then(() => createElementWithDimensions())
                    .then(dimensions => {
                        expectDimensions(dimensions, 0);

                        return show();
                    })
                    .then(() => createElementWithDimensions())
                    .then(dimensions => {
                        expectDimensions(dimensions, 50);
                    });
            }),

            run: () => {
                onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

                return `
                    const instance = window.__component__().remote({
                        foo: ({ createElementWithDimensions }) => {
                            return window.xprops.foo({
                                createElementWithDimensions,
                                show: instance.show,
                                hide: instance.hide
                            });
                        },

                        run: () => \`
                            window.xprops.foo({ ${ measure } });
                        \`
                    });

                    instance.renderTo(window.parent, 'body');
                `;
            }
        });

        return instance.render(getBody());
    }));

    it(`should render a component to the parent as an iframe and hide before render completes`, () => wrapPromise(({ expect }) => {
        // Same origin: a cross-origin frame lays out its own document even while hidden.
        const { simple } = sameOriginPair('iframe-hide-before-render');

        const instance = simple({
            foo: expect(`foo`, ({ createElementWithDimensions } : ShowHideProps) => createElementWithDimensions().then(dimensions => {
                expectDimensions(dimensions, 0);
            })),

            run: () => {
                onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

                return `
                    const instance = window.__component__().remote({
                        foo: ({ createElementWithDimensions }) => {
                            return window.xprops.foo({ createElementWithDimensions });
                        },

                        run: () => \`
                            window.xprops.foo({ ${ measure } });
                        \`
                    });

                    instance.hide();
                    instance.renderTo(window.parent, 'body');
                `;
            }
        });

        return instance.render(getBody());
    }));

    it(`should render a component to the parent as a popup without a container element and call a prop`, () => wrapPromise(({ expect }) => {
        const { simple } = sameOriginPair('popup-no-container', { defaultContext: 'popup' });

        return simple({
            foo:        expect('foo'),
            runOnClick: true,

            run(this : RunContext) : string {
                const { source } = this;

                onWindowOpen({ win: source }).then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => {
                    if (getOpener(win) !== source) {
                        throw new Error('Expected window opener to be child frame');
                    }
                }));

                return `
                    const instance = window.__component__().remote({
                        foo: window.xprops.foo,
                        run: () => 'window.xprops.foo();'
                    });

                    return instance.renderTo(window.parent);
                `;
            }
        }).render(getBody());
    }));

    type UrlChangeCase = {
        readonly title : string,
        readonly name : string,
        readonly popup : boolean,
        readonly changeDomain : boolean,
    };

    const urlChange = ({ title, name, popup, changeDomain } : UrlChangeCase) : void => {
        it(title, () => wrapPromise(({ expect }) => {
            // A popup opens from the child, and the test watches that window's
            // open, so popup cases run on this page's origin.
            const { simple } = defineComponent<Pair>(({ zoid: lib, env: testEnv, params }) => {
                const [ page, origin, otherOrigin ] = params.popup
                    ? [ testEnv.childPage, testEnv.origin, testEnv.foreignOrigin ]
                    : [ testEnv.foreignChildPage, testEnv.foreignOrigin, testEnv.origin ];

                return {
                    simple: lib.create({ tag: `test-renderto-${ params.name as string }-simple`, url: page, domain: origin }),
                    remote: lib.create({
                        tag:    `test-renderto-${ params.name as string }-remote`,
                        url:    `${ page }?firstLoad`,
                        domain: [ origin, otherOrigin ]
                    })
                };
            }, { name, popup });

            const [ samePage, otherPage ] = popup
                ? [ env.childPage, env.foreignChildPage ]
                : [ env.foreignChildPage, env.childPage ];

            const secondUrl = changeDomain
                ? `${ otherPage }?secondLoad`
                : `${ samePage }?secondLoad`;

            return simple({
                firstLoad:  expect('firstLoad'),
                secondLoad: expect('secondLoad'),
                runOnClick: popup,

                run(this : RunContext) : string {
                    const { source } = this;

                    if (popup) {
                        onWindowOpen({ win: source }).then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => {
                            if (getOpener(win) !== source) {
                                throw new Error('Expected window opener to be child frame');
                            }
                        }));
                    } else {
                        onWindowOpen().then(expect(`onWindowOpen`, ({ win } : OnWindowOpenResult) => expectParent(win)));
                    }

                    return `
                        window.__component__().remote({
                            firstLoad: window.xprops.firstLoad,
                            secondLoad: window.xprops.secondLoad,

                            run: () => \`
                                if (location.href.indexOf('firstLoad') !== -1) {
                                    window.xprops.firstLoad().then(() => {
                                        window.location = ${ JSON.stringify(secondUrl) };
                                    });
                                }

                                if (location.href.indexOf('secondLoad') !== -1) {
                                    window.xprops.secondLoad();
                                }
                            \`
                        }).renderTo(window.parent, 'body'${
                            popup
                                ? ', zoid.CONTEXT.POPUP'
                                : ''
                        });
                    `;
                }
            }).render(getBody());
        }));
    };

    urlChange({ title: `should render a component to the parent as an iframe, change url, and call a prop`, name: `iframe-change-url`, popup: false, changeDomain: false });
    urlChange({ title: `should render a component to the parent as a popup, change url, and call a prop`, name: `popup-change-url`, popup: true, changeDomain: false });
    urlChange({ title: `should render a component to the parent as an iframe, change domain, and call a prop`, name: `iframe-change-domain`, popup: false, changeDomain: true });
    urlChange({ title: `should render a component to the parent as a popup, change domain, and call a prop`, name: `popup-change-domain`, popup: true, changeDomain: true });
});
/* eslint-enable max-nested-callbacks */
