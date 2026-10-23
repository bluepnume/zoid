export const ZOID = 'zoid';

// Parent and child windows find each other through a window property keyed
// by major version, so a parent on one major never picks up a child on
// another. A test checks this against package.json.
export const MAJOR_VERSION = '11';

export const GLOBAL_KEY = `__${ ZOID }_${ MAJOR_VERSION }__`;

export const POST_MESSAGE = {
    DELEGATE:       `${ ZOID }_delegate`,
    ALLOW_DELEGATE: `${ ZOID }_allow_delegate`
} as const;

export const COMPONENT_ERROR = {
    NAVIGATED_AWAY:      'Window navigated away',
    COMPONENT_DESTROYED: 'Component destroyed',
    COMPONENT_CLOSED:    'Component closed',
    WINDOW_CLOSED:       'Detected component window close',
    IFRAME_CLOSE:        'Detected iframe close'
} as const;

export const PROP_TYPE = {
    STRING:   'string',
    OBJECT:   'object',
    FUNCTION: 'function',
    BOOLEAN:  'boolean',
    NUMBER:   'number',
    ARRAY:    'array'
} as const;

export const WINDOW_REFERENCE = {
    OPENER: 'opener',
    PARENT: 'parent',
    GLOBAL: 'global',
    NAME:   'name'
} as const;

export const PROP_SERIALIZATION = {
    JSON:   'json',
    DOTIFY: 'dotify',
    BASE64: 'base64'
} as const;

export const WILDCARD = '*';

export const DEFAULT_DIMENSIONS = {
    WIDTH:  '300px',
    HEIGHT: '150px'
} as const;

export const EVENT = {
    RENDER:          'zoid-render',
    RENDERED:        'zoid-rendered',
    PRERENDER:       'zoid-prerender',
    PRERENDERED:     'zoid-prerendered',
    DISPLAY:         'zoid-display',
    ERROR:           'zoid-error',
    CLOSE:           'zoid-close',
    DESTROY:         'zoid-destroy',
    PROPS:           'zoid-props',
    RESIZE:          'zoid-resize',
    FOCUS:           'zoid-focus',
    BFCACHE_CACHE:   'zoid-bfcache-cache',
    BFCACHE_RESTORE: 'zoid-bfcache-restore'
} as const;

export const METHOD = {
    GET:  'get',
    POST: 'post'
} as const;

export { WINDOW_TYPE as CONTEXT } from 'cross-domain-utils';
