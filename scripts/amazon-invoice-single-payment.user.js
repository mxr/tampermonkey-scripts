// ==UserScript==
// @name         Amazon: Single Payment Method on Invoice
// @namespace    https://github.com/mxr/tampermonkey-scripts
// @version      1.0.0
// @description  On the Amazon order invoice print page, consolidates a split payment into a single payment method and total.
// @author       mxr
// @match        https://www.amazon.com/gp/css/summary/print.html*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  // Unofficial user script; not affiliated with or endorsed by Amazon.

  const PAYMENT_METHOD_SELECTOR = ".pmts-payments-instrument-detail-box-paystationpaymentmethod";

  function parseCurrency(text) {
    const match = (text || "").match(/(-?)\$([\d,]+\.\d{2})/);
    if (!match) {
      return null;
    }
    const value = Number.parseFloat(match[2].replace(/,/g, ""));
    return match[1] === "-" ? -value : value;
  }

  function formatCurrency(value) {
    const sign = value < 0 ? "-" : "";
    return `${sign}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function findLineItemRow(labelText) {
    const label = Array.from(document.querySelectorAll(".od-line-item-row-label span")).find(
      (span) => span.textContent.trim() === labelText,
    );
    return label ? label.closest("li") : null;
  }

  function getRowValueSpan(row) {
    return row.querySelector(".od-line-item-row-content span.a-color-base");
  }

  function removeGiftCardPaymentMethod() {
    const removed = Array.from(document.querySelectorAll(PAYMENT_METHOD_SELECTOR)).filter((span) => /gift card/i.test(span.textContent));
    for (const span of removed) {
      span.remove();
    }
    return removed.length > 0;
  }

  function foldGiftCardIntoGrandTotal() {
    const giftCardRow = findLineItemRow("Gift Card Amount:");
    const grandTotalRow = findLineItemRow("Grand Total:");
    if (!giftCardRow || !grandTotalRow) {
      return;
    }

    const giftCardValueSpan = getRowValueSpan(giftCardRow);
    const grandTotalValueSpan = getRowValueSpan(grandTotalRow);
    const giftCardValue = parseCurrency(giftCardValueSpan?.textContent);
    const grandTotalValue = parseCurrency(grandTotalValueSpan?.textContent);
    if (giftCardValue === null || grandTotalValue === null) {
      return;
    }

    grandTotalValueSpan.textContent = formatCurrency(grandTotalValue - giftCardValue);
    giftCardRow.remove();
  }

  function run() {
    if (removeGiftCardPaymentMethod()) {
      foldGiftCardIntoGrandTotal();
    }
  }

  run();
})();
