import type { TestComponent } from './common';

import { defineComponent, getBody, setupSuite, wrapPromise } from './common';

setupSuite();

describe('zoid url method cases', () => {
    it('should send props via get and post to an iframe component', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-post-props',
            url:    () => testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin,
            props:  {
                foo: { type: 'string', queryParam: true },
                bar: { type: 'string', bodyParam: true }
            }
        }));

        return component({
            foo:        '123',
            bar:        '456',
            onRendered: expect('onRendered'),
            run:        () => 'window.xprops.checkUrl(window.location.href);',
            checkUrl:   expect('checkUrl', (url : string) => {
                if (!url.includes('foo=123')) {
                    throw new Error('Expected to find foo=123 in the url');
                }

                if (url.includes('bar=456')) {
                    throw new Error('Expected not to find bar=456 in the url');
                }
            })
        }).render(getBody());
    }));
});
