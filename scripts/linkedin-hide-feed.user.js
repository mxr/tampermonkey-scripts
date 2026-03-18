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
  const MAIN_FEED_SELECTOR = 'main[aria-label="Main Feed"]';
  const FEED_CONTENT_SELECTOR = '[data-finite-scroll-hotkey-context="FEED"]';

  function isFeedPage() {
    return window.location.pathname.startsWith(FEED_PATH_PREFIX);
  }

  function hideElement(element) {
    if (!element) {
      return;
    }
    element.style.display = "none";
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
    if (!isFeedPage()) {
      return;
    }

    const feedContainer = findFeedContainer();
    if (feedContainer) {
      hideElement(feedContainer);
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
