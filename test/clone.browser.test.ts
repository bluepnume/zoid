import { assertExists } from 'belter';
import { ZalgoPromise } from 'zalgo-promise';

import type { OnWindowOpenResult, TestComponent } from './common';

import { defineComponent, expectParent, getBody, onWindowOpen, setupSuite, wrapPromise } from './common';

setupSuite();

const expectInstances = (component : TestComponent, count : number) : void => {
    if (component.instances.length !== count) {
        throw new Error(`Expected ${ count } instances, got ${ component.instances.length }`);
    }
};

describe('zoid clone cases', () => {
    it('should initialize a component, and clone it', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-iframe-clone',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        return component({ onRendered: expect('onRendered') }).clone().render(getBody());
    }));

    it('should initialize a component, and clone it with different props', () => wrapPromise(({ expect, avoid }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-iframe-clone-props',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        return component({ onRendered: avoid('onRenderedOriginal') })
            .clone({ decorate: () => ({ onRendered: expect('onRendered') }) })
            .render(getBody());
    }));

    it('should initialize a component, and clone it from instances', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-iframe-clone-instances',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        component({ onRendered: expect('onRendered') });
        expectInstances(component, 1);

        const clone = assertExists(component.instances[0], 'instance').clone();

        expectInstances(component, 2);

        return clone.render(getBody())
            .then(() => ZalgoPromise.all([ assertExists(component.instances[0], 'instance').close(), clone.close() ]))
            .then(() => expectInstances(component, 0));
    }));

    it(`should initialize a component, and clone it from instances with different props`, () => wrapPromise(({ expect, avoid }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-iframe-clone-instances-props',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        component({ onRendered: avoid('onRenderedOriginal') });
        expectInstances(component, 1);

        const clone = assertExists(component.instances[0], `instance`).clone({ decorate: () => ({ onRendered: expect(`onRendered`) }) });

        expectInstances(component, 2);

        return clone.render(getBody())
            .then(() => ZalgoPromise.all([ assertExists(component.instances[0], 'instance').close(), clone.close() ]))
            .then(() => expectInstances(component, 0));
    }));

    it(`should initialize an ineligible component, clone it, and make sure both instances are destroyed`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:      'test-render-iframe-clone-ineligible',
            url:      testEnv.foreignChildPage,
            domain:   testEnv.foreignOrigin,
            eligible: () => ({ eligible: false })
        }));

        return component({ onDestroy: expect('onDestroy') })
            .clone({ decorate: () => ({ onDestroy: expect('onDestroy2') }) })
            .render(getBody())
            .catch(expect('catch'))
            .then(() => expectInstances(component, 0));
    }));
});
