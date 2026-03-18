// ==UserScript==
// @name         LinkedIn: Hide News Feed
// @namespace    https://github.com/mxr/tampermonkey-scripts
// @version      1.0.0
// @description  Hides the LinkedIn home feed.
// @author       mxr
// @match        https://www.linkedin.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  "use strict";
  // Unofficial user script; not affiliated with or endorsed by LinkedIn or related entities.

  const FEED_PATH_PREFIX = "/feed";
  const FEED_SELECTORS = [
    '[data-finite-scroll-hotkey-context="FEED"]',
    ".feed-container-theme",
    ".scaffold-layout__main .scaffold-finite-scroll",
    ".scaffold-finite-scroll.scaffold-finite-scroll--infinite",
  ];
  const hiddenElements = new Set();

  function isFeedPage() {
    return window.location.pathname.startsWith(FEED_PATH_PREFIX);
  }

  function hideElement(element) {
    if (!element || hiddenElements.has(element)) {
      return;
    }
    element.dataset.linkedinHideFeedPreviousDisplay =
      element.style.display || "";
    element.style.display = "none";
    hiddenElements.add(element);
  }

  function restoreHiddenElements() {
    for (const element of hiddenElements) {
      if (!element.isConnected) {
        continue;
      }
      element.style.display =
        element.dataset.linkedinHideFeedPreviousDisplay || "";
      delete element.dataset.linkedinHideFeedPreviousDisplay;
    }
    hiddenElements.clear();
  }

  function hideFeed() {
    if (!isFeedPage()) {
      restoreHiddenElements();
      return;
    }

    for (const selector of FEED_SELECTORS) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        hideElement(element);
      }
    }
  }

  function onLocationChange() {
    queueMicrotask(() => hideFeed());
  }

  const observer = new MutationObserver(() => hideFeed());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  const originalPushState = history.pushState;
  history.pushState = function pushState(...args) {
    const result = originalPushState.apply(this, args);
    onLocationChange();
    return result;
  };

  const originalReplaceState = history.replaceState;
  history.replaceState = function replaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    onLocationChange();
    return result;
  };

  window.addEventListener("popstate", onLocationChange);
  hideFeed();
})();
