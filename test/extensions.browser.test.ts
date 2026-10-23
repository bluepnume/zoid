import type { OnWindowOpenResult, TestComponent } from './common';

import { defineComponent, expectParent, getBody, onWindowOpen, setupSuite, wrapPromise } from './common';

setupSuite();

type Extension = ReturnType<TestComponent> & {
    testAttribute ?: string,
    testMethod ?: () => string,
    invokeCalculatePrice ?: () => number,
};

describe('zoid getExtensions cases', () => {
    it('should render a component with additional properties to the component', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:           'test-render-with-extended-properties',
            url:           () => testEnv.foreignChildPage,
            domain:        testEnv.foreignOrigin,
            getExtensions: () => ({ testAttribute: '123', testMethod: () => 'result_of_test_method' })
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        const instance = component({ onRendered: expect('onRendered') }) as unknown as Extension;

        if (instance.testAttribute !== '123') {
            throw new Error(`Expected test attribute to be "123", but got ${ String(instance.testAttribute) }`);
        }

        if (instance.testMethod?.() !== 'result_of_test_method') {
            throw new Error('Expected test method to return result_of_test_method');
        }

        return instance.render(getBody());
    }));

    it(`should not be able to override default properties of component using getExtensions`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-extended-properties-cannot-override-defaults',
            url:    () => testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin,

            getExtensions: () => ({
                render: () => {
                    throw new Error('The render method should have been overridden');
                }
            })
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        return component({ onRendered: expect('onRendered') }).render(getBody());
    }));

    it(`should be able to interact with method supplied to the component during instantiation`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-with-extended-method-invokes-callbacks',
            url:    () => testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin,

            getExtensions: parent => ({
                invokeCalculatePrice: () => {
                    const { calculatePrice } = parent.getProps() as unknown as { calculatePrice : () => number };

                    return calculatePrice();
                }
            })
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        const instance = component({ onRendered: expect(`onRendered`), calculatePrice: () => 1034.56 }) as unknown as Extension;

        if (instance.invokeCalculatePrice?.() !== 1034.56) {
            throw new Error('Expected invokeCalculatePrice to return 1034.56');
        }

        return instance.render(getBody());
    }));

    it(`should be able to interact with updated methods supplied to the component during instantiation`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-with-updated-extended-method-invokes-callbacks',
            url:    () => testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin,

            getExtensions: parent => ({
                invokeCalculatePrice: () => {
                    const { calculatePrice } = parent.getProps() as unknown as { calculatePrice : () => number };

                    return calculatePrice();
                }
            })
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        const instance = component({ onRendered: expect(`onRendered`), calculatePrice: () => 1034.56 }) as unknown as Extension;

        instance.updateProps({ calculatePrice: () => 50.56 });

        if (instance.invokeCalculatePrice?.() !== 50.56) {
            throw new Error('Expected invokeCalculatePrice to return 50.56');
        }

        return instance.render(getBody());
    }));
});
