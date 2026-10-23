# Create new component

```javascript
zoid.create({ ...options });
```

Create a component definition, which will be loaded in both the parent and child windows.

## tag `string` [required]

A tag-name for the component, used for:

- Loading the correct component in the child window or frame
- Registering the component on the page, so a child window and a `renderTo` target can find it
- Logging

```javascript
const MyComponent = zoid.create({
    tag: 'my-component-tag',
    ...
});
```

## url `string | ({ props }) => string` [required]

The full url that will be loaded when your component is rendered, or a function returning the url.

This must include a protocol (http:, https:, or about:); it cannot be scheme-relative.

```javascript
const MyComponent = zoid.create({
  tag: "my-component",
  url: "https://my-site.com/my-component",
});
```

```javascript
const MyComponent = zoid.create({
  tag: "my-component",
  url: ({ props }) => {
    return props.env === "development"
      ? "http://dev.my-site.com/mycomponent"
      : "https://www.my-site.com/mycomponent";
  },
});
```

When `url` is a function that needs instance props to resolve, pass `domain` too: zoid needs the child's origin at `create` time to register its `renderTo` listeners.

## domain `string | RegExp | Array<string | RegExp>`

The origin (or origins) the child window may be on. Only required if the origin which will be rendered is different to the one in `url` - for example, if the url redirects to a different subdomain, or the child navigates between origins.

```javascript
const MyComponent = zoid.create({
  tag: "my-component",
  url: "https://foo.com/login",
  domain: "https://subdomain.foo.com",
});
```

```javascript
const MyComponent = zoid.create({
  tag: "my-component",
  url: "https://foo.com/login",
  domain: ["https://foo.com", /^https:\/\/[a-z]+\.foo\.com$/],
});
```

A wildcard `*` is not allowed here.

## dimensions `{ width : string, height : string } | ({ props }) => { width, height }`

The dimensions for your component, in css-style units, with support for `px` or `%`.

```javascript
const MyComponent = zoid.create({
  tag: "my-component",
  url: "https://my-site.com/my-component",
  dimensions: {
    width: "300px",
    height: "200px",
  },
});
```

```javascript
const MyComponent = zoid.create({
  tag: "my-component",
  url: "https://my-site.com/my-component",
  dimensions: {
    width: "80%",
    height: "90%",
  },
});
```

## props `{ [string] : PropDefinition }`

A mapping of prop name to prop settings. Helpful for setting default values, decorating values, adding props to the query string of your component url, and more.

Note: you are not required to create a prop definition for each new prop. By default, anything passed in as a prop when instantiating your component will be automatically passed to the child window in `window.xprops`.

```javascript
const MyComponent = zoid.create({
  tag: "my-component",
  url: "https://my-site.com/my-component",

  props: {
    onLogin: {
      type: "function",
    },

    prefilledEmail: {
      type: "string",
      required: false,
    },
  },
});
```

See [Prop Definitions](./prop-definitions.md) for all options which can be passed to prop definitions.

## containerTemplate `(opts) => HTMLElement`

A function which should return a DOM element, rendered on the parent page and containing the iframe element (or rendered behind the popup window).

zoid will pass `opts.frame` and `opts.prerenderFrame` to this function, which are pre-generated elements your component will be rendered into. These must be inserted somewhere into the DOM element you return, for frame-based components.

The `opts` parameter is [the same](#opts) as the parameter used in `prerenderTemplate`.

```javascript
const MyLoginZoidComponent = zoid.create({
  tag: "my-login",
  url: "https://www.mysite.com/login",

  containerTemplate: ({ doc, uid, frame, prerenderFrame }) => {
    const container = doc.createElement("div");
    const style = doc.createElement("style");

    container.id = uid;
    style.textContent = `
      #${uid} {
        border: 5px solid red;
      }
    `;

    container.appendChild(style);
    container.appendChild(frame);
    container.appendChild(prerenderFrame);

    return container;
  },
});
```

Any library that produces real DOM elements works here, as long as the elements are created with the `doc` that is passed in.

If no `containerTemplate` function is defined, then a default is used. The default template can be found in [src/templates.ts](../../src/templates.ts).

## prerenderTemplate `(opts) => HTMLElement`

A function which should return an `<html>` DOM element, rendered in place of the iframe element, or inside the popup window, as it loads.

Useful if you want to display a loading spinner or pre-render some content as the component loads.

```javascript
const MyLoginZoidComponent = zoid.create({
  tag: "my-login",
  url: "https://www.mysite.com/login",

  prerenderTemplate: ({ doc }) => {
    const html = doc.createElement("html");
    const body = doc.createElement("body");
    const p = doc.createElement("p");

    p.innerText = "Please wait while the component loads...";
    body.appendChild(p);
    html.appendChild(body);

    return html;
  },
});
```

**Note:** you must create the elements with the `doc` passed to `prerenderTemplate`, so they belong to the document of the new iframe or popup window, **not** the document of the parent page. zoid refuses a template built with the wrong document.

If no `prerenderTemplate` function is defined, a spinner is used. The default can be found in [src/templates.ts](../../src/templates.ts).

### opts

Data automatically passed to `containerTemplate` and `prerenderTemplate`, used to help render and customize the template.

- `uid`: Unique id automatically generated by zoid on render, unique to the instantiation of the given component
- `props`: Props passed to the component in `render()`
- `doc`: The appropriate document used to render dom elements
- `container`: The element into which the generated element will be inserted (`containerTemplate` only)
- `dimensions`: The dimensions for the component
- `tag`: Tag name of the component
- `context`: Context type of the component (`iframe` or `popup`)
- `frame`: Frame element that will be rendered into. Only applies to `containerTemplate` when rendering an iframe
- `prerenderFrame`: Frame element that will be pre-rendered into. Only applies to `containerTemplate` when rendering an iframe using `prerenderTemplate`
- `close`: Close the component. Useful if you want to render a close button outside the component
- `focus`: Focus the component. Valid for popup components only. Useful if you want a clickable background overlay to re-focus the popup window.
- `state`: An object the templates and prop definitions share for the life of the instance
- `event`: Object that can be used to listen for the events in `zoid.EVENT`

### Listening to zoid events

In the `containerTemplate` and `prerenderTemplate` functions, it is possible to attach functions that fire at events in the zoid lifecycle:

```javascript
event.on(zoid.EVENT.RENDERED, () => {
  prerenderFrame.classList.remove(CLASS.VISIBLE);
  prerenderFrame.classList.add(CLASS.INVISIBLE);

  frame.classList.remove(CLASS.INVISIBLE);
  frame.classList.add(CLASS.VISIBLE);

  setTimeout(() => {
    prerenderFrame.remove();
  }, 1);
});
```

The events are `RENDER`, `RENDERED`, `PRERENDER`, `PRERENDERED`, `DISPLAY`, `ERROR`, `CLOSE`, `DESTROY`, `PROPS`, `RESIZE`, `FOCUS`, `BFCACHE_CACHE` and `BFCACHE_RESTORE`.

## autoResize `{ height: boolean, width: boolean, element: string }`

Makes the iframe resize automatically when the child window size changes.

```javascript
const MyComponent = zoid.create({
  tag: "my-component",
  url: "https://my-site.com/my-component",
  autoResize: {
    width: false,
    height: true,
  },
});
```

Note that by default it matches the `body` element of your content.
You can override this setting by specifying a custom selector as an `element` property.

```javascript
const MyComponent = zoid.create({
  tag: "my-component",
  url: "https://my-site.com/my-component",
  autoResize: {
    width: false,
    height: true,
    element: ".my-selector",
  },
});
```

Recommended to only use autoResize for height. Width has some strange effects, especially when scroll bars are present.

## allowedParentDomains `string | RegExp | Array<string | RegExp>`

A string, regular expression, or array of either, used to validate the parent origin. If the parent origin doesn't match, the child refuses to expose props and the render fails. The default value is `*`, which matches any origin.

```javascript
const MyComponent = zoid.create({
  tag: "my-component",
  url: "https://my-site.com/my-component",
  allowedParentDomains: ["http://localhost", /^http:\/\/www\.mydomain\.com$/],
});
```

## defaultContext `string`

Determines which context should be picked by default when `render()` is called. Defaults to `iframe`.

```javascript
const MyComponent = zoid.create({
  tag: "my-component",
  url: "https://my-site.com/my-component",
  defaultContext: "popup",
});
```

## attributes `{ iframe?: { [string]: string }, popup?: { [string]: string | number | boolean } } | ({ props }) => attributes`

Attributes for the iframe element, and window features for the popup, or a function of the props returning them.

```javascript
const MyComponent = zoid.create({
  tag: "my-component",
  url: "https://my-site.com/my-component",
  attributes: {
    iframe: {
      scrolling: "no",
      allow: "payment",
    },
    popup: {
      resizable: 0,
    },
  },
});
```

## method `'get' | 'post'`

How the child url is loaded. Defaults to `get`, or to `post` when any prop has a `bodyParam`.

## validate `({ props }) => void`

Function which is passed all of the props at once and may validate them. Useful for validating inter-dependent props.

```javascript
const MyComponent = zoid.create({
  tag: "my-component",
  url: "https://my-site.com/my-component",
  validate: function ({ props }) {
    if (props.name === "Batman" && props.strength < 10) {
      throw new Error(`Batman must have at least 10 strength`);
    }
  },
});
```

## eligible `({ props }) => { eligible : boolean, reason? : string }`

Function which determines if the component is eligible to be rendered.

```javascript
const FirefoxOnlyButton = zoid.create({
  tag: "my-component",
  url: "https://my-site.com/my-component",
  eligible: () => {
    return { eligible: isFireFox(), reason: "Firefox only" };
  },
});
```

Now anyone can check eligibility prior to rendering the component:

```javascript
const myComponent = MyComponent();

if (myComponent.isEligible()) {
  myComponent.render("#my-container");
}
```

If the component is not eligible, calling `.render(...)` will return a rejected promise:

```javascript
const myComponent = MyComponent();

myComponent.render("#my-container").catch((err) => {
  console.error(err); // This will happen if we're not in firefox
});
```

## exports `{ [string] : { type } }`

## exports `({ getExports : () => Promise<{ [string] : any }> }) => { [string] : any }`

Used to map exports from the child (passed with `xprops.export(...)`) to properties on the parent component instance.

```javascript
const CreatePostForm = zoid.create({
  tag: "create-post-form",
  url: "https://my-site.com/component/create-post-form",

  exports: {
    submit: {
      type: "function",
    },
  },
});
```

Or, as a mapper function:

```javascript
const CreatePostForm = zoid.create({
  tag: "create-post-form",
  url: "https://my-site.com/component/create-post-form",

  exports: ({ getExports }) => {
    return {
      submit: () => getExports().then((exports) => exports.submit()),
    };
  },
});
```

Once this mapper is defined, the child window may export values up to the parent:

```javascript
window.xprops.export({
  submit: () => {
    document.querySelector("form#createPost").submit();
  },
});
```

The parent window may call these exports at any time:

```javascript
const postForm = CreatePostForm();
postForm.render("#create-post-form-container");

document.querySelector("button#submitForm").addEventListener("click", () => {
  postForm.submit();
});
```

## getExtensions `(parent) => { [string] : any }`

Extra properties and methods to put on every instance. The function receives the parent component, so an extension can read the live props.

```javascript
const MyComponent = zoid.create({
  tag: "my-component",
  url: "https://my-site.com/my-component",
  getExtensions: (parent) => ({
    calculateTotal: () => parent.getProps().items.length * 10,
  }),
});

MyComponent({ items: [1, 2, 3] }).calculateTotal(); // 30
```

Extensions can not override the built-in instance methods.

## children `() => { [string] : ZoidComponent }`

Set up components which will be renderable as children of the current component.

```javascript
const CardNumberField = zoid.create({
  tag: "card-number-field",
  url: "https://my-site.com/component/card-fields/number",
});

const CardCVVField = zoid.create({
  tag: "card-cvv-field",
  url: "https://my-site.com/component/card-fields/cvv",
});

const CardExpiryField = zoid.create({
  tag: "card-expiry-field",
  url: "https://my-site.com/component/card-fields/expiry",
});

const CardFields = zoid.create({
  tag: "card-fields",
  url: "https://my-site.com/component/card-fields",

  children: () => {
    return {
      NumberField: CardNumberField,
      CVVField: CardCVVField,
      ExpiryField: CardExpiryField,
    };
  },
});
```

These children will now be renderable as children of the parent:

```javascript
const cardFields = CardFields({
  style: {
    borderColor: "red",
  },
});

cardFields.NumberField().render("#card-number-field-container");
cardFields.CVVField().render("#card-cvv-field-container");
cardFields.ExpiryField().render("#card-expiry-field-container");
```

The children will inherit both `props` and `export` from the parent, in `window.xprops.parent`.

```javascript
console.log("Parent style:", window.xprops.parent.props.style);
```

```javascript
window.xprops.parent.export({
  submit: () => {
    document.querySelector("form#cardFields").submit();
  },
});
```

## enableBfcache `boolean`

When `true`, the component survives the parent page entering the back/forward cache: `onBfcacheCache` fires as the page is cached and `onBfcacheRestore` as it comes back, instead of the component being destroyed. Defaults to `false`.
