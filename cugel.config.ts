import type { BuildOptions } from 'cugel-scripts/build';

// ES2019 syntax so older bundlers parse the package; one minified script-tag
// bundle for pages that load zoid directly, as `window.zoid`.
// eslint-disable-next-line import/no-default-export -- cugel-scripts reads the config's default export
export default {
    build: {
        target: 'es2019',

        bundle: {
            entry:      'src/index.ts',
            outfile:    'dist/zoid.min.js',
            globalName: 'zoid'
        }
    } satisfies Omit<BuildOptions, 'root'>
};
