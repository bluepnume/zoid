/* eslint-disable max-nested-callbacks -- a suite nests describe, it, wrapPromise, prop handlers and promise chains, and zoid props and window hooks return promises by design */
import { getDomain } from 'cross-domain-utils';

import type { TestComponent } from './common';

import { defineComponent, getBody, setupSuite, wrapPromise } from './common';

setupSuite();

describe('parent domain check', () => {
    describe('should not throw error when', () => {
        it('allowedParentDomains is a wildcard', () => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
                tag:                  'test-parent-domain-wildcard',
                url:                  testEnv.foreignChildPage,
                domain:               testEnv.foreignOrigin,
                allowedParentDomains: '*'
            }));

            return component().render(getBody()).toPromise();
        });

        it('allowedParentDomains is specified as string', () => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
                tag:                  'test-parent-domain-string',
                url:                  testEnv.foreignChildPage,
                domain:               testEnv.foreignOrigin,
                allowedParentDomains: testEnv.origin
            }));

            return component().render(getBody()).toPromise();
        });

        it('allowedParentDomains is specified as array of strings and parent domain matches', () => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
                tag:                  'test-parent-domain-array',
                url:                  testEnv.foreignChildPage,
                domain:               testEnv.foreignOrigin,
                allowedParentDomains: [ testEnv.origin, 'https://www.foo.com' ]
            }));

            return component().render(getBody()).toPromise();
        });

        it('allowedParentDomains is specified as array of strings with a wildcard', () => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
                tag:                  'test-parent-domain-array-wildcard',
                url:                  testEnv.foreignChildPage,
                domain:               testEnv.foreignOrigin,
                allowedParentDomains: [ '*', 'https://www.foo.com' ]
            }));

            return component().render(getBody()).toPromise();
        });

        it('allowedParentDomains is specified as a regex and parent domain matches', () => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
                tag:                  'test-parent-domain-regex',
                url:                  testEnv.foreignChildPage,
                domain:               testEnv.foreignOrigin,
                allowedParentDomains: /.+/u
            }));

            return component().render(getBody()).toPromise();
        });
    });

    describe('should throw error when', () => {
        it(`allowedParentDomains is specified as string and parent domain does not match`, () => wrapPromise(({ expect }) => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
                tag:                  'test-parent-domain-string-nomatch',
                url:                  testEnv.foreignChildPage,
                domain:               testEnv.foreignOrigin,
                allowedParentDomains: 'https://www.foo.com'
            }));

            return component().render(getBody()).catch(expect('onError'));
        }));

        it(`allowedParentDomains is specified as array of strings and parent domain does not match`, () => wrapPromise(({ expect }) => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
                tag:                  'test-parent-domain-array-nomatch',
                url:                  testEnv.foreignChildPage,
                domain:               testEnv.foreignOrigin,
                allowedParentDomains: [ 'https://www.foo.com', 'https://www.bar.com' ]
            }));

            return component().render(getBody()).catch(expect('onError'));
        }));

        it(`allowedParentDomains is specified as a regex and parent domain does not match`, () => wrapPromise(({ expect }) => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
                tag:                  'test-parent-domain-regex-nomatch',
                url:                  testEnv.foreignChildPage,
                domain:               testEnv.foreignOrigin,
                allowedParentDomains: /^https:\/\/www\.foo\.com$/u
            }));

            return component().render(getBody()).catch(expect('onError'));
        }));
    });

    it('xprops.getParentDomain should pass the correct domain', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-get-parent-domain',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({
            passParentDomain: expect('passParentDomain', (parentDomain : unknown) => {
                if (!parentDomain || parentDomain !== getDomain()) {
                    throw new Error(`Expected parent domain to be ${ getDomain() }, got ${ String(parentDomain) }`);
                }
            }),
            run: () => 'window.xprops.passParentDomain(window.xprops.getParentDomain());'
        }).render(getBody());
    }));

    it('xprops.getParent should pass the correct window', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-get-parent',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({
            isParentCorrect: expect('isParentCorrect', (result : unknown) => {
                if (!result) {
                    throw new Error('Expected parent window to be correct');
                }
            }),
            run: () => 'window.xprops.isParentCorrect(window.xprops.getParent() === window.parent);'
        }).render(getBody());
    }));
});
/* eslint-enable max-nested-callbacks */
