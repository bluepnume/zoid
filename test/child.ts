import { destroyElement, memoize } from 'belter';
import { getAncestors } from 'cross-domain-utils';
import { on, send } from 'post-robot';
import { ZalgoPromise } from 'zalgo-promise';

// eslint-disable-next-line import/no-namespace -- the whole module is what a definition receives
import * as zoid from '../src';

// The page every test renders: it asks the window that opened it for the
// component definition, creates it (becoming the child, or a renderTo
// target), and runs whatever code the parent hands it through `run`.
import type { ComponentFactory, Definition, Zoid } from './env';

import { runOnClick } from './click';
import { reportCoverage } from './coverage';
import { COMPONENT_MESSAGE, getTestEnv } from './env';

type ChildWindow = Window & {
    zoid ?: Zoid,
    __component__ ?: () => unknown,
    xprops ?: {
        readonly run ?: () => PromiseLike<string>,
        readonly runOnClick ?: boolean,
        readonly postRun ?: () => unknown,
        readonly onError : (err : unknown) => unknown,
    },
};

reportCoverage();

const win = window as ChildWindow;

win.zoid = zoid;

// The definition lives on the test window, which may be more than one
// level up (a container template can nest the frame in another iframe):
// ask each ancestor in turn, nearest first.
const fetchDefinition = (candidates : ReadonlyArray<Window>) : ZalgoPromise<Definition> => {
    const [ first, ...rest ] = candidates;

    if (!first) {
        return ZalgoPromise.reject(new Error('No ancestor window answered with a component definition'));
    }

    return send(first, COMPONENT_MESSAGE, {}, { domain: '*', timeout: 3000 })
        .then(({ data }) => data as Definition)
        .catch((err : unknown) => (rest.length
            ? fetchDefinition(rest)
            : ZalgoPromise.reject(err)));
};

const evaluate = (code : string) : ZalgoPromise => ZalgoPromise.try(() => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func -- the suite hands the child code to run
    const run = new Function(code) as () => unknown;

    return run();
}).catch((err : unknown) => {
    win.xprops?.onError(err);
});

fetchDefinition(getAncestors(window)).then(definition => {
    const { source, params } = definition;

    // Relay the definition to any window this one renders.
    on(COMPONENT_MESSAGE, () => definition);

    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func -- the definition travels as source
    const factory = new Function('context', `return (${ source })(context);`) as ComponentFactory;

    win.__component__ = memoize(() => factory({ zoid, env: getTestEnv(), side: 'child', params }));
    win.__component__();

    const { xprops } = win;

    if (!xprops) {
        setTimeout(() => {
            window.close();

            if (window.frameElement) {
                destroyElement(window.frameElement as HTMLElement);
            }
        }, 1);

        throw new Error('No xprops found');
    }

    on('eval', ({ data: request }) => evaluate((request as { code : string }).code));

    if (xprops.run) {
        return ZalgoPromise.resolve(xprops.run()).then(code => {
            const wrapped = `(function() { ${ code } }).call(this);`;

            if (xprops.runOnClick) {
                runOnClick(() => evaluate(wrapped));
            } else {
                evaluate(wrapped);
            }
        }).then(() => xprops.postRun?.());
    }

    return undefined;
}).catch((err : unknown) => {
    // eslint-disable-next-line no-console -- the only channel out of a child page that never came up
    console.error('zoid child page failed', err);
});
