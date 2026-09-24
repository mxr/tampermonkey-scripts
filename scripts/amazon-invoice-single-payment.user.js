// ==UserScript==
// @name         Amazon: Single Payment Method on Invoice
// @namespace    https://github.com/mxr/tampermonkey-scripts
// @version      1.0.1
// @description  On the Amazon order invoice print page, consolidates a split payment into a single payment method and total.
// @author       mxr
// @match        https://www.amazon.com/gp/css/summary/print.html*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  // Unofficial user script; not affiliated with or endorsed by Amazon.

  const GIFT_CARD_NAME = "Amazon Gift Card";

  function parseAmount(text) {
    const match = (text || "").trim().match(/(-?)([\d,]+\.\d{2})/);

    if (!match) {
      return null;
    }

    const value = Number.parseFloat(match[2].replace(/,/g, ""));
    return match[1] === "-" ? -value : value;
  }

  function formatAmount(value) {
    return `${value < 0 ? "-" : ""}${Math.abs(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  function findLineItemRow(labelText) {
    const normalizedLabel = labelText.replace(/:$/, "");

    const label = Array.from(
      document.querySelectorAll(".od-line-item-row-label span"),
    ).find(
      (span) => span.textContent.trim().replace(/:$/, "") === normalizedLabel,
    );

    return label?.closest("li") ?? null;
  }

  function getRowValueSpan(row) {
    return row?.querySelector(".od-line-item-row-content span.a-color-base");
  }

  function removeGiftCardPaymentMethod() {
    const giftCardName = Array.from(
      document.querySelectorAll('[data-testid="payment-instrument-name"]'),
    ).find((element) => element.textContent.trim() === GIFT_CARD_NAME);

    const paymentMethod = giftCardName?.closest('[aria-label="payment method"]');

    if (!paymentMethod) {
      return;
    }

    // Amazon renders an 8px spacer immediately after each payment method.
    // Remove only the spacer following the Gift Card entry.
    paymentMethod.nextElementSibling?.remove();

    // Remove only the card containing "Amazon Gift Card" and its balance.
    paymentMethod.remove();
  }

  function foldGiftCardIntoGrandTotal() {
    const giftCardRow = findLineItemRow("Gift Card Amount");
    const grandTotalRow = findLineItemRow("Grand Total");

    if (!giftCardRow || !grandTotalRow) {
      return;
    }

    const giftCardValueSpan = getRowValueSpan(giftCardRow);
    const grandTotalValueSpan = getRowValueSpan(grandTotalRow);

    const giftCardValue = parseAmount(giftCardValueSpan?.textContent);
    const grandTotalValue = parseAmount(grandTotalValueSpan?.textContent);

    if (giftCardValue === null || grandTotalValue === null) {
      return;
    }

    /*
     * Amazon renders the Gift Card Amount as a negative value:
     *
     *   Grand Total:      0.00
     *   Gift Card Amount: -14.14
     *
     * The combined total becomes:
     *
     *   0.00 + (-14.14) = -14.14
     */
    grandTotalValueSpan.textContent = formatAmount(
      grandTotalValue + giftCardValue,
    );

    giftCardRow.remove();
  }

  function applyInvoiceEdits() {
    removeGiftCardPaymentMethod();
    foldGiftCardIntoGrandTotal();
  }

  // Attempt immediately for the traditional invoice markup.
  applyInvoiceEdits();

  /*
   * The payment-method widget is mounted and can later be replaced by React.
   * Keep watching so the Gift Card entry is deleted again on each re-render.
   *
   * Both edits are idempotent:
   * - Once the Gift Card summary row is removed, no second total adjustment occurs.
   * - Once the payment card is removed, no action occurs until React re-adds it.
   */
  const observer = new MutationObserver(applyInvoiceEdits);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
