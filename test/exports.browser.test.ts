/* eslint-disable max-nested-callbacks -- a suite nests describe, it, wrapPromise, prop handlers and promise chains, and zoid props and window hooks return promises by design */
import type { TestComponent } from './common';

import { defineComponent, getBody, setupSuite, wrapPromise } from './common';

setupSuite();

type Exported = ReturnType<TestComponent> & {
    readonly doSomething : () => PromiseLike<unknown>,
    readonly value : PromiseLike<unknown>,
};

describe('zoid export cases', () => {
    const expectedResult = 'hello world';

    const checkResult = (what : string) => (result : unknown) : void => {
        if (result !== expectedResult) {
            throw new Error(`Expected component.${ what } to give ${ JSON.stringify(expectedResult) }, got ${ JSON.stringify(result) }`);
        }
    };

    it(`should render a component with an exported function and call that function directly on the instance`, () => wrapPromise(() => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-export-function-instance',
            url:    () => testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin,

            exports: ({ getExports }) => ({
                doSomething: (...args : ReadonlyArray<unknown>) =>
                    getExports().then(exports => {
                        type Target = { doSomething : (...innerArgs : ReadonlyArray<unknown>) => unknown };

                        const { doSomething } = exports as Target;

                        return doSomething(...args);
                    })
            })
        }));

        const instance = component({
            run: () => `
                window.xprops.export({
                    doSomething: () => ${ JSON.stringify(expectedResult) }
                });
            `
        });

        const resultPromise = (instance as unknown as Exported).doSomething();

        return instance.render(getBody()).then(() => resultPromise).then(checkResult('doSomething'));
    }));

    it(`should render a component with an exported value and get that value directly on the instance`, () => wrapPromise(() => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-export-value-instance',
            url:    () => testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin,

            exports: ({ getExports }) => ({
                get value() : PromiseLike<unknown> {
                    return getExports().then(exports => (exports as { value : unknown }).value);
                }
            })
        }));

        const instance = component({
            run: () => `
                window.xprops.export({
                    value: ${ JSON.stringify(expectedResult) }
                });
            `
        });

        const valuePromise = (instance as unknown as Exported).value;

        return instance.render(getBody()).then(() => valuePromise).then(checkResult('value'));
    }));

    it(`should render a component with defined exports and an exported function and call that function directly on the instance`, () => wrapPromise(() => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:     'test-export-function-instance-defined',
            url:     () => testEnv.foreignChildPage,
            domain:  testEnv.foreignOrigin,
            exports: { doSomething: { type: 'function' } }
        }));

        const instance = component({
            run: () => `
                window.xprops.export({
                    doSomething: () => ${ JSON.stringify(expectedResult) }
                });
            `
        });

        const resultPromise = (instance as unknown as Exported).doSomething();

        return instance.render(getBody()).then(() => resultPromise).then(checkResult('doSomething'));
    }));

    it(`should render a component with defined exports and an exported value and get that value directly on the instance`, () => wrapPromise(() => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:     'test-export-value-instance-defined',
            url:     () => testEnv.foreignChildPage,
            domain:  testEnv.foreignOrigin,
            exports: { value: { type: 'string' } }
        }));

        const instance = component({
            run: () => `
                window.xprops.export({
                    value: ${ JSON.stringify(expectedResult) }
                });
            `
        });

        const valuePromise = (instance as unknown as Exported).value;

        return instance.render(getBody()).then(() => valuePromise).then(checkResult('value'));
    }));
});
/* eslint-enable max-nested-callbacks */
