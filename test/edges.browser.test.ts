// Edges of the public API the other suites leave alone: misuse that has to
// fail loudly, options that change what gets rendered, and tearing zoid down.
import type { TestComponent } from './common';

import { defineComponent, env, expectError, getBody, runOnClick, setupSuite, wrapPromise, zoid } from './common';

setupSuite();

type RawCreate = (options : Record<string, unknown>) => TestComponent;

const create = zoid.create as unknown as RawCreate;

// Without an onError prop a render error is also thrown globally; these
// tests expect the error from render itself.
const ignoreError = () : undefined => undefined;

const loadFrame = async (origin : string) : Promise<Window> => {
    const frame = document.createElement('iframe');

    frame.src = `${ origin }/test/pages/basic.html`;
    getBody().append(frame);

    await new Promise(resolve => {
        frame.addEventListener('load', resolve, { once: true });
    });

    if (!frame.contentWindow) {
        throw new Error('Expected a frame window');
    }

    return frame.contentWindow;
};

const openPopup = () : Window => runOnClick(() => {
    const popup = window.open(`${ env.origin }/test/pages/basic.html`, `_blank`);

    if (!popup) {
        throw new Error('Popup blocked');
    }

    return popup;
});

describe('zoid edges', () => {
    it('refuses a second component with the same tag', () => {
        create({ tag: 'test-edges-duplicate', url: env.childPage });

        return expectError('Duplicate tag', () => create({ tag: 'test-edges-duplicate', url: env.childPage }));
    });

    it('refuses a default context that is not a string', () =>
        expectError(`Numeric default context`, () => create({ tag: `test-edges-context`, url: env.childPage, defaultContext: 1 })));

    it('asks for a domain when the url function has no url until it has props', () =>
        expectError('Lazy url without domain', () => create({ tag: 'test-edges-lazy-url', url: () => '' })));

    it('asks for a domain when the url function throws without props', () =>
        expectError('Throwing url without domain', () => create({
            tag: 'test-edges-throwing-url',
            url: ({ props } : { readonly props : { readonly path : { readonly value : string } } }) => props.path.value
        })));

    it('refuses a closed window passed as the window prop', () => {
        const component = create({ tag: 'test-edges-closed-window', url: env.childPage });
        const popup = openPopup();

        popup.close();

        return expectError(`Closed window prop`, () => component({ window: popup, onError: ignoreError }).render(getBody()));
    });

    it('refuses a window on another domain passed as the window prop', async () => {
        const component = create({ tag: 'test-edges-foreign-window', url: env.childPage });
        const win = await loadFrame(env.foreignOrigin);

        await expectError(`Foreign window prop`, () => component({ window: win, onError: ignoreError }).render(getBody()));
    });

    it('refuses to renderTo another frame with an element for a container', async () => {
        const component = create({ tag: 'test-edges-renderto-container', url: env.childPage });
        const win = await loadFrame(env.origin);

        await expectError('Element container', () => component({ onError: ignoreError }).renderTo(win, getBody()));
    });

    it('refuses to renderTo a window outside this window tree', () => {
        const component = create({ tag: 'test-edges-renderto-popup', url: env.childPage });
        const popup = openPopup();

        return expectError(`Popup target`, () => component({ onError: ignoreError }).renderTo(popup, `body`)).finally(() => {
            popup.close();
        });
    });

    it('focuses nothing before it renders', async () => {
        const component = create({ tag: 'test-edges-focus', url: env.childPage });

        await component().focus().toPromise();
    });

    it('marks its styles with the csp nonce', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-edges-csp-nonce',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        return component({
            cspNonce:   'edges-nonce',
            onRendered: expect('onRendered', () => {
                if (!document.querySelector('style[nonce="edges-nonce"]')) {
                    throw new Error('Expected a style with the nonce');
                }
            })
        }).render(getBody());
    }));

    it('renders with no prerender page when the template gives none', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:               'test-edges-no-prerender',
            url:               testEnv.foreignChildPage,
            domain:            testEnv.foreignOrigin,
            prerenderTemplate: () => undefined
        }));

        return component({ onRendered: expect('onRendered') }).render(getBody());
    }));

    it(`reports each restore from the back-forward cache, with how long it was cached`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:           'test-edges-bfcache-restore',
            url:           testEnv.foreignChildPage,
            domain:        testEnv.foreignOrigin,
            enableBfcache: true,

            props: {
                hidden: { type: 'string', required: false, queryParam: true, queryValue: () => undefined }
            }
        }));

        const restores : Array<number | undefined> = [];
        const testComplete = expect('testComplete');

        const page = (type : string, persisted : boolean) : void => {
            window.dispatchEvent(new PageTransitionEvent(type, { persisted }));
        };

        return component({
            hidden: 'value',

            onBfcacheRestore: ({ cachedDurationMs } : { readonly cachedDurationMs ?: number }) => {
                restores.push(cachedDurationMs);
            }
        }).render(getBody(), zoid.CONTEXT.IFRAME).then(() => {
            page('pageshow', true);
            page('pageshow', false);
            page('pagehide', true);
            page('pageshow', true);

            if (restores.length !== 2 || restores[0] !== undefined || typeof restores[1] !== 'number') {
                throw new Error(`Unexpected restores: ${ JSON.stringify(restores) }`);
            }

            testComplete();
        });
    }));

    it('does not report a render cut short by destroy as an error', () => wrapPromise(({ expect, avoid }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-edges-destroy-during-render',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin
        }));

        const rendering = component({ onError: avoid('onError') }).render(getBody());

        return zoid.destroyAll().then(() => rendering.catch(expect('renderRejected')));
    }));

    it('keeps the child through a page hide into the back-forward cache', () => wrapPromise(({ expect, avoid }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:           'test-edges-child-bfcache',
            url:           testEnv.foreignChildPage,
            domain:        testEnv.foreignOrigin,
            enableBfcache: true
        }));

        return component({
            onClose: avoid('onClose'),
            onDone:  expect('onDone'),

            run: () => `
                window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
                window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
                window.xprops.onDone();
            `
        }).render(getBody());
    }));

    it('loads the child with the method the component asks for', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-edges-method',
            url:    testEnv.foreignChildPage,
            domain: testEnv.foreignOrigin,
            method: 'post'
        }));

        return component({ onRendered: expect('onRendered') }).render(getBody());
    }));

    // Last: it tears down zoid and post-robot for this page.
    it('tears everything down with destroy', async () => {
        create({ tag: 'test-edges-destroy', url: env.childPage });

        await zoid.destroy().toPromise();

        expect(Object.hasOwn(window, '__zoid_11__')).toBe(false);
    });
});
