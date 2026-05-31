// ==UserScript==
// @name         LinkedIn: Hide News Feed
// @namespace    https://github.com/mxr/tampermonkey-scripts
// @version      1.1.0
// @description  Hides the LinkedIn home feed.
// @author       mxr
// @match        https://www.linkedin.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  // Unofficial user script; not affiliated with or endorsed by LinkedIn or related entities.

  // The home feed loads its content via a voyager graphql query whose queryId begins with
  // "voyagerFeedDashMainFeed" (both the initial batch and scroll pagination share it). Blocking
  // that request prevents any feed posts from loading.
  const FEED_QUERY_MARKER = "queryId=voyagerFeedDashMainFeed";

  // Returned in place of a real feed response so the app sees "no updates" and stops spinning.
  const EMPTY_FEED_BODY = '{"data":{},"included":[]}';
  const EMPTY_FEED_CONTENT_TYPE = "application/vnd.linkedin.normalized+json+2.1";

  // Candidate selectors for the center feed column. LinkedIn's class names drift, so a few are
  // listed; whichever is present gets hidden. The surrounding nav and side rails are untouched.
  const FEED_CONTAINER_SELECTORS = ['[data-testid="mainFeed"]', "main .scaffold-finite-scroll", "main .feed-container-theme"];

  function isMainFeedRequest(url) {
    return typeof url === "string" && url.includes(FEED_QUERY_MARKER);
  }

  function urlFromInput(input) {
    if (typeof input === "string") {
      return input;
    }
    if (input instanceof URL) {
      return input.href;
    }
    return input?.url;
  }

  function emptyFeedResponse() {
    return new Response(EMPTY_FEED_BODY, {
      status: 200,
      headers: { "content-type": EMPTY_FEED_CONTENT_TYPE },
    });
  }

  function blockFeedRequests() {
    const originalFetch = window.fetch;
    window.fetch = function fetch(input, init) {
      if (isMainFeedRequest(urlFromInput(input))) {
        return Promise.resolve(emptyFeedResponse());
      }
      return originalFetch.call(this, input, init);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function open(method, url, ...args) {
      this._linkedinHideFeedUrl = url;
      return originalOpen.call(this, method, url, ...args);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function send(body) {
      if (isMainFeedRequest(this._linkedinHideFeedUrl)) {
        return;
      }
      return originalSend.call(this, body);
    };

    const originalSendBeacon = navigator.sendBeacon?.bind(navigator);
    if (originalSendBeacon) {
      navigator.sendBeacon = function sendBeacon(url, data) {
        if (isMainFeedRequest(url)) {
          return false;
        }
        return originalSendBeacon(url, data);
      };
    }
  }

  function hideFeed() {
    for (const selector of FEED_CONTAINER_SELECTORS) {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.setProperty("display", "none", "important");
      });
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
  blockFeedRequests();
  hideFeed();
})();
