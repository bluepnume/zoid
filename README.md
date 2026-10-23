<p align="center"><img width="45%" alt="zoid" src="./zoid.png"></p>

---

[![npm version](https://img.shields.io/npm/v/zoid.svg?style=flat-square)](https://www.npmjs.com/package/zoid)

A cross-domain component toolkit, supporting:

- Render an iframe or popup on a different domain, and pass down props, including objects and functions
- Call callbacks natively from the child window without worrying about post-messaging or cross-domain restrictions
- Create and expose components to share functionality from your site to others!

It's 'data-down, actions up' style components, but 100% cross-domain using iframes and popups!

---

### [API Docs](./docs/api/index.md)

Public options and methods supported by zoid

### [Demos](./demo/index.htm)

Working demos of different zoid patterns. Build the bundle (`npm run build`) and serve the repository root to try them.

### [Example](./docs/example.md)

A full example of a cross-domain component using zoid

---

### Install

```sh
npm install zoid
```

```javascript
import { create } from "zoid";
```

ES modules with TypeScript types, ES2019 syntax, tree-shakeable. For a page without a bundler, `dist/zoid.min.js` defines `window.zoid`.

### Quick example

Define a component to be put on both the parent and child pages:

```javascript
var MyLoginComponent = zoid.create({
  tag: "my-login-component",
  url: "http://www.my-site.com/my-login-component",
});
```

Render the component on the parent page:

```javascript
<div id="container"></div>

<script src="script-where-my-login-component-is-defined.js"></script>
<script>
    MyLoginComponent({

        prefilledEmail: 'foo@bar.com',

        onLogin: function(email) {
            console.log('User logged in with email:', email);
        }

    }).render('#container');
</script>
```

Implement the component in the iframe:

```javascript
<input type="text" id="email" />
<input type="password" id="password" />
<button id="login">Log In</button>

<script src="script-where-my-login-component-is-defined.js"></script>
<script>
    var email = document.querySelector('#email');
    var password = document.querySelector('#password');
    var button = document.querySelector('#login');

    email.value = window.xprops.prefilledEmail;

    function validUser (email, password) {
      return email && password;
    }

    button.addEventListener('click', function() {
        if (validUser(email.value, password.value)) {
            window.xprops.onLogin(email.value);
        }
    });
</script>
```

### Useful Links

- [Introducing zoid](https://medium.com/@bluepnume/introducing-zoid-seamless-cross-domain-web-components-from-paypal-c0144f3e82bf#.ikbg9r1ml)
- [Turn your web-app into a cross-domain component with five lines of code](https://medium.com/@bluepnume/turn-your-web-app-into-a-cross-domain-component-with-5-lines-of-code-ced01e6795f9#.w8ea7h6ky)
- [A full example of how to implement and use a zoid](./docs/example.md)
- [Building PayPal's Button with zoid](https://medium.com/@bluepnume/less-is-more-reducing-thousands-of-paypal-buttons-into-a-single-iframe-using-zoid-d902d71d8875#.o3ib7y58n)
- [PayPal Checkout - zoid powered Button and Checkout components](https://github.com/paypal/paypal-checkout)
- [Post-Robot - the cross-domain messaging library which powers zoid](https://github.com/krakenjs/post-robot)
- [Implementing Zoid video tutorial](https://www.youtube.com/watch?v=UpXavGv7FaI)


## Rationale

**Writing cross domain components is tricky.**

Consider this: I own `foo.com`, you own `bar.com`, and I have some functionality I want to share on your page.
I could just give you some javascript to load in your page. But then:

- What if I've written a component in React, but you're using some other framework?
- What if I have secure form fields, or secure data I don't want your site to spy on?
- What if I need to make secure calls to my back-end, without resorting to CORS?

**What about an iframe?**

You could just use a vanilla iframe for all of this. But:

- You have to pass data down in the url, or with a post-message.
- You need to set up post-message listeners to get events back up from the child.
- You need to deal with error cases, like if your iframe fails to load or doesn't respond to a post-message.
- You need to think carefully about how to expose all this functionality behind a simple, clear interface.

**zoid solves all of these problems.**

- You pass data and callbacks down as a javascript object
- zoid renders the component and passes down the data
- The child calls your callbacks when it's ready

A component is a plain function, so it drops into any framework, or none, without anyone worrying about iframes or post-messages.

## FAQ

- **Do I need to use a particular framework like React to use zoid?**

  No, zoid is framework agnostic. You can:

  - Use it with vanilla javascript.
  - Use it with any framework of your choice: render in a mount hook, close in an unmount hook.

- **Why write another ui / component library?**

  This isn't designed to replace libraries like React, which are responsible for rendering same-domain components. In fact, the only
  real rendering zoid does is iframes and popups; the rest is up to you! You can build your components using any framework,
  library or pattern you want, then use zoid to expose your components cross-domain. It should play nicely with any other framework!

- **Aren't iframes really slow?**

  Yes, but there are a few things to bear in mind here:

  - zoid isn't designed for building components for your own site. For that you should use native component libraries
    like React, which render quickly onto your page. Use zoid to share functionality with other sites, that you can't
    share native-javascript components with

  - zoid also provides mechanisms for pre-rendering html and css into iframes and popups, so you can at least render a
    loading spinner, or maybe something more advanced, while the new window loads its content.

- **Can I contribute?**

  By all means! But please raise an issue first if it's more than a small change, to discuss the feasibility.

- **Is this different to [react-frame-component](https://github.com/ryanseddon/react-frame-component)?**

  Yes. `react-frame-component` allows you to render html into a sandboxed iframe on the same domain. `zoid` is geared
  around sharing functionality from one domain to another, in a cross-domain iframe.

## Browser Support

Current Chrome, Edge, Firefox and Safari (14 and up). zoid 11 dropped Internet Explorer and the IE-only popup bridge; use zoid 10 for those.

## Changes in 11

See the [changelog](./CHANGELOG.md#1100).
