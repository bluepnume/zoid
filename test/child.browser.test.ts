import { onCloseWindow } from 'cross-domain-utils';

import type { OnWindowOpenResult, TestComponent } from './common';

import { defineComponent, getBody, onWindowOpen, runOnClick, setupSuite, wrapPromise, zoid } from './common';

setupSuite();

describe('zoid child cases', () => {
    it('should render a popup component and focus from the child', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-iframe-focus-from-child',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        const instance = component({
            didFocus: expect('didFocus', (focused : unknown) => {
                if (!focused) {
                    throw new Error('Expected window to have been focused');
                }
            }),

            run: () => `
                let focused = false;
                window.focus = () => {
                    focused = true;
                };

                window.xprops.focus().then(() => {
                    return window.xprops.didFocus(focused);
                });
            `
        });

        return runOnClick(() => instance.render(getBody(), zoid.CONTEXT.POPUP));
    }));

    type CloseCase = { readonly title : string, readonly tag : string, readonly code : string };

    const closeFromChild = ({ title, tag, code } : CloseCase) : void => {
        it(title, () => wrapPromise(({ expect }) => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv, params }) => lib.create({
                tag:    params.tag as string,
                url:    testEnv.foreignChildPage,
                domain: testEnv.foreignOrigin
            }), { tag });

            const onClosed = expect('onCloseWindow');

            onWindowOpen().then(expect(`onWindowOpen`, ({ win } : OnWindowOpenResult) => onCloseWindow({
                win,
                delay: 50,

                callback: () => {
                    onClosed();
                }
            })));

            const instance = component({
                onClose: expect('onClose'),
                run:     () => code
            });

            return runOnClick(() => instance.render(getBody(), zoid.CONTEXT.POPUP));
        }, { timeout: 5000 }));
    };

    closeFromChild({
        title: 'should render a popup component and close from the child',
        tag:   'test-render-iframe-close-from-child',
        code:  'window.xprops.close();'
    });

    closeFromChild({
        title: 'should render a popup component and close from the child manually',
        tag:   'test-render-iframe-close-manually-from-child',
        code:  'window.close();'
    });

    it('should pass an error up from the child', () => wrapPromise(({ expect }) => {
        const message = 'Something went wrong';
        const code = 'OH_NO';

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-iframe-error-from-child',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        const instance = component({
            onError: expect('onError', (err : unknown) => {
                if (!(err instanceof Error)) {
                    throw new TypeError('Expected an error to be passed up');
                }

                if (err.message !== message) {
                    throw new Error(`Expected error message to be ${ JSON.stringify(message) }, got ${ JSON.stringify(err.message) }`);
                }

                const errCode = (err as Error & { code ?: unknown }).code;

                if (errCode !== code) {
                    throw new Error(`Expected error code to be ${ JSON.stringify(code) }, got ${ JSON.stringify(errCode) }`);
                }
            }),

            run: () => `
                const err = new Error(${ JSON.stringify(message) });
                err.code = ${ JSON.stringify(code) };
                window.xprops.onError(err);
            `
        });

        return runOnClick(() => instance.render(getBody(), zoid.CONTEXT.POPUP));
    }));
});
