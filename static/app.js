const catalog = window.__CATALOG__;
let currentEvent = catalog.events[0]?.name || "";
let quantities = {};
let calculateTimer = null;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const fmtTwd = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0
});

function fmtNumber(n) {
  return new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(Number(n || 0));
}

function eventProducts() {
  return catalog.products_by_event[currentEvent] || [];
}

function eventMeta() {
  return catalog.events.find(e => e.name === currentEvent) || {};
}

function storageKey() {
  return `lezhin-popup-calc:${currentEvent}`;
}

function loadQuantities(useDefaults = true) {
  const saved = localStorage.getItem(storageKey());
  if (saved && !useDefaults) {
    quantities = JSON.parse(saved);
    return;
  }

  quantities = {};
  for (const p of eventProducts()) {
    quantities[p.id] = useDefaults ? Number(p.default_qty || 0) : 0;
  }
}

function saveQuantities() {
  localStorage.setItem(storageKey(), JSON.stringify(quantities));
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, s => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[s]));
}

function initEvents() {
  const select = $("#eventSelect");
  select.innerHTML = catalog.events.map(event => (
    `<option value="${escapeHtml(event.name)}">${escapeHtml(event.name)}（${event.currency}｜${event.product_count} 項）</option>`
  )).join("");

  select.value = currentEvent;
  select.addEventListener("change", () => {
    currentEvent = select.value;
    const meta = eventMeta();
    $("#exchangeRate").value = meta.default_exchange_rate ?? 1;
    loadQuantities(false);
    if (Object.keys(quantities).length === 0) loadQuantities(true);
    renderProducts();
    calculate();
  });
}

function productMatchesSearch(product, query) {
  const haystack = `${product.item} ${product.variant || ""} ${product.note || ""}`.toLowerCase();
  return !query || haystack.includes(query);
}

function renderProducts() {
  const tbody = $("#productsBody");
  const q = $("#searchInput").value.trim().toLowerCase();
  const selectedOnly = $("#selectedOnly").checked;
  const products = eventProducts();
  const meta = eventMeta();
  const currency = meta.currency || "TWD";

  $("#eventInfo").textContent = `目前場次：${currentEvent}；幣別：${currency}；商品數：${products.length} 項。`;

  const rows = [];
  for (const p of products) {
    const qty = Number(quantities[p.id] || 0);
    if (!productMatchesSearch(p, q)) continue;
    if (selectedOnly && qty <= 0) continue;

    const line = Number(p.price) * qty;
    rows.push(`
      <tr class="product-row" data-id="${escapeHtml(p.id)}" data-price="${Number(p.price || 0)}" data-currency="${escapeHtml(currency || p.currency)}">
        <td data-label="品項" class="product-name-cell">
          <strong>${escapeHtml(p.item)}</strong>
          ${p.limit ? `<div class="limit-badge">參考限購：${escapeHtml(p.limit)}</div>` : ""}
        </td>
        <td data-label="款式">${escapeHtml(p.variant || "—")}</td>
        <td data-label="單價" class="price">${escapeHtml(currency || p.currency)} ${fmtNumber(p.price)}</td>
        <td data-label="數量" class="qty-cell">
          <div class="qty-control">
            <button type="button" data-action="minus" aria-label="減少">−</button>
            <input type="number" inputmode="numeric" min="0" step="1" value="${qty}" data-qty aria-label="${escapeHtml(p.item)} 數量">
            <button type="button" data-action="plus" aria-label="增加">＋</button>
          </div>
        </td>
        <td data-label="小計" class="line-total">${escapeHtml(currency || p.currency)} ${fmtNumber(line)}</td>
        <td data-label="官方備註" class="note">${escapeHtml(p.note || "")}</td>
      </tr>
    `);
  }

  tbody.innerHTML = rows.join("") || `<tr class="empty-row"><td colspan="6">找不到符合條件的商品。</td></tr>`;
  bindProductControls(tbody);
}

function bindProductControls(tbody) {
  tbody.querySelectorAll("button[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      const input = tr.querySelector("[data-qty]");
      const delta = btn.dataset.action === "plus" ? 1 : -1;
      const next = Math.max(0, Number(input.value || 0) + delta);
      quantities[id] = next;
      input.value = next;
      updateLineTotal(tr, next);
      saveQuantities();

      if ($("#selectedOnly").checked && next === 0) renderProducts();
      calculate();
    });
  });

  tbody.querySelectorAll("[data-qty]").forEach(input => {
    input.addEventListener("input", () => {
      const tr = input.closest("tr");
      const id = tr.dataset.id;
      const next = Math.max(0, Math.floor(Number(input.value || 0)));
      quantities[id] = next;
      updateLineTotal(tr, next);
      saveQuantities();
      calculateDebounced();
    });

    input.addEventListener("change", () => {
      const next = Math.max(0, Math.floor(Number(input.value || 0)));
      input.value = next;
      if ($("#selectedOnly").checked && next === 0) renderProducts();
      calculate();
    });
  });
}

function updateLineTotal(tr, qty) {
  const price = Number(tr.dataset.price || 0);
  const currency = tr.dataset.currency || "TWD";
  const lineCell = tr.querySelector(".line-total");
  lineCell.textContent = `${currency} ${fmtNumber(price * qty)}`;
}

function getExtras() {
  const extras = {};
  $$("[data-extra]").forEach(input => {
    extras[input.dataset.extra] = Number(input.value || 0);
  });
  return extras;
}

function calculateDebounced() {
  clearTimeout(calculateTimer);
  calculateTimer = setTimeout(calculate, 180);
}

async function calculate() {
  const payload = {
    event: currentEvent,
    exchange_rate: Number($("#exchangeRate").value || 1),
    budget: Number($("#budget").value || 0),
    extras: getExtras(),
    quantities
  };

  const response = await fetch("/api/calculate", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  renderSummary(result);
}

function renderSummary(result) {
  $("#subtotalOriginal").textContent = `${result.currency} ${fmtNumber(result.subtotal_original)}`;
  $("#subtotalTwd").textContent = fmtTwd.format(result.subtotal_twd);
  $("#extrasTotal").textContent = fmtTwd.format(result.extras_total);
  $("#grandTotal").textContent = fmtTwd.format(result.grand_total_twd);
  $("#cashSuggestion").textContent = `建議至少準備：${fmtTwd.format(result.cash_suggestion)}（已無條件進位到百元）`;

  $("#mobileGrandTotal").textContent = fmtTwd.format(result.grand_total_twd);
  $("#mobileSelectedCount").textContent = `已選 ${result.selected_count || 0} 項`;

  const budgetLine = $("#budgetLine");
  budgetLine.classList.remove("safe", "over");
  if (!result.budget) {
    budgetLine.textContent = "尚未設定預算。";
  } else if (result.remaining >= 0) {
    budgetLine.classList.add("safe");
    budgetLine.textContent = `預算內，還剩 ${fmtTwd.format(result.remaining)}。`;
  } else {
    budgetLine.classList.add("over");
    budgetLine.textContent = `超出預算 ${fmtTwd.format(Math.abs(result.remaining))}。`;
  }

  const rewardList = $("#rewardList");
  if (!result.rewards || result.rewards.length === 0) {
    rewardList.innerHTML = "<li>此場次沒有設定滿額贈估算。</li>";
  } else {
    rewardList.innerHTML = result.rewards.map(r => (
      `<li><b>${escapeHtml(r.label)}</b>：${r.count === null ? "需手動確認" : `${r.count} 份`}<br><span class="hint">${escapeHtml(r.note || "")}</span></li>`
    )).join("");
  }

  const cart = $("#cartList");
  if (!result.selected_items.length) {
    cart.className = "cart-list empty";
    cart.textContent = "目前尚未選擇商品。";
  } else {
    cart.className = "cart-list";
    cart.innerHTML = result.selected_items.map(item => (
      `<div class="cart-item">
        <b>${escapeHtml(item.item)}${item.variant ? `｜${escapeHtml(item.variant)}` : ""}</b>
        <span>${escapeHtml(item.currency)} ${fmtNumber(item.price)} × ${item.qty} ＝ ${escapeHtml(item.currency)} ${fmtNumber(item.line_total)}</span>
      </div>`
    )).join("");
  }

  const warnings = $("#warningList");
  warnings.innerHTML = (result.warnings || []).map(w => `<div>⚠ ${escapeHtml(w)}</div>`).join("");
}

function bindInputs() {
  ["#exchangeRate", "#budget"].forEach(selector => {
    $(selector).addEventListener("input", calculateDebounced);
    $(selector).addEventListener("change", calculate);
  });

  ["#searchInput", "#selectedOnly"].forEach(selector => {
    $(selector).addEventListener("input", () => {
      renderProducts();
      calculateDebounced();
    });
    $(selector).addEventListener("change", () => {
      renderProducts();
      calculate();
    });
  });

  $$("[data-extra]").forEach(input => {
    input.addEventListener("input", calculateDebounced);
    input.addEventListener("change", calculate);
  });

  $("#resetBtn").addEventListener("click", () => {
    for (const p of eventProducts()) quantities[p.id] = 0;
    saveQuantities();
    renderProducts();
    calculate();
  });

  $("#defaultBtn").addEventListener("click", () => {
    loadQuantities(true);
    saveQuantities();
    renderProducts();
    calculate();
  });

  $("#printBtn").addEventListener("click", () => window.print());
}

function init() {
  initEvents();
  const meta = eventMeta();
  $("#exchangeRate").value = meta.default_exchange_rate ?? 1;
  loadQuantities(false);
  if (Object.keys(quantities).length === 0) loadQuantities(true);
  bindInputs();
  renderProducts();
  calculate();
}

init();
