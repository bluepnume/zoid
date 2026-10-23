import type { CONTEXT, METHOD, PROP_SERIALIZATION, PROP_TYPE } from './constants';

export type Context = typeof CONTEXT[keyof typeof CONTEXT];

export type Method = typeof METHOD[keyof typeof METHOD];

export type PropType = typeof PROP_TYPE[keyof typeof PROP_TYPE];

export type PropSerialization = typeof PROP_SERIALIZATION[keyof typeof PROP_SERIALIZATION];

export type CssDimensions = {
    readonly width ?: string,
    readonly height ?: string,
};

export type ContainerReference = string | HTMLElement;

// A loose record: zoid's props are whatever the integrator declares.
export type AnyProps = Record<string, unknown>;
