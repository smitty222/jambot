// site/app.js (modern3)
console.log("[jj] app.js booted", new Date().toISOString());
const APP_VER = "modern3";

// Prefer an override set in index.html, otherwise auto-detect dev/prod,
// falling back to prod if dev is unreachable.
const CANDIDATE_ORIGINS = [
  (typeof window !== "undefined" && window.JJ_API_ORIGIN) || null,
  "https://jamflow-site-api-dev.jamflowbot.workers.dev",
  "https://jamflow-site-api.jamflowbot.workers.dev",
].filter(Boolean);

let API_ORIGIN = null;

// Safe helpers
function escapeHtml(s) {
  return String(s).replace(/[&<>\"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[ch]);
}
function $(id){ return document.getElementById(id) }

const els = {
  publicCmds: $("publicCmds"),
  modCmds: $("modCmds"),
  totals: $("totals"),
  topSongs: $("topSongs"),
  topAlbums: $("topAlbums"),
  publicTables: $("publicTables"),
  modTables: $("modTables"),
  tableDetail: $("tableDetail"),
  tokenInput: $("tokenInput"),
  saveToken: $("saveToken"),
  clearToken: $("clearToken"),
  tokenStatus: $("tokenStatus"),
  tabCommands: $("tabCommands"),
  tabData: $("tabData"),
  tabStats: $("tabStats"),
  tabSettings: $("tabSettings"),
  viewCommands: $("viewCommands"),
  viewData: $("viewData"),
  viewStats: $("viewStats"),
  viewSettings: $("viewSettings"),
  tableSearch: $("tableSearch"),
  cmdSearch: $("cmdSearch"),
  toggleTokenVis: $("toggleTokenVis"),
  toastHost: $("toastHost"),
  crapsRecord: $("crapsRecord"),
  lotteryWinners: $("lotteryWinners"),
};

// Ensure buttons are clickable even if CSS disables pointer events by accident
for (const id of ["saveToken","clearToken","tabCommands","tabData","tabStats","tabSettings"]) {
  const b = $(id);
  if (b) { b.style.pointerEvents = "auto"; b.style.userSelect = "auto"; }
}

// Simple toast
function toast(msg){
  if(!els.toastHost) return;
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = msg;
  els.toastHost.appendChild(div);
  setTimeout(()=>{ div.style.opacity='0'; div.style.transition='opacity .4s'; }, 1800);
  setTimeout(()=>{ div.remove(); }, 2400);
}

// Tabs (event delegation)
document.addEventListener("click", (e) => {
  const target = e.target;
  if (!target) return;

  // Tabs
  const tab = target.closest("#tabCommands, #tabData, #tabStats, #tabSettings");
  if (tab) {
    const map = {
      tabCommands: "viewCommands",
      tabData: "viewData",
      tabStats: "viewStats",
      tabSettings: "viewSettings",
    };
    const showId = map[tab.id];
    for (const [tid, vid] of Object.entries(map)) {
      const tbtn = $(tid);
      const v = $(vid);
      const active = (tid === tab.id);
      if (tbtn) tbtn.classList.toggle("active", active);
      if (v) v.style.display = active ? "block" : "none";
    }
    return;
  }

  // Save / Clear
  if (target.closest("#saveToken")) {
    saveTokenHandler();
    return;
  }
  if (target.closest("#clearToken")) {
    clearTokenHandler();
    return;
  }
});

// Enter-to-save
if (els.tokenInput) els.tokenInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { saveTokenHandler(); }
});

// Show/hide token
if (els.toggleTokenVis && els.tokenInput) {
  els.toggleTokenVis.addEventListener('click', () => {
    const isPass = els.tokenInput.type === 'password';
    els.tokenInput.type = isPass ? 'text' : 'password';
    els.toggleTokenVis.textContent = isPass ? 'Hide' : 'Show';
  });
}

function setTokenStatus(msg, ok=false) {
  if (!els.tokenStatus) return;
  els.tokenStatus.textContent = msg || "";
  els.tokenStatus.style.color = ok ? "#22c55e" : "";
}

function getToken() { return localStorage.getItem("JJ_MOD_TOKEN") || "" }
function setToken(val) { if (val) localStorage.setItem("JJ_MOD_TOKEN", val); else localStorage.removeItem("JJ_MOD_TOKEN") }
if (els.tokenInput) els.tokenInput.value = getToken();

async function saveTokenHandler() {
  const val = (els.tokenInput?.value || "").trim();
  setToken(val);
  setTokenStatus(val ? "Saved. Checking access…" : "Cleared.");
  toast(val ? "Token saved" : "Token cleared");
  try {
    await refreshMod();
    setTokenStatus(val ? "Saved. If mod still says Unauthorized, double-check the token." : "Cleared.", true);
  } catch (e) {
    setTokenStatus("Saved, but error loading mod data.", false);
  }
}
function clearTokenHandler() {
  setToken("");
  if (els.tokenInput) els.tokenInput.value = "";
  setTokenStatus("Cleared.");
  toast("Token cleared");
  refreshMod();
}

// ---------- API bootstrap ----------
async function pingOrigin(origin){
  try {
    const res = await fetch(`${origin}/api/tables`, { method:'GET' });
    if (res.ok) return true;
  } catch {}
  return false;
}
async function chooseApiOrigin(){
  for (const origin of CANDIDATE_ORIGINS) {
    if (await pingOrigin(origin)) {
      API_ORIGIN = origin;
      console.log(`[jj] using API_ORIGIN: ${origin}`);
      return;
    }
  }
  // Last resort to avoid silent failures
  API_ORIGIN = CANDIDATE_ORIGINS[CANDIDATE_ORIGINS.length - 1];
  console.warn("[jj] No API responded; falling back to", API_ORIGIN);
}

async function apiGet(path, mod = false) {
  if (!API_ORIGIN) throw new Error("API not ready");
  const res = await fetch(`${API_ORIGIN}${path}`, {
    headers: mod && getToken() ? { "authorization": `Bearer ${getToken()}` } : {}
  });
  if (!res.ok) {
    const text = await res.text().catch(()=> "");
    const err = new Error(`GET ${path} failed: ${res.status} ${text}`);
    err.status = res.status;
    throw err;
  }
  return await res.json();
}

// ---------- Render helpers ----------
function groupToHtml(group) {
  const items = (group.items || []).map(i => `<code class="tag">${escapeHtml(i)}</code>`).join(" ");
  return `<div class="card"><div class="small muted">${escapeHtml(group.group || "")}</div><div style="margin:6px 0 6px;">${items}</div></div>`;
}
function nameBtn(name, isMod=false) {
  const safe = escapeHtml(name);
  const call = isMod ? `loadTable('${safe}', true)` : `loadTable('${safe}', false)`;
  return `<button class="button secondary" style="margin:4px 6px 6px 0" onclick="${call}">${safe}</button>`;
}

// ---------- Public & Mod (Commands + Data) ----------
async function refreshPublic() {
  try {
    const cmds = await apiGet("/api/commands", false);
    window._publicCmdsRaw = (cmds || []);
    renderCommands();
  } catch (e) {
    if (els.publicCmds) els.publicCmds.innerHTML = `<div class='muted small'>Error: ${escapeHtml(e.message)}</div>`;
  }
}

async function refreshMod() {
  try {
    const mod = await apiGet("/api/commands_mod", true).catch(() => null);
    if (els.modCmds) {
      els.modCmds.innerHTML = (!mod ? "<div class='muted small'>Unauthorized</div>" :
        (mod || []).map(groupToHtml).join("") || "<div class='muted small'>None</div>");
    }

    const list = await apiGet("/api/tables_mod", true).catch(() => null);
    const pub = await apiGet("/api/tables", false).catch(() => ({ public: [] }));
    const pubNames = (pub?.public || []);
    const modNames = (list?.mod || []);
    window._publicTableNames = pubNames;
    window._modTableNames = modNames;
    renderTableButtons();
  } catch (e) {
    if (els.publicTables) els.publicTables.innerHTML = `<div class='muted small'>Error: ${escapeHtml(e.message)}</div>`;
    if (els.modTables) els.modTables.innerHTML    = `<div class='muted small'>Error: ${escapeHtml(e.message)}</div>`;
  }
}

function renderCommands(){
  const q = (els.cmdSearch?.value || "").toLowerCase().trim();
  const groups = (window._publicCmdsRaw || []);
  const filtered = !q ? groups : groups.map(g => {
    const items = (g.items || []).filter(i => i.toLowerCase().includes(q));
    return { ...g, items };
  }).filter(g => (g.items || []).length > 0);
  if (els.publicCmds) els.publicCmds.innerHTML = filtered.map(groupToHtml).join("") || "<div class='muted small'>None</div>";
}
if (els.cmdSearch) els.cmdSearch.addEventListener('input', renderCommands);

function renderTableButtons(){
  const q = (els.tableSearch?.value || "").toLowerCase().trim();
  const pub = (window._publicTableNames || []).filter(n => !q || n.toLowerCase().includes(q));
  const mod = (window._modTableNames || []).filter(n => !q || n.toLowerCase().includes(q));
  if (els.publicTables) els.publicTables.innerHTML = pub.map(n => nameBtn(n, false)).join("") || "<div class='muted small'>None</div>";
  if (els.modTables) els.modTables.innerHTML    = mod.map(n => nameBtn(n, true)).join("") || "<div class='muted small'>None</div>";
}
if (els.tableSearch) els.tableSearch.addEventListener('input', renderTableButtons);

// Table view & sorting
window._tableState = { name:null, mod:false, data:[], sort:null };
window.loadTable = async (name, mod) => {
  try {
    const data = await apiGet(mod ? `/api/db_mod/${name}` : `/api/db/${name}`, mod);
    const arr = Array.isArray(data) ? data : [];
    window._tableState = { name, mod, data: arr, sort: null };
    renderTable();
  } catch (e) {
    if (els.tableDetail) els.tableDetail.innerHTML = `<div class='muted small'>Error: ${escapeHtml(e.message)}</div>`;
  }
};

function renderTable(){
  const { name, mod, data, sort } = window._tableState;
  const count = Array.isArray(data) ? data.length : 0;
  const columns = Array.isArray(data) && data[0] ? Object.keys(data[0]) : [];
  const header = columns.map((c, idx) => {
    const dir = (sort && sort.col === idx) ? (sort.dir === 'asc' ? '▲' : '▼') : '↕';
    return `<th data-col="${idx}">${escapeHtml(c)} <span class="sort">${dir}</span></th>`;
  }).join("");

  let rows = data;
  if (sort) {
    const { col, dir } = sort;
    const key = columns[col];
    rows = [...data].sort((a,b) => {
      const av = a[key]; const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const na = Number(av), nb = Number(bv);
      const isNum = !isNaN(na) && !isNaN(nb);
      if (isNum) return dir === 'asc' ? na - nb : nb - na;
      return dir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
  }

  const body = rows.slice(0, 200).map(row => {
    const tds = columns.map(c => `<td>${escapeHtml(String(row[c] ?? ""))}</td>`).join("");
    return `<tr>${tds}</tr>`;
  }).join("");

  if (els.tableDetail) {
    els.tableDetail.innerHTML = `
      <div class="section-title">
        <div><strong>${mod ? "Mod" : "Public"} table:</strong> <code class="tag">${escapeHtml(name || "")}</code> <span class="badge">${count} rows</span></div>
        <div class="row">
          <button class="button" onclick="downloadJson('${escapeHtml(name || "")}', ${mod})">Download JSON</button>
        </div>
      </div>
      <div class="table-wrap">
        <table id="dataTable"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
        <div class="muted small" style="margin-top: 6px;">Showing up to 200 rows.</div>
      </div>
    `;
  }

  const thead = document.querySelector("#dataTable thead");
  if (thead) {
    thead.onclick = (ev) => {
      const th = ev.target.closest("th");
      if (!th) return;
      const col = Number(th.getAttribute("data-col"));
      if (isNaN(col)) return;
      const cur = window._tableState.sort;
      const dir = (!cur || cur.col !== col) ? 'asc' : (cur.dir === 'asc' ? 'desc' : 'asc');
      window._tableState.sort = { col, dir };
      renderTable();
    };
  }
}

window.downloadJson = async (name, mod) => {
  const url = `${API_ORIGIN}${mod ? `/api/db_mod/${name}` : `/api/db/${name}`}`;
  const res = await fetch(url, { headers: mod && getToken() ? { "authorization": `Bearer ${getToken()}` } : {} });
  const blob = await res.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.json`;
  a.click();
};

// ---------- Stats ----------
async function refreshStats() {
  // Totals (from /api/stats if available)
  try {
    const stats = await apiGet("/api/stats", false);
    const t = stats?.totals || {};
    els.totals.innerHTML = `
      <div><b>Updated</b> <span class="muted">${escapeHtml(t.updatedAt || "never")}</span></div>
      <div><b>Songs Tracked</b> ${t.songsTracked ?? 0}</div>
      <div><b>Albums Tracked</b> ${t.albumsTracked ?? 0}</div>
      <div><b>Song Reviews</b> ${t.songReviews ?? 0}</div>
      <div><b>Album Reviews</b> ${t.albumReviews ?? 0}</div>
    `;
  } catch (e) {
    els.totals.innerHTML = `<div class='muted small'>Error: Failed to fetch (${escapeHtml(e.message)})</div>`;
  }

  // Craps Record (public view)
  try {
    const rec = await apiGet("/api/db/craps_records_public");
    if (!Array.isArray(rec) || rec.length === 0) {
      els.crapsRecord.innerHTML = `<div class="muted small">No record yet.</div>`;
    } else {
      const r = rec[0];
      els.crapsRecord.innerHTML = `
        <div class="row">
          <div class="tag">Room</div> <code class="tag">${escapeHtml(r.roomId || r.room || "—")}</code>
        </div>
        <div style="margin-top:8px"><b>Max Rolls:</b> ${Number(r.maxRolls ?? r.max_rolls ?? 0)}</div>
        <div><b>Shooter:</b> ${escapeHtml(r.shooterNickname || r.shooter || "—")}</div>
        <div class="muted small">${escapeHtml(r.achievedAt || r.achieved_at || "")}</div>
      `;
    }
  } catch (e) {
    els.crapsRecord.innerHTML = `<div class="muted small">Error: ${escapeHtml(e.message)}</div>`;
  }

  // Lottery winners (public view)
  try {
    const winners = await apiGet("/api/db/lottery_winners_public");
    if (!Array.isArray(winners) || winners.length === 0) {
      els.lotteryWinners.innerHTML = `<div class="muted small">No winners yet.</div>`;
    } else {
      els.lotteryWinners.innerHTML = winners.slice(0, 6).map(w =>
        `<div class="tag">${escapeHtml(w.nickname || "—")} — $${escapeHtml(String(w.amountWon ?? w.amount_won ?? ""))}</div>`
      ).join(" ");
    }
  } catch (e) {
    els.lotteryWinners.innerHTML = `<div class="muted small">Error: ${escapeHtml(e.message)}</div>`;
  }

  // Top Songs & Albums (public views)
  try {
    const songs = await apiGet("/api/db/top_songs");
    els.topSongs.innerHTML = (songs || []).slice(0, 30).map(s =>
      `<div class="tag">${escapeHtml(s.title || "")} — ${escapeHtml(s.artist || "")} (${s.plays ?? 0})</div>`
    ).join(" ") || "<div class='muted small'>None</div>";
  } catch (e) {
    els.topSongs.innerHTML = `<div class="muted small">Error: ${escapeHtml(e.message)}</div>`;
  }

  try {
    const albums = await apiGet("/api/db/album_stats_public");
    els.topAlbums.innerHTML = (albums || []).slice(0, 30).map(a =>
      `<div class="tag">${escapeHtml(a.title || "")} — ${escapeHtml(a.artist || "")} (avg ${a.avg ?? "—"})</div>`
    ).join(" ") || "<div class='muted small'>None</div>";
  } catch (e) {
    els.topAlbums.innerHTML = `<div class="muted small">Error: ${escapeHtml(e.message)}</div>`;
  }
}

// ---------- Boot ----------
async function refreshAll() { await Promise.all([refreshPublic(), refreshMod(), refreshStats()]) }

(async function init(){
  try {
    await chooseApiOrigin();
    await refreshAll();
    setInterval(refreshStats, 15000);
  } catch (e) {
    console.error("[jj] init failed", e);
    toast("Init failed: " + e.message);
  }
})();
