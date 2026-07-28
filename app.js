(() => {
  "use strict";

  const config = window.MAQSOOD_CONFIG || {};
  const SESSION_KEY = "maqsood-karyana-session";
  const state = { token: localStorage.getItem(SESSION_KEY) || "", items: [], entries: [], ledger: [], deferredPrompt: null };
  const BASIC_ITEMS = [
    "Aata", "Chawal", "Cheeni", "Daal Chana", "Daal Masoor", "Daal Moong",
    "Daal Mash", "Besan", "Suji", "Maida", "Namak", "Laal Mirch", "Haldi",
    "Dhania Powder", "Garam Masala", "Cooking Oil", "Ghee", "Chai Patti",
    "Doodh", "Dahi", "Anday", "Bread", "Biscuit", "Soap", "Shampoo",
    "Toothpaste", "Washing Powder", "Dishwash", "Tissue Paper", "Match Box",
    "Piyaz", "Aloo", "Tamatar", "Lehsan", "Adrak"
  ];
  const $ = (id) => document.getElementById(id);
  const configured = /^https:\/\//.test(config.supabaseUrl || "") && !String(config.supabaseAnonKey || "").startsWith("YOUR_");
  const money = (value) => `Rs ${Number(value || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

  async function api(path, options = {}) {
    const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${config.supabaseAnonKey}`,
        "Content-Type": "application/json",
        Prefer: options.prefer || "return=representation",
        ...(state.token ? { "X-Store-Session": state.token } : {}),
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    if (!response.ok) throw new Error(text || `Request failed (${response.status})`);
    return text ? JSON.parse(text) : null;
  }

  function toast(message) {
    $("toast").textContent = message;
    $("toast").classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => $("toast").classList.remove("show"), 2600);
  }

  function showApp() {
    $("loginScreen").classList.add("hidden");
    $("appScreen").classList.remove("hidden");
    $("headerDate").textContent = new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" }).format(new Date());
  }

  function showLogin() {
    $("appScreen").classList.add("hidden");
    $("loginScreen").classList.remove("hidden");
  }

  async function login(event) {
    event.preventDefault();
    if (!configured) return $("setupMessage").classList.remove("hidden");
    try {
      const result = await api("rpc/store_login", { method: "POST", body: JSON.stringify({ input_password: $("loginPassword").value }) });
      if (!result?.authenticated) return toast("Wrong password");
      state.token = result.session_token;
      localStorage.setItem(SESSION_KEY, state.token);
      $("loginPassword").value = "";
      showApp();
      await refreshAll();
    } catch (error) {
      console.error(error);
      toast("Login failed. Supabase SQL aur config check karein.");
    }
  }

  async function restoreSession() {
    if (!configured || !state.token) return showLogin();
    try {
      const result = await api("rpc/store_restore_session", { method: "POST", body: "{}" });
      if (!result?.authenticated) throw new Error("Expired");
      showApp();
      await refreshAll();
    } catch {
      state.token = "";
      localStorage.removeItem(SESSION_KEY);
      showLogin();
    }
  }

  async function logout() {
    try { if (state.token) await api("rpc/store_logout", { method: "POST", body: "{}" }); } catch {}
    state.token = "";
    localStorage.removeItem(SESSION_KEY);
    showLogin();
  }

  function showView(name) {
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("hidden", view.id !== `${name}View`));
    document.querySelectorAll(".nav-button[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (name === "history") renderHistory();
    if (name === "analytics") renderAnalytics();
    if (name === "items") renderItems();
  }

  async function loadItems() {
    state.items = await api("store_items?select=*&order=name.asc") || [];
    const options = [...new Set([...BASIC_ITEMS, ...state.items.map((item) => item.name)])]
      .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    $("itemOptions").innerHTML = options.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
  }

  async function loadEntries() {
    state.entries = await api("store_entries?select=*&order=purchase_date.desc,created_at.desc") || [];
  }

  async function loadLedger() {
    state.ledger = await api("store_ledger?select=*&order=entry_date.desc,created_at.desc") || [];
  }

  async function refreshAll() {
    await Promise.all([loadItems(), loadEntries(), loadLedger()]);
    renderDashboard();
    renderHistory();
    renderAnalytics();
    renderItems();
  }

  function entryStatus(row) {
    const total = Number(row.total_amount || 0);
    const paid = Number(row.paid_amount || 0);
    if (paid <= 0 && total > 0) return "Unpaid";
    if (paid >= total) return "Paid";
    return "Partial";
  }

  function totals(rows) {
    return rows.reduce((acc, row) => {
      acc.total += Number(row.total_amount || 0);
      acc.paid += Number(row.paid_amount || 0);
      acc.remaining += Math.max(0, Number(row.total_amount || 0) - Number(row.paid_amount || 0));
      return acc;
    }, { total: 0, paid: 0, remaining: 0 });
  }

  function grouped(rows) {
    const map = new Map();
    rows.forEach((row) => {
      const key = String(row.item_name || "").trim();
      const item = map.get(key) || { name: key, count: 0, spend: 0 };
      item.count += 1;
      item.spend += Number(row.total_amount || 0);
      map.set(key, item);
    });
    return [...map.values()];
  }

  function renderDashboard() {
    const todayRows = state.entries.filter((row) => row.purchase_date === today());
    const todayTotals = totals(todayRows);
    $("todayTotal").textContent = money(todayTotals.total);
    $("todayPaid").textContent = money(todayTotals.paid);
    $("todayUnpaid").textContent = money(todayTotals.remaining);
    $("todayCount").textContent = todayRows.length;
    const groups = grouped(state.entries);
    const frequent = [...groups].sort((a, b) => b.count - a.count)[0];
    const spending = [...groups].sort((a, b) => b.spend - a.spend)[0];
    $("topFrequent").textContent = frequent ? `${frequent.name} (${frequent.count} times)` : "-";
    $("topSpending").textContent = spending ? `${spending.name} - ${money(spending.spend)}` : "-";
    const allTotals = totals(state.entries);
    $("allRemaining").textContent = money(allTotals.remaining);
    renderLedger(allTotals);
    $("recentList").innerHTML = state.entries.slice(0, 6).map((row) => `
      <div class="record-row"><div><strong>${escapeHtml(row.item_name)}</strong><span>${escapeHtml(row.purchase_date)} · ${escapeHtml(row.quantity)} ${escapeHtml(row.unit)}</span></div><strong>${money(row.total_amount)}</strong></div>
    `).join("") || `<p class="empty">Abhi koi record nahi.</p>`;
  }

  function ledgerTotals() {
    return state.ledger.reduce((acc, row) => {
      const amount = Number(row.amount || 0);
      if (row.entry_type === "opening_balance") acc.opening += amount;
      if (row.entry_type === "payment") acc.payments += amount;
      if (row.entry_type === "adjustment") acc.adjustments += amount;
      return acc;
    }, { opening: 0, payments: 0, adjustments: 0 });
  }

  function renderLedger(allTotals = totals(state.entries)) {
    const ledger = ledgerTotals();
    const oldRows = state.entries.filter((row) => row.source_group === "old_register");
    const newRows = state.entries.filter((row) => row.source_group !== "old_register");
    const remaining = ledger.opening + ledger.adjustments + allTotals.total - allTotals.paid - ledger.payments;
    $("openingBalance").textContent = money(ledger.opening + ledger.adjustments);
    $("oldRegisterTotal").textContent = money(totals(oldRows).total);
    $("newPurchasesTotal").textContent = money(totals(newRows).total);
    $("entryPaidTotal").textContent = money(allTotals.paid);
    $("depositTotal").textContent = money(ledger.payments);
    $("accountRemaining").textContent = money(remaining);
    $("ledgerHistory").innerHTML = state.ledger.length ? state.ledger.slice(0, 8).map((row) => `
      <div class="record-row">
        <div><strong>${row.entry_type === "payment" ? "Jama payment" : row.entry_type === "opening_balance" ? "Pichla balance" : "Adjustment"}</strong><span>${escapeHtml(row.entry_date)} · ${escapeHtml(row.note || "-")}</span></div>
        <div class="ledger-row-end"><strong>${row.entry_type === "payment" ? "-" : "+"}${money(row.amount)}</strong><button class="row-action danger" data-delete-ledger="${row.id}">Delete</button></div>
      </div>`).join("") : `<p class="empty">Abhi koi alag khata entry nahi.</p>`;
    $("ledgerHistory").querySelectorAll("[data-delete-ledger]").forEach((button) => button.addEventListener("click", () => deleteLedger(button.dataset.deleteLedger)));
  }

  async function saveLedger(event) {
    event.preventDefault();
    try {
      await api("store_ledger", { method: "POST", body: JSON.stringify({
        entry_date: $("ledgerDate").value,
        entry_type: $("ledgerType").value,
        amount: Number($("ledgerAmount").value),
        note: $("ledgerNote").value.trim()
      }), prefer: "return=minimal" });
      $("ledgerAmount").value = "";
      $("ledgerNote").value = "";
      await loadLedger();
      renderDashboard();
      toast("Khata entry save ho gayi");
    } catch (error) {
      console.error(error);
      toast("Khata entry save failed. Updated SQL run karein.");
    }
  }

  async function deleteLedger(id) {
    if (!confirm("Ye khata entry delete karni hai?")) return;
    try {
      await api(`store_ledger?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", prefer: "return=minimal" });
      await loadLedger();
      renderDashboard();
      toast("Khata entry deleted");
    } catch { toast("Delete failed"); }
  }

  function updateRemaining() {
    const amount = Math.max(0, Number($("totalAmount").value || 0) - Number($("paidAmount").value || 0));
    $("remainingAmount").value = money(amount);
  }

  async function ensureItem(name) {
    const existing = state.items.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const result = await api("store_items", { method: "POST", body: JSON.stringify({ name }), headers: { Prefer: "return=representation,resolution=merge-duplicates" } });
    await loadItems();
    return result?.[0] || state.items.find((item) => item.name.toLowerCase() === name.toLowerCase());
  }

  async function saveEntry(event) {
    event.preventDefault();
    const name = $("itemName").value.trim();
    const total = Number($("totalAmount").value || 0);
    const paid = Number($("paidAmount").value || 0);
    if (!name) return toast("Item name required");
    if (paid > total) return toast("Paid amount total se zyada nahi ho sakta");
    try {
      const item = await ensureItem(name);
      const row = {
        purchase_date: $("purchaseDate").value,
        item_id: item?.id || null,
        item_name: name,
        quantity: Number($("quantity").value),
        unit: $("unit").value,
        total_amount: total,
        paid_amount: paid,
        note: $("note").value.trim(),
        source_group: "daily"
      };
      const id = $("entryId").value;
      await api(id ? `store_entries?id=eq.${encodeURIComponent(id)}` : "store_entries", { method: id ? "PATCH" : "POST", body: JSON.stringify(row), prefer: "return=minimal" });
      clearEntry();
      await refreshAll();
      showView("dashboard");
      toast(id ? "Record updated" : "Saman save ho gaya");
    } catch (error) {
      console.error(error);
      toast("Record save failed");
    }
  }

  function clearEntry() {
    $("entryForm").reset();
    $("entryId").value = "";
    $("purchaseDate").value = today();
    $("quantity").value = "1";
    $("paidAmount").value = "0";
    updateRemaining();
  }

  function filteredEntries() {
    const from = $("filterFrom").value;
    const to = $("filterTo").value;
    const payment = $("filterPayment").value;
    const item = $("filterItem").value.trim().toLowerCase();
    return state.entries.filter((row) =>
      (!from || row.purchase_date >= from) &&
      (!to || row.purchase_date <= to) &&
      (!payment || entryStatus(row) === payment) &&
      (!item || row.item_name.toLowerCase().includes(item))
    );
  }

  function renderHistory() {
    const rows = filteredEntries();
    const sum = totals(rows);
    $("historySummary").innerHTML = [
      ["Records", rows.length], ["Total", money(sum.total)], ["Paid", money(sum.paid)], ["Remaining", money(sum.remaining)]
    ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
    $("historyTable").innerHTML = rows.length ? `
      <table><thead><tr><th>Date</th><th>Item</th><th>Quantity</th><th>Total</th><th>Paid</th><th>Remaining</th><th>Status</th><th>Note</th><th>Action</th></tr></thead>
      <tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.purchase_date)}</td><td>${escapeHtml(row.item_name)}</td><td>${escapeHtml(row.quantity)} ${escapeHtml(row.unit)}</td><td>${money(row.total_amount)}</td><td>${money(row.paid_amount)}</td><td>${money(Number(row.total_amount)-Number(row.paid_amount))}</td><td>${entryStatus(row)}</td><td>${escapeHtml(row.note || "-")}</td><td><span class="row-actions"><button class="row-action" data-edit="${row.id}">Edit</button><button class="row-action danger" data-delete="${row.id}">Delete</button></span></td></tr>`).join("")}</tbody></table>
    ` : `<p class="empty">Is filter mein koi record nahi.</p>`;
    $("historyTable").querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => editEntry(button.dataset.edit)));
    $("historyTable").querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteEntry(button.dataset.delete)));
  }

  function editEntry(id) {
    const row = state.entries.find((entry) => entry.id === id);
    if (!row) return;
    $("entryId").value = row.id;
    $("purchaseDate").value = row.purchase_date;
    $("itemName").value = row.item_name;
    $("quantity").value = row.quantity;
    $("unit").value = row.unit;
    $("totalAmount").value = row.total_amount;
    $("paidAmount").value = row.paid_amount;
    $("note").value = row.note || "";
    updateRemaining();
    showView("entry");
  }

  async function deleteEntry(id) {
    if (!confirm("Ye record delete karna hai?")) return;
    try {
      await api(`store_entries?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", prefer: "return=minimal" });
      await refreshAll();
      toast("Record deleted");
    } catch (error) {
      console.error(error);
      toast("Delete failed");
    }
  }

  function dateRangeRows(fromId, toId) {
    const from = $(fromId).value;
    const to = $(toId).value;
    return state.entries.filter((row) => (!from || row.purchase_date >= from) && (!to || row.purchase_date <= to));
  }

  function renderBars(targetId, rows, field) {
    const target = $(targetId);
    const sorted = grouped(rows).sort((a, b) => b[field] - a[field]).slice(0, 10);
    const max = sorted[0]?.[field] || 1;
    target.innerHTML = sorted.map((item) => `<div class="bar-row"><strong>${escapeHtml(item.name)}</strong><div class="bar-track"><div class="bar-fill" style="width:${Math.max(3, item[field] / max * 100)}%"></div></div><span>${field === "spend" ? money(item[field]) : item[field]}</span></div>`).join("") || `<p class="empty">Data available nahi.</p>`;
  }

  function renderAnalytics() {
    const rows = dateRangeRows("analyticsFrom", "analyticsTo");
    renderBars("frequencyChart", rows, "count");
    renderBars("spendingChart", rows, "spend");
  }

  function renderItems() {
    $("itemList").innerHTML = state.items.map((item) => `<div class="item-chip"><span>${escapeHtml(item.name)}</span><button type="button" data-delete-item="${item.id}" aria-label="Delete ${escapeHtml(item.name)}">×</button></div>`).join("") || `<p class="empty">Items pehla purchase save karte hi yahan aa jayengi.</p>`;
    $("itemList").querySelectorAll("[data-delete-item]").forEach((button) => button.addEventListener("click", () => deleteItem(button.dataset.deleteItem)));
  }

  async function addItem(event) {
    event.preventDefault();
    const name = $("catalogueItemName").value.trim();
    if (!name) return;
    try {
      await ensureItem(name);
      $("catalogueItemName").value = "";
      renderItems();
      toast("Item added");
    } catch { toast("Item already exists ya save failed"); }
  }

  async function deleteItem(id) {
    if (!confirm("Item dropdown se remove karna hai? Purani history delete nahi hogi.")) return;
    try {
      await api(`store_items?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", prefer: "return=minimal" });
      await loadItems();
      renderItems();
      toast("Item removed");
    } catch { toast("Item remove failed"); }
  }

  function exportCsv() {
    const rows = filteredEntries();
    if (!rows.length) return toast("Export ke liye data nahi");
    const headers = ["Date","Item","Quantity","Unit","Total","Paid","Remaining","Status","Note"];
    const values = rows.map((row) => [row.purchase_date,row.item_name,row.quantity,row.unit,row.total_amount,row.paid_amount,Number(row.total_amount)-Number(row.paid_amount),entryStatus(row),row.note || ""]);
    const csv = [headers, ...values].map((line) => line.map((value) => `"${String(value).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `maqsood-karyana-history-${today()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function bindEvents() {
    $("loginForm").addEventListener("submit", login);
    $("showLoginPassword").addEventListener("click", () => {
      const input = $("loginPassword");
      input.type = input.type === "password" ? "text" : "password";
      $("showLoginPassword").textContent = input.type === "password" ? "Show" : "Hide";
    });
    $("logoutBtn").addEventListener("click", logout);
    document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
    document.querySelectorAll("[data-open-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.openView)));
    $("entryForm").addEventListener("submit", saveEntry);
    $("clearEntryBtn").addEventListener("click", clearEntry);
    $("totalAmount").addEventListener("input", updateRemaining);
    $("paidAmount").addEventListener("input", updateRemaining);
    ["filterFrom","filterTo","filterPayment","filterItem"].forEach((id) => $(id).addEventListener("change", renderHistory));
    $("showHistoryBtn").addEventListener("click", renderHistory);
    $("showAnalyticsBtn").addEventListener("click", renderAnalytics);
    $("exportCsvBtn").addEventListener("click", exportCsv);
    $("printBtn").addEventListener("click", () => window.print());
    $("itemForm").addEventListener("submit", addItem);
    $("ledgerForm").addEventListener("submit", saveLedger);
    document.querySelectorAll("[data-install-app]").forEach((button) => button.addEventListener("click", async () => {
      if (!state.deferredPrompt) return toast("Browser menu se Install App choose karein");
      state.deferredPrompt.prompt();
      await state.deferredPrompt.userChoice;
      state.deferredPrompt = null;
      updateInstallButtons();
    }));
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.deferredPrompt = event;
      updateInstallButtons();
    });
    window.addEventListener("appinstalled", () => {
      state.deferredPrompt = null;
      updateInstallButtons();
    });
  }

  function updateInstallButtons() {
    const installed = matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    document.querySelectorAll("[data-install-app]").forEach((button) => {
      button.classList.toggle("hidden", installed || !state.deferredPrompt);
    });
  }

  function init() {
    bindEvents();
    clearEntry();
    $("filterFrom").value = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    $("filterTo").value = today();
    $("analyticsFrom").value = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    $("analyticsTo").value = today();
    $("ledgerDate").value = today();
    updateInstallButtons();
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js?v=2").catch(console.error);
    restoreSession();
  }

  init();
})();
