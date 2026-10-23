// What both sides of a test can compute for themselves: the two origins the
// dev server answers on, and the child page on each.
// eslint-disable-next-line import/no-namespace -- the whole module is what a definition receives
import type * as zoidModule from '../src';

export type Zoid = typeof zoidModule;

export type TestEnv = {
    readonly origin : string,
    readonly childPage : string,
    readonly foreignOrigin : string,
    readonly foreignChildPage : string,
};

// The suite runs on `localhost`; the same server answers at the IPv6
// loopback literal, which the browser treats as a second origin.
export const getTestEnv = () : TestEnv => {
    const origin = `http://localhost:${ location.port }`;
    const foreignOrigin = `http://[::1]:${ location.port }`;

    return {
        origin,
        childPage:        `${ origin }/test/pages/child.html`,
        foreignOrigin,
        foreignChildPage: `${ foreignOrigin }/test/pages/child.html`
    };
};

export type Side = 'parent' | 'child';

// JSON-safe values a test hands its definition, so a helper can vary a tag
// or an option without the definition closing over anything.
export type Params = Readonly<Record<string, unknown>>;

// A component definition travels between windows as source, so it is a
// function of these arguments and nothing else.
export type FactoryContext = {
    readonly zoid : Zoid,
    readonly env : TestEnv,
    readonly side : Side,
    readonly params : Params,
};

export type ComponentFactory = (context : FactoryContext) => unknown;

export type Definition = {
    readonly source : string,
    readonly params : Params,
};

export const COMPONENT_MESSAGE = 'zoid_test_component_definition';
