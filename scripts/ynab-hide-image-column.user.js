// ==UserScript==
// @name         YNAB: Hide Image Column
// @namespace    https://github.com/mxr/tampermonkey-scripts
// @version      1.0.0
// @description  Hides the transaction image column in the YNAB register.
// @author       mxr
// @match        https://app.ynab.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  // Unofficial user script; not affiliated with or endorsed by YNAB or related entities.

  // Both the header cell and every body cell carry this class, so a stylesheet rule hides the
  // whole column and keeps applying as Ember re-renders rows during scrolling.
  const style = document.createElement("style");
  style.textContent = ".ynab-grid-cell-image { display: none !important; }";
  document.documentElement.appendChild(style);
})();
