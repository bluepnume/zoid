# Prop Definitions

## type

`string`

The data-type expected for the prop

- `'string'`
- `'number'`
- `'boolean'`
- `'object'`
- `'function'`
- `'array'`

## required

`boolean`

Whether or not the prop is mandatory. Defaults to `true`.

```javascript
onLogin: {
    type: 'function',
    required: false
}
```

## default

```javascript
({
    props : Props,
    state : Object,
    close : () => Promise<undefined>,
    focus : () => Promise<undefined>,
    onError : (mixed) => Promise<undefined>,
    container : HTMLElement | undefined,
    event : Event
}) => value
```

A function returning the default value for the prop, if none is passed

```javascript
email: {
    type: 'string',
    required: false,
    default: function() {
        return 'a@b.com';
    }
}
```

## validate

`({ value, props }) => void`

A function to validate the passed value. Should throw an appropriate error if invalid.

```javascript
email: {
    type: 'string',
    validate: function({ value, props }) {
        if (!value.match(/^.+@.+\..+$/)) {
            throw new TypeError(`Expected email to be valid format`);
        }
    }
}
```

## queryParam

`boolean | string | ({ value }) => string`

Should a prop be passed in the url.

```javascript
email: {
    type: 'string',
    queryParam: true // ?email=foo@bar.com
}
```

If a string is set, this specifies the url param name which will be used.

```javascript
email: {
    type: 'string',
    queryParam: 'user-email' // ?user-email=foo@bar.com
}
```

If a function is set, this is called to determine the url param which should be used.

```javascript
email: {
    type: 'string',
    queryParam: function({ value }) {
        if (value.indexOf('@foo.com') !== -1) {
            return 'foo-email'; // ?foo-email=person@foo.com
        } else {
            return 'generic-email'; // ?generic-email=person@whatever.com
        }
    }
}
```

## queryValue

`({ value }) => any`

The value to put in the url for the prop, instead of the prop itself. The only way to put a function prop in the url: give it a `queryValue` that returns what to send.

```javascript
getUser: {
    type: 'function',
    queryParam: 'user',
    queryValue: ({ value }) => value().name
}
```

## bodyParam, bodyValue

The same as `queryParam` and `queryValue`, for a component loaded by form POST (`method: 'post'`, or automatically when any prop has a `bodyParam`). The value goes in the request body instead of the url.

## value

```javascript
({
    props : Props,
    state : Object,
    close : () => Promise<undefined>,
    focus : () => Promise<undefined>,
    onError : (mixed) => Promise<undefined>,
    container : HTMLElement | undefined,
    event : Event
}) => value
```

The value for the prop, if it should be statically defined at component creation time

```javascript
userAgent: {
    type: 'string',
    value() {
        return window.navigator.userAgent;
    }
}
```

## decorate

```javascript
({
    props : Props,
    state : Object,
    close : () => Promise<undefined>,
    focus : () => Promise<undefined>,
    onError : (mixed) => Promise<undefined>,
    container : HTMLElement | undefined,
    event : Event,
    value : Value
}) => value
```

A function used to decorate the prop at render-time. Called with the value of the prop (and the other props, helpers and state), should return the new value.

```javascript
onLogin: {
    type: 'function',
    decorate({ value }) {
        return function() {
            console.log('User logged in!');
            return value.apply(this, arguments);
        };
    }
}
```

## childDecorate

`({ value, uid, tag, close, focus, show, hide, resize, onError, onProps, getParent, getParentDomain, export, getSiblings }) => value`

Like `decorate`, but run in the child window, with the child helpers. This is how the built-in `xprops.close`, `xprops.focus` and the rest are made.

## sendToChild

`boolean`

Whether the prop is sent to the child window at all. Defaults to `true`. Parent-side callbacks like `onRendered` are `sendToChild: false`.

## allowDelegate

`boolean`

Whether the prop is handed to the window doing the rendering during `renderTo`. Defaults to `false`; `window`, `onClose`, `onDestroy`, `onDisplay`, `onResize` and `onFocus` are delegated.

## sameDomain

`boolean`

When `true`, the prop only reaches a child on the same origin as the parent. Defaults to `false`.

## trustedDomains

`Array<string | RegExp>`

The prop only reaches a child whose origin matches one of these. Overrides `sameDomain`.

## serialization

`string`

If `json`, the prop will be JSON stringified before being inserted into the url

```javascript
user: {
    type: 'object',
    serialization: 'json' // ?user={"name":"Zippy","age":34}
}
```

If `dotify` the prop will be converted to dot-notation.

```javascript
user: {
    type: 'object',
    serialization: 'dotify' // ?user.name=Zippy&user.age=34
}
```

If `base64`, the prop will be JSON stringified then base64 encoded before being inserted into the url

```javascript
user: {
    type: 'object',
    serialization: 'base64' // ?user=eyJuYW1lIjoiWmlwcHkiLCJhZ2UiOjM0fQ==
}
```

## alias

`string`

An aliased name for the prop. Either name may be passed, and the child sees both.

```javascript
onLogin: {
    type: 'function',
    alias: 'onUserLogin'
}
```
