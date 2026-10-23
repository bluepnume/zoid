// The payload a parent hands a child through its window name: an envelope
// the child can read before any messaging exists, around data serialized
// by post-robot (so functions in it are live).

import type { DomainMatcher } from 'cross-domain-utils';
import type { ProxyWindow } from 'post-robot';

import { base64decode, base64encode, uniqueID } from 'belter';
import { deserializeMessage, serializeMessage, toProxyWindow } from 'post-robot';
import { ZalgoPromise } from 'zalgo-promise';

import { getGlobal } from './global';

export type ProxyObject<T> = {
    readonly get : () => ZalgoPromise<T>,
};

// An object that stays in this window: handed to another window it becomes
// a function that only works from here. Called remotely, `this` is the
// request's context, so a caller elsewhere is refused.
export const getProxyObject = <T>(obj : T) : ProxyObject<T> => ({
    get(this : { readonly source ?: unknown } | undefined) : ZalgoPromise<T> {
        return ZalgoPromise.try(() => {
            if (this?.source && this.source !== window) {
                throw new Error('Can not call get on proxy object from a remote window');
            }

            return obj;
        });
    }
});

// base64 because the window name uses `__` as its delimiter.
const basicSerialize = (data : unknown) : string => base64encode(JSON.stringify(data));

const basicDeserialize = <T>(serializedData : string) : T => JSON.parse(base64decode(serializedData)) as T;

export const REFERENCE_TYPE = {
    UID: 'uid',
    RAW: 'raw'
} as const;

export type Reference = {
    readonly type : typeof REFERENCE_TYPE.UID,
    readonly uid : string,
} | {
    readonly type : typeof REFERENCE_TYPE.RAW,
    readonly val : string,
};

const getReferenceStore = (win : Window) : Record<string, string> => {
    const global = getGlobal(win);

    global.references ??= {};

    return global.references;
};

// Kept in this window, so a same-origin child reads it from here and the
// window name carries only the key.
const getUIDRef = (val : string) : Reference => {
    const uid = uniqueID();

    getReferenceStore(window)[uid] = val;

    return { type: REFERENCE_TYPE.UID, uid };
};

const getRefValue = (win : Window, ref : Reference) : string => {
    if (ref.type === REFERENCE_TYPE.RAW) {
        return ref.val;
    }

    const value = getReferenceStore(win)[ref.uid];

    if (value === undefined) {
        throw new Error(`Reference ${ ref.uid } not found in window`);
    }

    return value;
};

const cleanupRef = (ref : Reference) : void => {
    if (ref.type === REFERENCE_TYPE.UID) {
        delete getReferenceStore(window)[ref.uid];
    }
};

type Envelope<Meta> = {
    readonly sender : { readonly domain : string },
    readonly metaData : Meta,
    readonly reference : Reference,
};

type CrossDomainSerialized = {
    readonly serializedData : string,
    readonly cleanReference : () => void,
};

type CrossDomainSerializeOptions<Meta> = {
    readonly data : unknown,
    readonly metaData : Meta,
    readonly sender : { readonly domain : string },
    readonly receiver : {
        readonly win : ProxyWindow | Window,
        readonly domain : DomainMatcher,
    },
    readonly passByReference ?: boolean,
    // Copy the data as plain JSON instead of serializing it for the receiver.
    readonly basic ?: boolean,
};

export const crossDomainSerialize = <Meta>({
    data, metaData, sender, receiver, passByReference = false, basic = false
} : CrossDomainSerializeOptions<Meta>) : CrossDomainSerialized => {
    const serializedMessage = basic
        ? JSON.stringify(data)
        : serializeMessage(toProxyWindow(receiver.win), receiver.domain, data);

    const reference : Reference = passByReference
        ? getUIDRef(serializedMessage)
        : { type: REFERENCE_TYPE.RAW, val: serializedMessage };

    const message : Envelope<Meta> = {
        sender: { domain: sender.domain },
        metaData,
        reference
    };

    return {
        serializedData: basicSerialize(message),
        cleanReference: () => cleanupRef(reference)
    };
};

type CrossDomainDeserialized<T, Meta> = {
    readonly data : T,
    readonly metaData : Meta,
    readonly sender : {
        readonly domain : string,
        readonly win : Window,
    },
    readonly reference : Reference,
};

type CrossDomainDeserializeOptions<Meta> = {
    readonly data : string,
    readonly sender : {
        readonly win : Window | ((opts : { readonly metaData : Meta }) => Window),
        readonly domain ?: string | ((opts : { readonly metaData : Meta }) => string),
    },
    readonly basic ?: boolean,
};

export const crossDomainDeserialize = <T, Meta>({
    data, sender, basic = false
} : CrossDomainDeserializeOptions<Meta>) : CrossDomainDeserialized<T, Meta> => {
    const message = basicDeserialize<Envelope<Meta>>(data);
    const { reference, metaData } = message;

    const win = typeof sender.win === 'function'
        ? sender.win({ metaData })
        : sender.win;

    const domain = typeof sender.domain === 'function'
        ? sender.domain({ metaData })
        : sender.domain ?? message.sender.domain;

    const serializedData = getRefValue(win, reference);

    const deserializedData = basic
        ? JSON.parse(serializedData) as T
        : deserializeMessage<T>(win, domain, serializedData);

    return {
        data:   deserializedData,
        metaData,
        sender: { win, domain },
        reference
    };
};
