# Component

## Instantiate `(props : { [string] : any }) => ZoidComponentInstance`

Instantiate a component and pass in props.

```javascript
const Component = zoid.create({
  tag: "my-component",
  url: "https://my-site.com/my-component",
});

const componentInstance = Component({
  foo: "bar",
  onSomething: () => {
    console.log("Something happened!");
  },
});
```

See [Component Instance](./instance.md).

## isChild `() => boolean`

Returns `true` if the window you are currently in is an instance of the component, `false` if not.

```javascript
const MyComponent = zoid.create({ ... });

if (MyComponent.isChild()) {
    console.log('We are currently in a child iframe or popup of MyComponent!')
}
```

## xprops `{ [string] : any }`

Similar to `window.xprops` -- gives you access to the props passed down to the child window or iframe.

```javascript
const MyComponent = zoid.create({ ... });

console.log(MyComponent.xprops.message);
```

## canRenderTo `(Window) => Promise<boolean>`

Returns a promise for a boolean, informing you if it is possible to remotely render the component to a different window.

```javascript
const MyComponent = zoid.create({ ... });

MyComponent.canRenderTo(window.parent).then(result => {
    if (result) {
        console.log('We can render to the parent window!');
        MyComponent().renderTo(window.parent, '#container');
    }
});
```

## instances `Array<ZoidComponentInstance>`

Provides an array of currently rendered instances of the zoid component.

```javascript
const MyComponent = zoid.create({ ... });

console.log(`There are currently ${ MyComponent.instances.length } active instances of MyComponent`);
```

## Framework bindings

zoid 11 ships no framework drivers. A zoid component is a plain function returning an instance with `render`, so a wrapper for any framework is a few lines: create the instance in a mount hook, render it into a ref, close it on unmount, and call `updateProps` when props change. Dedicated packages for React, Vue and Angular will be published separately.
