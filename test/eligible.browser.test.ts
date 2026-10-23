import type { TestComponent } from './common';

import { defineComponent, getBody, setupSuite, wrapPromise } from './common';

setupSuite();

type Kind = 'undefined' | 'true' | 'prop' | 'false' | 'validate';

type EligibleCaseOptions = {
    readonly title : string,
    readonly tag : string,
    readonly kind : Kind,
    readonly props ?: Record<string, unknown>,
    readonly eligible : boolean,
};

describe('zoid eligible cases', () => {
    const eligibleCase = ({ title, tag, kind, props = {}, eligible } : EligibleCaseOptions) : void => {
        it(title, () => wrapPromise(({ expect, avoid }) => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv, params }) => {
                const rule = params.kind as Kind;

                const eligibility = rule === 'undefined'
                    ? undefined
                    : ({ props: inputProps } : { props : { foo ?: unknown } }) => {
                        switch (rule) {
                            case 'true':
                                return { eligible: true };
                            case 'prop':
                                return { eligible: inputProps.foo === 'bar' };
                            case 'false':
                            case 'validate':
                                return { eligible: false };
                            default:
                                return { eligible: false };
                        }
                    };

                return lib.create({
                    tag:      params.tag as string,
                    url:      testEnv.foreignChildPage,
                    domain:   testEnv.foreignOrigin,
                    eligible: eligibility,

                    props: rule === 'validate'
                        ? {
                            foo: {
                                type: 'string',

                                validate: () => {
                                    throw new Error('Value is not valid');
                                }
                            }
                        }
                        : {}
                });
            }, { tag, kind });

            const instance = component({
                ...props,
                onRendered: eligible
                    ? expect('onRendered')
                    : avoid('onRendered')
            });

            if (instance.isEligible() !== eligible) {
                throw new Error(`Expected component eligibility to be ${ String(eligible) }`);
            }

            return eligible
                ? instance.render(getBody())
                : instance.render(getBody()).catch(expect('renderError'));
        }));
    };

    eligibleCase({
        title:    'should initialize a component, with no eligibility and check it is eligible',
        tag:      'test-render-iframe-eligible-undefined',
        kind:     'undefined',
        eligible: true
    });

    eligibleCase({
        title:    'should initialize a component, with true eligibility and check it is eligible',
        tag:      'test-render-iframe-eligible-true',
        kind:     'true',
        eligible: true
    });

    eligibleCase({
        title:    'should initialize a component, with true eligibility based on a prop and check it is eligible',
        tag:      'test-render-iframe-eligible-true-prop',
        kind:     'prop',
        props:    { foo: 'bar' },
        eligible: true
    });

    eligibleCase({
        title:    'should initialize a component, with false eligibility and check it is not eligible',
        tag:      'test-render-iframe-eligible-false',
        kind:     'false',
        eligible: false
    });

    eligibleCase({
        title:    'should initialize a component, with false eligibility based on a prop and check it is not eligible',
        tag:      'test-render-iframe-eligible-false-prop',
        kind:     'prop',
        props:    { foo: 'baz' },
        eligible: false
    });

    eligibleCase({
        title:    'should initialize a component, with false eligibility and do not validate props',
        tag:      'test-render-iframe-eligible-false-validate',
        kind:     'validate',
        props:    { foo: 'blerp' },
        eligible: false
    });
});
