import type { ComponentOptions } from '../src';

import type { TestComponent } from './common';

import { defineComponent, env, expectError, getBody, setupSuite, wrapPromise, zoid } from './common';

setupSuite();

type RawOptions = Partial<Record<keyof ComponentOptions<Record<string, unknown>, unknown, unknown, unknown>, unknown>>;

// Validation guards JavaScript callers, so the options go in untyped.
const create = zoid.create as unknown as (options ?: RawOptions) => unknown;

describe('zoid validation errors', () => {
    it('should throw validation errors when a component is created with no options', () =>
        expectError('Empty options', () => create()));

    it('should throw validation errors when a component is created with empty options', () =>
        expectError('Empty options', () => create({})));

    it('should throw validation errors when a component is created with no tag', () =>
        expectError('No tag', () => create({ url: 'http://foo.com/bar' })));

    it('should throw validation errors when a component is created with no url', () =>
        expectError('No url', () => create({ tag: 'my-component-no-url' })));

    it('should throw validation errors when a component is created with trailing dash in tag name', () =>
        expectError('Malformed tag name', () => create({ url: 'http://foo.com/bar', tag: 'my-component-' })));

    it('should throw validation errors when a component is created with leading dash in tag name', () =>
        expectError('Malformed tag name', () => create({ url: 'http://foo.com/bar', tag: '-my-component' })));

    it('should NOT throw validation errors when a component is created with no dash in tag name', () => {
        create({ url: 'http://foo.com/bar', tag: 'component' });
    });

    it('should throw validation errors when a component is created with special chars in tag name', () =>
        expectError('Special chars in tag name', () => create({ url: 'http://foo.com/bar', tag: 'special$%&-chars' })));

    it('should throw validation errors when a component is created with a string passed for dimensions', () =>
        expectError(`String passed for dimensions`, () => create({ url: `http://foo.com/bar`, tag: `my-component-string-dimensions`, dimensions: `moo` })));

    it('should throw validation errors when a component is created with empty options passed for dimensions', () =>
        expectError(`Empty dimensions`, () => create({ url: `http://foo.com/bar`, tag: `my-component-empty-dimensions`, dimensions: {} })));

    it('should throw validation errors when a component is created with strings passed for dimensions', () =>
        expectError('Strings passed for dimensions', () => create({
            url: `http://foo.com/bar`, tag: `my-component-string-dimensions-object`, dimensions: { height: `foo`, width: `bar` }
        })));

    it('should throw validation errors when a component is created with a string passed for height', () =>
        expectError('String passed for height', () => create({
            url: 'http://foo.com/bar', tag: 'my-component-string-height', dimensions: { height: 'foo', width: '50px' }
        })));

    it('should throw validation errors when a component is created with a string passed for width', () =>
        expectError('String passed for width', () => create({
            url: 'http://foo.com/bar', tag: 'my-component-string-width', dimensions: { height: '50px', width: 'foo' }
        })));

    it('should throw validation errors when a component is created with props passed as string', () =>
        expectError(`Props passed as string`, () => create({ url: `http://foo.com/bar`, tag: `my-component-props-string`, props: `foo` })));

    it('should throw validation errors when a component is created with a prop passed as string', () =>
        expectError(`Prop passed as string`, () => create({ tag: `my-component-prop-string`, url: `http://zombo.com`, props: { moo: `wat` } })));

    it('should throw validation errors when a component is created with an invalid prop type', () =>
        expectError(`Invalid prop type`, () => create({ tag: `my-component-invalid-prop-type`, url: `http://zombo.com`, props: { moo: { type: `invalid` } } })));

    it('should throw validation errors when a component is created with an empty prop definition', () =>
        expectError(`Empty prop definition`, () => create({ tag: `my-component-no-prop-type`, url: `http://zombo.com`, props: { onSomething: {} } })));

    it('should throw validation errors when a component is created with required and default passed', () =>
        expectError('Required and default passed', () => create({
            tag:   'my-component-required-and-default',
            url:   'http://zombo.com',
            props: { onSomething: { type: 'function', required: true, default: () => () => undefined } }
        })));

    it(`should throw validation errors when a component is created with a non-function passed for prerenderTemplate`, () =>
        expectError(`Non-function prerenderTemplate`, () => create({ url: `http://foo.com/bar`, tag: `my-component-prerender-non-function`, prerenderTemplate: `foo` })));

    it(`should throw validation errors when a component is created with a non-function passed for containerTemplate`, () =>
        expectError(`Non-function containerTemplate`, () => create({ url: `http://foo.com/bar`, tag: `my-component-container-non-function`, containerTemplate: `foo` })));

    it('should throw validation errors when a component is created with an invalid default context', () =>
        expectError(`Invalid default context`, () => create({ tag: `my-component-invalid-default-context`, url: `http://zombo.com`, defaultContext: `moo` })));

    it('should throw validation errors when a component is created with an invalid url', () =>
        expectError('Invalid url passed', () => create({ tag: 'my-component-invalid-url', url: 12_345 })));

    it('should throw validation errors when a component is rendered with a string passed for a function prop', () =>
        expectError('String passed for function prop', () => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
                tag:    'test-render-string-passed-as-function-prop',
                url:    testEnv.foreignChildPage,
                domain: testEnv.foreignOrigin,
                props:  { functionProp: { type: 'function' } }
            }));

            return component({ functionProp: 'foobar' });
        }));

    it('should throw validation errors when a component is rendered with a function passed for a string prop', () =>
        expectError('Function passed for string prop', () => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
                tag:    'test-render-object-passed-as-string-prop',
                url:    testEnv.foreignChildPage,
                domain: testEnv.foreignOrigin,
                props:  { stringProp: { type: 'string' } }
            }));

            return component({ stringProp: () => undefined });
        }));

    it('should throw validation errors when a component is rendered with a function passed for a number prop', () =>
        expectError('Function passed for number prop', () => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
                tag:    'test-render-object-passed-as-number-prop',
                url:    testEnv.foreignChildPage,
                domain: testEnv.foreignOrigin,
                props:  { numberProp: { type: 'number' } }
            }));

            return component({ numberProp: () => undefined });
        }));

    // Cycles cross by reference now, so a cyclic object prop is no longer an error.
    it('should pass a cyclic object prop to the child with its cycle intact', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-cyclic-object',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin,
            props:  { objectProp: { type: 'object' } }
        }));

        // Not `self`: an object whose `self` is itself passes for a window.
        const obj : Record<string, unknown> = { name: 'loop' };

        obj.obj = obj;

        return component({
            objectProp: obj,
            passCycle:  expect('passCycle', (isCycle : unknown) => {
                if (isCycle !== true) {
                    throw new Error('Expected the child to see the cycle');
                }
            }),
            run: () => 'window.xprops.passCycle(window.xprops.objectProp.obj === window.xprops.objectProp);'
        }).render(getBody());
    }));

    it('should throw validation errors when a component is rendered with an object passed for an array prop', () =>
        expectError('Object passed for array', () => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
                tag:    'test-render-object-passed-for-array',
                url:    testEnv.foreignChildPage,
                domain: testEnv.foreignOrigin,
                props:  { arrayProp: { type: 'array' } }
            }));

            return component({ arrayProp: {} });
        }));

    it('should throw validation errors when a component is rendered with no props passed', () =>
        expectError('No props passed', () => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
                tag:    'test-render-no-props-passed-when-required',
                url:    testEnv.foreignChildPage,
                domain: testEnv.foreignOrigin,
                props:  { functionProp: { type: 'function' } }
            }));

            return component().render(getBody());
        }));

    it('should throw validation errors when a component is created with a function prop with queryParam true', () =>
        expectError('Function queryParam true', () => create({
            tag:    'test-render-function-queryparam-true',
            url:    env.foreignChildPage,
            domain: env.foreignOrigin,
            props:  { functionProp: { type: 'function', queryParam: true } }
        })));
});
