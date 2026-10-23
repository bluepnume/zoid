// How a child finds its parent: the parent writes a payload into the child's
// window name, with a reference to itself the child can follow before any
// messaging exists.

import { assertExists, memoize } from 'belter';
import {
    assertSameDomain, findFrameByName, getAllFramesInWindow, getAncestor, getDistanceFromTop,
    getDomain, getNthParentFromTop, getOpener, getParent, isSameDomain,
    isTop
} from 'cross-domain-utils';

import { WINDOW_REFERENCE, ZOID } from './constants';

import type { Reference } from './serialize';

import { tryGlobal } from './global';
import { crossDomainDeserialize, crossDomainSerialize, REFERENCE_TYPE } from './serialize';

export type WindowRef = {
    readonly type : typeof WINDOW_REFERENCE.OPENER,
} | {
    readonly type : typeof WINDOW_REFERENCE.PARENT,
    readonly distance : number,
} | {
    readonly type : typeof WINDOW_REFERENCE.GLOBAL,
    readonly uid : string,
} | {
    readonly type : typeof WINDOW_REFERENCE.NAME,
    readonly name : string,
};

type PayloadMetadata = {
    readonly windowRef : WindowRef,
};

const assertUnreachable = (value : never) : never => {
    throw new Error(`Unexpected window reference: ${ JSON.stringify(value) }`);
};

const getWindowByRef = (windowRef : WindowRef) : Window => {
    switch (windowRef.type) {
        case WINDOW_REFERENCE.OPENER:
            return assertExists(getOpener(window), 'opener');

        case WINDOW_REFERENCE.PARENT:
            return assertExists(getNthParentFromTop(window, windowRef.distance), 'parent');

        case WINDOW_REFERENCE.GLOBAL: {
            const { uid } = windowRef;
            const ancestor = getAncestor(window);

            if (!ancestor) {
                throw new Error('Can not find ancestor window');
            }

            for (const frame of getAllFramesInWindow(ancestor)) {
                if (isSameDomain(frame)) {
                    const win = tryGlobal(frame, global => global.windows?.[uid]);

                    if (win) {
                        return win;
                    }
                }
            }

            throw new Error(`Unable to find ${ windowRef.type } parent component window`);
        }

        case WINDOW_REFERENCE.NAME:
            return assertExists(findFrameByName(assertExists(getAncestor(window), `ancestor`), windowRef.name), `namedWindow`);

        default:
            return assertUnreachable(windowRef);
    }
};

type BuildChildWindowNameOptions = {
    readonly name : string,
    readonly serializedPayload : string,
};

export const buildChildWindowName = ({ name, serializedPayload } : BuildChildWindowNameOptions) : string =>
    `__${ ZOID }__${ name }__${ serializedPayload }__`;

type ParsedWindowName = {
    readonly name : string,
    readonly serializedInitialPayload : string,
};

const parseWindowName = (windowName : string) : ParsedWindowName => {
    if (!windowName) {
        throw new Error('No window name');
    }

    const [ , zoidcomp, name, serializedInitialPayload ] = windowName.split('__');

    if (zoidcomp !== ZOID) {
        throw new Error(`Window not rendered by zoid - got ${ zoidcomp ?? '' }`);
    }

    if (!name) {
        throw new Error('Expected component name');
    }

    if (!serializedInitialPayload) {
        throw new Error('Expected serialized payload ref');
    }

    return { name, serializedInitialPayload };
};

type InitialParentPayload<Payload> = {
    readonly parent : {
        readonly domain : string,
        readonly win : Window,
    },
    readonly payload : Payload,
    readonly reference : Reference,
};

const parseInitialParentPayload = memoize((windowName : string) : InitialParentPayload<unknown> => {
    const { serializedInitialPayload } = parseWindowName(windowName);

    const { data: payload, sender: parent, reference } = crossDomainDeserialize<unknown, PayloadMetadata>({
        data:   serializedInitialPayload,
        sender: {
            win: ({ metaData: { windowRef } }) => getWindowByRef(windowRef)
        }
    });

    return { parent, payload, reference };
});

export const getInitialParentPayload = <Payload>() : InitialParentPayload<Payload> =>
    parseInitialParentPayload(window.name) as InitialParentPayload<Payload>;

export const isChildComponentWindow = (name : string) : boolean => {
    try {
        return parseWindowName(window.name).name === name;
    } catch {
        return false;
    }
};

// How `currentWindow` can describe `targetWindow` to a child it opens.
const getWindowRef = (targetWindow : Window, currentWindow : Window = window) : WindowRef | undefined => {
    if (targetWindow === getParent(currentWindow)) {
        return { type: WINDOW_REFERENCE.PARENT, distance: getDistanceFromTop(targetWindow) };
    }

    if (targetWindow === getOpener(currentWindow)) {
        return { type: WINDOW_REFERENCE.OPENER };
    }

    if (isSameDomain(targetWindow) && !isTop(targetWindow)) {
        const windowName = assertSameDomain(targetWindow).name;

        if (windowName) {
            return { type: WINDOW_REFERENCE.NAME, name: windowName };
        }
    }

    return undefined;
};

type UpdateChildWindowNameWithRefOptions = {
    readonly componentName : string,
    readonly parentComponentWindow : Window,
};

// A same-origin child rewrites its own name once it is up, so the payload no
// longer travels with the window if it navigates elsewhere: the data is
// copied as inert JSON (never re-hydrated here) under a reference the parent
// window resolves.
export const updateChildWindowNameWithRef = ({
    componentName, parentComponentWindow
} : UpdateChildWindowNameWithRefOptions) : string | undefined => {
    const { serializedInitialPayload } = parseWindowName(window.name);

    const { data, sender, reference, metaData } = crossDomainDeserialize<unknown, PayloadMetadata>({
        data:   serializedInitialPayload,
        sender: { win: parentComponentWindow },
        basic:  true
    });

    if (reference.type !== REFERENCE_TYPE.UID && metaData.windowRef.type !== WINDOW_REFERENCE.GLOBAL) {
        return undefined;
    }

    const windowRef = getWindowRef(parentComponentWindow);

    const { serializedData: serializedPayload } = crossDomainSerialize<PayloadMetadata | { windowRef : undefined }>({
        data,
        metaData: { windowRef },
        sender:   { domain: sender.domain },
        receiver: { win: window, domain: getDomain() },
        basic:    true
    });

    const childWindowName = buildChildWindowName({ name: componentName, serializedPayload });

    window.name = childWindowName;

    return childWindowName;
};
