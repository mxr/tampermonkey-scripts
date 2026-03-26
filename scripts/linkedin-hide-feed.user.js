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
  const FEED_REQUEST_BODY_MARKERS = [
    '"pagerId":"com.linkedin.sdui.pagers.feed.mainFeed"',
    '"screenId":"com.linkedin.sdui.flagshipnav.feed.MainFeed"',
    '"feedType":"FeedType_MAIN_FEED_RELEVANCE"',
  ];

  function bodyToText(body) {
    if (typeof body === "string") {
      return body;
    }
    if (body instanceof URLSearchParams) {
      return body.toString();
    }
    if (body instanceof Blob) {
      return "";
    }
    if (body instanceof FormData) {
      return Array.from(body.entries())
        .map(
          ([key, value]) => `${key}=${typeof value === "string" ? value : ""}`,
        )
        .join("&");
    }
    if (
      body instanceof ArrayBuffer ||
      ArrayBuffer.isView(body) ||
      body == null
    ) {
      return "";
    }
    return String(body);
  }

  function bodyLooksLikeFeedRequest(bodyText) {
    return (
      typeof bodyText === "string" &&
      FEED_REQUEST_BODY_MARKERS.some((marker) => bodyText.includes(marker))
    );
  }

  function shouldBlockFeedRequest(url, bodyText) {
    const urlMatches =
      typeof url === "string" &&
      url.includes(FEED_PAGINATION_PATH) &&
      url.includes(FEED_PAGINATION_MARKER);
    return urlMatches || bodyLooksLikeFeedRequest(bodyText);
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
      const initBodyText = bodyToText(init?.body);
      const requestBodyText =
        !initBodyText && input instanceof Request && !input.bodyUsed
          ? await input
              .clone()
              .text()
              .catch(() => "")
          : "";

      if (shouldBlockFeedRequest(url, initBodyText || requestBodyText)) {
        return new Promise(() => {});
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
      if (shouldBlockFeedRequest(this._linkedinHideFeedUrl, bodyToText(body))) {
        return;
      }
      return originalSend.call(this, body);
    };

    const originalSendBeacon = navigator.sendBeacon?.bind(navigator);
    if (originalSendBeacon) {
      navigator.sendBeacon = function sendBeacon(url, data) {
        if (shouldBlockFeedRequest(url, bodyToText(data))) {
          return false;
        }
        return originalSendBeacon(url, data);
      };
    }
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
