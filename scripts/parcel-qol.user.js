// ==UserScript==
// @name         Parcel: Quality of Life
// @namespace    https://github.com/mxr/tampermonkey-scripts
// @version      1.1.1
// @description  Adds days-left indicators, smart sorting, and delete confirmation prompts on Parcel.
// @author       mxr
// @match        https://web.parcelapp.net/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";
  // Unofficial user script; not affiliated with or endorsed by Parcel or related entities.

  const HEADER_DAYS_TEXT = "Days Left";
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const DELETE_CONFIRM_MESSAGE =
    "Delete this package? This action cannot be undone.";

  function normalize(text) {
    return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function getNoDataStatusText() {
    return typeof globalThis.text_no_data === "string" &&
      globalThis.text_no_data.trim()
      ? globalThis.text_no_data
      : "No data available";
  }

  function isNoDataStatusText(text) {
    return normalize(text) === normalize(getNoDataStatusText());
  }

  function parseDateValue(text) {
    const value = (text || "").trim();
    if (!value || /^(n\/?a|none|unknown|tbd|--)$/i.test(value)) {
      return null;
    }

    const cleaned = value
      .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1")
      .replace(/\b(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\b/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const monthNameMatch = cleaned.match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,?\s*(\d{4}))?\b/i,
    );
    if (monthNameMatch) {
      const monthNames = {
        january: 0,
        february: 1,
        march: 2,
        april: 3,
        may: 4,
        june: 5,
        july: 6,
        august: 7,
        september: 8,
        october: 9,
        november: 10,
        december: 11,
      };
      const month = monthNames[monthNameMatch[1].toLowerCase()];
      const day = Number(monthNameMatch[2]);
      const year = monthNameMatch[3]
        ? Number(monthNameMatch[3])
        : new Date().getFullYear();
      const date = new Date(year, month, day);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    const dotted = cleaned.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/);
    if (dotted) {
      const day = Number(dotted[1]);
      const month = Number(dotted[2]);
      let year = Number(dotted[3]);
      if (year < 100) {
        year += 2000;
      }
      const date = new Date(year, month - 1, day);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    const slashed = cleaned.match(
      /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/,
    );
    if (slashed) {
      const month = Number(slashed[1]);
      const day = Number(slashed[2]);
      let year = slashed[3] ? Number(slashed[3]) : new Date().getFullYear();
      if (year < 100) {
        year += 2000;
      }
      const date = new Date(year, month - 1, day);
      if (!Number.isNaN(date.getTime())) {
        return date;
      }
    }

    const parsed = Date.parse(cleaned);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }

    return null;
  }

  function extractDeliveryDateFromText(text) {
    const value = text || "";
    const labeledMatch = value.match(
      /(?:scheduled|expected)\s+delivery\s*:\s*([^\n\r]+)/i,
    );
    if (labeledMatch) {
      return parseDateValue(labeledMatch[1]);
    }

    const anyDateMatch = value.match(
      /\b(?:\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)\b/i,
    );
    if (anyDateMatch) {
      return parseDateValue(anyDateMatch[0]);
    }

    return null;
  }

  function findColumnIndex(headers, candidates) {
    for (let i = 0; i < headers.length; i += 1) {
      const headerText = normalize(headers[i].textContent);
      if (candidates.some((candidate) => headerText.includes(candidate))) {
        return i;
      }
    }
    return -1;
  }

  function looksLikeHeaderText(text) {
    return (
      text.includes("name") ||
      text.includes("number") ||
      text.includes("delivery company") ||
      text.includes("status") ||
      text.includes("edit") ||
      text.includes("delete")
    );
  }

  function getHeaderRow(table) {
    const explicitHeader =
      table.tHead?.rows?.[0] || table.querySelector("thead tr");
    if (explicitHeader && explicitHeader.cells.length >= 2) {
      return explicitHeader;
    }

    const allRows = Array.from(table.querySelectorAll("tr"));
    for (const row of allRows) {
      if (row.cells.length < 2) {
        continue;
      }
      const texts = Array.from(row.cells).map((cell) =>
        normalize(cell.textContent),
      );
      if (texts.some((text) => looksLikeHeaderText(text))) {
        return row;
      }
    }

    return null;
  }

  function isDeliveredRow(row, statusIndex) {
    if (row.classList.contains("tableRowDelivered")) {
      return true;
    }

    const statusText =
      statusIndex >= 0 ? normalize(row.cells[statusIndex]?.textContent) : "";
    const rowText = normalize(row.textContent);
    const haystack = `${statusText} ${rowText}`;

    if (/\b(undelivered|not delivered)\b/i.test(haystack)) {
      return false;
    }

    const icon = row.querySelector(
      'img[alt*="completed delivery" i], img[alt*="delivered" i]',
    );
    if (icon) {
      const src = icon.getAttribute("src") || "";
      const style = icon.getAttribute("style") || "";
      const hidden = /visibility\s*:\s*hidden/i.test(style);
      if (!hidden && /tick/i.test(src)) {
        return true;
      }
    }

    return /\b(delivered|completed)\b/i.test(haystack);
  }

  function getDeliveryDate(row, deliveryIndex, statusIndex) {
    if (deliveryIndex >= 0) {
      const fromCell = parseDateValue(
        row.cells[deliveryIndex]?.textContent || "",
      );
      if (fromCell) {
        return fromCell;
      }
    }

    if (statusIndex >= 0) {
      const fromStatus = extractDeliveryDateFromText(
        row.cells[statusIndex]?.textContent || "",
      );
      if (fromStatus) {
        return fromStatus;
      }
    }

    return extractDeliveryDateFromText(row.textContent || "");
  }

  function getNameValue(row, nameIndex) {
    if (nameIndex >= 0) {
      return normalize(row.cells[nameIndex]?.textContent || "");
    }
    return normalize(row.cells[0]?.textContent || "");
  }

  function calculateDaysUntil(date) {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const targetStart = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    const diff = Math.round(
      (targetStart.getTime() - todayStart.getTime()) / MS_PER_DAY,
    );
    return diff;
  }

  function getDaysCellValue(delivered, date, statusText) {
    if (delivered) {
      return "✅";
    }
    if (isNoDataStatusText(statusText)) {
      return "❔";
    }
    if (!date) {
      return "🚛";
    }
    const days = calculateDaysUntil(date);
    if (days === 0) {
      return "0";
    }
    if (days < 0) {
      return "🚛";
    }
    return String(days);
  }

  function getExpectedDateRow(body) {
    return (
      Array.from(body.rows).find((row) =>
        row.querySelector("td.expectedDate"),
      ) || null
    );
  }

  function getPrimaryShipmentRow(body) {
    return (
      Array.from(body.rows).find(
        (row) =>
          row.classList.contains("tableRow") ||
          row.classList.contains("tableRowDelivered"),
      ) ||
      Array.from(body.rows).find(
        (row) => !row.querySelector("td.expectedDate"),
      ) ||
      null
    );
  }

  function getDeliveryDateForBody(
    body,
    primaryRow,
    deliveryIndex,
    statusIndex,
  ) {
    const expectedRow = getExpectedDateRow(body);
    if (expectedRow) {
      const fromExpected = extractDeliveryDateFromText(
        expectedRow.textContent || "",
      );
      if (fromExpected) {
        return fromExpected;
      }
    }
    return primaryRow
      ? getDeliveryDate(primaryRow, deliveryIndex, statusIndex)
      : null;
  }

  function ensureDaysColumn(table, headers, deliveryIndex, headerRow) {
    const insertAt = 0;
    const headerTag = headers[0]?.tagName?.toLowerCase() === "td" ? "td" : "th";
    let headerCell = headerRow.querySelector(
      "th[data-tm-days-until], td[data-tm-days-until]",
    );
    if (!headerCell) {
      const fromText = Array.from(headerRow.cells).find(
        (cell) => normalize(cell.textContent) === normalize(HEADER_DAYS_TEXT),
      );
      if (fromText) {
        headerCell = fromText;
      }
    }
    if (!headerCell) {
      headerCell = document.createElement(headerTag);
      headerCell.dataset.tmDaysUntil = "true";
    }
    headerCell.textContent = HEADER_DAYS_TEXT;
    headerCell.dataset.tmDaysUntil = "true";
    headerCell.style.whiteSpace = "nowrap";
    headerCell.style.width = "88px";
    headerCell.style.minWidth = "88px";
    if (headerCell.parentElement === headerRow) {
      headerRow.removeChild(headerCell);
    }
    headerRow.insertBefore(headerCell, headerRow.cells[insertAt] || null);

    for (const body of table.tBodies) {
      const expectedRow = getExpectedDateRow(body);
      if (expectedRow && expectedRow.cells[0]) {
        while (expectedRow.cells.length > 1) {
          expectedRow.deleteCell(expectedRow.cells.length - 1);
        }
        expectedRow.cells[0].removeAttribute("colspan");
      }

      const primaryRow = getPrimaryShipmentRow(body);
      if (!primaryRow || primaryRow === headerRow) {
        continue;
      }

      for (const row of body.rows) {
        if (row === primaryRow) {
          continue;
        }
        const staleDaysCell = row.querySelector("td[data-tm-days-until]");
        if (staleDaysCell) {
          staleDaysCell.remove();
        }
      }

      let daysCell = primaryRow.querySelector("td[data-tm-days-until]");
      if (!daysCell) {
        daysCell = document.createElement("td");
        daysCell.dataset.tmDaysUntil = "true";
      }
      daysCell.className = "centeredDetailed centerDetailed";
      daysCell.setAttribute("rowspan", expectedRow ? "2" : "1");
      daysCell.style.whiteSpace = "nowrap";
      daysCell.style.width = "88px";
      daysCell.style.minWidth = "88px";

      if (daysCell.parentElement === primaryRow) {
        primaryRow.removeChild(daysCell);
      }
      primaryRow.insertBefore(daysCell, primaryRow.cells[insertAt] || null);
    }

    return insertAt;
  }

  function applyDaysValues(
    table,
    deliveryIndex,
    daysIndex,
    statusIndex,
    headerRow,
  ) {
    for (const body of table.tBodies) {
      const primaryRow = getPrimaryShipmentRow(body);
      if (
        !primaryRow ||
        primaryRow === headerRow ||
        !primaryRow.cells[daysIndex]
      ) {
        continue;
      }
      const deliveryDate = getDeliveryDateForBody(
        body,
        primaryRow,
        deliveryIndex,
        statusIndex,
      );
      const delivered = isDeliveredRow(primaryRow, statusIndex);
      const statusText =
        statusIndex >= 0
          ? primaryRow.cells[statusIndex]?.textContent || ""
          : "";
      primaryRow.cells[daysIndex].textContent = getDaysCellValue(
        delivered,
        deliveryDate,
        statusText,
      );
    }
  }

  function sortRows(table, deliveryIndex, nameIndex, statusIndex, headerRow) {
    const scoredBodies = Array.from(table.tBodies).map((body, index) => {
      const primaryRow = getPrimaryShipmentRow(body);
      if (!primaryRow || primaryRow === headerRow) {
        return { body, index, group: 3, date: null, name: "", sortable: false };
      }
      const delivered = isDeliveredRow(primaryRow, statusIndex);
      const statusText =
        statusIndex >= 0
          ? primaryRow.cells[statusIndex]?.textContent || ""
          : "";
      const noData = isNoDataStatusText(statusText);
      const date = getDeliveryDateForBody(
        body,
        primaryRow,
        deliveryIndex,
        statusIndex,
      );
      const name = getNameValue(primaryRow, nameIndex);
      return {
        body,
        index,
        group: date ? 0 : noData ? 1 : delivered ? 3 : 2,
        date,
        name,
        sortable: true,
      };
    });

    scoredBodies.sort((a, b) => {
      if (!a.sortable || !b.sortable) {
        return a.index - b.index;
      }
      if (a.group !== b.group) {
        return a.group - b.group;
      }
      if (a.group === 0) {
        const dateDiff = a.date.getTime() - b.date.getTime();
        if (dateDiff !== 0) {
          return dateDiff;
        }
      }
      const nameDiff = a.name.localeCompare(b.name, undefined, {
        sensitivity: "base",
      });
      if (nameDiff !== 0) {
        return nameDiff;
      }
      return a.index - b.index;
    });

    for (const item of scoredBodies) {
      table.appendChild(item.body);
    }
  }

  function enhanceTable(table) {
    const headerRow = getHeaderRow(table);
    if (!headerRow) {
      return;
    }

    const headers = Array.from(headerRow.cells);
    if (!headers.length) {
      return;
    }

    const deliveryIndex = findColumnIndex(headers, [
      "delivery",
      "eta",
      "estimated",
      "arrival",
    ]);
    const nameIndex = findColumnIndex(headers, ["name", "package", "shipment"]);
    const statusIndex = findColumnIndex(headers, ["status", "state"]);

    const daysIndex = ensureDaysColumn(
      table,
      headers,
      deliveryIndex,
      headerRow,
    );
    applyDaysValues(table, deliveryIndex, daysIndex, statusIndex, headerRow);
    sortRows(table, deliveryIndex, nameIndex, statusIndex, headerRow);
  }

  function findTargetTables() {
    const container = document.getElementById("table") || document;
    const tables = Array.from(container.querySelectorAll("table"));
    return tables.filter((table) => {
      const headerRow = getHeaderRow(table);
      if (!headerRow) {
        return false;
      }
      const headers = Array.from(headerRow.cells).map((cell) =>
        normalize(cell.textContent),
      );
      if (!headers.length) {
        return false;
      }
      const hasNameLike = headers.some((text) => text.includes("name"));
      const hasMainColumns =
        headers.some((text) => text.includes("number")) ||
        headers.some((text) => text.includes("status")) ||
        headers.some((text) => text.includes("delivery company"));
      return hasNameLike && hasMainColumns;
    });
  }

  let scheduled = false;

  function shouldConfirmDelete(target) {
    return (
      target instanceof Element &&
      Boolean(
        target.closest(
          '#table a[onclick*="deleteTracking("][title="Delete"], #table a[onclick*="deleteTracking("] img[alt="Delete"]',
        ),
      )
    );
  }

  function installDeleteConfirmation() {
    document.addEventListener(
      "click",
      (event) => {
        if (
          shouldConfirmDelete(event.target) &&
          !window.confirm(DELETE_CONFIRM_MESSAGE)
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
  }

  function run() {
    scheduled = false;
    for (const table of findTargetTables()) {
      enhanceTable(table);
    }
  }

  function scheduleRun() {
    if (scheduled) {
      return;
    }
    scheduled = true;
    requestAnimationFrame(run);
  }

  const observer = new MutationObserver(() => scheduleRun());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  installDeleteConfirmation();
  scheduleRun();
})();
