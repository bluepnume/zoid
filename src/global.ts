import { isSameDomain } from 'cross-domain-utils';

import { GLOBAL_KEY } from './constants';

// Everything zoid keeps on a window: registered component tags, windows
// reachable by uid, serialized payloads held by reference, and a child's
// exports.
type ZoidGlobal = {
    components ?: Record<string, true>,
    windows ?: Record<string, Window>,
    references ?: Record<string, string>,
    exports ?: unknown,
};

export const getGlobal = (win : Window = window) : ZoidGlobal => {
    if (!isSameDomain(win)) {
        throw new Error('Can not get global for window on different domain');
    }

    const holder = win as unknown as Record<string, ZoidGlobal | undefined>;

    holder[GLOBAL_KEY] ??= {};

    return holder[GLOBAL_KEY];
};

export const tryGlobal = <Result>(win : Window, handler : (global : ZoidGlobal) => Result) : Result | undefined => {
    try {
        return handler(getGlobal(win));
    } catch {
        return undefined;
    }
};

export const destroyGlobal = () : void => {
    delete (window as unknown as Record<string, unknown>)[GLOBAL_KEY];
};
