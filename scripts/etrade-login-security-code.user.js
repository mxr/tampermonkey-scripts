// ==UserScript==
// @name         E*TRADE Login: Enable Use Security Code
// @namespace    https://github.com/mxr/tampermonkey-scripts
// @version      0.1.1
// @description  Automatically checks the "Use security code" checkbox on E*TRADE login.
// @author       mxr
// @match        https://us.etrade.com/home/welcome-back*
// @match        https://us.etrade.com/etx/pxy/login*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const TARGET_TEXT = /use\s+security\s+code/i;
  const TARGET_ATTR_HINT = /(security|code|mfa|2fa|otp)/i;
  const MAX_ATTEMPTS = 120;
  let attempts = 0;
  let done = false;

  function getAllRoots(root = document) {
    const roots = [root];
    const treeWalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    while (treeWalker.nextNode()) {
      const node = treeWalker.currentNode;
      if (node && node.shadowRoot) {
        roots.push(node.shadowRoot);
      }
    }
    return roots;
  }

  function findByAssociatedLabel(root) {
    const labels = root.querySelectorAll("label");
    for (const label of labels) {
      if (!TARGET_TEXT.test((label.textContent || "").trim())) {
        continue;
      }
      const forId = label.getAttribute("for");
      if (forId) {
        const input = root.querySelector(`#${CSS.escape(forId)}`);
        if (input && input.type === "checkbox") {
          return input;
        }
      }
      const nestedInput = label.querySelector('input[type="checkbox"]');
      if (nestedInput) {
        return nestedInput;
      }
    }
    return null;
  }

  function findByNearbyText(root) {
    const candidates = root.querySelectorAll('input[type="checkbox"]');
    for (const input of candidates) {
      const containerText =
        input.closest("label, div, li, td, span")?.textContent || "";
      if (TARGET_TEXT.test(containerText)) {
        return input;
      }
      const aria = `${input.getAttribute("aria-label") || ""} ${input.getAttribute("name") || ""} ${input.getAttribute("id") || ""}`;
      if (TARGET_TEXT.test(aria)) {
        return input;
      }
    }
    return null;
  }

  function findByKnownHints(root) {
    const candidates = root.querySelectorAll('input[type="checkbox"]');
    for (const input of candidates) {
      const hints = `${input.getAttribute("aria-label") || ""} ${input.getAttribute("name") || ""} ${input.getAttribute("id") || ""} ${input.getAttribute("data-testid") || ""}`;
      if (TARGET_ATTR_HINT.test(hints)) {
        return input;
      }
    }
    return null;
  }

  function findTargetCheckbox() {
    for (const root of getAllRoots(document)) {
      const fromLabel = findByAssociatedLabel(root);
      if (fromLabel) {
        return fromLabel;
      }
      const fromNearby = findByNearbyText(root);
      if (fromNearby) {
        return fromNearby;
      }
      const fromHints = findByKnownHints(root);
      if (fromHints) {
        return fromHints;
      }
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
    if (checkbox && checkbox.checked) {
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
