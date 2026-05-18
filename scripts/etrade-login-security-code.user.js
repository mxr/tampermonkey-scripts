// ==UserScript==
// @name         E*TRADE Login: Enable Use Security Code
// @namespace    https://github.com/mxr/tampermonkey-scripts
// @version      1.0.0
// @description  Automatically checks the "Use security code" checkbox on E*TRADE login.
// @author       mxr
// @match        https://us.etrade.com/home/welcome-back*
// @match        https://us.etrade.com/etx/pxy/login*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
  // Unofficial user script; not affiliated with or endorsed by E*TRADE or related entities.

  const SECURITY_CODE_CHECKBOX_SELECTOR = '.checkbox.input-offset > input#useSecurityCode[type="checkbox"]';
  const MAX_ATTEMPTS = 120;
  let attempts = 0;
  let done = false;

  function findTargetCheckbox() {
    const checkbox = document.querySelector(SECURITY_CODE_CHECKBOX_SELECTOR);
    const label = checkbox?.nextElementSibling;
    if (
      label?.matches('label.label-inline[for="useSecurityCode"]') &&
      label.querySelector(":scope > span")?.textContent?.trim() === "Use security code"
    ) {
      return checkbox;
    }
    return null;
  }

  function enableIfFound() {
    if (done) {
      return;
    }
    attempts += 1;
    const checkbox = findTargetCheckbox();
    if (checkbox && !checkbox.checked) {
      checkbox.click();
      checkbox.dispatchEvent(new Event("input", { bubbles: true }));
      checkbox.dispatchEvent(new Event("change", { bubbles: true }));
      done = true;
      observer.disconnect();
      return;
    }
    if (checkbox?.checked) {
      done = true;
      observer.disconnect();
      return;
    }
    if (attempts >= MAX_ATTEMPTS) {
      observer.disconnect();
    }
  }

  const observer = new MutationObserver(() => enableIfFound());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
  });

  enableIfFound();
  const intervalId = setInterval(() => {
    enableIfFound();
    if (done || attempts >= MAX_ATTEMPTS) {
      clearInterval(intervalId);
    }
  }, 250);
})();
