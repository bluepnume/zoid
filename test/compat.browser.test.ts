// The current code against the published zoid 11 bundle (the zoid-previous
// dev dependency), each as parent and as child: a release must keep talking
// to the one before it on the same major.
import { env, getBody, setupSuite, wrapPromise, zoid } from './common';

setupSuite();

type Exports = { readonly double : (value : number) => PromiseLike<number> };

const expectDoubled = ({ double } : Exports) : Promise<void> => Promise.resolve(double(21)).then(result => {
    if (result !== 42) {
        throw new Error(`Expected 42 from the previous child, got ${ String(result) }`);
    }
});

const isCompatMessage = (data : unknown) : data is { readonly zoidCompat : unknown } =>
    typeof data === 'object' && data !== null && 'zoidCompat' in data;

describe('compatibility with the published zoid 11', () => {
    it('renders a child running the published bundle and calls back into it', () => wrapPromise(({ expect }) => {
        const tag = 'test-compat-previous-child';

        const component = zoid.create<{ readonly onLoad : (exports : Exports) => unknown }>({
            tag,
            url:    `${ env.foreignOrigin }/test/pages/previous-child.html?tag=${ tag }`,
            domain: env.foreignOrigin
        });

        return component({
            onLoad: expect('onLoad', expectDoubled)
        }).render(getBody());
    }));

    it('runs as a child of a parent on the published bundle', async () => {
        const frame = document.createElement('iframe');

        const result = new Promise<unknown>(resolve => {
            window.addEventListener('message', event => {
                if (isCompatMessage(event.data) && event.source === frame.contentWindow) {
                    resolve(event.data.zoidCompat);
                }
            });
        });

        frame.src = `${ env.origin }/test/pages/previous-parent.html`;
        getBody().append(frame);

        expect(await result).toBe(42);
    });
});
