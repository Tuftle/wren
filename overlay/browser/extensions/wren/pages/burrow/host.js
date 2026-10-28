// Glue for running inside Wren: tells the browser's background page what is unlocked, so it can fill logins.
// On the website and in the desktop app there is no `browser`, so this does nothing.
if (globalThis.browser?.runtime?.id) {
  globalThis.burrowHost = (state) => browser.runtime.sendMessage({ type: "vault:state", ...state }).catch(() => {});
  globalThis.burrowPending = () => browser.runtime.sendMessage({ type: "vault:takePending" }).catch(() => null);
  browser.runtime.onMessage.addListener((m) => {
    if (m && m.type === "vault:lockNow") globalThis.burrowLock?.();
  });
}
