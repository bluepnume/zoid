/* eslint-disable max-nested-callbacks -- a suite nests describe, it, wrapPromise, prop handlers and promise chains, and zoid props and window hooks return promises by design */
import type { OnWindowOpenResult, TestComponent } from './common';

import { defineComponent, getBody, onWindowOpen, setupSuite, wrapPromise } from './common';

setupSuite();

// Dimension checks read the child's innerWidth, so these children are same-origin.
type Size = { readonly width : number, readonly height : number };

const expectSize = (win : Window, { width, height } : Size) : void => {
    if (win.innerWidth !== width) {
        throw new Error(`Expected width to be ${ width }, got ${ win.innerWidth }`);
    }

    if (win.innerHeight !== height) {
        throw new Error(`Expected height to be ${ height }, got ${ win.innerHeight }`);
    }
};

describe('zoid dimensions cases', () => {
    it('should render a component to an iframe with specific px dimensions', () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:        'test-render-iframe-dimensions',
            url:        testEnv.childPage,
            domain:     testEnv.origin,
            dimensions: { width: '178px', height: '253px' },
            attributes: { iframe: { scrolling: 'no' } }
        }));

        const windowPromise = onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => win));

        return component({ onRendered: expect('onRendered') }).render(getBody())
            .then(() => windowPromise)
            .then(win => expectSize(win, { width: 178, height: 253 }));
    }));

    it(`should render a component to an iframe and resize with specific px dimensions`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:        'test-render-iframe-resize',
            url:        testEnv.childPage,
            domain:     testEnv.origin,
            attributes: { iframe: { scrolling: 'no' } }
        }));

        const windowPromise = onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => win));
        const instance = component({ onRendered: expect('onRendered') });

        return instance.render(getBody())
            .then(() => instance.resize({ width: 293, height: 101 }))
            .then(() => windowPromise)
            .then(win => expectSize(win, { width: 293, height: 101 }));
    }));

    it(`should render a component to an iframe with specific px dimensions from a function`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:    'test-render-popup-dimensions-func',
            url:    testEnv.childPage,
            domain: testEnv.origin,

            dimensions: ({ props }) => {
                const { dimensions } = props as unknown as { dimensions : { width : string, height : string } };

                return dimensions;
            },

            attributes: { iframe: { scrolling: 'no' } }
        }));

        const windowPromise = onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => win));

        return component({ onRendered: expect(`onRendered`), dimensions: { width: `1282px`, height: `720px` } }).render(getBody())
            .then(() => windowPromise)
            .then(win => expectSize(win, { width: 1282, height: 720 }));
    }));

    it(`should render a component to an iframe and resize from the child with specific px dimensions`, () => wrapPromise(({ expect }) => {
        const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv }) => lib.create({
            tag:        'test-render-iframe-resize-from-child',
            url:        testEnv.childPage,
            domain:     testEnv.origin,
            attributes: { iframe: { scrolling: 'no' } }
        }));

        const windowPromise = onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => win));

        return component({
            onResized: expect(`onResized`, () => windowPromise.then(win => expectSize(win, { width: 293, height: 101 }))),

            run: () => `
                window.xprops.resize({ width: 293, height: 101 })
                    .then(() => window.xprops.onResized());
            `
        }).render(getBody());
    }));

    type AutoResizeCase = {
        readonly title : string,
        readonly tag : string,
        readonly autoResize : { width ?: boolean, height ?: boolean, element ?: string },
        readonly dimensions ?: { width : string, height : string },
        readonly set : Size,
        readonly expected : Size,
    };

    const autoResizeFromChild = ({ title, tag, autoResize, dimensions, set, expected } : AutoResizeCase) : void => {
        it(title, () => wrapPromise(({ expect }) => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv, params }) => lib.create({
                tag:        params.tag as string,
                url:        testEnv.childPage,
                domain:     testEnv.origin,
                autoResize: params.autoResize as never,
                dimensions: params.dimensions as never,
                attributes: { iframe: { scrolling: 'no' } }
            }), { tag, autoResize, dimensions });

            const windowPromise = onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => win));
            const target = autoResize.element ?? 'body';

            return component({
                onResized: expect('onResized', () => windowPromise.then(win => expectSize(win, expected))),

                run: () => `
                    const target = document.querySelector(${ JSON.stringify(target) });
                    target.style.height = '${ set.height }px';
                    target.style.width = '${ set.width }px';
                    setTimeout(window.xprops.onResized, 100);
                `
            }).render(getBody());
        }));
    };

    autoResizeFromChild({
        title:      'should render a component to an iframe and autoresize from the child',
        tag:        'test-render-iframe-autoresize-from-child',
        autoResize: { height: true, width: true },
        set:        { width: 293, height: 101 },
        expected:   { width: 293, height: 101 }
    });

    autoResizeFromChild({
        title:      'should render a component to an iframe and autoresize width from the child',
        tag:        'test-render-iframe-autoresize-width-from-child',
        autoResize: { height: false, width: true },
        dimensions: { width: '100px', height: '100px' },
        set:        { width: 293, height: 100 },
        expected:   { width: 293, height: 100 }
    });

    autoResizeFromChild({
        title:      'should render a component to an iframe and autoresize height from the child',
        tag:        'test-render-iframe-autoresize-height-from-child',
        autoResize: { height: true, width: false },
        dimensions: { width: '100px', height: '100px' },
        set:        { width: 293, height: 105 },
        expected:   { width: 100, height: 105 }
    });

    autoResizeFromChild({
        title:      'should render a component to an iframe and autoresize from the child with a custom element',
        tag:        'test-render-iframe-autoresize-custom-from-child',
        autoResize: { height: true, width: true, element: '#container' },
        set:        { width: 293, height: 101 },
        expected:   { width: 293, height: 101 }
    });

    const autoResizeFromPrerender = ({ title, tag, autoResize, dimensions, set, expected } : AutoResizeCase) : void => {
        it(title, () => wrapPromise(({ expect }) => {
            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv, params }) => {
                const resizeOptions = params.autoResize as { width ?: boolean, height ?: boolean, element ?: string };
                const size = params.set as { width : number, height : number };

                return lib.create({
                    tag:        params.tag as string,
                    url:        testEnv.childPage,
                    domain:     testEnv.origin,
                    autoResize: resizeOptions,
                    dimensions: params.dimensions as never,
                    attributes: { iframe: { scrolling: 'no' } },

                    prerenderTemplate: ({ props, doc }) => {
                        const { onResized } = props as unknown as { onResized : unknown };

                        (window as Window & { __onResized__ ?: unknown }).__onResized__ = onResized;

                        const html = doc.createElement('html');
                        const body = doc.createElement('body');
                        const script = doc.createElement('script');

                        if (resizeOptions.element) {
                            const container = doc.createElement('div');

                            container.id = resizeOptions.element.slice(1);
                            body.appendChild(container);
                        }

                        script.text = `
                            const target = document.querySelector(${ JSON.stringify(resizeOptions.element ?? 'body') });
                            target.style.height = '${ size.height }px';
                            target.style.width = '${ size.width }px';
                            setTimeout(window.parent.__onResized__, 1);
                        `;

                        html.appendChild(body);
                        body.appendChild(script);

                        return html;
                    }
                });
            }, { tag, autoResize, dimensions, set });

            const windowPromise = onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => win));

            return component({
                onResized: expect('onResized', () => windowPromise.then(win => expectSize(win, expected)))
            }).render(getBody());
        }));
    };

    autoResizeFromPrerender({
        title:      'should render a component to an iframe and autoresize from the prerender template',
        tag:        'test-render-iframe-autoresize-from-prerender',
        autoResize: { height: true, width: true },
        set:        { width: 293, height: 101 },
        expected:   { width: 293, height: 101 }
    });

    autoResizeFromPrerender({
        title:      'should render a component to an iframe and autoresize the width from the prerender template',
        tag:        'test-render-iframe-autoresize-width-from-prerender',
        autoResize: { height: false, width: true },
        dimensions: { width: '100px', height: '100px' },
        set:        { width: 293, height: 101 },
        expected:   { width: 293, height: 100 }
    });

    autoResizeFromPrerender({
        title:      'should render a component to an iframe and autoresize the height from the prerender template',
        tag:        'test-render-iframe-autoresize-height-from-prerender',
        autoResize: { height: true, width: false },
        dimensions: { width: '100px', height: '100px' },
        set:        { width: 293, height: 101 },
        expected:   { width: 100, height: 101 }
    });

    autoResizeFromPrerender({
        title:      `should render a component to an iframe and autoresize using a custom element from the prerender template`,
        tag:        'test-render-iframe-autoresize-custom-from-prerender',
        autoResize: { height: true, width: true, element: '#container' },
        set:        { width: 293, height: 101 },
        expected:   { width: 293, height: 101 }
    });

    type PercentageCase = {
        readonly title : string,
        readonly tag : string,
        readonly percent : string,
        readonly factor : number,
    };

    const percentage = ({ title, tag, percent, factor } : PercentageCase) : void => {
        it(title, () => wrapPromise(({ expect }) => {
            const width = 178;
            const height = 254;

            const el = document.createElement('div');

            el.style.width = `${ width * factor }px`;
            el.style.height = `${ height * factor }px`;
            getBody().appendChild(el);

            const component = defineComponent<TestComponent>(({ zoid: lib, env: testEnv, params }) => lib.create({
                tag:        params.tag as string,
                url:        testEnv.childPage,
                domain:     testEnv.origin,
                dimensions: { width: `${ params.percent as string }%`, height: `${ params.percent as string }%` },
                attributes: { iframe: { scrolling: 'no' } }
            }), { tag, percent });

            const windowPromise = onWindowOpen().then(expect('onWindowOpen', ({ win } : OnWindowOpenResult) => win));

            return component({ onRendered: expect('onRendered') }).render(el)
                .then(() => windowPromise)
                .then(win => expectSize(win, { width, height }));
        }));
    };

    percentage({ title: `should render a component to an iframe with 100% percentage dimensions`, tag: `test-render-iframe-100-percent-dimensions`, percent: `100`, factor: 1 });
    percentage({ title: `should render a component to an iframe with 50% percentage dimensions`, tag: `test-render-iframe-50-percent-dimensions`, percent: `50`, factor: 2 });
});
/* eslint-enable max-nested-callbacks */
