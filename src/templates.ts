// The default container (a div holding the frame and the prerender frame)
// and the default prerender page (a spinner).

import { destroyElement, toCSS } from 'belter';

import { EVENT } from './constants';

import type { RenderOptions } from './parent';

const CLASS = {
    VISIBLE:   'zoid-visible',
    INVISIBLE: 'zoid-invisible'
} as const;

export const defaultContainerTemplate = <P>({
    uid, frame, prerenderFrame, doc, props, event, dimensions
} : RenderOptions<P>) : HTMLElement | undefined => {
    if (!frame || !prerenderFrame) {
        return undefined;
    }

    const { width, height } = dimensions;

    const widthRule = width
        ? `width: ${ width };`
        : '';

    const heightRule = height
        ? `height: ${ height };`
        : '';

    const div = doc.createElement('div');

    div.setAttribute('id', uid);

    const style = doc.createElement('style');

    if (props.cspNonce) {
        style.setAttribute('nonce', props.cspNonce);
    }

    style.appendChild(doc.createTextNode(`
        #${ uid } {
            display: inline-block;
            position: relative;
            ${ widthRule }
            ${ heightRule }
        }

        #${ uid } > iframe {
            display: inline-block;
            position: absolute;
            width: 100%;
            height: 100%;
            top: 0;
            left: 0;
            transition: opacity .2s ease-in-out;
        }

        #${ uid } > iframe.${ CLASS.INVISIBLE } {
            opacity: 0;
        }

        #${ uid } > iframe.${ CLASS.VISIBLE } {
            opacity: 1;
        }
    `));

    div.appendChild(frame);
    div.appendChild(prerenderFrame);
    div.appendChild(style);

    prerenderFrame.classList.add(CLASS.VISIBLE);
    frame.classList.add(CLASS.INVISIBLE);

    event.on(EVENT.RENDERED, () => {
        prerenderFrame.classList.remove(CLASS.VISIBLE);
        prerenderFrame.classList.add(CLASS.INVISIBLE);

        frame.classList.remove(CLASS.INVISIBLE);
        frame.classList.add(CLASS.VISIBLE);

        setTimeout(() => {
            destroyElement(prerenderFrame);
        }, 1);
    });

    event.on(EVENT.RESIZE, data => {
        const { width: newWidth, height: newHeight } = data as { width ?: number, height ?: number };

        if (typeof newWidth === 'number') {
            div.style.width = toCSS(newWidth);
        }

        if (typeof newHeight === 'number') {
            div.style.height = toCSS(newHeight);
        }
    });

    return div;
};

export const defaultPrerenderTemplate = <P>({ doc, props } : RenderOptions<P>) : HTMLElement | undefined => {
    const html = doc.createElement('html');
    const body = doc.createElement('body');
    const style = doc.createElement('style');
    const spinner = doc.createElement('div');

    spinner.classList.add('spinner');

    if (props.cspNonce) {
        style.setAttribute('nonce', props.cspNonce);
    }

    html.appendChild(body);
    body.appendChild(spinner);
    body.appendChild(style);

    style.appendChild(doc.createTextNode(`
        html, body {
            width: 100%;
            height: 100%;
        }

        .spinner {
            position: fixed;
            max-height: 60vmin;
            max-width: 60vmin;
            height: 40px;
            width: 40px;
            top: 50%;
            left: 50%;
            box-sizing: border-box;
            border: 3px solid rgba(0, 0, 0, .2);
            border-top-color: rgba(33, 128, 192, 0.8);
            border-radius: 100%;
            animation: rotation .7s infinite linear;
        }

        @keyframes rotation {
            from {
                transform: translateX(-50%) translateY(-50%) rotate(0deg);
            }
            to {
                transform: translateX(-50%) translateY(-50%) rotate(359deg);
            }
        }
    `));

    return html;
};
