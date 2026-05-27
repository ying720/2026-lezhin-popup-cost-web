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

function isSpaklzEvent(name = currentEvent) {
  return /SPAKLZ/i.test(String(name || ""));
}

function applyEventTheme() {
  document.body.classList.toggle("theme-spaklz", isSpaklzEvent());
}

function findProduct(id) {
  return eventProducts().find(p => p.id === id) || null;
}

function productLimit(product) {
  const limit = Number(product?.limit || 0);
  return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : null;
}

function normalizeQty(value, product) {
  const limit = productLimit(product);
  let qty = Math.max(0, Math.floor(Number(value || 0)));
  if (limit !== null) qty = Math.min(qty, limit);
  return qty;
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
    applyEventTheme();
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

function productCategory(product) {
  if (product.category) return String(product.category).trim();
  const item = String(product.item || "").trim();
  return item.split(/\n/)[0].trim() || "其他商品";
}

function visibleProductRows(products, query, selectedOnly) {
  const rows = [];
  for (const p of products) {
    const qty = normalizeQty(quantities[p.id] || 0, p);
    quantities[p.id] = qty;
    if (!productMatchesSearch(p, query)) continue;
    if (selectedOnly && qty <= 0) continue;
    rows.push({ product: p, qty });
  }
  return rows;
}

function renderProductRow(p, qty, currency) {
  const line = Number(p.price) * qty;
  return `
    <tr class="product-row" data-id="${escapeHtml(p.id)}" data-price="${Number(p.price || 0)}" data-currency="${escapeHtml(currency || p.currency)}" data-limit="${productLimit(p) ?? ""}">
      <td data-label="品項" class="product-name-cell">
        <strong>${escapeHtml(p.item)}</strong>
        ${p.limit ? `<div class="limit-badge">限購 ${escapeHtml(p.limit)} 件</div>` : ""}
      </td>
      <td data-label="款式">${escapeHtml(p.variant || "—")}</td>
      <td data-label="單價" class="price">${escapeHtml(currency || p.currency)} ${fmtNumber(p.price)}</td>
      <td data-label="數量" class="qty-cell">
        <div class="qty-control">
          <button type="button" data-action="minus" aria-label="減少">−</button>
          <input type="number" inputmode="numeric" min="0" ${productLimit(p) !== null ? `max="${productLimit(p)}"` : ""} step="1" value="${qty}" data-qty aria-label="${escapeHtml(p.item)} 數量">
          <button type="button" data-action="plus" aria-label="增加" ${productLimit(p) !== null && qty >= productLimit(p) ? "disabled" : ""}>＋</button>
        </div>
        ${productLimit(p) !== null ? `<div class="limit-message" data-limit-message>${qty >= productLimit(p) ? "已達限購上限" : `最多可選 ${productLimit(p)} 件`}</div>` : ""}
      </td>
      <td data-label="小計" class="line-total">${escapeHtml(currency || p.currency)} ${fmtNumber(line)}</td>
      <td data-label="說明" class="note">${escapeHtml(p.note || "")}</td>
    </tr>
  `;
}

function renderCategoryRow(category, groupRows) {
  const selectedQty = groupRows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
  const selectedKinds = groupRows.filter(row => Number(row.qty || 0) > 0).length;
  const selectedText = selectedQty > 0 ? `已選 ${fmtNumber(selectedQty)} 件` : "尚未選擇";

  return `
    <tr class="product-category-row">
      <td colspan="6">
        <div class="category-title">${escapeHtml(category)}</div>
        <div class="category-meta">
          <span>共 ${fmtNumber(groupRows.length)} 款</span>
          <span>${escapeHtml(selectedText)}</span>
          ${selectedKinds > 0 ? `<span>${fmtNumber(selectedKinds)} 款有選</span>` : ""}
        </div>
      </td>
    </tr>
  `;
}

function renderProducts() {
  const tbody = $("#productsBody");
  const q = $("#searchInput").value.trim().toLowerCase();
  const selectedOnly = $("#selectedOnly").checked;
  const products = eventProducts();
  const meta = eventMeta();
  const currency = meta.currency || "TWD";
  const grouped = isSpaklzEvent();

  const shortEventName = currentEvent
    .replace(/^SPAKLZ\s+2026\s+WORLD\s+TOUR\s*/i, "")
    .trim() || currentEvent;
  $("#eventInfo").innerHTML = `
    <span class="event-meta-label">目前場次</span>
    <strong class="event-meta-name" title="${escapeHtml(currentEvent)}">${escapeHtml(shortEventName)}</strong>
    <span class="event-meta-chip">${escapeHtml(currency)}</span>
    <span class="event-meta-chip">${products.length} 項</span>
  `;

  const visibleRows = visibleProductRows(products, q, selectedOnly);

  if (!visibleRows.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">找不到符合條件的商品。</td></tr>`;
    return;
  }

  if (!grouped) {
    tbody.innerHTML = visibleRows.map(({ product, qty }) => renderProductRow(product, qty, currency)).join("");
    bindProductControls(tbody);
    return;
  }

  const groups = new Map();
  for (const row of visibleRows) {
    const category = productCategory(row.product);
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(row);
  }

  const html = [];
  for (const [category, groupRows] of groups.entries()) {
    html.push(renderCategoryRow(category, groupRows));
    html.push(...groupRows.map(({ product, qty }) => renderProductRow(product, qty, currency)));
  }

  tbody.innerHTML = html.join("");
  bindProductControls(tbody);
}
function bindProductControls(tbody) {
  tbody.querySelectorAll("button[data-action]").forEach(btn => {
    btn.addEventListener("click", () => {
      const tr = btn.closest("tr");
      const id = tr.dataset.id;
      const product = findProduct(id);
      const input = tr.querySelector("[data-qty]");
      const delta = btn.dataset.action === "plus" ? 1 : -1;
      const next = normalizeQty(Number(input.value || 0) + delta, product);
      setProductQty(tr, product, next);
      saveQuantities();

      if ($("#selectedOnly").checked && next === 0) renderProducts();
      calculate();
    });
  });

  tbody.querySelectorAll("[data-qty]").forEach(input => {
    input.addEventListener("input", () => {
      const tr = input.closest("tr");
      const id = tr.dataset.id;
      const product = findProduct(id);
      const next = normalizeQty(input.value, product);
      setProductQty(tr, product, next);
      saveQuantities();
      calculateDebounced();
    });

    input.addEventListener("change", () => {
      const tr = input.closest("tr");
      const product = findProduct(tr.dataset.id);
      const next = normalizeQty(input.value, product);
      setProductQty(tr, product, next);
      if ($("#selectedOnly").checked && next === 0) renderProducts();
      calculate();
    });
  });
}

function setProductQty(tr, product, qty) {
  const id = tr.dataset.id;
  quantities[id] = qty;

  const input = tr.querySelector("[data-qty]");
  if (input) input.value = qty;

  updateLineTotal(tr, qty);
  updateLimitState(tr, product, qty);
}

function updateLimitState(tr, product, qty) {
  const limit = productLimit(product);
  const plusBtn = tr.querySelector('button[data-action="plus"]');
  const message = tr.querySelector("[data-limit-message]");

  if (limit === null) {
    if (plusBtn) plusBtn.disabled = false;
    if (message) message.textContent = "";
    return;
  }

  const reached = qty >= limit;
  if (plusBtn) plusBtn.disabled = reached;
  tr.classList.toggle("limit-reached", reached);
  if (message) {
    message.textContent = reached ? "已達限購上限" : `最多可選 ${limit} 件`;
  }
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
  const rewardBadge = $("#rewardSummaryBadge");
  const rewardHint = $("#rewardHint");
  const rewards = result.rewards || [];

  if (rewards.length === 0) {
    if (rewardBadge) {
      rewardBadge.textContent = "無設定";
      rewardBadge.className = "reward-summary-badge empty";
    }
    if (rewardHint) rewardHint.textContent = "此場次目前沒有設定滿額贈估算。";
    rewardList.innerHTML = `<li class="reward-item empty">此場次沒有設定滿額贈估算。</li>`;
  } else {
    const totalRewards = rewards.reduce((sum, r) => {
      const count = Number(r.count || 0);
      return sum + (Number.isFinite(count) && count > 0 ? count : 0);
    }, 0);

    if (rewardBadge) {
      rewardBadge.textContent = totalRewards > 0 ? `目前可領 ${totalRewards} 份` : "尚未達成";
      rewardBadge.className = `reward-summary-badge ${totalRewards > 0 ? "achieved" : "not-achieved"}`;
    }
    if (rewardHint) rewardHint.textContent = "依目前商品原幣總額估算，實際贈品規則仍以現場公告為準。";

    rewardList.innerHTML = rewards.map(r => {
      const manual = r.count === null || r.count === undefined;
      const count = manual ? null : Number(r.count || 0);
      const achieved = manual || count > 0;
      const countText = manual ? "需手動確認" : `${fmtNumber(count)} 份`;
      const statusText = manual ? "請確認" : achieved ? "已達成" : "未達成";

      return `
        <li class="reward-item ${manual ? "manual" : achieved ? "achieved" : "not-achieved"}">
          <div class="reward-line-main">
            <span class="reward-dot" aria-hidden="true"></span>
            <b>${escapeHtml(r.label)}</b>
            <span class="reward-separator">：</span>
            <strong class="reward-count-text">${escapeHtml(countText)}</strong>
            <span class="reward-status">${escapeHtml(statusText)}</span>
          </div>
          <div class="reward-note">${escapeHtml(r.note || "")}</div>
        </li>
      `;
    }).join("");
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

  const clearAllQuantities = () => {
    for (const p of eventProducts()) quantities[p.id] = 0;
    saveQuantities();
    renderProducts();
    calculate();
  };

  $("#resetBtn").addEventListener("click", clearAllQuantities);

  const mobileResetBtn = $("#mobileResetBtn");
  if (mobileResetBtn) mobileResetBtn.addEventListener("click", clearAllQuantities);

  $("#printBtn").addEventListener("click", () => window.print());
}

function init() {
  initEvents();
  applyEventTheme();
  const meta = eventMeta();
  $("#exchangeRate").value = meta.default_exchange_rate ?? 1;
  loadQuantities(false);
  if (Object.keys(quantities).length === 0) loadQuantities(true);
  bindInputs();
  renderProducts();
  calculate();
}

init();
