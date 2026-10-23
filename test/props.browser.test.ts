/* eslint-disable max-nested-callbacks -- a suite nests describe, it, wrapPromise, prop handlers and promise chains, and zoid props and window hooks return promises by design */
import { destroyElement, getElement, noop, parseQuery } from 'belter';
import { ZalgoPromise } from 'zalgo-promise';

import type { OnWindowOpenResult, TestComponent } from './common';

import { defineComponent, env, getBody, onWindowOpen, setupSuite, wrapPromise, zoid } from './common';

setupSuite();

const expectQuery = (rawQuery : string, expected : Record<string, string>) : void => {
    const query = JSON.stringify(parseQuery(rawQuery), null, 4);
    const expectedQuery = JSON.stringify(expected, null, 4);

    if (query !== expectedQuery) {
        throw new Error(`Expected query string to be:\n\n${ expectedQuery }\n\nbut got:\n\n${ query }`);
    }
};

describe('zoid props cases', () => {
    it('should render a component with a prop with a pre-defined value', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-prop-value',
            url:   testEnv.foreignChildPage,
            props: {
                foo:     { type: 'string', value: () => 'bar' },
                passFoo: { type: 'function', required: true }
            }
        }));

        return component({
            run:     () => 'window.xprops.passFoo({ foo: xprops.foo });',
            passFoo: expect('passFoo', ({ foo } : { foo : unknown }) => {
                if (foo !== 'bar') {
                    throw new Error(`Expected prop to have the correct value; got ${ String(foo) }`);
                }
            })
        }).render(getBody());
    }));

    it(`should render a component with a prop with a pre-defined value using container`, () => wrapPromise(({ expect }) => {
        const bodyWidth = getBody().offsetWidth;

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-prop-value-container',
            url:   testEnv.foreignChildPage,
            props: {
                foo:     { type: 'number', required: false, value: ({ container }) => container?.offsetWidth },
                passFoo: { type: 'function', required: true }
            }
        }));

        return component({
            run:     () => 'window.xprops.passFoo({ foo: xprops.foo });',
            passFoo: expect('passFoo', ({ foo } : { foo : unknown }) => {
                if (foo !== bodyWidth) {
                    throw new Error(`Expected prop to have the correct value; got ${ String(foo) }`);
                }
            })
        }).render(getBody());
    }));

    it(`should render a component with a prop with a pre-defined value using container, and pass the value in the url`, () => wrapPromise(({ expect }) => {
        const bodyWidth = getBody().offsetWidth;

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-prop-value-container-url-param',
            url:   testEnv.foreignChildPage,
            props: {
                foo: {
                    type:     'number',
                    required: false,

                    value: ({ container }) => (container
                        ? container.offsetWidth
                        : undefined),

                    queryParam: true
                },
                passFoo: { type: 'function', required: true }
            }
        }));

        return component({
            run:     () => 'window.xprops.passFoo({ query: location.search });',
            passFoo: expect('passFoo', ({ query } : { query : string }) => {
                if (!query.includes(`foo=${ bodyWidth }`)) {
                    throw new Error(`Expected foo=${ bodyWidth } in the url`);
                }
            })
        }).render(getBody());
    }));

    it(`should render a component with a prop with a pre-defined value using container, and pass the value in the url, with a lazy element`, () => wrapPromise(({ expect }) => {
        const bodyWidth = getBody().offsetWidth;

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-prop-value-container-url-param-element-not-ready',
            url:   testEnv.foreignChildPage,
            props: {
                foo: {
                    type:     'number',
                    required: false,

                    value: ({ container }) => (container
                        ? getElement(container).offsetWidth
                        : undefined),

                    queryParam: true
                },
                passFoo: { type: 'function', required: true }
            }
        }));

        const instance = component({
            run:     () => 'window.xprops.passFoo({ query: location.search });',
            passFoo: expect('passFoo', ({ query } : { query : string }) => {
                if (!query.includes(`foo=${ bodyWidth }`)) {
                    throw new Error(`Expected foo=${ bodyWidth } in the url`);
                }
            })
        });

        // Hold the document in `loading` so the container can appear after render is called.
        Object.defineProperty(document, 'readyState', { value: 'loading', configurable: true });

        const renderPromise = instance.render('#container-element');

        const container = document.createElement('div');

        container.setAttribute('id', 'container-element');
        getBody().appendChild(container);

        delete (document as { readyState ?: unknown }).readyState;

        return renderPromise;
    }));

    it('should enter a component, update a prop, and call a prop', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag: 'test-update-prop',
            url: testEnv.foreignChildPage
        }));

        const instance = component({
            run: () => `
                window.xprops.onProps(function() {
                    window.xprops.foo('bar');
                });
            `,

            postRun: () => instance.updateProps({
                foo: expect('foo', (bar : unknown) => {
                    if (bar !== 'bar') {
                        throw new Error(`Expected bar to be 'bar', got ${ String(bar) }`);
                    }
                })
            })
        });

        return instance.render(getBody());
    }));

    it('should enter a component, update a prop, and call a different prop', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag: 'test-update-different-prop',
            url: testEnv.foreignChildPage
        }));

        const instance = component({
            foo: expect('foo', (bar : unknown) => {
                if (bar !== 'bar') {
                    throw new Error(`Expected bar to be 'bar', got ${ String(bar) }`);
                }
            }),

            run: () => `
                window.xprops.onProps(function() {
                    window.xprops.foo('bar');
                });
            `,

            postRun: () => instance.updateProps({ bar: 'helloworld' })
        });

        return instance.render(getBody());
    }));

    it(`should enter a component, decorate a prop, update a prop, and call a different prop`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-update-decorated-different-prop',
            url:   testEnv.foreignChildPage,
            props: {
                baz: {
                    type:     'function',
                    required: false,

                    decorate: ({ props }) => () => {
                        const { foo } = props as { foo ?: (value : string) => unknown };

                        if (!foo) {
                            throw new Error('Expected props.foo to be defined');
                        }

                        return foo('bar');
                    }
                }
            }
        }));

        const instance = component({
            foo: expect('foo', (bar : unknown) => {
                if (bar !== 'bar') {
                    throw new Error(`Expected bar to be 'bar', got ${ String(bar) }`);
                }
            }),

            run: () => `
                window.xprops.onProps(function() {
                    window.xprops.baz('bar');
                });
            `,

            postRun: () => instance.updateProps({ baz: noop })
        });

        return instance.render(getBody());
    }));

    it('should pass the inputProp as a parameter in the value function', () => wrapPromise(({ expect }) => {
        const expectedAccount = '123';

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-prop-input-value-passing',
            url:   testEnv.foreignChildPage,
            props: {
                account: { type: `string`, required: true, value: ({ props }) => (props as { account ?: string }).account },
                passFoo: { type: 'function', required: true }
            }
        }));

        return component({
            run:     () => 'window.xprops.passFoo({ account: window.xprops.account });',
            account: expectedAccount,
            passFoo: expect('passFoo', ({ account } : { account : unknown }) => {
                if (account !== expectedAccount) {
                    throw new Error(`Expected account=${ expectedAccount }, but got account=${ String(account) }`);
                }
            })
        }).render(getBody());
    }));

    it(`should allow decorated functions to change their signature from the original value callback prop`, () => wrapPromise(({ expect, avoid }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'changing-decorated-function-signature',
            url:   testEnv.foreignChildPage,
            props: {
                onSuccess: {
                    type: 'function',

                    decorate: ({ value, onError }) => (err : unknown, result : unknown) => {
                        return err || !result
                            ? onError(err)
                            : (value as (success : boolean) => unknown)(true);
                    }
                }
            }
        }));

        return component({
            run:       () => 'window.xprops.onSuccess(null, {success: true});',
            onSuccess: expect('onSuccess', (result : unknown) => {
                if (result !== true) {
                    throw new Error(`Expected onSuccess to have been called with true, but was called with ${ String(result) }`);
                }
            }),
            onError: avoid('onError')
        }).render(getBody());
    }));

    it(`should enter a component, update a prop with a default, then call the prop`, () => wrapPromise(({ expect, error }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-update-default-prop',
            url:   testEnv.foreignChildPage,
            props: {
                meep: { type: 'function', default: () => error('meepv1') }
            }
        }));

        const instance = component({
            run: () => `
                window.xprops.onProps(function() {
                    window.xprops.meep();
                });
            `,

            postRun: () => instance.updateProps({ meep: expect('meepv2') })
        });

        return instance.render(getBody());
    }));

    it(`should enter a component, update a prop with a value, then call the prop`, () => wrapPromise(({ expect, error }) => {
        let doExpect = false;

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-update-value-prop',
            url:   testEnv.foreignChildPage,
            props: {
                meep: {
                    type: 'function',

                    value: () => (doExpect
                        ? expect('meepv1')
                        : noop)
                }
            }
        }));

        const instance = component({
            run: () => `
                window.xprops.onProps(function() {
                    window.xprops.meep();
                });
            `,

            postRun: () => {
                doExpect = true;

                return instance.updateProps({ meep: error('meepv2') });
            }
        });

        return instance.render(getBody());
    }));

    type CallBackCase = { readonly name : string, readonly tag : string, readonly expectedResult : unknown };

    const callBackWith = ({ name, tag, expectedResult } : CallBackCase) : void => {
        it(`should enter a component and call back with a ${ name } prop`, () => wrapPromise(({ expect }) => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv, params }) => lib.create({
                tag: params.tag as string,
                url: testEnv.foreignChildPage
            }), { tag });

            return component({
                customProp: expectedResult,

                foo: expect('foo', (bar : unknown) => {
                    if (bar !== expectedResult) {
                        throw new Error(`Expected bar to be ${ String(expectedResult) }, got ${ String(bar) }`);
                    }
                }),

                run: () => 'window.xprops.foo(window.xprops.customProp);'
            }).render(getBody());
        }));
    };

    callBackWith({ name: 'string', tag: 'test-string-prop', expectedResult: 'bar' });
    callBackWith({ name: 'number', tag: 'test-number-prop', expectedResult: 123 });
    callBackWith({ name: 'boolean', tag: 'test-boolean-prop', expectedResult: true });

    it('should enter a component and call back with an array prop', () => wrapPromise(({ expect }) => {
        const expectedResult = [ 'bar', 12_345, { bar: 'baz' }, expect('fn') ];

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag: 'test-array-prop',
            url: testEnv.foreignChildPage
        }));

        return component({
            objectProp: expectedResult,

            foo: expect('foo', (result : [ string, number, { bar : string }, () => unknown ]) => {
                if (result[0] !== expectedResult[0] || result[1] !== expectedResult[1]) {
                    throw new Error(`Array ${ JSON.stringify(result) } does not match expected`);
                }

                if (result[2].bar !== 'baz') {
                    throw new Error(`Array ${ JSON.stringify(result) } does not match expected`);
                }

                if (typeof result[3] !== 'function') {
                    throw new TypeError(`Array ${ JSON.stringify(result) } does not match expected`);
                }

                result[3]();
            }),

            run: () => 'window.xprops.foo(window.xprops.objectProp);'
        }).render(getBody());
    }));

    it('should enter a component and call back with an object prop', () => wrapPromise(({ expect }) => {
        const expectedResult = { foo: 'bar', x: 12_345, fn: expect('fn'), obj: { bar: 'baz' } };

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag: 'test-object-prop',
            url: testEnv.foreignChildPage
        }));

        return component({
            objectProp: expectedResult,

            foo: expect('foo', (result : { foo : string, x : number, fn : () => unknown, obj : { bar : string } }) => {
                const mismatch = result.foo !== expectedResult.foo ||
                    result.obj.bar !== expectedResult.obj.bar ||
                    result.x !== expectedResult.x;

                if (mismatch) {
                    throw new Error(`Object ${ JSON.stringify(result) } does not match expected`);
                }

                if (typeof result.fn !== 'function') {
                    throw new TypeError(`Object ${ JSON.stringify(result) } does not match expected`);
                }

                result.fn();
            }),

            run: () => 'window.xprops.foo(window.xprops.objectProp);'
        }).render(getBody());
    }));

    it('should enter a component and call back with a function prop', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag: 'test-function-prop',
            url: testEnv.foreignChildPage
        }));

        return component({
            functionProp: expect('functionProp'),

            foo: expect('foo', (fn : unknown) => {
                if (typeof fn !== 'function') {
                    throw new TypeError(`Expected a function prop, got ${ typeof fn }`);
                }

                (fn as () => unknown)();
            }),

            run: () => 'window.xprops.foo(window.xprops.functionProp);'
        }).render(getBody());
    }));

    it('should error out if not passed a required prop', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-required-prop',
            url:   testEnv.foreignChildPage,
            props: { foo: { type: 'string' } }
        }));

        return ZalgoPromise.try(() => {
            component();
        }).catch(expect('catch'));
    }));

    it('should not pass a sameDomain prop to the child', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-samedomain-prop',
            url:   testEnv.foreignChildPage,
            props: { foo: { type: 'string', sameDomain: true } }
        }));

        return component({
            foo:      'bar',
            passProp: expect('passProp', (val : unknown) => {
                if (val) {
                    throw new Error('Expected val to not be passed');
                }
            }),
            run: () => 'window.xprops.passProp(window.xprops.foo);'
        }).render(getBody());
    }));

    it('should pass a sameDomain prop and not have it populate on the child', () => wrapPromise(({ expect }) => {
        // The child declares the prop sameDomain even though the parent does not.
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv, side }) => lib.create({
            tag:   'test-samedomain-prop-passed',
            url:   testEnv.foreignChildPage,
            props: { foo: { type: 'string', sameDomain: side === 'child' } }
        }));

        return component({
            foo:      'bar',
            passProp: expect('passProp', (val : unknown) => {
                if (val) {
                    throw new Error('Expected val to not be passed');
                }
            }),
            run: () => 'window.xprops.passProp(window.xprops.foo);'
        }).render(getBody());
    }));

    it(`should pass a trustedDomain prop and have it populate on the child with string and regex`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-trusteddomain-prop-passed',
            url:   testEnv.foreignChildPage,
            props: { foo: { type: 'string', trustedDomains: [ /\.other\.(com|cn)(:\d+)?$/u, testEnv.foreignOrigin ] } }
        }));

        return component({
            foo:      'bar',
            passProp: expect('passProp', (val : unknown) => {
                if (!val) {
                    throw new Error('Expected val to be passed');
                }
            }),
            run: () => 'window.xprops.passProp(window.xprops.foo);'
        }).render(getBody());
    }));

    it(`should pass a trustedDomain prop and have it not populate on the child if no match`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-trusteddomain-prop-not-passed',
            url:   testEnv.foreignChildPage,
            props: { foo: { type: 'string', trustedDomains: [ /\.other\.(com|cn)(:\d+)?$/u ] } }
        }));

        return component({
            foo:      'bar',
            passProp: expect('passProp', (val : unknown) => {
                if (val) {
                    throw new Error('Expected val to not be passed');
                }
            }),
            run: () => 'window.xprops.passProp(window.xprops.foo);'
        }).render(getBody());
    }));

    it(`should pass a trustedDomain and sameDomain=true prop and have it populate on the child`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-samedomain-trusteddomain-prop-passed',
            url:   testEnv.foreignChildPage,
            props: { foo: { type: 'string', sameDomain: true, trustedDomains: [ /^http:\/\/\[::1\]/u ] } }
        }));

        return component({
            foo:      'bar',
            passProp: expect('passProp', (val : unknown) => {
                if (!val) {
                    throw new Error('Expected val to be passed');
                }
            }),
            run: () => 'window.xprops.passProp(window.xprops.foo);'
        }).render(getBody());
    }));

    it('should alias a prop and have it copy correctly', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-alias-prop',
            url:   testEnv.foreignChildPage,
            props: { foo: { type: 'function', alias: 'bar' } }
        }));

        return component({
            foo: expect('foo'),
            run: () => 'window.xprops.bar();'
        }).render(getBody());
    }));

    it('should alias a prop and have it copy correctly in reverse', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-alias-reverse-prop',
            url:   testEnv.foreignChildPage,
            props: { foo: { type: 'function', alias: 'bar' } }
        }));

        return component({
            bar: expect('bar'),
            run: () => 'window.xprops.foo();'
        }).render(getBody());
    }));

    it('should pass props in the url correctly', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-props-query-param',
            url:   testEnv.foreignChildPage,
            props: {
                fooProp: { type: 'string', queryParam: true },
                barProp: { type: 'boolean', queryParam: 'myBooleanProp' },
                bazProp: {
                    type:       'object',
                    queryParam: () => 'myBazProp',
                    // queryValue gets `{ value }`; spreading it keeps `value` as a key.
                    queryValue: options => ({ ...options, meep: 'beep' })
                },
                bingProp: { type: 'number', queryParam: true },
                zomgProp: { type: 'object', queryParam: true, serialization: 'json' },
                lolProp:  { type: 'object', queryParam: true, serialization: 'base64' }
            }
        }));

        return component({
            fooProp:   'hello world',
            barProp:   true,
            bazProp:   { woot: 'boot', foobar: [ 1, 'wat', { woop: 'doop' } ] },
            bingProp:  54_321,
            zomgProp:  { flerp: 'blerp' },
            lolProp:   { bleep: [ 1, 2, 3 ] },
            bloopProp: 'floop',

            getQuery: expect('getQuery', (rawQuery : string) => {
                expectQuery(rawQuery, {
                    'fooProp':                     'hello world',
                    'myBooleanProp':               'true',
                    'bazProp.value.woot':          'boot',
                    'bazProp.value.foobar.0':      '1',
                    'bazProp.value.foobar.1':      'wat',
                    'bazProp.value.foobar.2.woop': 'doop',
                    'bazProp.meep':                'beep',
                    'bingProp':                    '54321',
                    'zomgProp':                    '{"flerp":"blerp"}',
                    'lolProp':                     btoa('{"bleep":[1,2,3]}').replaceAll('=', '')
                });
            }),

            run: () => 'window.xprops.getQuery(window.location.search.slice(1));'
        }).render(getBody());
    }));

    it('should pass boolean props in the url correctly', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-props-boolean-query-param',
            url:   testEnv.foreignChildPage,
            props: {
                trueProp:  { type: 'boolean', queryParam: true },
                falseProp: { type: 'boolean', queryParam: true }
            }
        }));

        return component({
            trueProp:  true,
            falseProp: false,

            getQuery: expect('getQuery', (rawQuery : string) => {
                expectQuery(rawQuery, { trueProp: 'true', falseProp: 'false' });
            }),

            run: () => 'window.xprops.getQuery(window.location.search.slice(1));'
        }).render(getBody());
    }));

    it('should pass promise props in the url correctly', () => wrapPromise(({ expect }) => {
        const promiseValue = 'helloworld';

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-promise-props-query-param',
            url:   testEnv.foreignChildPage,
            props: {
                promiseProp: {
                    type:       'function',
                    queryParam: true,

                    queryValue: ({ value }) => new Promise<string>(resolve => {
                        setTimeout(() => resolve((value as () => string)()), 50);
                    })
                }
            }
        }));

        return component({
            promiseProp: expect('promiseProp', () => promiseValue),
            getQuery:    expect('getQuery', (rawQuery : string) => {
                expectQuery(rawQuery, { promiseProp: promiseValue });
            }),
            run: () => 'window.xprops.getQuery(window.location.search.slice(1));'
        }).render(getBody());
    }));

    it('should pass an empty string as a query param', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-promise-props-query-param-empty-string',
            url:   testEnv.foreignChildPage,
            props: { fooBar: { type: 'string', required: false, queryParam: 'foo_bar' } }
        }));

        return component({
            fooBar:   '',
            getQuery: expect('getQuery', (rawQuery : string) => {
                if (!rawQuery.includes('foo_bar=')) {
                    throw new Error(`Expected foo_bar to be in query string, got ${ rawQuery }`);
                }
            }),
            run: () => 'window.xprops.getQuery(window.location.search.slice(1));'
        }).render(getBody());
    }));

    it(`should not pass an empty default string as a query param when decorated to null`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-promise-props-query-param-empty-string-null-decorator',
            url:   testEnv.foreignChildPage,
            props: {
                fooBar: {
                    type:       'string',
                    required:   false,
                    queryParam: 'foo_bar',
                    default:    () => '',

                    decorate: ({ props }) => ((props as { fooBar ?: string }).fooBar
                        ? (props as { fooBar : string }).fooBar
                        : null as unknown as string)
                }
            }
        }));

        return component({
            fooBar:   '',
            getQuery: expect('getQuery', (rawQuery : string) => {
                if (rawQuery.includes('foo_bar=')) {
                    throw new Error(`Expected foo_bar to not be in query string, got ${ rawQuery }`);
                }
            }),
            run: () => 'window.xprops.getQuery(window.location.search.slice(1));'
        }).render(getBody());
    }));

    it(`should enter a component, update a prop, destroy the component, and not error out`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag: 'test-update-prop-destroy-component',
            url: testEnv.foreignChildPage
        }));

        const instance = component();

        instance.render(getBody()).then(expect('postRender', () => {
            const updatePromise = instance.updateProps({ foo: 'bar' });

            instance.close();

            return updatePromise;
        }));
    }));

    it(`should enter a component, update a prop, close the window, and not error out`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-update-prop-close-window',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        const instance = component();
        let openedFrame : HTMLIFrameElement | undefined;

        onWindowOpen().then(expect('onWindowOpen', ({ iframe } : OnWindowOpenResult) => {
            openedFrame = iframe?.element;
        }));

        instance.render(getBody()).then(expect('postRender', () => {
            const updatePromise = instance.updateProps({ foo: 'bar' });

            if (!openedFrame) {
                throw new Error('Expected frame to have opened');
            }

            destroyElement(openedFrame);

            return updatePromise;
        }));
    }));

    it('should enter a component, and update a prop after a delay', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag: 'test-update-prop-delay',
            url: testEnv.foreignChildPage
        }));

        const instance = component({
            onFoo: expect('onFoo'),

            run: () => {
                setTimeout(() => {
                    instance.updateProps({ foo: 'bar' });
                }, 200);

                return `
                    window.xprops.onProps(function(props) {
                        if (props.foo === 'bar') {
                            props.onFoo();
                        }
                    });
                `;
            }
        });

        return instance.render(getBody());
    }));

    it('should pass all input props through to value', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-prop-value-derived-from-props',
            url:   testEnv.foreignChildPage,
            props: {
                foo:     { type: 'string' },
                bar:     { type: 'string', value: ({ props }) => (props as { foo ?: string }).foo },
                passBar: { type: 'function', required: true }
            }
        }));

        return component({
            run:     () => 'window.xprops.passBar({ bar: xprops.bar });',
            foo:     'foo',
            passBar: expect('passBar', ({ bar } : { bar : unknown }) => {
                if (bar !== 'foo') {
                    throw new Error(`Expected prop to have the correct value; got ${ String(bar) }`);
                }
            })
        }).render(getBody());
    }));

    it('should pass all input props through to value, even for the same prop', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-prop-value-derived-from-props-with-same-prop',
            url:   testEnv.foreignChildPage,
            props: {
                bar:     { type: 'string', value: ({ props }) => (props as { bar ?: string }).bar },
                passBar: { type: 'function', required: true }
            }
        }));

        return component({
            run:     () => 'window.xprops.passBar({ bar: xprops.bar });',
            bar:     'foo',
            passBar: expect('passBar', ({ bar } : { bar : unknown }) => {
                if (bar !== 'foo') {
                    throw new Error(`Expected prop to have the correct value; got ${ String(bar) }`);
                }
            })
        }).render(getBody());
    }));

    it('should error out if a required prop has an value function which returns undefined', () => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-prop-value-undefined-error',
            url:   testEnv.foreignChildPage,
            props: { foo: { type: 'string', value: () => undefined } }
        }));

        expect(() => component()).toThrow();
    });

    it('should error out if a required prop has both required:true and a default value', () => {
        expect(() => zoid.create({
            tag:   'test-prop-value-required-default',
            url:   env.foreignChildPage,
            props: { foo: { type: 'string', required: true, default: () => 'foo' } }
        })).toThrow();
    });

    it(`should instantiate a component, decorate a prop, update the prop, and get the latest decorated value`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-update-decorated-multiple-times',
            url:   testEnv.foreignChildPage,
            props: { baz: { type: 'number', required: false, decorate: ({ value }) => (value as number) * 2 } }
        }));

        const instance = component({
            baz: 2,

            passBaz: expect('passBaz', (baz : unknown) => {
                if (baz !== 4) {
                    throw new Error(`Expected prop to have the correct value; got ${ String(baz) }`);
                }

                return instance.updateProps({ baz: 3 });
            }),

            passBazAgain: expect('passBazAgain', (baz : unknown) => {
                if (baz !== 6) {
                    throw new Error(`Expected prop to have the correct value; got ${ String(baz) }`);
                }
            }),

            run: () => `
                window.xprops.passBaz(window.xprops.baz);
                const propListener = window.xprops.onProps(function() {
                    window.xprops.passBazAgain(window.xprops.baz);
                });
            `
        });

        return instance.render(getBody());
    }));

    it(`should instantiate a component, decorate a prop, update the prop multiple times, and get the latest decorated value`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-update-decorated-multiple-times-updated-multiple-times',
            url:   testEnv.foreignChildPage,
            props: { baz: { type: 'number', required: false, decorate: ({ value }) => (value as number) * 2 } }
        }));

        const instance = component({
            baz: 2,

            passBaz: expect('passBaz', (baz : unknown) => {
                if (baz !== 4) {
                    throw new Error(`Expected prop to have the correct value; got ${ String(baz) }`);
                }

                return instance.updateProps({ baz: 3 });
            }),

            passBazAgain: expect('passBazAgain', (baz : unknown) => {
                if (baz !== 6) {
                    throw new Error(`Expected prop to have the correct value; got ${ String(baz) }`);
                }

                return instance.updateProps({ baz: 8 });
            }),

            passBazAgainAgain: expect('passBazAgainAgain', (baz : unknown) => {
                if (baz !== 16) {
                    throw new Error(`Expected prop to have the correct value; got ${ String(baz) }`);
                }
            }),

            run: () => `
                window.xprops.passBaz(window.xprops.baz);
                const propListener = window.xprops.onProps(function() {
                    window.xprops.passBazAgain(window.xprops.baz);

                    propListener.cancel();
                    const propListener2 = window.xprops.onProps(function() {
                        window.xprops.passBazAgainAgain(window.xprops.baz);
                        propListener2.cancel();
                    });
                });
            `
        });

        return instance.render(getBody());
    }));

    it(`should instantiate three components, decorate a prop, update the prop, and get the latest decorated value in each`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-update-decorated-multiple-times-multiple-instances',
            url:   testEnv.foreignChildPage,
            props: { baz: { type: 'number', required: false, decorate: ({ value }) => (value as number) * 2 } }
        }));

        return ZalgoPromise.all([ 0, 1, 2 ].map(() => {
            const startingNumber = Math.floor(Math.random() * 10);
            const startingNumber2 = Math.floor(Math.random() * 10);

            const instance = component({
                baz: startingNumber,

                passBaz: expect('passBaz', (baz : unknown) => {
                    if (baz !== startingNumber * 2) {
                        throw new Error(`Expected prop to have the correct value; got ${ String(baz) }`);
                    }

                    return instance.updateProps({ baz: startingNumber2 });
                }),

                passBazAgain: expect('passBazAgain', (baz : unknown) => {
                    if (baz !== startingNumber2 * 2) {
                        throw new Error(`Expected prop to have the correct value; got ${ String(baz) }`);
                    }
                }),

                run: () => `
                    window.xprops.passBaz(window.xprops.baz);
                    const propListener = window.xprops.onProps(function() {
                        window.xprops.passBazAgain(window.xprops.baz);
                    });
                `
            });

            return instance.render(getBody());
        }));
    }));

    it(`should instantiate three components, decorate a prop, update the prop twice, and get the latest decorated value in each`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-update-decorated-multiple-times-multiple-instances-updated-multiple-times',
            url:   testEnv.foreignChildPage,
            props: { baz: { type: 'number', required: false, decorate: ({ value }) => (value as number) * 2 } }
        }));

        return ZalgoPromise.all([ 0, 1, 2 ].map(() => {
            const startingNumber = Math.floor(Math.random() * 10);
            const startingNumber2 = Math.floor(Math.random() * 10);
            const startingNumber3 = Math.floor(Math.random() * 10);

            const instance = component({
                baz: startingNumber,

                passBaz: expect('passBaz', (baz : unknown) => {
                    if (baz !== startingNumber * 2) {
                        throw new Error(`Expected prop to have the correct value; got ${ String(baz) }`);
                    }

                    return instance.updateProps({ baz: startingNumber2 });
                }),

                passBazAgain: expect('passBazAgain', (baz : unknown) => {
                    if (baz !== startingNumber2 * 2) {
                        throw new Error(`Expected prop to have the correct value; got ${ String(baz) }`);
                    }

                    return instance.updateProps({ baz: startingNumber3 });
                }),

                passBazAgainAgain: expect('passBazAgainAgain', (baz : unknown) => {
                    if (baz !== startingNumber3 * 2) {
                        throw new Error(`Expected prop to have the correct value; got ${ String(baz) }`);
                    }
                }),

                run: () => `
                    window.xprops.passBaz(window.xprops.baz);
                    const propListener = window.xprops.onProps(function() {
                        window.xprops.passBazAgain(window.xprops.baz);

                        propListener.cancel();
                        const propListener2 = window.xprops.onProps(function() {
                            window.xprops.passBazAgainAgain(window.xprops.baz);
                            propListener2.cancel();
                        });
                    });
                `
            });

            return instance.render(getBody());
        }));
    }));

    it(`should instantiate a component, derive a prop, and get a passed value in the value function`, () => wrapPromise(({ expect }) => {
        const fooValue = Math.floor(Math.random() * 100);
        const bazValue = Math.floor(Math.random() * 100);

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-value-passed-prop',
            url:   testEnv.foreignChildPage,
            props: {
                foo: { type: 'number' },
                baz: {
                    type:     'number',
                    required: false,

                    value: helpers => {
                        if ('value' in helpers && (helpers as { value ?: unknown }).value !== undefined) {
                            throw new TypeError('Expected value to be undefined in value function');
                        }

                        return (helpers.props as { foo : number }).foo;
                    }
                }
            }
        }));

        return component({
            foo:     fooValue,
            baz:     bazValue,
            passBaz: expect('passBaz', (baz : unknown) => {
                if (baz !== fooValue) {
                    throw new Error(`Expected prop to have the correct value of ${ fooValue }; got ${ String(baz) }`);
                }
            }),
            run: () => 'window.xprops.passBaz(window.xprops.baz);'
        }).render(getBody());
    }));

    it(`should instantiate a component, default a prop, and get a passed value in the default function`, () => wrapPromise(({ expect }) => {
        const fooValue = Math.floor(Math.random() * 100);

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-default-passed-prop',
            url:   testEnv.foreignChildPage,
            props: {
                foo: { type: 'number' },
                baz: {
                    type:     'number',
                    required: false,

                    default: helpers => {
                        if ('value' in helpers && (helpers as { value ?: unknown }).value !== undefined) {
                            throw new TypeError('Expected value to be undefined in default function');
                        }

                        return (helpers.props as { foo : number }).foo;
                    }
                }
            }
        }));

        return component({
            foo:     fooValue,
            passBaz: expect('passBaz', (baz : unknown) => {
                if (baz !== fooValue) {
                    throw new Error(`Expected prop to have the correct value of ${ fooValue }; got ${ String(baz) }`);
                }
            }),
            run: () => 'window.xprops.passBaz(window.xprops.baz);'
        }).render(getBody());
    }));

    type DecoratedCase = {
        readonly title : string,
        readonly tag : string,
        readonly fooDefinition : Record<string, unknown>,
        readonly bar : boolean,
    };

    const decoratedWithFoo = ({ title, tag, fooDefinition, bar } : DecoratedCase) : void => {
        it(title, () => wrapPromise(({ expect }) => {
            const fooValue = Math.floor(Math.random() * 100);
            const bazValue = Math.floor(Math.random() * 100);
            const expectedValue = fooValue * bazValue;

            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv, params }) => lib.create({
                tag:   params.tag as string,
                url:   testEnv.foreignChildPage,
                props: {
                    foo: { type: 'number', ...(params.fooDefinition as Record<string, unknown>) } as never,
                    baz: {
                        type:     'number',
                        required: false,
                        decorate: ({ props, value }) => (props as { foo : number }).foo * (value as number)
                    }
                }
            }), { tag, fooDefinition });

            const fooKey = bar
                ? 'bar'
                : 'foo';

            return component({
                [ fooKey ]: fooValue,
                baz:        bazValue,
                passBaz:    expect('passBaz', (baz : unknown) => {
                    if (baz !== expectedValue) {
                        throw new Error(`Expected prop to have the correct value of ${ expectedValue }; got ${ String(baz) }`);
                    }
                }),
                run: () => 'window.xprops.passBaz(window.xprops.baz);'
            }).render(getBody());
        }));
    };

    decoratedWithFoo({
        title:         'should instantiate a component, decorate a prop, and get a passed value in the decorator',
        tag:           'test-decorated-passed-prop',
        fooDefinition: {},
        bar:           false
    });

    decoratedWithFoo({
        title:         'should instantiate a component, decorate a prop, and get an aliased value in the decorator',
        tag:           'test-decorated-alias-prop',
        fooDefinition: { alias: 'bar' },
        bar:           true
    });

    it(`should instantiate a component, decorate a prop, and get a calculated value in the decorator`, () => wrapPromise(({ expect }) => {
        const fooValue = Math.floor(Math.random() * 100);
        const bazValue = Math.floor(Math.random() * 100);
        const expectedValue = fooValue * bazValue;

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-decorated-value-prop',
            url:   testEnv.foreignChildPage,
            props: {
                foo: { type: 'number', value: () => fooValue },
                baz: { type: `number`, required: false, decorate: ({ props, value }) => (props as { foo : number }).foo * (value as number) }
            }
        }));

        return component({
            baz:     bazValue,
            passBaz: expect('passBaz', (baz : unknown) => {
                if (baz !== expectedValue) {
                    throw new Error(`Expected prop to have the correct value of ${ expectedValue }; got ${ String(baz) }`);
                }
            }),
            run: () => 'window.xprops.passBaz(window.xprops.baz);'
        }).render(getBody());
    }));

    it(`should instantiate a component, decorate a prop, and get a self-calculated value in the decorator`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-decorated-self-value-prop',
            url:   testEnv.foreignChildPage,
            props: {
                baz: {
                    type:     'string',
                    value:    () => 'baz',
                    decorate: ({ props, value }) => `${ (props as { baz : string }).baz }_${ value }_decorated`
                }
            }
        }));

        return component({
            passBaz: expect('passBaz', (baz : unknown) => {
                if (baz !== 'baz_baz_decorated') {
                    throw new Error(`Expected prop to have the correct value of baz_baz_decorated; got ${ String(baz) }`);
                }
            }),
            run: () => 'window.xprops.passBaz(window.xprops.baz);'
        }).render(getBody());
    }));

    it(`should instantiate a component, decorate a prop, and get a default value in the decorator`, () => wrapPromise(({ expect }) => {
        const fooValue = Math.floor(Math.random() * 100);
        const bazValue = Math.floor(Math.random() * 100);
        const expectedValue = fooValue * bazValue;

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-decorated-default-prop',
            url:   testEnv.foreignChildPage,
            props: {
                foo: { type: 'number', default: () => fooValue },
                baz: { type: `number`, required: false, decorate: ({ props, value }) => (props as { foo : number }).foo * (value as number) }
            }
        }));

        return component({
            baz:     bazValue,
            passBaz: expect('passBaz', (baz : unknown) => {
                if (baz !== expectedValue) {
                    throw new Error(`Expected prop to have the correct value of ${ expectedValue }; got ${ String(baz) }`);
                }
            }),
            run: () => 'window.xprops.passBaz(window.xprops.baz);'
        }).render(getBody());
    }));

    it(`should instantiate a component, decorate a prop, and get a self-default value in the decorator`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-decorated-self-default-prop',
            url:   testEnv.foreignChildPage,
            props: {
                baz: {
                    type:     'string',
                    default:  () => 'baz',
                    decorate: ({ props, value }) => `${ (props as { baz : string }).baz }_${ value }_decorated`
                }
            }
        }));

        return component({
            passBaz: expect('passBaz', (baz : unknown) => {
                if (baz !== 'baz_baz_decorated') {
                    throw new Error(`Expected prop to have the correct value of baz_baz_decorated; got ${ String(baz) }`);
                }
            }),
            run: () => 'window.xprops.passBaz(window.xprops.baz);'
        }).render(getBody());
    }));

    type SignatureCase = {
        readonly title : string,
        readonly tag : string,
        readonly viaProps : boolean,
        readonly viaValueOption : boolean,
    };

    const differentSignature = ({ title, tag, viaProps, viaValueOption } : SignatureCase) : void => {
        it(title, () => wrapPromise(({ expect }) => {
            const originalValue = 'hello';
            const newValue = 12_345;

            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv, params }) => {
                const derive = ({ props, value } : { props : unknown, value ?: unknown }) : unknown => {
                    const original = params.viaProps
                        ? (props as { foo : (arg : number) => unknown }).foo
                        : value as (arg : number) => unknown;

                    return (originalPropValue : unknown) => {
                        if (originalPropValue !== params.originalValue) {
                            throw new Error(`Expected prop to have the correct value of ${ String(params.originalValue) }; got ${ String(originalPropValue) }`);
                        }

                        return original(params.newValue as number);
                    };
                };

                return lib.create({
                    tag:   params.tag as string,
                    url:   testEnv.foreignChildPage,
                    props: {
                        foo: (params.viaValueOption
                            ? { type: 'function', value: derive }
                            : { type: 'function', decorate: derive }) as never
                    }
                });
            }, { tag, viaProps, viaValueOption, originalValue, newValue });

            return component({
                foo: expect('foo', (newPropValue : unknown) => {
                    if (newPropValue !== newValue) {
                        throw new Error(`Expected prop to have the correct value of ${ newValue }; got ${ String(newPropValue) }`);
                    }
                }),
                run: () => `window.xprops.foo(${ JSON.stringify(originalValue) });`
            }).render(getBody());
        }));
    };

    differentSignature({
        title:          `should instantiate a component, decorate a value for a function prop, and call the function with a different signature using the props.propName`,
        tag:            'test-decorate-diff-signature-props',
        viaProps:       true,
        viaValueOption: false
    });

    differentSignature({
        title:          `should instantiate a component, decorate a value for a function prop, and call the function with a different signature using the value`,
        tag:            'test-decorate-diff-signature-value',
        viaProps:       false,
        viaValueOption: false
    });

    differentSignature({
        title:          `should instantiate a component, derive a value for a function prop, and call the function with a different signature using the props.propName`,
        tag:            'test-value-diff-signature-props',
        viaProps:       true,
        viaValueOption: true
    });

    it('should get the correct value for all other props in value function', () => wrapPromise(({ expect }) => {
        const fooValue = 'abc123';
        const barValue = 12_345;

        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-prop-value-get-other-props',
            url:   testEnv.foreignChildPage,
            props: {
                superpropfunc: {
                    type: 'function',

                    value: ({ props }) => () => {
                        (props as unknown as { passProps : (value : unknown) => unknown }).passProps(props);
                    }
                },
                superprop: {
                    type: 'object',

                    value: ({ props }) => {
                        const { foo, bar } = props as { foo : string, bar : number };

                        return { foo, bar };
                    }
                },
                foo: { type: 'string', value: () => fooValue },
                bar: { type: 'number', value: () => barValue }
            }
        }));

        return component({
            passProps: expect(`passProps`, (props : { foo : unknown, bar : unknown, superprop : { foo : unknown, bar : unknown }, superpropfunc : unknown }) => {
                if (props.foo !== fooValue || props.bar !== barValue) {
                    throw new Error(`Expected props.foo and props.bar to have the correct values; got ${ String(props.foo) }, ${ String(props.bar) }`);
                }

                if (props.superprop.foo !== fooValue || props.superprop.bar !== barValue) {
                    throw new Error('Expected props.superprop to have the correct values');
                }

                if (typeof props.superpropfunc !== 'function') {
                    throw new TypeError(`Expected props.superpropfunc to be a function; got ${ typeof props.superpropfunc }`);
                }
            }),
            run: () => 'window.xprops.superpropfunc();'
        }).render(getBody());
    }));

    it('should reject an object smuggled into a string-typed prop', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-string-prop-object-rejected',
            url:   testEnv.foreignChildPage,
            props: { term: { type: 'string' } }
        }));

        // A forged object where a string is declared is the window.name injection vector.
        return ZalgoPromise.try(() => {
            component({ term: { __html: '<img src=x onerror=alert(1)>' } });
        }).catch(expect('catch'));
    }));

    it('should accept a normal string for a string-typed prop', () => wrapPromise(({ expect, avoid }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:   'test-string-prop-accepted',
            url:   testEnv.foreignChildPage,
            props: { term: { type: 'string' } }
        }));

        return component({
            term:     '12 months',
            passProp: expect('passProp', (val : unknown) => {
                if (val !== '12 months') {
                    throw new Error('Expected term to be passed through unchanged');
                }
            }),
            onError: avoid('onError'),
            run:     () => 'window.xprops.passProp(window.xprops.term);'
        }).render(getBody());
    }));
});
/* eslint-enable max-nested-callbacks */
