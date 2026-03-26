// ==UserScript==
// @name         LinkedIn: Hide News Feed
// @namespace    https://github.com/mxr/tampermonkey-scripts
// @version      1.0.1
// @description  Hides the LinkedIn home feed.
// @author       mxr
// @match        https://www.linkedin.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";
  // Unofficial user script; not affiliated with or endorsed by LinkedIn or related entities.

  const MAIN_FEED_SELECTOR = '[data-testid="mainFeed"]';
  const FEED_ITEM_SELECTOR =
    '[componentkey*="FeedType_MAIN_FEED_RELEVANCE"], [role="listitem"][componentkey*="FeedType_MAIN_FEED_RELEVANCE"]';
  const FEED_PAGINATION_PATH = "/flagship-web/rsc-action/actions/pagination";
  const FEED_PAGINATION_MARKER =
    "sduiid=com.linkedin.sdui.pagers.feed.mainFeed";

  function isFeedPaginationRequest(url) {
    return (
      typeof url === "string" &&
      url.includes(FEED_PAGINATION_PATH) &&
      url.includes(FEED_PAGINATION_MARKER)
    );
  }

  function blockFeedPaginationRequests() {
    const originalFetch = window.fetch;
    window.fetch = async function fetch(input, init) {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input?.url;
      if (isFeedPaginationRequest(url)) {
        return new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch.call(this, input, init);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function open(method, url, ...args) {
      this._linkedinHideFeedBlocked = isFeedPaginationRequest(url);
      return originalOpen.call(this, method, url, ...args);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function send(body) {
      if (this._linkedinHideFeedBlocked) {
        Object.defineProperties(this, {
          readyState: { configurable: true, value: 4 },
          status: { configurable: true, value: 200 },
          statusText: { configurable: true, value: "OK" },
          response: { configurable: true, value: "{}" },
          responseText: { configurable: true, value: "{}" },
        });
        queueMicrotask(() => {
          this.dispatchEvent(new Event("readystatechange"));
          this.dispatchEvent(new Event("load"));
          this.dispatchEvent(new Event("loadend"));
        });
        return;
      }
      return originalSend.call(this, body);
    };
  }

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
  blockFeedPaginationRequests();
  hideFeed();
})();
