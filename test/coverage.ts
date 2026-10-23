// Coverage from child windows. Each child page runs its own instrumented copy
// of src/, in its own process when it is cross-origin, so its counters never
// reach the test page on their own. Children post their counters up every
// few ticks and as they unload; the test page adds them to its own before
// the runner takes coverage at the end of the file.

const COVERAGE_KEY = '__VITEST_COVERAGE__';
const MESSAGE_KEY = '__zoid_test_coverage__';
const REPORT_INTERVAL = 50;
const SETTLE_DELAY = 200;

type FileCoverage = {
    readonly s : Record<string, number>,
    readonly f : Record<string, number>,
    readonly b : Record<string, Array<number>>,
};

type CoverageMap = Record<string, FileCoverage>;

type CoverageMessage = {
    readonly [ MESSAGE_KEY ] : {
        readonly frame : string,
        readonly map : CoverageMap,
    },
};

const coverageGlobal = globalThis as unknown as Record<typeof COVERAGE_KEY, CoverageMap | undefined>;

// Every window a child can reach upward: its parents, and its opener's.
const getReachableWindows = () : ReadonlyArray<Window> => {
    const found = new Set<Window>();
    const queue : Array<Window | null> = [ window.parent, window.opener as Window | null ];

    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        if (next && next !== window && !found.has(next)) {
            found.add(next);
            queue.push(next.parent, next.opener as Window | null);
        }
    }

    return [ ...found ];
};

// Child side: report this window's counters until it unloads.
export const reportCoverage = () : void => {
    const frame = crypto.randomUUID();

    const report = () : void => {
        const map = coverageGlobal[COVERAGE_KEY];

        if (!map) {
            return;
        }

        const message : CoverageMessage = { [ MESSAGE_KEY ]: { frame, map } };

        for (const target of getReachableWindows()) {
            target.postMessage(message, '*');
        }
    };

    setInterval(report, REPORT_INTERVAL);
    window.addEventListener('pagehide', report);
};

const isCoverageMessage = (data : unknown) : data is CoverageMessage =>
    typeof data === 'object' && data !== null && MESSAGE_KEY in data;

type AddCountsOptions = { readonly target : FileCoverage, readonly source : FileCoverage };

const addCounts = ({ target, source } : AddCountsOptions) : void => {
    for (const key of Object.keys(source.s)) {
        target.s[key] = (target.s[key] ?? 0) + (source.s[key] ?? 0);
    }

    for (const key of Object.keys(source.f)) {
        target.f[key] = (target.f[key] ?? 0) + (source.f[key] ?? 0);
    }

    for (const key of Object.keys(source.b)) {
        const counts = target.b[key] ?? [];

        target.b[key] = (source.b[key] ?? []).map((count, index) => count + (counts[index] ?? 0));
    }
};

// Test page side: keep each child's latest counters, and add them all in
// once the file's tests are done.
export const collectChildCoverage = () : void => {
    const latest = new Map<string, CoverageMap>();

    window.addEventListener('message', event => {
        if (isCoverageMessage(event.data)) {
            const { frame, map } = event.data[MESSAGE_KEY];

            latest.set(frame, map);
        }
    });

    afterAll(async () => {
        await new Promise(resolve => {
            setTimeout(resolve, SETTLE_DELAY);
        });

        const own = coverageGlobal[COVERAGE_KEY] ?? {};

        coverageGlobal[COVERAGE_KEY] = own;

        for (const map of latest.values()) {
            for (const [ file, coverage ] of Object.entries(map)) {
                const existing = own[file];

                if (existing) {
                    addCounts({ target: existing, source: coverage });
                } else {
                    own[file] = structuredClone(coverage);
                }
            }
        }
    });
};
