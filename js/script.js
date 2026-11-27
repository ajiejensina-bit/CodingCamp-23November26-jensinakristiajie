// Expense & Budget Visualizer
// Vanilla JS, data disimpan di Local Storage.
// Fitur opsional: monthly summary, sort transaksi, highlight spending limit.

const KEYS = {
  transactions: "ebv_transactions",
  limit: "ebv_limit",
  sort: "ebv_sort",
};

// Sage, teal, dan ink (dari color palette)
const COLORS = { Food: "#a5bb80", Transport: "#3b7d7b", Fun: "#2a3130" };
const CATEGORIES = Object.keys(COLORS);

// ---------- State ----------
let transactions = loadJSON(KEYS.transactions, []);
let spendingLimit = Number(localStorage.getItem(KEYS.limit)) || 0;
let sortMode = localStorage.getItem(KEYS.sort) || "newest";
let selectedMonth = monthKey(new Date());
let chart = null;
let filterCategory = "";   // "" = tampilkan semua kategori
let lastAddedId = null;    // untuk animasi item baru
let lastDeleted = null;    // untuk tombol Undo
let toastTimer = null;
let shownTotal = 0;        // angka balance yang sedang tampil (untuk animasi)
let countFrame = null;

// ---------- Elements ----------
const nameInput = document.getElementById("item-name");
const amountInput = document.getElementById("item-amount");
const categorySelect = document.getElementById("item-category");
const formError = document.getElementById("form-error");
const addBtn = document.getElementById("add-btn");

const totalEl = document.getElementById("total-balance");
const balanceCard = document.getElementById("balance-card");
const limitInput = document.getElementById("limit-input");
const limitWarning = document.getElementById("limit-warning");

const sortSelect = document.getElementById("sort-select");
const listEl = document.getElementById("transaction-list");

const monthSelect = document.getElementById("month-select");
const monthTotal = document.getElementById("month-total");
const monthCount = document.getElementById("month-count");
const monthWarning = document.getElementById("month-warning");
const monthCategories = document.getElementById("month-categories");

const filterBar = document.getElementById("filter-bar");
const toast = document.getElementById("toast");
const toastText = document.getElementById("toast-text");
const undoBtn = document.getElementById("undo-btn");

const canvas = document.getElementById("chart");
const chartEmpty = document.getElementById("chart-empty");

// ---------- Helpers ----------
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function saveTransactions() {
  localStorage.setItem(KEYS.transactions, JSON.stringify(transactions));
}

function formatMoney(value) {
  // Format dollar: $15.00 (dua angka desimal)
  return "$" + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getTotal() {
  return transactions.reduce((sum, t) => sum + t.amount, 0);
}

function sumByCategory(list, category) {
  return list.filter((t) => t.category === category).reduce((sum, t) => sum + t.amount, 0);
}

// Contoh month key: "2026-11"
function monthKey(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
}

function monthLabel(key) {
  const parts = key.split("-");
  return new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function getDate(t) {
  return t.date ? new Date(t.date) : new Date(t.id);
}

function showMessage(el, message) {
  el.textContent = message;
  el.style.display = "block";
}

function hideMessage(el) {
  el.style.display = "none";
}

function getSortedTransactions() {
  const list = transactions.slice();
  if (sortMode === "amount-high") return list.sort((a, b) => b.amount - a.amount);
  if (sortMode === "amount-low") return list.sort((a, b) => a.amount - b.amount);
  if (sortMode === "category") {
    return list.sort((a, b) => a.category.localeCompare(b.category) || b.id - a.id);
  }
  return list.sort((a, b) => b.id - a.id); // newest first
}

// ---------- Render ----------
// Angka balance "berjalan" dari nilai lama ke nilai baru
function animateTotal(target) {
  cancelAnimationFrame(countFrame);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || shownTotal === target) {
    shownTotal = target;
    totalEl.textContent = formatMoney(target);
    return;
  }

  const start = shownTotal;
  const startTime = performance.now();
  const duration = 400;

  function step(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    shownTotal = start + (target - start) * eased;
    totalEl.textContent = formatMoney(shownTotal);
    if (progress < 1) {
      countFrame = requestAnimationFrame(step);
    } else {
      shownTotal = target;
      totalEl.textContent = formatMoney(target);
    }
  }
  countFrame = requestAnimationFrame(step);
}

function renderBalance() {
  const total = getTotal();
  animateTotal(total);

  const over = spendingLimit > 0 && total > spendingLimit;
  balanceCard.classList.toggle("over-limit", over);
  if (over) {
    showMessage(
      limitWarning,
      "You are " + formatMoney(total - spendingLimit) + " over your " + formatMoney(spendingLimit) + " limit."
    );
  } else {
    hideMessage(limitWarning);
  }
}

function renderMonthly() {
  const keys = new Set(transactions.map((t) => monthKey(getDate(t))));
  keys.add(monthKey(new Date()));
  const sortedKeys = Array.from(keys).sort().reverse();
  if (!sortedKeys.includes(selectedMonth)) selectedMonth = sortedKeys[0];

  monthSelect.innerHTML = "";
  sortedKeys.forEach((key) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = monthLabel(key);
    monthSelect.appendChild(opt);
  });
  monthSelect.value = selectedMonth;

  const items = transactions.filter((t) => monthKey(getDate(t)) === selectedMonth);
  const total = items.reduce((sum, t) => sum + t.amount, 0);

  monthTotal.textContent = formatMoney(total);

  // Opsi 4: tandai kalau total bulan ini melewati limit
  const monthOver = spendingLimit > 0 && total > spendingLimit;
  monthTotal.classList.toggle("month-over", monthOver);
  if (monthOver) {
    showMessage(
      monthWarning,
      "Over your " + formatMoney(spendingLimit) + " limit by " + formatMoney(total - spendingLimit) + "."
    );
  } else {
    hideMessage(monthWarning);
  }
  monthCount.textContent =
    items.length === 0
      ? "No transactions in " + monthLabel(selectedMonth) + "."
      : items.length + (items.length === 1 ? " transaction" : " transactions");

  monthCategories.innerHTML = "";
  if (items.length === 0) return;

  CATEGORIES.forEach((cat) => {
    const catTotal = sumByCategory(items, cat);
    if (catTotal === 0) return;
    const percent = (catTotal / total) * 100;

    const row = document.createElement("div");
    row.className = "month-row";

    const top = document.createElement("div");
    top.className = "month-row-top";
    const label = document.createElement("span");
    label.textContent = cat + " (" + percent.toFixed(0) + "%)";
    const value = document.createElement("span");
    value.textContent = formatMoney(catTotal);
    top.append(label, value);

    const bar = document.createElement("div");
    bar.className = "bar";
    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = "0%";
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = percent + "%"; }));
    fill.style.background = COLORS[cat];
    bar.appendChild(fill);

    row.append(top, bar);
    monthCategories.appendChild(row);
  });
}

function renderList() {
  listEl.innerHTML = "";

  if (transactions.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No transactions yet. Add your first one above.";
    listEl.appendChild(empty);
    return;
  }

  const visible = getSortedTransactions().filter(
    (t) => !filterCategory || t.category === filterCategory
  );
  if (visible.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No " + filterCategory + " transactions yet.";
    listEl.appendChild(empty);
    return;
  }

  visible.forEach((t) => {
    const item = document.createElement("div");
    item.className = "item" + (t.id === lastAddedId ? " new" : "");
    if (spendingLimit > 0 && t.amount > spendingLimit) item.classList.add("over-limit");

    const info = document.createElement("div");

    const name = document.createElement("strong");
    name.textContent = t.name;

    const amount = document.createElement("div");
    amount.className = "item-amount";
    amount.textContent = formatMoney(t.amount);

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = t.category;
    tag.style.background = COLORS[t.category] || "#999999";
    tag.style.color = t.category === "Food" ? "#2a3130" : "#ffffff"; // teks gelap di atas sage

    const date = document.createElement("div");
    date.className = "item-date";
    date.textContent = getDate(t).toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    info.append(name, amount, tag, date);

    const del = document.createElement("button");
    del.type = "button";
    del.className = "delete-btn";
    del.textContent = "Delete";
    del.addEventListener("click", () => deleteTransaction(t.id, item));

    item.append(info, del);
    listEl.appendChild(item);
  });
  lastAddedId = null;   // animasi hanya sekali
}

function renderChart() {
  const totals = CATEGORIES.map((cat) => sumByCategory(transactions, cat));
  const hasData = totals.some((v) => v > 0);

  canvas.style.display = hasData ? "block" : "none";
  chartEmpty.style.display = hasData ? "none" : "block";

  if (!hasData) {
    if (chart) {
      chart.destroy();
      chart = null;
    }
    return;
  }

  if (chart) {
    chart.data.datasets[0].data = totals;
    chart.update();
    return;
  }

  chart = new Chart(canvas, {
    type: "pie",
    data: {
      labels: CATEGORIES,
      datasets: [{ data: totals, backgroundColor: CATEGORIES.map((c) => COLORS[c]), hoverOffset: 12 }],
    },
    options: {
      // Klik potongan pie = filter daftar transaksi
      onClick: (event, elements) => {
        if (elements.length > 0) setFilter(CATEGORIES[elements[0].index]);
      },
      onHover: (event, elements) => {
        event.native.target.style.cursor = elements.length > 0 ? "pointer" : "default";
      },
      plugins: {
        legend: { position: "bottom" },
        tooltip: {
          callbacks: { label: (ctx) => " " + ctx.label + ": " + formatMoney(ctx.parsed) },
        },
      },
    },
  });
}

function render() {
  renderBalance();
  renderMonthly();
  renderList();
  renderChart();
}

// ---------- Aksi ----------
function addTransaction() {
  const name = nameInput.value.trim();
  const amount = parseFloat(amountInput.value);
  const category = categorySelect.value;

  if (!name || amountInput.value === "" || !category) {
    showMessage(formError, "Please fill in the item name, amount, and category.");
    return;
  }
  if (isNaN(amount) || amount <= 0) {
    showMessage(formError, "Amount must be a number greater than 0.");
    return;
  }

  hideMessage(formError);
  const now = new Date();
  lastAddedId = now.getTime();
  transactions.push({ id: now.getTime(), name, amount, category, date: now.toISOString() });
  saveTransactions();

  selectedMonth = monthKey(now);
  nameInput.value = "";
  amountInput.value = "";
  categorySelect.value = "";
  nameInput.focus();
  render();
}

function deleteTransaction(id, itemEl) {
  const removed = transactions.find((t) => t.id === id);
  if (!removed) return;
  if (itemEl && itemEl.classList.contains("removing")) return;

  const finish = () => {
    transactions = transactions.filter((t) => t.id !== id);
    lastDeleted = removed;
    saveTransactions();
    render();
    showToast('"' + removed.name + '" deleted.');
  };

  if (itemEl) {
    itemEl.classList.add("removing");   // animasi menghilang dulu
    setTimeout(finish, 200);
  } else {
    finish();
  }
}

function undoDelete() {
  if (!lastDeleted) return;
  transactions.push(lastDeleted);
  lastAddedId = lastDeleted.id;
  lastDeleted = null;
  saveTransactions();
  hideToast();
  render();
}

function showToast(message) {
  toastText.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, 5000);
}

function hideToast() {
  toast.classList.remove("show");
}

// Filter kategori: klik kategori yang sama sekali lagi = tampilkan semua
function setFilter(category) {
  filterCategory = category === filterCategory ? "" : category;
  filterBar.querySelectorAll(".chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.cat === filterCategory);
  });
  renderList();
}

// ---------- Events ----------
addBtn.addEventListener("click", addTransaction);

[nameInput, amountInput].forEach((input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addTransaction();
  });
});

filterBar.addEventListener("click", (e) => {
  const chip = e.target.closest(".chip");
  if (chip) setFilter(chip.dataset.cat);
});

undoBtn.addEventListener("click", undoDelete);

sortSelect.addEventListener("change", () => {
  sortMode = sortSelect.value;
  localStorage.setItem(KEYS.sort, sortMode);
  renderList();
});

monthSelect.addEventListener("change", () => {
  selectedMonth = monthSelect.value;
  renderMonthly();
});

limitInput.addEventListener("input", () => {
  spendingLimit = parseFloat(limitInput.value) || 0;
  localStorage.setItem(KEYS.limit, String(spendingLimit));
  renderBalance();
  renderMonthly();
  renderList();
});

// ---------- Init ----------
sortSelect.value = sortMode;
limitInput.value = spendingLimit > 0 ? spendingLimit : "";
render();