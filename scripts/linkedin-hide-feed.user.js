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

  const MAIN_FEED_SELECTOR = 'main[aria-label="Main Feed"]';
  const FEED_CONTENT_SELECTOR = '[data-finite-scroll-hotkey-context="FEED"]';

  function hideElement(element) {
    element?.style?.setProperty("display", "none");
  }

  function findFeedContainer() {
    const mainFeed = document.querySelector(MAIN_FEED_SELECTOR);
    if (!mainFeed) {
      return null;
    }

    const feedContent = mainFeed.querySelector(FEED_CONTENT_SELECTOR);
    return feedContent?.closest(".scaffold-finite-scroll") || null;
  }

  function hideFeed() {
    const feedContainer = findFeedContainer();
    hideElement(feedContainer);
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
