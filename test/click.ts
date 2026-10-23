// `window.open` is only honoured inside a click, the way browsers block
// popups outside one; a blocked popup comes back as a closed stub.
import { createElement, destroyElement, noop } from 'belter';

let isClick = false;
let clickTimer : ReturnType<typeof setTimeout> | undefined;

const doClick = () : void => {
    isClick = true;
    clearTimeout(clickTimer);

    clickTimer = setTimeout(() => {
        isClick = false;
    }, 1);
};

// eslint-disable-next-line @typescript-eslint/unbound-method -- called with the element as `this` below
const originalClick = window.HTMLElement.prototype.click;

window.HTMLElement.prototype.click = function overrideHTMLElementClick(this : HTMLElement) : void {
    doClick();
    originalClick.call(this);
};

const windowOpen = window.open.bind(window);

window.open = (...args : Parameters<typeof window.open>) : Window | null => {
    if (!isClick) {
        const stub = {
            closed:   true,
            close:    noop,
            location: { href: '', pathname: '', protocol: '', host: '', hostname: '' },
            opener:   window
        } as unknown as Window;

        Object.assign(stub, { parent: stub, top: stub });

        return stub;
    }

    return windowOpen(...args);
};

export const runOnClick = <T>(handler : () => T) : T => {
    const testButton = createElement({ tag: 'button', id: 'testButton', container: document.body });
    let outcome : { readonly result : T } | { readonly error : unknown } | undefined;

    testButton.addEventListener('click', () => {
        try {
            outcome = { result: handler() };
        } catch (error) {
            outcome = { error };
        }
    });

    testButton.click();
    destroyElement(testButton);

    if (!outcome) {
        throw new Error('Click handler did not run');
    }

    if ('error' in outcome) {
        throw outcome.error;
    }

    return outcome.result;
};
