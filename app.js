(() => {
  "use strict";

  const config = window.MAQSOOD_CONFIG || {};
  const FORCED_MODE = window.MAQSOOD_APP_MODE;
  const APP_MODE = FORCED_MODE === "admin" || (!FORCED_MODE && new URLSearchParams(location.search).get("mode") === "admin") ? "admin" : "user";
  const IS_ADMIN = APP_MODE === "admin";
  const SESSION_KEY = `maqsood-karyana-session-${APP_MODE}`;
  const PROFILE_KEY = "maqsood-karyana-profile";
  const OFFLINE_QUEUE_KEY = "maqsood-karyana-offline-drafts";
  const BACKUP_DUE_KEY = "maqsood-karyana-backup-due";
  const BACKUP_LAST_KEY = "maqsood-karyana-backup-last";
  const readStored = (key, fallback) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  };
  const state = {
    token: localStorage.getItem(SESSION_KEY) || "",
    profile: String(localStorage.getItem(PROFILE_KEY) || "").trim(),
    offlineDrafts: readStored(OFFLINE_QUEUE_KEY, []),
    items: [],
    entries: [],
    trash: [],
    activity: [],
    ledger: [],
    personalKhata: [],
    personalKhataFilter: "all",
    dataLoaded: false,
    deferredPrompt: null,
    syncing: false,
    dashboardDays: 30,
    dashboardFilter: { item: "", from: "", to: "" }
  };
  const BASIC_ITEMS = [
    "Aata", "Chawal", "Cheeni", "Daal Chana", "Daal Masoor", "Daal Moong",
    "Daal Mash", "Daal Arhar", "Besan", "Suji", "Maida", "Namak",
    "Laal Mirch", "Kali Mirch", "Haldi", "Dhania Powder", "Zeera",
    "Garam Masala", "Biryani Masala", "Qorma Masala", "Chaat Masala",
    "Cooking Oil", "Ghee", "Chai Patti", "Doodh", "Dahi", "Anday",
    "Bread", "Biscuit", "Rusk", "Noodles", "Jam", "Ketchup", "Achar",
    "Cold Drink", "Juice", "Mineral Water", "Rooh Afza", "Lays", "Nimko",
    "Soap", "Shampoo", "Toothpaste", "Toothbrush", "Washing Powder",
    "Dishwash", "Floor Cleaner", "Toilet Cleaner", "Bleach", "Phenyl",
    "Tissue Paper", "Toilet Roll", "Garbage Bags", "Match Box",
    "Mosquito Coil", "Neel", "Pyaaz", "Aloo", "Tamatar", "Lehsan",
    "Adrak", "Hari Mirch", "Lemon", "Sabzi", "Chicken", "Beef",
    "Mutton", "Fish"
    , "Hair Color", "Rusk", "Jam", "Ketchup", "Achar", "Juice", "Mineral Water", "Rooh Afza", "Potato Chips", "Nimko", "Shampoo", "Toothpaste", "Toothbrush", "Dishwash", "Floor Cleaner", "Toilet Cleaner", "Bleach", "Phenyl", "Tissue Paper", "Toilet Roll", "Garbage Bags", "Match Box", "Mosquito Coil", "Neel", "Laundry Detergent", "Diapers", "Sanitary Pads", "Razor", "Shaving Cream", "Handwash", "Batteries", "LED Bulb", "Broom"
  ];
  const CHART_COLORS = ["#176b45", "#d38b26", "#3a7ca5", "#8e5ea2", "#cf5c5c"];
  const QUICK_SPRITE_ITEMS = ["chawal","cold drink","sabzi","aloo","soap","ghee","sabzi masala","pyaaz","cheeni","washing powder","cheez","doodh","haldi","chai patti","chaina namak","cooking oil","masala","besan"];
  const CORE_SPRITE_ITEMS = ["aata","chawal","cheeni","daal chana","daal masoor","daal moong","daal mash","daal arhar","besan","suji","maida","namak","laal mirch","kali mirch","haldi","dhania powder","zeera","garam masala","cooking oil","ghee","chai patti","doodh","dahi","anday","bread","biscuit","pyaaz","aloo","tamatar","lehsan","adrak","lemon","chicken","beef","fish","soap"];
  const HOUSEHOLD_SPRITE_ITEMS = ["noodles","hair color","rusk","jam","ketchup","achar","juice","mineral water","rooh afza","potato chips","nimko","shampoo","toothpaste","toothbrush","dishwash","floor cleaner","toilet cleaner","bleach","phenyl","tissue paper","toilet roll","garbage bags","match box","mosquito coil","neel","hari mirch","mutton","laundry detergent","diapers","sanitary pads","razor","shaving cream","handwash","batteries","led bulb","broom"];
  const $ = (id) => document.getElementById(id);
  const configured = /^https:\/\//.test(config.supabaseUrl || "") && !String(config.supabaseAnonKey || "").startsWith("YOUR_");
  const money = (value) => `Rs ${Number(value || 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date());
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const clientRef = () => crypto.randomUUID?.() || `draft-${Date.now()}-${Math.random().toString(16).slice(2)}`;

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
    updateProfileUi();
    renderOfflineDrafts();
    applyModeUi();
  }

  function applyModeUi() {
    document.body.classList.toggle("admin-mode", IS_ADMIN); document.body.classList.toggle("simple-mode", !IS_ADMIN);
    document.querySelectorAll("[data-admin-only]").forEach((element) => element.classList.toggle("hidden", !IS_ADMIN));
    const name = IS_ADMIN ? "ADMIN Maqsood Karyana Store" : "Maqsood Karyana Store";
    document.title = name; $("loginAppTitle").textContent = name; $("headerAppTitle").textContent = name;
    if (IS_ADMIN && !FORCED_MODE) document.querySelector('link[rel="manifest"]').href = "manifest-admin.webmanifest?v=17";
    if (!IS_ADMIN && !$('appScreen').classList.contains('hidden')) showView("entry");
  }

  function showLogin() {
    $("appScreen").classList.add("hidden");
    $("loginScreen").classList.remove("hidden");
  }

  async function login(event) {
    event.preventDefault();
    if (!configured) return $("setupMessage").classList.remove("hidden");
    try {
      const result = await api("rpc/store_login_role", { method: "POST", body: JSON.stringify({ input_password: $("loginPassword").value, input_role: APP_MODE }) });
      if (!result?.authenticated) return toast("Wrong password");
      state.token = result.session_token;
      localStorage.setItem(SESSION_KEY, state.token);
      $("loginPassword").value = "";
      showApp();
      ensureProfile();
      await refreshAll();
      await syncOfflineDrafts();
    } catch (error) {
      console.error(error);
      toast("Login failed. Supabase SQL aur config check karein.");
    }
  }

  async function restoreSession() {
    if (!configured || !state.token) return showLogin();
    if (!navigator.onLine) {
      showApp();
      ensureProfile();
      toast("Offline mode: nayi entries draft mein save hongi");
      return;
    }
    try {
      const result = await api("rpc/store_restore_session_role", { method: "POST", body: JSON.stringify({ expected_role: APP_MODE }) });
      if (!result?.authenticated) throw new Error("Expired");
      showApp();
      ensureProfile();
      await refreshAll();
      await syncOfflineDrafts();
    } catch {
      state.token = "";
      localStorage.removeItem(SESSION_KEY);
      showLogin();
    }
  }

  function updateProfileUi() {
    const name = state.profile || "Profile";
    $("profileName").textContent = name;
    $("profileInitial").textContent = name.charAt(0).toUpperCase() || "?";
    $("profileModalInitial").textContent = name.charAt(0).toUpperCase() || "?";
  }

  function ensureProfile(force = false) {
    $("deviceProfileName").value = state.profile;
    $("cancelProfileBtn").classList.toggle("hidden", !state.profile);
    $("profileModal").classList.toggle("hidden", Boolean(state.profile) && !force);
    updateProfileUi();
  }

  function saveProfile(event) {
    event.preventDefault();
    const name = $("deviceProfileName").value.trim();
    if (!name) return;
    state.profile = name;
    localStorage.setItem(PROFILE_KEY, name);
    $("profileModal").classList.add("hidden");
    updateProfileUi();
    renderDashboard();
    toast("Profile save ho gayi");
  }

  async function logout() {
    try { if (state.token) await api("rpc/store_logout", { method: "POST", body: "{}" }); } catch {}
    state.token = "";
    localStorage.removeItem(SESSION_KEY);
    showLogin();
  }

  function showView(name) {
    if (!IS_ADMIN && ["dashboard", "analytics", "activity"].includes(name)) name = "entry";
    document.querySelectorAll(".view").forEach((view) => view.classList.toggle("hidden", view.id !== `${name}View`));
    document.querySelectorAll(".nav-button[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (name === "history") renderHistory();
    if (name === "analytics") renderAnalytics();
    if (name === "items") renderItems();
    if (name === "khata") renderPersonalKhata();
    if (name === "activity" && IS_ADMIN) renderActivity();
  }

  async function loadItems() {
    state.items = await api("store_items?select=*&order=name.asc") || [];
    const options = [...new Set(
      [...BASIC_ITEMS, ...state.items.map((item) => item.name)]
        .map(normalizedItemName)
        .filter(Boolean)
    )]
      .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    $("itemOptions").innerHTML = options.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("");
  }

  async function loadEntries() {
    if (IS_ADMIN) { const cutoff = new Date(Date.now() - 30 * 86400000).toISOString(); await api(`store_entries?deleted_at=lt.${encodeURIComponent(cutoff)}`, { method: "DELETE", prefer: "return=minimal" }); }
    state.entries = await api("store_entries?deleted_at=is.null&select=*&order=purchase_date.desc,created_at.desc") || [];
    state.trash = IS_ADMIN ? await api("store_entries?deleted_at=not.is.null&select=*&order=deleted_at.desc") || [] : [];
    state.entries ||= []; state.trash ||= [];
    state.dataLoaded = true;
  }

  async function loadLedger() {
    state.ledger = IS_ADMIN ? await api("store_ledger?select=*&order=entry_date.desc,created_at.desc") || [] : [];
  }

  async function loadPersonalKhata() {
    state.personalKhata = await api("personal_khata_entries?select=*&order=entry_at.desc,created_at.desc") || [];
  }

  async function loadActivity() { state.activity = IS_ADMIN ? await api("store_audit?select=*&order=occurred_at.desc&limit=500") || [] : []; }

  async function refreshAll() {
    await Promise.all([loadItems(), loadEntries(), loadLedger(), loadPersonalKhata(), loadActivity()]);
    renderDashboard();
    renderHistory();
    renderAnalytics();
    renderItems();
    renderPersonalKhata();
    renderQuickItems();
    if (IS_ADMIN) { renderTrash(); renderActivity(); }
    runAutoBackup();
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
      const key = normalizedItemName(row.item_name);
      const item = map.get(key) || { name: key, count: 0, spend: 0 };
      item.count += 1;
      item.spend += Number(row.total_amount || 0);
      map.set(key, item);
    });
    return [...map.values()];
  }

  function normalizedItemName(value) {
    const original = String(value || "").trim();
    const key = original.toLowerCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim();
    const aliases = [
      [/^(1 kilo ghee|adha kilo desi ghee|ghee(?: \d+ kilo)?)$/, "Ghee"],
      [/^(patti|chai patti|patti \d+ kilo)$/, "Chai Patti"],
      [/^chawal(?: \d+ kilo)?$/, "Chawal"],
      [/^(bottle|bottle \d+ lit(?:er|re)|bottle sprite|bottle dew|bottle juice wali)$/, "Cold Drink"],
      [/^(saban|soap)$/, "Soap"],
      [/^(saban bartan wala|dishwash)$/, "Dishwash"],
      [/^(surf|surf packet|washing powder)$/, "Washing Powder"],
      [/^(aalo|aloo)$/, "Aloo"],
      [/^(payaaz|pyaaz|piyaz)$/, "Pyaaz"],
      [/^(tamater|tamatar)$/, "Tamatar"],
      [/^(nembo|lemon)$/, "Lemon"],
      [/^(nemko|nimko)$/, "Nimko"],
      [/^(basin|besan|basin adh kilo)$/, "Besan"],
      [/^(cheeni|sugar)(?: \d+ kilo)?$/, "Cheeni"],
      [/^(anda|anda \d+|anday(?: \d+)?)$/, "Anday"],
      [/^(tel|oil|cooking oil)$/, "Cooking Oil"],
      [/^sabzi(?: \d+ kilo)?$/, "Sabzi"],
      [/^(dahi|adha kilo dahi)$/, "Dahi"],
      [/^(chana masala|chaina masala)$/, "Chana Masala"],
      [/^(sawinya|seviyan)$/, "Seviyan"]
      , [/^(china namak|chaina namak)$/, "Chaina namak"]
      , [/^(baleech|bleech|bleach)$/, "Bleach"]
      , [/^(color tub|colour tub|hair color|hair colour)$/, "Hair Color"]
    ];
    const match = aliases.find(([pattern]) => pattern.test(key));
    return match ? match[1] : original;
  }

  function renderDashboard() {
    const todayRows = state.entries.filter((row) => row.purchase_date === today());
    const todayTotals = totals(todayRows);
    $("todayTotal").textContent = money(todayTotals.total);
    $("todayCount").textContent = todayRows.length;
    $("headerTodayTotal").textContent = money(todayTotals.total);
    $("headerTodayCount").textContent = `${todayRows.length} items`;
    $("todayEnteredBy").textContent = [...new Set(todayRows.map((row) => row.entered_by).filter(Boolean))].join(", ") || "-";
    $("offlineDraftCount").textContent = state.offlineDrafts.length;
    const groups = grouped(state.entries);
    const frequent = [...groups].sort((a, b) => b.count - a.count)[0];
    const spending = [...groups].sort((a, b) => b.spend - a.spend)[0];
    $("topFrequent").textContent = frequent ? `${frequent.name} (${frequent.count} times)` : "-";
    $("topSpending").textContent = spending ? `${spending.name} - ${money(spending.spend)}` : "-";
    const allTotals = totals(state.entries);
    renderLedger(allTotals);
    renderVisualDashboard();
    $("recentList").innerHTML = state.entries.slice(0, 6).map((row) => `
      <div class="record-row"><div><strong>${escapeHtml(row.item_name)}</strong><span>${escapeHtml(row.purchase_date)} · ${escapeHtml(row.entered_by || "Purana record")}</span></div><strong>${money(row.total_amount)}</strong></div>
    `).join("") || `<p class="empty">Abhi koi record nahi.</p>`;
    renderOfflineDrafts();
    renderMonthlySummary();
  }

  function renderMonthlySummary() {
    const now = today(); const month = now.slice(0, 7);
    const cursor = new Date(`${month}-15T12:00:00`); cursor.setMonth(cursor.getMonth() - 1);
    const previous = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", timeZone: "Asia/Karachi" }).format(cursor).slice(0, 7);
    const currentRows = state.entries.filter((row) => row.purchase_date.startsWith(month));
    const previousRows = state.entries.filter((row) => row.purchase_date.startsWith(previous));
    const currentTotal = totals(currentRows).total, previousTotal = totals(previousRows).total;
    const change = previousTotal ? (currentTotal - previousTotal) / previousTotal * 100 : null;
    $("monthlySummaryTitle").textContent = new Intl.DateTimeFormat("en-PK", { month: "long", year: "numeric", timeZone: "Asia/Karachi" }).format(new Date());
    $("monthlySummary").innerHTML = `<div><span>Total kharcha</span><strong>${money(currentTotal)}</strong></div><div><span>Entries</span><strong>${currentRows.length}</strong></div><div><span>Previous month</span><strong>${money(previousTotal)}</strong></div><div><span>Comparison</span><strong class="${change !== null && change > 0 ? "negative" : "positive"}">${change === null ? "Data nahi" : `${change >= 0 ? "↑" : "↓"} ${Math.abs(change).toFixed(1)}%`}</strong></div>`;
  }

  function dateOffset(days) {
    const value = new Date();
    value.setDate(value.getDate() + days);
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(value);
  }

  function renderVisualDashboard() {
    const allMode = state.dashboardDays === "all";
    const oldestDate = state.entries.reduce((oldest, row) => !oldest || row.purchase_date < oldest ? row.purchase_date : oldest, today());
    const startDate = allMode ? oldestDate : dateOffset(-(Number(state.dashboardDays) - 1));
    const periodDays = allMode ? Math.max(1, Math.round((new Date(`${today()}T12:00:00`) - new Date(`${startDate}T12:00:00`)) / 86400000) + 1) : Number(state.dashboardDays);
    const currentRows = state.entries.filter((row) => row.purchase_date >= startDate && row.purchase_date <= today());
    const previousStart = dateOffset(-(periodDays * 2 - 1));
    const previousEnd = dateOffset(-periodDays);
    const previousRows = allMode ? [] : state.entries.filter((row) => row.purchase_date >= previousStart && row.purchase_date <= previousEnd);
    const bucketSize = periodDays > 120 ? 30 : periodDays > 45 ? 7 : 1;
    const bucketCount = Math.ceil(periodDays / bucketSize);
    const daily = Array.from({ length: bucketCount }, (_, index) => {
      const bucketStartOffset = -(periodDays - 1) + index * bucketSize;
      const bucketEndOffset = Math.min(0, bucketStartOffset + bucketSize - 1);
      const from = dateOffset(bucketStartOffset), to = dateOffset(bucketEndOffset);
      return { date: from, label: bucketSize === 1 ? from : `${from.slice(5)}–${to.slice(5)}`, value: totals(currentRows.filter((row) => row.purchase_date >= from && row.purchase_date <= to)).total };
    });
    const maximum = Math.max(...daily.map((point) => point.value), 1);
    const width = 720, height = 210;
    const divisor = Math.max(1, daily.length - 1);
    const chartPoints = daily.map((point, index) => ({ ...point, x: (index / divisor) * width, y: height - (point.value / maximum) * (height - 28) - 8 }));
    const points = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");
    $("spendingTrendChart").innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Dynamic spending line chart"><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#176b45" stop-opacity=".28"/><stop offset="1" stop-color="#176b45" stop-opacity=".02"/></linearGradient></defs><line x1="0" y1="${height - 1}" x2="${width}" y2="${height - 1}" class="chart-axis"/><polygon points="0,${height} ${points} ${width},${height}" fill="url(#trendFill)"/><polyline points="${points}" class="trend-line"/>${chartPoints.map((point, index) => `<circle class="trend-point" cx="${point.x}" cy="${point.y}" r="7" tabindex="0" data-point="${index}" aria-label="${escapeHtml(point.label)} ${money(point.value)}"></circle>`).join("")}</svg><div class="chart-labels"><span>${daily[0]?.label || startDate}</span><span>Aaj</span></div>`;
    $("spendingTrendChart").querySelectorAll("[data-point]").forEach((point) => {
      const show = () => { const data = chartPoints[Number(point.dataset.point)]; $("chartTooltip").innerHTML = `<strong>${escapeHtml(data.label)}</strong><span>${money(data.value)}</span>`; $("chartTooltip").classList.remove("hidden"); };
      point.addEventListener("mouseenter", show); point.addEventListener("focus", show); point.addEventListener("click", show);
      point.addEventListener("click", () => { const data = chartPoints[Number(point.dataset.point)]; const endOffset = Math.min(0, -(periodDays - 1) + Number(point.dataset.point) * bucketSize + bucketSize - 1); state.dashboardFilter.from = data.date; state.dashboardFilter.to = bucketSize === 1 ? data.date : dateOffset(endOffset); renderDashboardDrilldown(); });
      point.addEventListener("mouseleave", () => $("chartTooltip").classList.add("hidden")); point.addEventListener("blur", () => $("chartTooltip").classList.add("hidden"));
    });
    const currentTotal = totals(currentRows).total, previousTotal = totals(previousRows).total;
    const change = previousTotal ? ((currentTotal - previousTotal) / previousTotal) * 100 : null;
    $("trendTotal").textContent = money(currentTotal);
    $("trendTitle").textContent = allMode ? "All-time spending" : `Last ${periodDays} days spending`;
    $("trendComparison").innerHTML = allMode ? `<span class="neutral">${currentRows.length} total entries · ${startDate} se aaj tak</span>` : change === null ? `<span class="neutral">Is period ke comparison ke liye mazeed data chahiye</span>` : `<span class="${change <= 0 ? "positive" : "negative"}">${change >= 0 ? "↑" : "↓"} ${Math.abs(change).toFixed(1)}%</span> previous ${periodDays} days ke muqablay mein`;
    const top = grouped(currentRows).sort((a, b) => b.spend - a.spend).slice(0, 5);
    const topTotal = top.reduce((sum, item) => sum + item.spend, 0) || 1;
    let cursor = 0;
    const stops = top.map((item, index) => { const start = cursor; cursor += item.spend / topTotal * 100; return `${CHART_COLORS[index]} ${start}% ${cursor}%`; }).join(", ");
    $("dashboardTopItems").innerHTML = top.length ? `<div class="donut" style="background:conic-gradient(${stops})"><span>${top.length}<small>items</small></span></div><div class="donut-legend">${top.map((item, index) => `<button type="button" data-dashboard-item="${escapeHtml(item.name)}" class="${state.dashboardFilter.item === item.name ? "selected" : ""}"><i style="background:${CHART_COLORS[index]}"></i><span>${escapeHtml(item.name)}</span><strong>${money(item.spend)}</strong></button>`).join("")}</div>` : `<p class="empty">Graph ke liye data available nahi.</p>`;
    $("dashboardTopItems").querySelectorAll("[data-dashboard-item]").forEach((button) => button.addEventListener("click", () => { state.dashboardFilter.item = state.dashboardFilter.item === button.dataset.dashboardItem ? "" : button.dataset.dashboardItem; renderVisualDashboard(); }));
    document.querySelectorAll("[data-dashboard-days]").forEach((button) => button.classList.toggle("active", String(state.dashboardDays) === button.dataset.dashboardDays));
    renderDashboardDrilldown();
  }

  function renderDashboardDrilldown() {
    const filter = state.dashboardFilter;
    const active = Boolean(filter.item || filter.from || filter.to);
    $("clearDashboardFilter").classList.toggle("hidden", !active);
    if (!active) { $("drilldownTitle").textContent = "Graph ya item par click karke insight dekhein"; $("drilldownStats").innerHTML = `<p class="empty">Trend point ya Top Saman item select karain.</p>`; $("drilldownRecords").innerHTML = ""; return; }
    const rows = state.entries.filter((row) => (!filter.item || normalizedItemName(row.item_name) === filter.item) && (!filter.from || row.purchase_date >= filter.from) && (!filter.to || row.purchase_date <= filter.to));
    const sum = totals(rows).total, average = rows.length ? sum / rows.length : 0;
    $("drilldownTitle").textContent = [filter.item, filter.from ? (filter.from === filter.to ? filter.from : `${filter.from} to ${filter.to}`) : ""].filter(Boolean).join(" · ");
    $("drilldownStats").innerHTML = `<div><span>Matching entries</span><strong>${rows.length}</strong></div><div><span>Total spend</span><strong>${money(sum)}</strong></div><div><span>Average entry</span><strong>${money(average)}</strong></div><div><span>Highest entry</span><strong>${money(Math.max(0, ...rows.map((row) => Number(row.total_amount))))}</strong></div>`;
    $("drilldownRecords").innerHTML = rows.slice(0, 8).map((row) => `<button type="button" data-drill-entry="${row.id}"><span>${escapeHtml(row.purchase_date)}</span><strong>${escapeHtml(row.item_name)}</strong><b>${money(row.total_amount)}</b></button>`).join("") || `<p class="empty">Is selection mein record nahi.</p>`;
    $("drilldownRecords").querySelectorAll("[data-drill-entry]").forEach((button) => button.addEventListener("click", () => { const row = state.entries.find((entry) => entry.id === button.dataset.drillEntry); if (!row) return; $("filterFrom").value = row.purchase_date; $("filterTo").value = row.purchase_date; $("filterItem").value = normalizedItemName(row.item_name); showView("history"); }));
  }

  function persistOfflineDrafts() {
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(state.offlineDrafts));
    renderOfflineDrafts();
  }

  function renderOfflineDrafts() {
    if (!$("offlineDraftPanel")) return;
    const count = state.offlineDrafts.length;
    $("offlineDraftPanel").classList.toggle("hidden", count === 0);
    $("offlineBadge").classList.toggle("hidden", navigator.onLine && count === 0);
    $("offlineBadge").textContent = navigator.onLine ? `${count} drafts` : `Offline · ${count} drafts`;
    $("offlineDraftCount").textContent = count;
    $("offlineDraftList").innerHTML = state.offlineDrafts.map((row) => `
      <div class="record-row">
        <div><strong>${escapeHtml(row.item_name)}</strong><span>${escapeHtml(row.purchase_date)} · ${escapeHtml(row.entered_by)}</span></div>
        <div class="draft-end"><strong>${money(row.total_amount)}</strong><button class="row-action danger" data-delete-draft="${row.local_id}">Delete</button></div>
      </div>`).join("");
    $("offlineDraftList").querySelectorAll("[data-delete-draft]").forEach((button) => button.addEventListener("click", () => {
      state.offlineDrafts = state.offlineDrafts.filter((row) => row.local_id !== button.dataset.deleteDraft);
      persistOfflineDrafts();
      renderDashboard();
    }));
  }

  function queueOfflineEntry(row) {
    state.offlineDrafts.push({ ...row, local_id: clientRef() });
    persistOfflineDrafts();
    clearEntry();
    showView("dashboard");
    renderDashboard();
    scheduleAutoBackup();
    toast("Internet nahi. Entry offline draft mein save ho gayi.");
  }

  async function syncOfflineDrafts() {
    if (!navigator.onLine || !state.token || state.syncing || !state.offlineDrafts.length) return;
    state.syncing = true;
    const pending = [...state.offlineDrafts];
    for (const row of pending) {
      try {
        const item = await ensureItem(row.item_name);
        const body = { ...row, item_id: item?.id || null };
        delete body.local_id;
        await api("store_entries?on_conflict=client_ref", {
          method: "POST",
          body: JSON.stringify(body),
          prefer: "resolution=merge-duplicates,return=minimal"
        });
        state.offlineDrafts = state.offlineDrafts.filter((draft) => draft.local_id !== row.local_id);
        persistOfflineDrafts();
      } catch (error) {
        console.error("Draft sync failed", error);
        break;
      }
    }
    state.syncing = false;
    if (state.offlineDrafts.length === 0) {
      await refreshAll();
      toast("Offline entries sync ho gayi hain");
    } else {
      renderOfflineDrafts();
      toast("Kuch drafts sync nahi ho sake. Updated SQL check karein.");
    }
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
    const oldTotal = totals(oldRows).total;
    const newTotal = totals(newRows).total;
    const purchasesTotal = oldTotal + newTotal;
    const openingTotal = ledger.opening + ledger.adjustments;
    const remaining = ledger.opening + ledger.adjustments + allTotals.total - allTotals.paid - ledger.payments;
    $("openingBalance").textContent = money(openingTotal);
    $("oldRegisterTotal").textContent = money(oldTotal);
    $("newPurchasesTotal").textContent = money(newTotal);
    $("combinedPurchasesTotal").textContent = money(purchasesTotal);
    $("grossAccountTotal").textContent = money(openingTotal + purchasesTotal);
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
    const auditAmount = Number($("ledgerAmount").value || 0), auditType = $("ledgerType").value;
    try {
      if ($("ledgerType").value === "opening_balance") {
        await api("store_ledger?entry_type=eq.opening_balance", { method: "DELETE", prefer: "return=minimal" });
      }
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
      await logActivity("khata_save", "ledger", null, { type: auditType, amount: auditAmount });
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
      await logActivity("khata_delete", "ledger", id, {});
      await loadLedger();
      renderDashboard();
      toast("Khata entry deleted");
    } catch { toast("Delete failed"); }
  }

  function pakistanDateTime(value) {
    return new Intl.DateTimeFormat("en-PK", { weekday: "long", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" }).format(new Date(value));
  }

  function pakistanDateTimeInput(value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
    const get = (type) => parts.find((part) => part.type === type)?.value || "00";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  }

  function personalKhataTotals() {
    return state.personalKhata.reduce((acc, row) => {
      const amount = Number(row.amount || 0);
      if (row.entry_type === "returned") acc.returned += amount;
      else acc.borrowed += amount;
      return acc;
    }, { borrowed: 0, returned: 0 });
  }

  function resetPersonalKhataForm() {
    if (!IS_ADMIN) return;
    $("personalKhataForm").reset();
    $("personalKhataId").value = "";
    $("personalKhataDateTime").value = pakistanDateTimeInput();
    $("personalKhataType").value = "borrowed";
    $("personalKhataSaveBtn").textContent = "Khata mein add karein";
    $("cancelPersonalKhataEdit").classList.add("hidden");
  }

  function renderPersonalKhata() {
    const totals = personalKhataTotals();
    const outstanding = totals.borrowed - totals.returned;
    $("personalKhataBorrowed").textContent = money(totals.borrowed);
    $("personalKhataReturned").textContent = money(totals.returned);
    $("personalKhataOutstanding").textContent = money(Math.abs(outstanding));
    $("personalKhataOutstandingLabel").textContent = outstanding >= 0 ? "Aap ko wapas lena hai" : "Aap ko wapas karna hai";
    document.querySelectorAll("[data-personal-khata-filter]").forEach((button) => button.classList.toggle("active", button.dataset.personalKhataFilter === state.personalKhataFilter));
    const rows = state.personalKhata.filter((row) => state.personalKhataFilter === "all" || row.entry_type === state.personalKhataFilter);
    $("personalKhataList").innerHTML = rows.length ? rows.map((row) => {
      const taken = row.entry_type !== "returned";
      return `<article class="personal-khata-row ${taken ? "taken" : "returned"}">
        <div class="khata-row-icon">${taken ? "↑" : "↓"}</div>
        <div class="khata-row-main"><div class="khata-row-title"><strong>${escapeHtml(row.person_name)}</strong><span class="khata-badge ${taken ? "taken" : "returned"}">${taken ? "Aap se liye" : "Wapas kiye"}</span></div><span>${escapeHtml(row.note || "Koi note nahi")}</span><small>${pakistanDateTime(row.entry_at)}</small></div>
        <div class="khata-row-end"><strong>${taken ? "+" : "−"}${money(row.amount)}</strong>${IS_ADMIN ? `<div><button class="row-action" data-edit-personal-khata="${row.id}">Edit</button><button class="row-action danger" data-delete-personal-khata="${row.id}">Remove</button></div>` : ""}</div>
      </article>`;
    }).join("") : `<p class="empty">Is filter mein koi khata entry nahi.</p>`;
    if (IS_ADMIN) {
      $("personalKhataList").querySelectorAll("[data-edit-personal-khata]").forEach((button) => button.addEventListener("click", () => editPersonalKhata(button.dataset.editPersonalKhata)));
      $("personalKhataList").querySelectorAll("[data-delete-personal-khata]").forEach((button) => button.addEventListener("click", () => deletePersonalKhata(button.dataset.deletePersonalKhata)));
    }
  }

  async function savePersonalKhata(event) {
    event.preventDefault();
    const id = $("personalKhataId").value;
    const personName = $("personalKhataPerson").value.trim();
    const amount = Number($("personalKhataAmount").value || 0);
    const localDateTime = $("personalKhataDateTime").value;
    if (!personName || amount <= 0 || !localDateTime) return toast("Naam, amount aur date/time zaroori hai");
    const body = { person_name: personName, amount, entry_type: $("personalKhataType").value, note: $("personalKhataNote").value.trim(), entry_at: new Date(`${localDateTime}:00+05:00`).toISOString(), updated_by: state.profile || "Admin", updated_at: new Date().toISOString() };
    try {
      if (id) await api(`personal_khata_entries?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(body), prefer: "return=minimal" });
      else await api("personal_khata_entries", { method: "POST", body: JSON.stringify({ ...body, created_by: state.profile || "Admin" }), prefer: "return=minimal" });
      await logActivity(id ? "personal_khata_edit" : "personal_khata_add", "personal_khata", id || null, { person: personName, amount, type: body.entry_type });
      await loadPersonalKhata();
      resetPersonalKhataForm();
      renderPersonalKhata();
      toast(id ? "Khata entry update ho gayi" : "Khata entry add ho gayi");
    } catch (error) { console.error(error); toast("Khata save failed. New SQL migration run karein."); }
  }

  function editPersonalKhata(id) {
    const row = state.personalKhata.find((entry) => entry.id === id);
    if (!row || !IS_ADMIN) return;
    $("personalKhataId").value = row.id;
    $("personalKhataPerson").value = row.person_name;
    $("personalKhataAmount").value = row.amount;
    $("personalKhataType").value = row.entry_type;
    $("personalKhataNote").value = row.note || "";
    $("personalKhataDateTime").value = pakistanDateTimeInput(row.entry_at);
    $("personalKhataSaveBtn").textContent = "Changes save karein";
    $("cancelPersonalKhataEdit").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deletePersonalKhata(id) {
    const row = state.personalKhata.find((entry) => entry.id === id);
    if (!row || !confirm(`Remove khata entry?\n\n${row.person_name} · ${money(row.amount)}\n\nYe action undo nahi hoga.`)) return;
    try {
      await api(`personal_khata_entries?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", prefer: "return=minimal" });
      await logActivity("personal_khata_delete", "personal_khata", id, { person: row.person_name, amount: row.amount, type: row.entry_type });
      await loadPersonalKhata();
      renderPersonalKhata();
      toast("Khata entry remove ho gayi");
    } catch (error) { console.error(error); toast("Khata remove failed"); }
  }

  function updateRemaining() {
    const amount = Math.max(0, Number($("totalAmount").value || 0) - Number($("paidAmount").value || 0));
    $("remainingAmount").value = money(amount);
  }

  async function ensureItem(name) {
    const canonicalName = normalizedItemName(name);
    const existing = state.items.find((item) => normalizedItemName(item.name).toLowerCase() === canonicalName.toLowerCase());
    if (existing) return existing;
    const result = await api("store_items", { method: "POST", body: JSON.stringify({ name: canonicalName }), headers: { Prefer: "return=representation,resolution=merge-duplicates" } });
    await loadItems();
    return result?.[0] || state.items.find((item) => item.name.toLowerCase() === canonicalName.toLowerCase());
  }

  function confirmEntrySave({ id, name, total, purchaseDate }) {
    const allRecords = [...state.entries, ...state.offlineDrafts];
    const duplicate = !id && allRecords.some((row) =>
      row.purchase_date === purchaseDate &&
      normalizedItemName(row.item_name).toLowerCase() === name.toLowerCase() &&
      Number(row.total_amount) === total
    );
    const messages = [];
    if (total > 1000) {
      messages.push(`Bari amount warning: ${money(total)} Rs 1,000 se zyada hai. Amount dobara check karein.`);
    }
    if (duplicate) {
      messages.push("Duplicate warning: isi date par same item aur same amount pehle se mojood hai.");
    }
    messages.push(`${id ? "Record update" : "Naya record"}:\nDate: ${purchaseDate}\nItem: ${name}\nAmount: ${money(total)}\n\nKya ye details bilkul theek hain?`);
    return window.confirm(messages.join("\n\n"));
  }

  async function saveEntry(event) {
    event.preventDefault();
    const name = normalizedItemName($("itemName").value);
    const total = Number($("totalAmount").value || 0);
    const paid = Number($("paidAmount").value || 0);
    if (!name) return toast("Item name required");
    if (total <= 0) return toast("Total amount 0 se zyada hona chahiye");
    if (paid > total) return toast("Paid amount total se zyada nahi ho sakta");
    if (!state.profile) {
      ensureProfile(true);
      return toast("Pehle apna naam save karein");
    }
    const id = $("entryId").value;
    if (id && !navigator.onLine) return toast("Purana record edit karne ke liye internet chahiye");
    const purchaseDate = id ? $("purchaseDate").value : today();
    if (!confirmEntrySave({ id, name, total, purchaseDate })) return;
    const existing = id ? state.entries.find((row) => row.id === id) : null;
    const baseRow = {
      purchase_date: purchaseDate,
      item_name: name,
      quantity: existing?.quantity || 1,
      unit: existing?.unit || "Other",
      total_amount: total,
      paid_amount: existing?.paid_amount || 0,
      note: existing?.note || "",
      source_group: existing?.source_group || "daily"
    };
    if (!id) {
      baseRow.entered_by = state.profile;
      baseRow.client_ref = clientRef();
      baseRow.entered_at = new Date().toISOString();
    } else baseRow.modified_by = state.profile;
    if (!navigator.onLine) return queueOfflineEntry(baseRow);
    try {
      const item = await ensureItem(name);
      const row = {
        ...baseRow,
        item_id: item?.id || null,
      };
      await api(id ? `store_entries?id=eq.${encodeURIComponent(id)}` : "store_entries", { method: id ? "PATCH" : "POST", body: JSON.stringify(row), prefer: "return=minimal" });
      if (id) await logActivity("entry_edit", "purchase", id, { item: name, amount: total, date: purchaseDate });
      clearEntry();
      await refreshAll();
      showView("dashboard");
      toast(id ? "Record updated" : "Saman save ho gaya");
      scheduleAutoBackup();
    } catch (error) {
      console.error(error);
      if (!id && (error instanceof TypeError || !navigator.onLine)) return queueOfflineEntry(baseRow);
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

  function itemImageUrl(name) {
    const slug = normalizedItemName(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `item-images/${slug || "grocery"}.jpg`;
  }

  function quickSpriteStyle(name) {
    const originalKey = normalizedItemName(name).toLowerCase();
    const key = /masala/.test(originalKey) ? (originalKey.includes("sabzi") ? "sabzi masala" : "masala") : /namak|salt/.test(originalKey) ? "chaina namak" : /cold|drink|cola|sprite|dew/.test(originalKey) ? "cold drink" : /washing|detergent|surf/.test(originalKey) ? "laundry detergent" : /tissue/.test(originalKey) ? "tissue paper" : /noodle/.test(originalKey) ? "noodles" : originalKey;
    let index = QUICK_SPRITE_ITEMS.indexOf(key);
    if (index >= 0) { const column = index % 6, row = Math.floor(index / 6); return `background-image:url('grocery-quick-items-v12.jpg');background-size:600% 300%;background-position:${column * 20}% ${row * 50}%`; }
    index = CORE_SPRITE_ITEMS.indexOf(key);
    if (index >= 0) { const column = index % 6, row = Math.floor(index / 6); return `background-image:url('grocery-core-items-v12.png');background-size:600% 600%;background-position:${column * 20}% ${row * 20}%`; }
    index = HOUSEHOLD_SPRITE_ITEMS.indexOf(key);
    if (index < 0) return "";
    const column = index % 6, row = Math.floor(index / 6);
    return `background-image:url('grocery-household-items-v13.png');background-size:600% 600%;background-position:${column * 20}% ${row * 20}%`;
  }

  function renderQuickItems() {
    const frequentNames = grouped(state.entries).sort((a, b) => b.count - a.count).map((item) => item.name);
    const names = [...new Set([...frequentNames, ...state.items.map((item) => normalizedItemName(item.name)), ...BASIC_ITEMS])];
    $("quickItemGallery").innerHTML = names.map((name) => { const sprite = quickSpriteStyle(name); return `<button class="quick-item-card" type="button" data-quick-item="${escapeHtml(name)}"><span class="quick-image ${sprite ? "has-sprite" : ""}"${sprite ? ` style="${sprite}"` : ""}>${sprite ? "" : `<img src="${itemImageUrl(name)}" alt="" loading="lazy"><b>${escapeHtml(name.charAt(0).toUpperCase())}</b>`}</span><strong>${escapeHtml(name)}</strong><small>Quick add</small></button>`; }).join("");
    $("quickItemGallery").querySelectorAll("[data-quick-item]").forEach((button) => button.addEventListener("click", () => { $("itemName").value = button.dataset.quickItem; $("itemName").focus(); $("itemName").scrollIntoView({ behavior: "smooth", block: "center" }); toast(`${button.dataset.quickItem} select ho gaya`); }));
    $("quickItemGallery").querySelectorAll("img").forEach((image) => image.addEventListener("error", () => image.classList.add("image-failed")));
  }

  function startVoiceItem() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return toast("Is browser mein voice typing support nahi. Chrome/Edge use karein.");
    const recognition = new Recognition();
    recognition.lang = "ur-PK"; recognition.interimResults = false; recognition.maxAlternatives = 3;
    const button = $("voiceItemBtn"); button.classList.add("listening"); button.querySelector("span").textContent = "Sun raha…";
    recognition.onresult = (event) => { const spoken = event.results[0][0].transcript.replace(/[۔,.!?]/g, "").trim(); $("itemName").value = normalizedItemName(spoken); toast(`Suna gaya: ${spoken}`); };
    recognition.onerror = () => toast("Voice samajh nahi aayi. Dobara bolain.");
    recognition.onend = () => { button.classList.remove("listening"); button.querySelector("span").textContent = "Bolain"; };
    recognition.start();
  }

  function filteredEntries() {
    const from = $("filterFrom").value;
    const to = $("filterTo").value;
    const item = $("filterItem").value.trim().toLowerCase();
    const minimumValue = $("filterAmountMin").value;
    const maximumValue = $("filterAmountMax").value;
    const minimum = minimumValue === "" ? null : Number(minimumValue);
    const maximum = maximumValue === "" ? null : Number(maximumValue);
    return state.entries.filter((row) =>
      (!from || row.purchase_date >= from) &&
      (!to || row.purchase_date <= to) &&
      (!item || row.item_name.toLowerCase().includes(item)) &&
      (minimum === null || Number(row.total_amount) >= minimum) &&
      (maximum === null || Number(row.total_amount) <= maximum)
    );
  }

  function renderHistory() {
    const minimum = $("filterAmountMin").value;
    const maximum = $("filterAmountMax").value;
    if (minimum !== "" && maximum !== "" && Number(minimum) > Number(maximum)) {
      return toast("Minimum amount maximum amount se zyada nahi ho sakta");
    }
    const rows = filteredEntries();
    const sum = totals(rows);
    $("historySummary").innerHTML = [
      ["Records", rows.length], ["Total", money(sum.total)]
    ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");
    $("historyTable").innerHTML = rows.length ? `
      <table><thead><tr><th>Date, day & time</th><th>Item</th><th>Total</th><th>Entry karne wala</th><th>Action</th></tr></thead>
      <tbody>${rows.map((row) => { const saved = savedDayTime(row); return `<tr><td>${escapeHtml(saved)}</td><td>${escapeHtml(row.item_name)}</td><td>${money(row.total_amount)}</td><td>${escapeHtml(row.entered_by || "Purana record")}</td><td><span class="row-actions"><button class="row-action" data-edit="${row.id}">Edit</button><button class="row-action danger" data-delete="${row.id}">Delete</button></span></td></tr>`; }).join("")}</tbody></table>
    ` : `<p class="empty">Is filter mein koi record nahi.</p>`;
    $("historyTable").querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => editEntry(button.dataset.edit)));
    $("historyTable").querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteEntry(button.dataset.delete)));
  }

  function savedDayTime(row) {
    if (row.entered_at) return new Intl.DateTimeFormat("en-PK", { weekday: "long", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" }).format(new Date(row.entered_at));
    const purchaseDate = new Date(`${row.purchase_date}T12:00:00`);
    const dateAndDay = new Intl.DateTimeFormat("en-PK", { weekday: "long", day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Karachi" }).format(purchaseDate);
    return `${dateAndDay}, 09:00 PM`;
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
    const row = state.entries.find((entry) => entry.id === id);
    if (!row || !confirm(`Strong confirmation:\n\n${row.item_name} · ${money(row.total_amount)}\n\nYe record 30 din ke liye Trash mein move hoga. Continue?`)) return;
    try {
      await api(`store_entries?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ deleted_at: new Date().toISOString(), modified_by: state.profile }), prefer: "return=minimal" });
      await logActivity("entry_delete", "purchase", id, { item: row.item_name, amount: row.total_amount });
      await refreshAll();
      scheduleAutoBackup();
      showUndoDelete(id);
    } catch (error) {
      console.error(error);
      toast("Delete failed");
    }
  }

  function showUndoDelete(id) {
    const bar = $("undoToast"); bar.dataset.entryId = id; bar.classList.remove("hidden");
    clearTimeout(showUndoDelete.timer); showUndoDelete.timer = setTimeout(() => bar.classList.add("hidden"), 10000);
  }

  async function restoreEntry(id) {
    try { await api(`store_entries?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ deleted_at: null, modified_by: state.profile }), prefer: "return=minimal" }); await logActivity("entry_restore", "purchase", id, {}); $("undoToast").classList.add("hidden"); await refreshAll(); scheduleAutoBackup(); toast("Record restore ho gaya"); } catch { toast("Restore failed"); }
  }

  async function permanentlyDeleteEntry(id) {
    const row = state.trash.find((entry) => entry.id === id); if (!row) return;
    const age = Date.now() - new Date(row.deleted_at).getTime();
    if (age < 30 * 86400000) return toast("Permanent delete 30 din baad available hoga");
    if (!confirm(`PERMANENT DELETE:\n\n${row.item_name} · ${money(row.total_amount)}\n\nYe action undo nahi ho sakta. Delete forever?`)) return;
    try { await logActivity("entry_permanent_delete", "purchase", id, { item: row.item_name, amount: row.total_amount }); await api(`store_entries?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", prefer: "return=minimal" }); await refreshAll(); scheduleAutoBackup(); toast("Record permanently deleted"); } catch { toast("Permanent delete failed"); }
  }

  function renderTrash() {
    $("trashCount").textContent = `${state.trash.length} records`;
    $("trashList").innerHTML = state.trash.map((row) => { const daysLeft = Math.max(0, 30 - Math.floor((Date.now() - new Date(row.deleted_at)) / 86400000)); return `<div class="record-row"><div><strong>${escapeHtml(row.item_name)}</strong><span>${money(row.total_amount)} · ${daysLeft} days left</span></div><div class="trash-actions"><button class="row-action" data-restore-entry="${row.id}">Restore</button><button class="row-action danger" data-permanent-entry="${row.id}" ${daysLeft > 0 ? "disabled" : ""}>Delete forever</button></div></div>`; }).join("") || `<p class="empty">Trash empty hai.</p>`;
    $("trashList").querySelectorAll("[data-restore-entry]").forEach((button) => button.addEventListener("click", () => restoreEntry(button.dataset.restoreEntry)));
    $("trashList").querySelectorAll("[data-permanent-entry]").forEach((button) => button.addEventListener("click", () => permanentlyDeleteEntry(button.dataset.permanentEntry)));
  }

  async function logActivity(action, entity, entityId, details) {
    const record = { actor: state.profile || "Unknown", action, entity, entity_id: entityId || null, details: details || {}, occurred_at: new Date().toISOString() };
    try { await api("store_audit", { method: "POST", body: JSON.stringify(record), prefer: "return=minimal" }); if (IS_ADMIN) state.activity.unshift(record); } catch (error) { console.error("Activity log failed", error); }
  }

  function renderActivity() {
    if (!IS_ADMIN || !$("activityTable")) return;
    const edits = state.activity.filter((row) => row.action === "entry_edit").length, deletes = state.activity.filter((row) => row.action === "entry_delete").length;
    $("activitySummary").innerHTML = `<div><span>Total actions</span><strong>${state.activity.length}</strong></div><div><span>Edits</span><strong>${edits}</strong></div><div><span>Deletes</span><strong>${deletes}</strong></div>`;
    $("activityTable").innerHTML = state.activity.length ? `<table><thead><tr><th>Date & time</th><th>User</th><th>Action</th><th>Record</th><th>Details</th></tr></thead><tbody>${state.activity.map((row) => `<tr><td>${escapeHtml(new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(new Date(row.occurred_at)))}</td><td>${escapeHtml(row.actor)}</td><td>${escapeHtml(row.action.replace(/_/g, " "))}</td><td>${escapeHtml(row.entity)}</td><td>${escapeHtml(Object.entries(row.details || {}).map(([key,value]) => `${key}: ${value}`).join(" · ") || "-")}</td></tr>`).join("")}</tbody></table>` : `<p class="empty">Abhi koi edit/delete activity nahi.</p>`;
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
    const headers = ["Date Day Time","Item","Total","Entered By"];
    const values = rows.map((row) => [savedDayTime(row),row.item_name,row.total_amount,row.entered_by || "Purana record"]);
    const csv = [headers, ...values].map((line) => line.map((value) => `"${String(value).replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `maqsood-karyana-history-${today()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function backupCsv() {
    const headers = ["Date Day Time","Item","Total","Entered By"];
    const values = state.entries.map((row) => [savedDayTime(row),row.item_name,row.total_amount,row.entered_by || "Purana record"]);
    return "\ufeff" + [headers, ...values].map((line) => line.map((value) => `"${String(value).replace(/"/g,'""')}"`).join(",")).join("\n");
  }

  function backupExcelWorkbook() {
    const xml = (value) => escapeHtml(value).replace(/'/g, "&apos;");
    const months = [...new Set(state.entries.map((row) => row.purchase_date.slice(0, 7)))].sort().reverse();
    const sheets = months.map((month) => { const rows = state.entries.filter((row) => row.purchase_date.startsWith(month)); const body = rows.map((row) => `<Row><Cell><Data ss:Type="String">${xml(savedDayTime(row))}</Data></Cell><Cell><Data ss:Type="String">${xml(row.item_name)}</Data></Cell><Cell><Data ss:Type="Number">${Number(row.total_amount)}</Data></Cell><Cell><Data ss:Type="String">${xml(row.entered_by || "Purana record")}</Data></Cell></Row>`).join(""); return `<Worksheet ss:Name="${month}"><Table><Row><Cell><Data ss:Type="String">Date Day Time</Data></Cell><Cell><Data ss:Type="String">Item</Data></Cell><Cell><Data ss:Type="String">Total</Data></Cell><Cell><Data ss:Type="String">Entered By</Data></Cell></Row>${body}</Table></Worksheet>`; }).join("");
    return `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheets || `<Worksheet ss:Name="History"><Table/></Worksheet>`}</Workbook>`;
  }

  function backupPdfBlob() {
    const clean = (value) => String(value).normalize("NFKD").replace(/[^\x20-\x7E]/g, "?").replace(/([\\()])/g, "\\$1");
    const lines = ["Maqsood Karyana Store - Complete History", `Generated: ${new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}`, `Total entries: ${state.entries.length}   Total: ${money(totals(state.entries).total)}`, "", ...state.entries.map((row) => `${savedDayTime(row)} | ${row.item_name} | ${money(row.total_amount)} | ${row.entered_by || "Purana record"}`)];
    const wrapped = lines.flatMap((line) => { const text = clean(line); const parts = []; for (let i = 0; i < text.length; i += 92) parts.push(text.slice(i, i + 92)); return parts.length ? parts : [""]; });
    const pages = []; for (let i = 0; i < wrapped.length; i += 48) pages.push(wrapped.slice(i, i + 48));
    const objects = [null, "<< /Type /Catalog /Pages 2 0 R >>", ""];
    const fontId = 3 + pages.length * 2; const pageIds = [];
    pages.forEach((page, index) => { const pageId = 3 + index * 2, contentId = pageId + 1; pageIds.push(`${pageId} 0 R`); const commands = `BT /F1 9 Tf 38 805 Td 11 TL ${page.map((line, lineIndex) => `${lineIndex ? "T* " : ""}(${line}) Tj`).join(" ")} ET`; objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`; objects[contentId] = `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`; });
    objects[2] = `<< /Type /Pages /Kids [${pageIds.join(" ")}] /Count ${pages.length} >>`; objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    let pdf = "%PDF-1.4\n", offsets = [0]; for (let id = 1; id < objects.length; id++) { offsets[id] = pdf.length; pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`; } const xref = pdf.length; pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`; for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`; pdf += `trailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([pdf], { type: "application/pdf" });
  }

  async function writeBackupFile(handle, name, data) { const file = await handle.getFileHandle(name, { create: true }); const writable = await file.createWritable(); await writable.write(data); await writable.close(); }

  function backupDb() {
    return new Promise((resolve, reject) => { const request = indexedDB.open("maqsood-karyana-backup", 1); request.onupgradeneeded = () => request.result.createObjectStore("handles"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
  }

  async function saveBackupHandle(handle) { const db = await backupDb(); return new Promise((resolve, reject) => { const tx = db.transaction("handles", "readwrite"); tx.objectStore("handles").put(handle, "onedrive-folder"); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
  async function getBackupHandle() { const db = await backupDb(); return new Promise((resolve, reject) => { const request = db.transaction("handles").objectStore("handles").get("onedrive-folder"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }

  async function connectBackupFolder() {
    if (!window.showDirectoryPicker) return toast("Folder backup ke liye Chrome/Edge desktop use karein");
    try { const parent = await window.showDirectoryPicker({ mode: "readwrite" }); const handle = await parent.getDirectoryHandle("Maqsood Karyana Backups", { create: true }); await saveBackupHandle(handle); await updateBackupStatus(); toast("Maqsood Karyana Backups folder connected"); } catch (error) { if (error.name !== "AbortError") toast("Folder connect nahi hua"); }
  }

  async function connectCloudBackup() {
    if (!IS_ADMIN) return;
    try {
      const response = await fetch(`${config.supabaseUrl}/functions/v1/onedrive-oauth-callback?action=start`, {
        headers: { apikey: config.supabaseAnonKey, Authorization: `Bearer ${config.supabaseAnonKey}`, "X-Store-Session": state.token }
      });
      const result = await response.json();
      if (!response.ok || !result.authorizationUrl) throw new Error(result.error || "Connect unavailable");
      window.location.assign(result.authorizationUrl);
    } catch (error) {
      console.error(error);
      toast("Cloud backup setup abhi deploy nahi hua. Admin package aur Supabase functions deploy karein.");
    }
  }

  function scheduleAutoBackup() {
    if (!IS_ADMIN) return;
    localStorage.setItem(BACKUP_DUE_KEY, String(Date.now() + 3600000));
    clearTimeout(scheduleAutoBackup.timer);
    scheduleAutoBackup.timer = setTimeout(() => runAutoBackup(), 3600000);
    updateBackupStatus();
  }

  async function runAutoBackup(force = false) {
    if (!IS_ADMIN) return;
    if (!state.dataLoaded) return;
    const due = Number(localStorage.getItem(BACKUP_DUE_KEY) || 0);
    if (!force && (!due || Date.now() < due)) { if (due) { clearTimeout(scheduleAutoBackup.timer); scheduleAutoBackup.timer = setTimeout(() => runAutoBackup(), Math.min(2147483647, due - Date.now())); } return updateBackupStatus(); }
    try {
      const handle = await getBackupHandle();
      if (!handle) return updateBackupStatus();
      let permission = await handle.queryPermission({ mode: "readwrite" });
      if (permission !== "granted" && force) permission = await handle.requestPermission({ mode: "readwrite" });
      if (permission !== "granted") return updateBackupStatus();
      await writeBackupFile(handle, "maqsood-karyana-history-auto.csv", backupCsv());
      await writeBackupFile(handle, "maqsood-karyana-history-auto.pdf", backupPdfBlob());
      await writeBackupFile(handle, "maqsood-karyana-monthly-workbook.xls", new Blob([backupExcelWorkbook()], { type: "application/vnd.ms-excel" }));
      localStorage.removeItem(BACKUP_DUE_KEY); localStorage.setItem(BACKUP_LAST_KEY, new Date().toISOString());
      await updateBackupStatus(); toast("OneDrive history backup save ho gaya");
    } catch (error) { console.error(error); toast("Auto backup save nahi hua. Folder permission check karein."); }
  }

  async function updateBackupStatus() {
    if (!IS_ADMIN) return;
    const status = $("backupStatus"); if (!status) return;
    const handle = await getBackupHandle().catch(() => null); const due = Number(localStorage.getItem(BACKUP_DUE_KEY) || 0); const last = localStorage.getItem(BACKUP_LAST_KEY);
    if (!handle) return status.textContent = "Pehli dafa OneDrive mein backup folder select karein.";
    if (due) return status.textContent = `Connected: ${handle.name} · Next backup ${new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(new Date(due))}`;
    status.textContent = last ? `Connected: ${handle.name} · Last backup ${new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(new Date(last))}` : `Connected: ${handle.name} · New entry ke 1 hour baad backup hoga.`;
  }

  function bindEvents() {
    $("loginForm").addEventListener("submit", login);
    $("showLoginPassword").addEventListener("click", () => {
      const input = $("loginPassword");
      input.type = input.type === "password" ? "text" : "password";
      $("showLoginPassword").textContent = input.type === "password" ? "Show" : "Hide";
    });
    $("logoutBtn").addEventListener("click", logout);
    $("profileBtn").addEventListener("click", () => ensureProfile(true));
    $("profileForm").addEventListener("submit", saveProfile);
    $("cancelProfileBtn").addEventListener("click", () => $("profileModal").classList.add("hidden"));
    $("deviceProfileName").addEventListener("input", () => {
      $("profileModalInitial").textContent = $("deviceProfileName").value.trim().charAt(0).toUpperCase() || "?";
    });
    $("syncDraftsBtn").addEventListener("click", syncOfflineDrafts);
    $("clearDashboardFilter").addEventListener("click", () => { state.dashboardFilter = { item: "", from: "", to: "" }; renderVisualDashboard(); });
    document.querySelectorAll("[data-dashboard-days]").forEach((button) => button.addEventListener("click", () => { state.dashboardDays = button.dataset.dashboardDays === "all" ? "all" : Number(button.dataset.dashboardDays); renderVisualDashboard(); }));
    document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.view)));
    document.querySelectorAll("[data-open-view]").forEach((button) => button.addEventListener("click", () => showView(button.dataset.openView)));
    $("entryForm").addEventListener("submit", saveEntry);
    $("voiceItemBtn").addEventListener("click", startVoiceItem);
    $("clearEntryBtn").addEventListener("click", clearEntry);
    $("totalAmount").addEventListener("input", updateRemaining);
    $("paidAmount").addEventListener("input", updateRemaining);
    ["filterFrom","filterTo","filterItem","filterAmountMin","filterAmountMax"].forEach((id) => $(id).addEventListener("change", renderHistory));
    $("showHistoryBtn").addEventListener("click", renderHistory);
    $("showAnalyticsBtn").addEventListener("click", renderAnalytics);
    $("exportCsvBtn").addEventListener("click", exportCsv);
    $("printBtn").addEventListener("click", () => window.print());
    $("itemForm").addEventListener("submit", addItem);
    $("ledgerForm").addEventListener("submit", saveLedger);
    $("personalKhataForm")?.addEventListener("submit", savePersonalKhata);
    $("cancelPersonalKhataEdit")?.addEventListener("click", resetPersonalKhataForm);
    document.querySelectorAll("[data-personal-khata-filter]").forEach((button) => button.addEventListener("click", () => {
      state.personalKhataFilter = button.dataset.personalKhataFilter;
      renderPersonalKhata();
    }));
    $("connectBackupFolder").addEventListener("click", connectBackupFolder);
    $("connectCloudBackup").addEventListener("click", connectCloudBackup);
    $("backupNowBtn").addEventListener("click", () => runAutoBackup(true));
    $("undoDeleteBtn").addEventListener("click", () => restoreEntry($("undoToast").dataset.entryId));
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
    window.addEventListener("online", async () => {
      $("offlineBadge").classList.add("hidden");
      await syncOfflineDrafts();
    });
    window.addEventListener("offline", () => {
      renderOfflineDrafts();
      toast("Offline mode on ho gaya");
    });
  }

  function updateInstallButtons() {
    const installed = matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    document.querySelectorAll("[data-install-app]").forEach((button) => {
      button.classList.toggle("hidden", installed || !state.deferredPrompt);
    });
  }

  function init() {
    applyModeUi();
    bindEvents();
    clearEntry();
    $("filterFrom").value = "";
    $("filterTo").value = today();
    $("analyticsFrom").value = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    $("analyticsTo").value = today();
    $("ledgerDate").value = today();
    resetPersonalKhataForm();
    updateInstallButtons();
    renderOfflineDrafts();
    const updateEntryClock = () => { $("entryCurrentDateTime").textContent = new Intl.DateTimeFormat("en-PK", { weekday: "long", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Karachi" }).format(new Date()); };
    updateEntryClock(); setInterval(updateEntryClock, 30000);
    updateBackupStatus(); runAutoBackup(); setInterval(() => runAutoBackup(), 60000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) runAutoBackup(); });
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js?v=21").catch(console.error);
    restoreSession();
  }

  init();
})();
