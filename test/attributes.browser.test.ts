import type { OnWindowOpenResult, TestComponent } from './common';

import { defineComponent, getBody, onWindowOpen, setupSuite, wrapPromise } from './common';

setupSuite();

describe('zoid attributes cases', () => {
    it('should render a component to an iframe with specified static attributes', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:        'test-render-iframe-static-attributes',
            url:        testEnv.foreignChildPage,
            domain:     testEnv.foreignOrigin,
            attributes: { iframe: { scrolling: 'no' } }
        }));

        const framePromise = onWindowOpen().then(expect(`onWindowOpen`, ({ iframe } : OnWindowOpenResult) => iframe?.element));

        return component({ onRendered: expect(`onRendered`) }).render(getBody()).then(() => framePromise).then(frame => {
            const scrolling = frame?.getAttribute('scrolling');

            if (scrolling !== 'no') {
                throw new Error(`Expected scrolling attribute to be no, got ${ String(scrolling) }`);
            }
        });
    }));

    it('should render a component to an iframe with specified dynamic attributes', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:        'test-render-iframe-dynamic-attributes',
            url:        testEnv.foreignChildPage,
            domain:     testEnv.foreignOrigin,
            attributes: ({ props }) => ({ iframe: { scrolling: (props as { scrolling : string }).scrolling } }),
            props:      { scrolling: { type: 'string' } }
        }));

        const framePromise = onWindowOpen().then(expect(`onWindowOpen`, ({ iframe } : OnWindowOpenResult) => iframe?.element));

        return component({ scrolling: `no`, onRendered: expect(`onRendered`) }).render(getBody()).then(() => framePromise).then(frame => {
            const scrolling = frame?.getAttribute('scrolling');

            if (scrolling !== 'no') {
                throw new Error(`Expected scrolling attribute to be no, got ${ String(scrolling) }`);
            }
        });
    }));
});
