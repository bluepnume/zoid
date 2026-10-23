import { ZalgoPromise } from 'zalgo-promise';

import type { OnWindowOpenResult, TestComponent } from './common';

import { defineComponent, expectParent, getContainer, onWindowOpen, setupSuite, wrapPromise } from './common';

setupSuite();

describe('zoid remove cases', () => {
    const removeAndDestroy = (title : string, tag : string, shadow : boolean) : void => {
        it(title, () => wrapPromise(({ expect }) => {
            let closed = false;

            const { container, destroy } = getContainer({ shadow });

            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv, params }) => lib.create({
                tag:    params.tag as string,
                url:    () => testEnv.foreignChildPage,
                domain: testEnv.foreignOrigin
            }), { tag });

            onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

            return component({
                onRendered: expect('onRendered'),
                onClose:    expect('onClose', () => {
                    closed = true;
                })
            }).render(container).then(() => {
                if (closed) {
                    throw new Error('Expected element to not be closed');
                }

                destroy();

                return ZalgoPromise.delay(5);
            }).then(() => {
                if (!closed) {
                    throw new Error('Expected element to be closed');
                }
            });
        }));
    };

    removeAndDestroy(`should render a component, remove it from the dom, and immediately destroy the component`, `test-remove-destroy`, false);
    removeAndDestroy(`should render a component into the shadow dom, remove it from the dom, and immediately destroy the component`, `test-remove-destroy-shadow`, true);

    it('should not throw an error when parent container is removed before render completes', () => wrapPromise(() => {
        const { container } = getContainer();

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-remove-before-render-complete',
            url:    () => testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        const renderPromise = component().render(container);

        container.remove();

        return renderPromise.then(() => ZalgoPromise.delay(5));
    }));

    it('should not throw an error when window navigates away before render completes', () => wrapPromise(() => {
        const { container } = getContainer();

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-navigation-before-render-complete',
            url:    () => testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        const renderPromise = component().render(container);

        window.dispatchEvent(new Event('pagehide'));

        return renderPromise.then(() => ZalgoPromise.delay(5));
    }));
});
