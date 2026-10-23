import { ZalgoPromise } from 'zalgo-promise';

/* eslint-disable max-nested-callbacks -- a suite nests describe, it, wrapPromise, prop handlers and promise chains, and zoid props and window hooks return promises by design */
import type { TestComponent } from './common';

import { defineComponent, getBody, setupSuite, wrapPromise } from './common';

setupSuite();

type Executing = { readonly exec : (code : string) => PromiseLike<unknown> };

type Pair = { readonly simple : TestComponent, readonly remote : TestComponent };

type RerenderLocalOptions = { readonly title : string, readonly tag : string, readonly duringRender : boolean };

type RerenderRemoteOptions = { readonly title : string, readonly name : string, readonly duringRender : boolean };

describe('zoid rerender cases', () => {
    const rerenderLocal = ({ title, tag, duringRender } : RerenderLocalOptions) : void => {
        it(title, () => wrapPromise(({ expect, avoid }) => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv, params }) => lib.create({
                tag:    params.tag as string,
                url:    testEnv.foreignChildPage,
                domain: testEnv.foreignOrigin,

                exports: ({ getExports }) => ({
                    exec: (...args : ReadonlyArray<unknown>) => getExports().then(exports =>
                        (exports as { exec : (...innerArgs : ReadonlyArray<unknown>) => unknown }).exec(...args))
                })
            }), { tag });

            const container = document.createElement('div');

            getBody().appendChild(container);

            const instance = component({
                onRendered: expect('onRendered'),
                onClose:    avoid('onClose'),
                onDestroy:  avoid('onDestroy'),
                onError:    avoid('onError'),
                foo:        expect('foo'),

                run: () => `
                    window.xprops.export({
                        exec: (code) => eval(code)
                    });
                `
            });

            const remount = () : void => {
                getBody().removeChild(container);
                getBody().appendChild(container);
            };

            const renderPromise = instance.render(container);

            if (duringRender) {
                remount();
            }

            return renderPromise
                .then(() => ZalgoPromise.delay(50))
                .then(() => {
                    if (!duringRender) {
                        remount();
                    }
                })
                .then(() => ZalgoPromise.delay(50))
                .then(() => (instance as unknown as Executing).exec('window.xprops.foo();'));
        }));
    };

    rerenderLocal({
        title:        'should re-render a component when the container is removed and immediately re-added to the dom',
        tag:          'test-rerender',
        duringRender: false
    });

    rerenderLocal({
        title:        `should re-render a component when the container is removed and immediately re-added to the dom during render`,
        tag:          'test-rerender-during-render',
        duringRender: true
    });

    const rerenderRemote = ({ title, name, duringRender } : RerenderRemoteOptions) : void => {
        it(title, () => wrapPromise(({ expect, avoid }) => {
            const { simple } = defineComponent<Pair>(({ zoid: lib, env: testEnv, params }) => ({
                simple: lib.create({
                    tag:    `test-rerender-${ params.name as string }-simple`,
                    url:    testEnv.foreignChildPage,
                    domain: testEnv.foreignOrigin
                }),

                remote: lib.create({
                    tag:    `test-rerender-${ params.name as string }-remote`,
                    url:    testEnv.foreignChildPage,
                    domain: testEnv.foreignOrigin,

                    exports: ({ getExports }) => ({
                        exec: (...args : ReadonlyArray<unknown>) => getExports().then(exports =>
                            (exports as { exec : (...innerArgs : ReadonlyArray<unknown>) => unknown }).exec(...args))
                    })
                })
            }), { name });

            const container = document.createElement('div');

            container.id = 'remote-element-id';
            getBody().appendChild(container);

            const flow = duringRender
                ? `
                    const renderPromise = instance.renderTo(window.parent, '#remote-element-id');

                    return window.xprops.rerender().then(() => renderPromise)
                        .then(() => window.xprops.delay(500))
                `
                : `
                    return instance.renderTo(window.parent, '#remote-element-id')
                        .then(() => window.xprops.delay(50))
                        .then(() => window.xprops.rerender())
                        .then(() => window.xprops.delay(50))
                `;

            return simple({
                onRendered: expect('onRendered'),
                onClose:    avoid('onClose'),
                onDestroy:  avoid('onDestroy'),
                onError:    avoid('onError'),
                foo:        expect('foo'),
                delay:      (time : number) => ZalgoPromise.delay(time),

                rerender: () => {
                    getBody().removeChild(container);
                    getBody().appendChild(container);
                },

                run: () => `
                    const instance = window.__component__().remote({
                        foo: window.xprops.foo,
                        run: () => \`
                            window.xprops.export({
                                exec: (code) => eval(code)
                            });
                        \`
                    });

                    ${ flow }
                        .then(() => instance.exec('window.xprops.foo();'))
                        .catch(window.xprops.onError);
                `
            }).render(getBody());
        }));
    };

    rerenderRemote({
        title:        `should render a component to the parent as an iframe and re-render when the container is removed and re-added`,
        name:         'renderto-iframe',
        duringRender: false
    });

    rerenderRemote({
        title:        `should render a component to the parent as an iframe and re-render when the container is removed and re-added during render`,
        name:         'during-render-renderto-iframe',
        duringRender: true
    });
});
/* eslint-enable max-nested-callbacks */
