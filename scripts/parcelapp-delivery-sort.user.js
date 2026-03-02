// ==UserScript==
// @name         ParcelApp: Days Until Delivery + Smart Sort
// @namespace    https://github.com/mxr/tampermonkey-scripts
// @version      0.1.1
// @description  Adds a days-until-delivery column and sorts packages by delivery readiness.
// @author       mxr
// @match        https://web.parcelapp.net/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const HEADER_DAYS_TEXT = "Days Until Delivery";
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  function normalize(text) {
    return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function parseDateValue(text) {
    const value = (text || "").trim();
    if (!value || /^(n\/?a|none|unknown|tbd|--)$/i.test(value)) {
      return null;
    }

    const dotted = value.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/);
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

    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed);
    }

    const match = value.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
    if (!match) {
      return null;
    }

    const month = Number(match[1]);
    const day = Number(match[2]);
    let year = match[3] ? Number(match[3]) : new Date().getFullYear();
    if (year < 100) {
      year += 2000;
    }
    if (!month || !day || !year) {
      return null;
    }

    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date;
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
      /\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/,
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
    const statusText =
      statusIndex >= 0 ? normalize(row.cells[statusIndex]?.textContent) : "";
    const rowText = normalize(row.textContent);
    const haystack = `${statusText} ${rowText}`;
    const deliveredIcon = row.querySelector(
      'img[alt*="completed delivery" i], img[alt*="delivered" i]',
    );

    if (/(\bundelivered\b|\bnot delivered\b)/i.test(haystack)) {
      return false;
    }

    return (
      Boolean(deliveredIcon) ||
      /\bdelivered\b/i.test(haystack) ||
      /\bcompleted delivery\b/i.test(haystack)
    );
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
    if (!date) {
      return "";
    }

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

    if (diff === 0) {
      return "0";
    }
    return String(diff);
  }

  function isDetailRow(row, expectedColumnCount) {
    if (!row || row.cells.length !== 1) {
      return false;
    }
    const onlyCell = row.cells[0];
    return onlyCell.colSpan >= Math.max(2, expectedColumnCount - 1);
  }

  function ensureDaysColumn(table, headers, deliveryIndex, headerRow) {
    const existingIndex = headers.findIndex(
      (th) => normalize(th.textContent) === normalize(HEADER_DAYS_TEXT),
    );
    if (existingIndex >= 0) {
      const targetColspan = headers.length;
      for (const body of table.tBodies) {
        for (const row of body.rows) {
          if (row === headerRow) {
            continue;
          }
          if (isDetailRow(row, headers.length)) {
            if (row.cells[0].colSpan < targetColspan) {
              row.cells[0].colSpan = targetColspan;
            }
            continue;
          }
          if (row.cells.length >= headers.length) {
            continue;
          }
          const td = document.createElement("td");
          td.dataset.tmDaysUntil = "true";
          if (existingIndex >= row.cells.length) {
            row.appendChild(td);
          } else {
            row.insertBefore(td, row.cells[existingIndex]);
          }
        }
      }
      return existingIndex;
    }

    const insertAt = deliveryIndex >= 0 ? deliveryIndex + 1 : headers.length;
    const headerTag = headers[0]?.tagName?.toLowerCase() === "td" ? "td" : "th";
    const headerCell = document.createElement(headerTag);
    headerCell.textContent = HEADER_DAYS_TEXT;
    headerCell.dataset.tmDaysUntil = "true";
    if (insertAt >= headers.length) {
      headerRow.appendChild(headerCell);
    } else {
      headerRow.insertBefore(headerCell, headers[insertAt]);
    }

    for (const body of table.tBodies) {
      for (const row of body.rows) {
        if (row === headerRow) {
          continue;
        }
        if (isDetailRow(row, headers.length)) {
          row.cells[0].colSpan = Math.max(
            row.cells[0].colSpan,
            headers.length + 1,
          );
          continue;
        }
        const td = document.createElement("td");
        td.dataset.tmDaysUntil = "true";
        if (insertAt >= row.cells.length) {
          row.appendChild(td);
        } else {
          row.insertBefore(td, row.cells[insertAt]);
        }
      }
    }

    return insertAt;
  }

  function applyDaysValues(
    table,
    deliveryIndex,
    daysIndex,
    statusIndex,
    expectedColumnCount,
    headerRow,
  ) {
    for (const body of table.tBodies) {
      for (const row of body.rows) {
        if (row === headerRow) {
          continue;
        }
        if (isDetailRow(row, expectedColumnCount) || !row.cells[daysIndex]) {
          continue;
        }
        const deliveryDate = getDeliveryDate(row, deliveryIndex, statusIndex);
        const delivered = isDeliveredRow(row, statusIndex);
        row.cells[daysIndex].textContent = delivered
          ? ""
          : calculateDaysUntil(deliveryDate);
      }
    }
  }

  function sortRows(
    table,
    deliveryIndex,
    nameIndex,
    statusIndex,
    expectedColumnCount,
    headerRow,
  ) {
    for (const body of table.tBodies) {
      const allRows = Array.from(body.rows);
      const pinnedRows = allRows.filter((row) => row === headerRow);
      const blocks = [];

      for (let i = 0; i < allRows.length; i += 1) {
        const row = allRows[i];
        if (row === headerRow) {
          continue;
        }
        if (isDetailRow(row, expectedColumnCount)) {
          if (blocks.length) {
            blocks[blocks.length - 1].rows.push(row);
          } else {
            blocks.push({ rows: [row], anchor: row, detailOnly: true });
          }
          continue;
        }

        const block = { rows: [row], anchor: row, detailOnly: false };
        while (
          i + 1 < allRows.length &&
          isDetailRow(allRows[i + 1], expectedColumnCount)
        ) {
          i += 1;
          block.rows.push(allRows[i]);
        }
        blocks.push(block);
      }

      blocks.sort((aBlock, bBlock) => {
        if (aBlock.detailOnly || bBlock.detailOnly) {
          return aBlock.detailOnly === bBlock.detailOnly
            ? 0
            : aBlock.detailOnly
              ? 1
              : -1;
        }

        const a = aBlock.anchor;
        const b = bBlock.anchor;
        const aDelivered = isDeliveredRow(a, statusIndex);
        const bDelivered = isDeliveredRow(b, statusIndex);
        const aDate = getDeliveryDate(a, deliveryIndex, statusIndex);
        const bDate = getDeliveryDate(b, deliveryIndex, statusIndex);

        const aGroup = aDelivered ? 2 : aDate ? 0 : 1;
        const bGroup = bDelivered ? 2 : bDate ? 0 : 1;

        if (aGroup !== bGroup) {
          return aGroup - bGroup;
        }

        if (aGroup === 0) {
          const dateDiff = aDate.getTime() - bDate.getTime();
          if (dateDiff !== 0) {
            return dateDiff;
          }
        }

        return getNameValue(a, nameIndex).localeCompare(
          getNameValue(b, nameIndex),
          undefined,
          { sensitivity: "base" },
        );
      });

      for (const row of pinnedRows) {
        body.appendChild(row);
      }
      for (const block of blocks) {
        for (const row of block.rows) {
          body.appendChild(row);
        }
      }
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
    const expectedColumnCount = headerRow.cells.length;
    applyDaysValues(
      table,
      deliveryIndex,
      daysIndex,
      statusIndex,
      expectedColumnCount,
      headerRow,
    );
    sortRows(
      table,
      deliveryIndex,
      nameIndex,
      statusIndex,
      expectedColumnCount,
      headerRow,
    );
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
        headers.some((text) => text.includes("delivery company")) ||
        headers.some((text) => text.includes("status"));
      return hasNameLike && hasMainColumns;
    });
  }

  let scheduled = false;

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

  scheduleRun();
})();
