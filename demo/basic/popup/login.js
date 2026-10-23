window.MyLoginZoidComponent = zoid.create({
  // The html tag used to render my component

  tag: "my-login-component",

  // The url that will be loaded in the iframe or popup, when someone includes my component on their page

  url: new URL("login.htm", window.location.href).href,

  dimensions: {
    width: "300px",
    height: "150px",
  },

  // The background overlay, built with plain DOM calls on the document zoid passes in

  containerTemplate: ({ uid, tag, context, focus, close, doc }) => {
    const overlay = doc.createElement("div");
    const closeLink = doc.createElement("a");
    const style = doc.createElement("style");

    overlay.id = uid;
    overlay.className = `${tag} ${tag}-context-${context} ${tag}-focus`;
    overlay.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      focus();
    });

    closeLink.href = "#";
    closeLink.className = `${tag}-close`;
    closeLink.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      close();
    });

    style.textContent = `
      #${uid} {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.8);
      }

      #${uid}.${tag}-context-${zoid.CONTEXT.POPUP} {
        cursor: pointer;
      }

      #${uid} .${tag}-close {
        position: absolute;
        right: 16px;
        top: 16px;
        width: 16px;
        height: 16px;
        opacity: 0.6;
      }

      #${uid} .${tag}-close:hover {
        opacity: 1;
      }

      #${uid} .${tag}-close:before,
      #${uid} .${tag}-close:after {
        position: absolute;
        left: 8px;
        content: ' ';
        height: 16px;
        width: 2px;
        background-color: white;
      }

      #${uid} .${tag}-close:before {
        transform: rotate(45deg);
      }

      #${uid} .${tag}-close:after {
        transform: rotate(-45deg);
      }
    `;

    overlay.appendChild(closeLink);
    overlay.appendChild(style);

    return overlay;
  },
});
