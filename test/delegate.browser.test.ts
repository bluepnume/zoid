import { env, expectError, setupSuite, zoid } from './common';

setupSuite();

describe('zoid delegate domain matcher', () => {
    it('should throw when domain is explicitly set to WILDCARD', () =>
        expectError(`Wildcard domain guard`, () => zoid.create({ tag: `test-delegate-domain-wildcard`, url: env.foreignChildPage, domain: `*` })));

    it('should not throw when url is a function that resolves without instance props', () => {
        zoid.create({ tag: 'test-delegate-function-url-no-props', url: () => env.foreignChildPage });
    });

    it('should throw when url is a function that requires live props and no domain is set', () =>
        expectError('Function url requiring props without domain', () => zoid.create({
            tag: 'test-delegate-function-url-requires-props',

            url: ({ props }) => {
                const { clientID } = props as { clientID ?: string };

                if (!clientID) {
                    throw new Error('clientID required');
                }

                return `${ env.foreignChildPage }?client=${ clientID }`;
            }
        })));

    it('should reject an ALLOW_DELEGATE message from a mismatched origin', async () => {
        const component = zoid.create({ tag: `test-delegate-origin-reject`, url: env.foreignChildPage, domain: env.foreignOrigin });

        // This window is on the other origin, so its own listener must not answer.
        expect(await component.canRenderTo(window)).toBe(false);
    });

    it('should accept an ALLOW_DELEGATE message from a matching origin', async () => {
        const component = zoid.create({ tag: 'test-delegate-origin-accept', url: env.childPage, domain: env.origin });

        expect(await component.canRenderTo(window)).toBe(true);
    });

    it('should derive the domain matcher from a string url when domain is not set', async () => {
        const component = zoid.create({ tag: 'test-delegate-string-url-no-domain', url: env.childPage });

        expect(await component.canRenderTo(window)).toBe(true);
    });
});
