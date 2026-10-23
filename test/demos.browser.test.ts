// Every demo linked from demo/index.htm, driven end to end against the built
// bundle (dist/zoid.min.js): the component renders, gets its props, and a
// login inside it calls back to the page that rendered it.
import { assertExists } from 'belter';

import { env } from './common';

const TIMEOUT = 15_000;
const EMAIL = 'foo@bar.com';

type WaitForOptions<T> = { readonly what : string, readonly check : () => T | undefined | null | false };

const waitFor = async <T>({ what, check } : WaitForOptions<T>) : Promise<T> => {
    const deadline = Date.now() + TIMEOUT;

    for (;;) {
        const found = check();

        if (found) {
            return found;
        }

        if (Date.now() > deadline) {
            throw new Error(`Timed out waiting for ${ what }`);
        }

        // eslint-disable-next-line no-await-in-loop -- polling until the demo gets there
        await new Promise(resolve => {
            setTimeout(resolve, 50);
        });
    }
};

type Demo = {
    readonly win : Window,
    readonly opened : Array<Window>,
};

// Keeps every popup `win` opens in `opened`.
const recordPopups = ({ win, opened } : Demo) : void => {
    const open = win.open.bind(win);

    win.open = (...args : Parameters<typeof window.open>) : Window | null => {
        const popup = open(...args);

        if (popup) {
            opened.push(popup);
        }

        return popup;
    };
};

// Loads a demo page in a frame on this origin, recording the popups it opens.
const loadDemo = async (path : string) : Promise<Demo> => {
    const frame = document.createElement('iframe');
    const opened : Array<Window> = [];

    frame.style.width = '1000px';
    frame.style.height = '800px';
    frame.src = `${ env.origin }/demo/${ path }`;
    document.body.append(frame);

    const win = await waitFor({
        what:  `${ path } to load zoid`,
        check: () => frame.contentWindow && 'zoid' in frame.contentWindow && frame.contentWindow
    });

    const demo = { win, opened };

    recordPopups(demo);

    return demo;
};

// The document of the zoid frame inside `container`, once `selector` is in it.
type GetComponentDocumentOptions = { readonly doc : Document, readonly selector : string };

const getComponentDocument = ({ doc, selector } : GetComponentDocumentOptions) : Promise<Document> =>
    waitFor({
        what: `a component with ${ selector }`,

        check: () => [ ...doc.querySelectorAll('iframe') ]
            .filter(frame => frame.name.startsWith('__zoid__'))
            .map(frame => frame.contentDocument)
            .find(frameDoc => frameDoc?.querySelector(selector))
    });

type GetPopupDocumentOptions = { readonly demo : Demo, readonly selector : string };

const getPopupDocument = ({ demo, selector } : GetPopupDocumentOptions) : Promise<Document> =>
    waitFor({
        what:  `a popup with ${ selector }`,
        check: () => demo.opened.map(popup => popup.document).find(popupDoc => popupDoc.querySelector(selector))
    });

const getElement = <T extends HTMLElement>(doc : Document, selector : string) : T => {
    const element = doc.querySelector<T>(selector);

    if (!element) {
        throw new Error(`Expected ${ selector }`);
    }

    return element;
};

// Logs in through a login component and waits for `resultDoc` to hear of it.
type LogInOptions = { readonly loginDoc : Document, readonly resultDoc : Document };

const logIn = async ({ loginDoc, resultDoc } : LogInOptions) : Promise<void> => {
    expect(getElement<HTMLInputElement>(loginDoc, '#email').value).toBe(EMAIL);

    getElement<HTMLInputElement>(loginDoc, '#password').value = 'hunter2';
    getElement(loginDoc, '#loginButton').click();

    await waitFor({
        what:  'the login result',
        check: () => resultDoc.querySelector('#result')?.textContent.includes(`${ EMAIL } logged in!`)
    });
};

describe('demos', () => {
    it('basic iframe: renders the login and hears back from it', async () => {
        const demo = await loadDemo('basic/iframe/index.htm');
        const doc = demo.win.document;

        await logIn({ loginDoc: await getComponentDocument({ doc, selector: '#loginForm' }), resultDoc: doc });
    }, TIMEOUT * 2);

    it('basic popup: opens the login in a popup on click and hears back from it', async () => {
        const demo = await loadDemo('basic/popup/index.htm');
        const doc = demo.win.document;

        getElement(doc, '#popupLogin').click();

        await logIn({ loginDoc: await getPopupDocument({ demo, selector: '#loginForm' }), resultDoc: doc });
    }, TIMEOUT * 2);

    it('pre-defined props: passes an updated email down to the login', async () => {
        const demo = await loadDemo('advanced/props/index.htm');
        const doc = demo.win.document;
        const loginDoc = await getComponentDocument({ doc, selector: '#loginForm' });
        const input = getElement<HTMLInputElement>(doc, '#email');

        input.value = 'new@bar.com';
        input.dispatchEvent(new KeyboardEvent('keyup'));

        await waitFor({
            what:  'the updated email',
            check: () => getElement<HTMLInputElement>(loginDoc, '#email').value === 'new@bar.com'
        });

        getElement<HTMLInputElement>(loginDoc, '#email').value = EMAIL;

        await logIn({ loginDoc, resultDoc: doc });
    }, TIMEOUT * 2);

    it('render remote: a button component renders the login into its parent page', async () => {
        const demo = await loadDemo('advanced/remote/index.htm');
        const doc = demo.win.document;
        const buttonDoc = await getComponentDocument({ doc, selector: '#openLoginButton' });

        getElement(buttonDoc, '#openLoginButton').click();

        const loginDoc = await getComponentDocument({ doc: getElement(doc, `#loginContainer`).ownerDocument, selector: `#loginForm` });

        await logIn({ loginDoc, resultDoc: buttonDoc });
    }, TIMEOUT * 2);

    it('render remote popup: a button component opens the login in a popup from its parent page', async () => {
        const demo = await loadDemo('advanced/remote-popup/index.htm');
        const doc = demo.win.document;
        const buttonDoc = await getComponentDocument({ doc, selector: '#openLoginButton' });

        // The button frame opens the popup itself, inside its own click.
        recordPopups({ win: assertExists(buttonDoc.defaultView, 'button window'), opened: demo.opened });
        getElement(buttonDoc, '#openLoginButton').click();

        await logIn({ loginDoc: await getPopupDocument({ demo, selector: '#loginForm' }), resultDoc: buttonDoc });
    }, TIMEOUT * 2);
});
