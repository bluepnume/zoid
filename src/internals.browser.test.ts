// The guards inside zoid that the end-to-end suites never trip: malformed
// window names, cross-origin globals, missing payload references, and props
// forged into a child's window name.
import { getDomain } from 'cross-domain-utils';

import type { ChildHelpers, PropsDefinition } from './props';

import { normalizeChildProps } from './child-props';
import { destroyGlobal, getGlobal, tryGlobal } from './global';
import { crossDomainDeserialize, crossDomainSerialize, getProxyObject } from './serialize';
import { isChildComponentWindow } from './window';

const foreignFrame = async () : Promise<Window> => {
    const frame = document.createElement('iframe');

    frame.src = `http://[::1]:${ location.port }/test/pages/basic.html`;
    document.body.append(frame);

    await new Promise(resolve => {
        frame.addEventListener('load', resolve, { once: true });
    });

    if (!frame.contentWindow) {
        throw new Error('Expected a frame window');
    }

    return frame.contentWindow;
};

describe('window names', () => {
    const original = window.name;

    afterEach(() => {
        window.name = original;
    });

    it.each([
        [ 'empty', '' ],
        [ 'plain', 'plain' ],
        [ 'not zoid', '__other__name__payload' ],
        [ 'with no component name', '__zoid____payload' ],
        [ 'with no payload', '__zoid__name__' ]
    ])('does not take a window name that is %s for a child', (_label, name) => {
        window.name = name;

        expect(isChildComponentWindow('name')).toBe(false);
    });
});

describe('the zoid global', () => {
    it('can not be read on another origin', async () => {
        const win = await foreignFrame();

        expect(() => getGlobal(win)).toThrow('different domain');
        expect(tryGlobal(win, global => global)).toBeUndefined();
    });

    it('is removed by destroyGlobal and made again on the next read', () => {
        getGlobal().exports = 'kept';
        destroyGlobal();

        expect(getGlobal().exports).toBeUndefined();
    });
});

describe('payload serialization', () => {
    it('refuses a proxy object read from another window', async () => {
        const proxy = getProxyObject({ secret: true });
        const other = await foreignFrame();

        await expect(proxy.get.call({ source: other }).toPromise()).rejects.toThrow('remote window');
        await expect(proxy.get.call({ source: window }).toPromise()).resolves.toEqual({ secret: true });
    });

    it('says so when a payload held by reference is gone', () => {
        const { serializedData, cleanReference } = crossDomainSerialize({
            data:            { value: 1 },
            metaData:        {},
            sender:          { domain: getDomain() },
            receiver:        { win: window, domain: getDomain() },
            passByReference: true,
            basic:           true
        });

        const read = () : unknown => crossDomainDeserialize({
            data:   serializedData,
            sender: { win: window },
            basic:  true
        }).data;

        expect(read()).toEqual({ value: 1 });

        cleanReference();

        expect(read).toThrow('not found');
    });

    it('takes the sender domain from a function of the metadata', () => {
        const { serializedData } = crossDomainSerialize({
            data:     { value: 1 },
            metaData: { domain: 'http://example.com' },
            sender:   { domain: getDomain() },
            receiver: { win: window, domain: getDomain() },
            basic:    true
        });

        const { sender } = crossDomainDeserialize<unknown, { readonly domain : string }>({
            data:   serializedData,
            sender: { win: window, domain: ({ metaData }) => metaData.domain },
            basic:  true
        });

        expect(sender.domain).toBe('http://example.com');
    });
});

describe('child props from the window name', () => {
    const helpers = {} as ChildHelpers<Record<string, unknown>, unknown>;

    it('refuses an object smuggled into a string prop', () => {
        const propsDef = { label: { type: 'string' } } as unknown as PropsDefinition;

        expect(() => normalizeChildProps({
            parentComponentWindow: window,
            propsDef,
            props:                 { label: { toString: 'forged' } },
            origin:                getDomain(),
            helpers
        })).toThrow('declared as string');
    });

    it('drops a prop meant only for trusted domains when this one is not', () => {
        const propsDef = { secret: { type: `string`, trustedDomains: [ `http://trusted.example` ] } } as unknown as PropsDefinition;

        expect(normalizeChildProps({
            parentComponentWindow: window,
            propsDef,
            props:                 { secret: 'value' },
            origin:                getDomain(),
            helpers
        })).not.toHaveProperty('secret');
    });
});
