// A window with post-robot but no zoid: what a test hands in as a `window`
// prop before zoid loads a component into it.
import { on, send, setup } from 'post-robot';

import { reportCoverage } from './coverage';

reportCoverage();

setup();

on('eval', ({ data }) => {
    const { code } = data as { code : string };

    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func -- the suite hands this window code to run
    return (new Function(code) as () => unknown)();
});

const ancestor = (window.opener as Window | null) ?? window.parent;

send(ancestor, 'initBasicChild', {}).catch(() => undefined);
