// A child on the current code, rendered by a parent on the published zoid 11
// bundle (pages/previous-parent.html).
import { create } from '../src';

import { reportCoverage } from './coverage';

reportCoverage();

type Props = { readonly onLoad : (exports : { readonly double : (value : number) => number }) => unknown };

create<Props>({ tag: 'test-compat-previous-parent', url: location.href });

const { xprops } = window as unknown as { readonly xprops : Props };

xprops.onLoad({ double: value => value * 2 });
