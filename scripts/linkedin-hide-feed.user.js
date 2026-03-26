// ==UserScript==
// @name         LinkedIn: Hide News Feed
// @namespace    https://github.com/mxr/tampermonkey-scripts
// @version      1.0.1
// @description  Hides the LinkedIn home feed.
// @author       mxr
// @match        https://www.linkedin.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  "use strict";
  // Unofficial user script; not affiliated with or endorsed by LinkedIn or related entities.

  const MAIN_FEED_SELECTOR = '[data-testid="mainFeed"]';
  const FEED_ITEM_SELECTOR =
    '[componentkey*="FeedType_MAIN_FEED_RELEVANCE"], [role="listitem"][componentkey*="FeedType_MAIN_FEED_RELEVANCE"]';

  function hideFeed() {
    document
      .querySelector(MAIN_FEED_SELECTOR)
      ?.querySelectorAll(FEED_ITEM_SELECTOR)
      ?.forEach((element) => element.style.setProperty("display", "none"));
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
