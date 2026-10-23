import { assertExists, noop } from 'belter';
import { ZalgoPromise } from 'zalgo-promise';

import type { OnWindowOpenResult, TestComponent, TestInstance } from './common';

import { defineComponent, expectParent, getBody, onWindowOpen, setupSuite, wrapPromise } from './common';

type Family = ((props ?: Record<string, unknown>) => TestInstance & Record<string, TestComponent>) & TestComponent;

type Sibling = {
    readonly props : { readonly tag : string, readonly uid : string, readonly doXProp : () => PromiseLike<unknown> },
    readonly exports : { readonly submit : () => unknown },
};

type OnSiblingsOptions = { readonly uid : string, readonly export : (exports : unknown) => unknown };

setupSuite();

describe('zoid children cases', () => {
    it('should render a set of child components which inherit parent props', () => wrapPromise(({ expect, avoid }) => {
        const CardFields = defineComponent<Family>(({ zoid: lib, env: testEnv }) => {
            const field = (name : string) : unknown => lib.create({
                tag:    `test-multiple-children-card-field-${ name }`,
                url:    () => testEnv.foreignChildPage,
                domain: testEnv.foreignOrigin
            });

            const NumberField = field('number');
            const CVVField = field('cvv');
            const ExpiryField = field('expiry');

            return lib.create({
                tag:      'test-multiple-children-card-fields',
                url:      () => testEnv.foreignChildPage,
                domain:   testEnv.foreignOrigin,
                children: () => ({ NumberField, CVVField, ExpiryField })
            });
        });

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        const cardFields = CardFields({
            style:      { color: 'red' },
            onRendered: avoid('onRenderedCardFields'),
            callProp:   avoid('callPropCardFields'),
            run:        () => 'window.xprops.callProp(window.xprops.style);'
        });

        const child = (name : string) : TestInstance => assertExists(cardFields[name], name)({
            onRendered: expect(`onRendered${ name }`),
            callProp:   expect(`callProp${ name }`, (style : { color ?: string } | undefined) => {
                if (style?.color !== 'red') {
                    throw new Error(`Expected ${ name } to inherit style`);
                }
            }),
            run: () => 'window.xprops.callProp(window.xprops.parent.props.style);'
        });

        return ZalgoPromise.all([
            child('NumberField').render(getBody()),
            child('CVVField').render(getBody()),
            child('ExpiryField').render(getBody())
        ]);
    }));

    it(`should render a component in isolation with props, with multiple children which are never called`, () => wrapPromise(({ expect }) => {
        const CardFields = defineComponent<Family>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-multiple-children-card-fields-isolation',
            url:    () => testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin,

            children: () => ({
                NumberField: () => {
                    throw new Error('Should not call NumberField');
                },

                CVVField: () => {
                    throw new Error('Should not call CVVField');
                },

                ExpiryField: () => {
                    throw new Error('Should not call ExpiryField');
                }
            })
        }));

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        return CardFields({
            style:      { color: 'red' },
            onRendered: expect('onRenderedCardFields'),
            callProp:   expect('callPropCardFields', (style : { color ?: string } | undefined) => {
                if (style?.color !== 'red') {
                    throw new Error('Expected card fields to get style');
                }
            }),
            run: () => 'window.xprops.callProp(window.xprops.style);'
        }).render(getBody());
    }));

    it('should render a set of child components which export to the parent', () => wrapPromise(({ expect }) => {
        const CardFields = defineComponent<Family>(({ zoid: lib, env: testEnv }) => {
            const field = (name : string) : unknown => lib.create({
                tag:    `test-multiple-children-card-field-${ name }-export`,
                url:    () => testEnv.foreignChildPage,
                domain: testEnv.foreignOrigin
            });

            const NumberField = field('number');
            const CVVField = field('cvv');
            const ExpiryField = field('expiry');

            return lib.create({
                tag:      'test-multiple-children-card-fields-export',
                url:      () => testEnv.foreignChildPage,
                domain:   testEnv.foreignOrigin,
                children: () => ({ NumberField, CVVField, ExpiryField }),
                exports:  { submit: { type: 'function' } }
            });
        });

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        const cardFields = CardFields() as TestInstance & Record<string, TestComponent> & {
            readonly submit : () => ZalgoPromise,
        };

        let onSubmitCalledTimes = 0;

        const onSubmit = expect('onSubmit', () => {
            onSubmitCalledTimes += 1;
        });

        const child = (name : string) : TestInstance => assertExists(cardFields[name], name)({
            onSubmit,

            run: () => `
                window.xprops.parent.export({
                    submit: () => {
                        window.xprops.onSubmit();
                    }
                });
            `
        });

        return ZalgoPromise.all([
            child('NumberField').render(getBody()),
            child('CVVField').render(getBody()),
            child('ExpiryField').render(getBody())
        ]).then(() => cardFields.submit().timeout(500, new Error('cardFields.submit() timed out'))).then(() => {
            if (onSubmitCalledTimes !== 1) {
                throw new Error('Expected onSubmit to be called a single time');
            }
        });
    }));

    it(`should render a child component which directly inherits a prop from the parent`, () => wrapPromise(({ expect }) => {
        const CardFields = defineComponent<Family>(({ zoid: lib, env: testEnv }) => {
            const Button = lib.create({
                tag:    'test-multiple-children-card-button-inherit-prop',
                url:    () => testEnv.foreignChildPage,
                domain: testEnv.foreignOrigin,
                props:  {
                    fundingSource: {
                        type:     'string',
                        required: false,

                        default: ({ props }) => {
                            const { parent } = props as unknown as { parent : { props : { fundingSource : string } } };

                            return parent.props.fundingSource;
                        }
                    }
                }
            });

            return lib.create({
                tag:      'test-multiple-children-card-fields-inherit-prop',
                url:      () => testEnv.foreignChildPage,
                domain:   testEnv.foreignOrigin,
                props:    { fundingSource: { type: 'string', value: () => 'card' } },
                children: () => ({ Button })
            });
        });

        onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

        const checkFundingSource = (name : string) => ({ fundingSource } : { fundingSource : unknown }) : void => {
            if (fundingSource !== 'card') {
                throw new Error(`Expected ${ name } fundingSource to be card, got ${ String(fundingSource) }`);
            }
        };

        const cardFields = CardFields({
            onRendered: expect('onRenderedCardFields'),
            callProp:   expect('callPropCardFields', checkFundingSource('card fields')),
            run:        () => 'window.xprops.callProp({ fundingSource: window.xprops.fundingSource });'
        });

        const cardButtonInstance = assertExists(cardFields.Button, 'Button')({
            onRendered: expect('onRenderedButton'),
            callProp:   expect('callPropButton', checkFundingSource('button')),
            run:        () => 'window.xprops.callProp({ fundingSource: window.xprops.fundingSource });'
        });

        return ZalgoPromise.all([ cardFields.render(getBody()), cardButtonInstance.render(getBody()) ]);
    }));

    type SiblingsSetup = {
        readonly suffix : string,
        readonly expectedSiblings : ReadonlyArray<string>,
        readonly anyParent : boolean,
        readonly otherUnderParent : boolean,
        readonly otherParticipates : boolean,
    };

    const siblingsTest = (
        title : string,
        { suffix: suffixParam, expectedSiblings, anyParent, otherUnderParent, otherParticipates } : SiblingsSetup
    ) : void => {
        it(title, () => wrapPromise(({ expect, avoid }) => {
            const { CardFields, Other } = defineComponent<{ CardFields : Family, Other : Family }>(({
                zoid: lib, env: testEnv, params
            }) => {
                const suffix = params.suffix as string;

                const exported = (tag : string) : unknown => lib.create({
                    tag,
                    url:     () => testEnv.foreignChildPage,
                    domain:  testEnv.foreignOrigin,
                    exports: { submit: { type: 'function' } }
                });

                const NumberField = exported(`test-multiple-children-card-field-number-${ suffix }`);
                const CVVField = exported(`test-multiple-children-card-field-cvv-${ suffix }`);
                const ExpiryField = exported(`test-multiple-children-card-field-expiry-${ suffix }`);

                const cardFields = lib.create({
                    tag:      `test-multiple-children-card-fields-${ suffix }`,
                    url:      () => testEnv.foreignChildPage,
                    domain:   testEnv.foreignOrigin,
                    children: () => ({ NumberField, CVVField, ExpiryField })
                });

                const OtherComponent = exported(`test-multiple-children-other-component-${ suffix }`);

                const other = suffix.includes('diffparent')
                    ? lib.create({
                        tag:      `test-multiple-children-other-component-parent-${ suffix }`,
                        url:      () => testEnv.foreignChildPage,
                        domain:   testEnv.foreignOrigin,
                        children: () => ({ OtherComponent })
                    })
                    : OtherComponent;

                return { CardFields: cardFields, Other: other };
            }, { suffix: suffixParam });

            onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => expectParent(win)));

            const cardFields = CardFields({ onRendered: avoid('onRenderedCardFields') });

            const onSiblings = (siblings : ReadonlyArray<Sibling>, xprops : OnSiblingsOptions) : void => {
                for (const sibling of siblings) {
                    if (!expectedSiblings.includes(sibling.props.tag)) {
                        throw new Error(`Unexpected sibling: ${ sibling.props.tag }`);
                    }

                    if (sibling.props.uid === xprops.uid) {
                        xprops.export({ submit: expect('submit') });
                    } else {
                        // The test can end before this call returns, taking the
                        // sibling's window with it.
                        sibling.props.doXProp().then(() => sibling.exports.submit()).then(undefined, noop);
                    }
                }

                for (const tag of expectedSiblings) {
                    if (!siblings.some(sibling => sibling.props.tag === tag)) {
                        throw new Error(`Missing sibling: ${ tag }`);
                    }
                }

                if (siblings.length !== expectedSiblings.length) {
                    throw new Error(`Expected ${ expectedSiblings.length } siblings, found ${ siblings.length }`);
                }
            };

            const renderAll = new ZalgoPromise<void>();

            const passSiblings = () : ZalgoPromise<string> => renderAll.then(() => `
                const siblings = window.xprops.getSiblings(${
                    anyParent
                        ? '{ anyParent: true }'
                        : ''
                });
                window.xprops.onSiblings(siblings, window.xprops);
            `);

            const onError = (err : unknown) : never => {
                throw err;
            };

            const participant = (name : string) : Record<string, unknown> => ({
                onRendered: expect(`onRendered${ name }`),
                onSiblings: expect('onSiblings', onSiblings),
                doXProp:    expect('doXProp'),
                onError:    avoid('onError', onError),
                run:        passSiblings
            });

            const otherProps = otherParticipates
                ? participant('OtherComponent')
                : { onRendered: expect('onRenderedOtherComponent'), onError: avoid('onError', onError) };

            const otherInstance = otherUnderParent
                ? assertExists(Other().OtherComponent, 'OtherComponent')(otherProps)
                : Other(otherProps);

            const field = (name : string) : TestInstance => assertExists(cardFields[name], name)(participant(name));

            return ZalgoPromise.all([
                field('NumberField').render(getBody()),
                field('CVVField').render(getBody()),
                field('ExpiryField').render(getBody()),
                otherInstance.render(getBody())
            ]).then(() => renderAll.resolve());
        }));
    };

    siblingsTest('should render a set of child components and get all siblings', {
        suffix:           'getsiblings',
        expectedSiblings: [
            'test-multiple-children-card-field-number-getsiblings',
            'test-multiple-children-card-field-cvv-getsiblings',
            'test-multiple-children-card-field-expiry-getsiblings',
            'test-multiple-children-other-component-getsiblings'
        ],
        anyParent:         true,
        otherUnderParent:  false,
        otherParticipates: true
    });

    siblingsTest('should render a set of child components and get all siblings with the same parent', {
        suffix:           'getsiblings-sameparent',
        expectedSiblings: [
            'test-multiple-children-card-field-number-getsiblings-sameparent',
            'test-multiple-children-card-field-cvv-getsiblings-sameparent',
            'test-multiple-children-card-field-expiry-getsiblings-sameparent'
        ],
        anyParent:         false,
        otherUnderParent:  false,
        otherParticipates: false
    });

    siblingsTest(`should render a set of child components and get all siblings with the same parent, when a different parent exists`, {
        suffix:           'getsiblings-sameparent-diffparent',
        expectedSiblings: [
            'test-multiple-children-card-field-number-getsiblings-sameparent-diffparent',
            'test-multiple-children-card-field-cvv-getsiblings-sameparent-diffparent',
            'test-multiple-children-card-field-expiry-getsiblings-sameparent-diffparent'
        ],
        anyParent:         false,
        otherUnderParent:  true,
        otherParticipates: false
    });

    siblingsTest('should render a set of child components and get all siblings, when a different parent exists', {
        suffix:           'getsiblings-anyparent-sameparent-diffparent',
        expectedSiblings: [
            'test-multiple-children-card-field-number-getsiblings-anyparent-sameparent-diffparent',
            'test-multiple-children-card-field-cvv-getsiblings-anyparent-sameparent-diffparent',
            'test-multiple-children-card-field-expiry-getsiblings-anyparent-sameparent-diffparent',
            'test-multiple-children-other-component-getsiblings-anyparent-sameparent-diffparent'
        ],
        anyParent:         true,
        otherUnderParent:  true,
        otherParticipates: true
    });
});
