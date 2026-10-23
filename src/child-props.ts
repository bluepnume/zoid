// The child side of props: what arrived from the parent, filtered by trust
// and decorated with the child helpers.

import { getDomain, isSameDomain, matchDomain } from 'cross-domain-utils';

import { PROP_TYPE } from './constants';

import type { ChildHelpers, PropsDefinition } from './props';
import type { AnyProps } from './types';

const PRIMITIVE_PROP_TYPES : ReadonlySet<string> = new Set([ PROP_TYPE.STRING, PROP_TYPE.NUMBER, PROP_TYPE.BOOLEAN ]);

type AssertPrimitivePropTypeOptions = {
    readonly type : string,
    readonly key : string,
    readonly value : unknown,
};

// Bootstrap props come from window.name, which a framing or opening page
// can forge; an object or function smuggled into a primitive-typed prop is
// refused so it cannot reach a render sink.
const assertPrimitivePropType = ({ type, key, value } : AssertPrimitivePropTypeOptions) : void => {
    if (
        value !== null &&
        value !== undefined &&
        (typeof value === 'object' || typeof value === 'function') &&
        PRIMITIVE_PROP_TYPES.has(type)
    ) {
        throw new Error(`Prop "${ key }" is declared as ${ type } but received ${ typeof value }`);
    }
};

type NormalizeChildPropOptions = {
    readonly propsDef : PropsDefinition,
    readonly key : string,
    readonly value : unknown,
    readonly helpers : ChildHelpers<AnyProps, unknown>,
};

const normalizeChildProp = ({ propsDef, key, value, helpers } : NormalizeChildPropOptions) : unknown => {
    const prop = propsDef[key];

    return prop?.childDecorate
        ? prop.childDecorate({ ...helpers, value })
        : value;
};

type NormalizeChildPropsOptions = {
    readonly parentComponentWindow : Window,
    readonly propsDef : PropsDefinition,
    readonly props : AnyProps,
    readonly origin : string,
    readonly helpers : ChildHelpers<AnyProps, unknown>,
    readonly isUpdate ?: boolean,
};

export const normalizeChildProps = ({
    parentComponentWindow, propsDef, props, origin, helpers, isUpdate = false
} : NormalizeChildPropsOptions) : AnyProps => {
    const result : AnyProps = {};

    for (const key of Object.keys(props)) {
        const prop = propsDef[key];

        const trustedChild = prop?.trustedDomains?.length
            ? prop.trustedDomains.some(domain => matchDomain(domain, getDomain(window)))
            : origin === getDomain(window) || isSameDomain(parentComponentWindow);

        // trustedDomains overrides sameDomain; without it, same domain is the rule.
        if (!trustedChild && prop?.sameDomain) {
            continue;
        }

        if (!trustedChild && prop?.trustedDomains) {
            continue;
        }

        if (prop) {
            assertPrimitivePropType({ type: prop.type, key, value: props[key] });
        }

        const value = normalizeChildProp({ propsDef, key, value: props[key], helpers });

        result[key] = value;

        if (prop?.alias && !result[prop.alias]) {
            result[prop.alias] = value;
        }
    }

    if (!isUpdate) {
        for (const key of Object.keys(propsDef)) {
            if (!Object.hasOwn(props, key)) {
                result[key] = normalizeChildProp({ propsDef, key, value: undefined, helpers });
            }
        }
    }

    return result;
};
