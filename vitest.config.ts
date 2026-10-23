import type { Plugin } from 'vite';

import { vitestConfig } from 'cugel-scripts/vitest';

// A component with body params is loaded by form POST; the static test
// pages answer that the same as a GET.
const postAsGet : Plugin = {
    name: 'zoid-test-post-as-get',

    configureServer: server => {
        server.middlewares.use((req, res, next) => {
            if (req.method === 'POST' && req.url?.startsWith('/test/pages/')) {
                req.method = 'GET';
            }

            next();
        });
    }
};

const base = vitestConfig({
    root:              import.meta.dirname,
    browser:           true,
    coverageThreshold: 95
});

// Istanbul, not v8: child windows run their own instrumented copy of src/,
// often in another process, and post their counters to the test page
// (test/coverage.ts). v8 coverage only sees the test page's own process.
export default {
    ...base,

    test: {
        ...base.test,
        coverage: { ...base.test.coverage, provider: 'istanbul' as const }
    },

    plugins: [ postAsGet ]
};
