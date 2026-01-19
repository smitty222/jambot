// site/app.js (modern10)
const APP_VER = "modern10";
console.log("[jj] app.js booted", APP_VER, new Date().toISOString());

// --- tiny error reporter so we see issues on the page ---
window.addEventListener("error", (e) => {
  try {
    const m = e?.error?.stack || e?.message || String(e);
    const div = document.createElement("div");
    div.style.cssText = "position:fixed;right:8px;bottom:8px;z-index:10000;background:#fee;border:1px solid #f99;color:#900;padding:8px 10px;font:12px/1.3 system-ui;border-radius:6px;max-width:60ch;box-shadow:0 2px 12px rgba(0,0,0,.15)";
    div.textContent = "[js] " + m;
    document.body.appendChild(div);
    setTimeout(()=>div.remove(), 8000);
  } catch {}
});

// Prefer an override set in index.html, otherwise auto-detect dev/prod
const CANDIDATE_ORIGINS = [
  (typeof window !== "undefined" && window.JJ_API_ORIGIN) || null,
  "https://jamflow-site-api-dev.jamflowbot.workers.dev",
  "https://jamflow-site-api.jamflowbot.workers.dev",
].filter(Boolean);

let API_ORIGIN = null;

// ------------- helpers -------------
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[ch]);
}
function $(id){ return document.getElementById(id) }
function val(o, ...keys){ for (const k of keys){ if (o && o[k] != null) return o[k]; } return undefined; }
function briefDate(dlike){
  if (!dlike) return "";
  try {
    const d = new Date(dlike);
    if (isNaN(d)) return String(dlike);
    return d.toLocaleString();
  } catch { return String(dlike); }
}

const els = {
  publicCmds: $("publicCmds"),
  modCmds: $("modCmds"),
  totals: $("totals"),
  // stats detail
  // craps & lottery containers now live in the Games tab
  gamesCrapsRecord: $("gamesCrapsRecord"),
  gamesLotteryWinners: $("gamesLotteryWinners"),

  // old stats elements retained for back-compat but unused
  crapsRecord: $("crapsRecord"),
  lotteryWinners: $("lotteryWinners"),

    // wrapped
  tabWrapped: $("tabWrapped"),
  viewWrapped: $("viewWrapped"),
  wrappedYear: $("wrappedYear"),
  wrappedRefresh: $("wrappedRefresh"),
  wrappedTopSongs: $("wrappedTopSongs"),
  wrappedTopArtists: $("wrappedTopArtists"),
  wrappedTopDjs: $("wrappedTopDjs"),

  // DJ wrapped
  djWrappedSelect: $("djWrappedSelect"),
  djWrappedSummary: $("djWrappedSummary"),
  djWrappedTopSongs: $("djWrappedTopSongs"),
  djWrappedTopArtists: $("djWrappedTopArtists"),
// Horse Hall of Fame
  gamesHorseHof: $("gamesHorseHof"),



  // data browsing
  publicTables: $("publicTables"),   // ensure this exists in JS
  modTables: $("modTables"),
  tableDetail: $("tableDetail"),
  tableSearch: $("tableSearch"),

  // commands filtering
  cmdSearch: $("cmdSearch"),

  // tabs/views
  tabCommands: $("tabCommands"),
  tabData: $("tabData"),
  tabStats: $("tabStats"),
  tabAlbums: $("tabAlbums"),
  tabSongs: $("tabSongs"),
  tabGames: $("tabGames"),
  tabLottery: $("tabLottery"),
  tabSettings: $("tabSettings"),
  viewCommands: $("viewCommands"),
  viewData: $("viewData"),
  viewStats: $("viewStats"),
  viewAlbums: $("viewAlbums"),
  viewSongs: $("viewSongs"),
  viewGames: $("viewGames"),
  viewLottery: $("viewLottery"),
  viewSettings: $("viewSettings"),

  // albums
  albumSearch: $("albumSearch"),
  albumSort: $("albumSort"),
  albumMinRated: $("albumMinRated"),   // ok if it doesn't exist; we ignore it
  albumMinPlays: $("albumMinPlays"),
  albumsAll: $("albumsAll"),           // NEW
  albumsList: $("albumsList"),      

  // songs
  songSearch: $("songSearch"),
  songSort: $("songSort"),
  songsList: $("songsList"),

  // settings
  tokenInput: $("tokenInput"),
  saveToken: $("saveToken"),
  clearToken: $("clearToken"),
  tokenStatus: $("tokenStatus"),
  toggleTokenVis: $("toggleTokenVis"),

  // misc
  toastHost: $("toastHost"),
  lotteryBalls: $("lotteryBalls"),
};

// Keep header controls clickable
for (const id of [
  "saveToken","clearToken",
  "tabCommands","tabData","tabStats","tabAlbums","tabSongs","tabGames","tabLottery","tabSettings"
]) {
  const b = $(id);
  if (b) { b.style.pointerEvents = "auto"; b.style.userSelect = "auto"; }
}

// Toast
function toast(msg){
  if(!els.toastHost) return;
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = msg;
  els.toastHost.appendChild(div);
  setTimeout(()=>{ div.style.opacity='0'; div.style.transition='opacity .4s'; }, 1800);
  setTimeout(()=>{ div.remove(); }, 2400);
}

// ------------- Tabs (explicit listeners + safe fallback) -------------
const TAB_MAP = {
  tabCommands: "viewCommands",
  tabData:     "viewData",
  tabStats:    "viewStats",
  tabAlbums:   "viewAlbums",
  tabSongs:    "viewSongs",
  tabGames:    "viewGames",
  tabLottery:  "viewLottery",
  tabWrapped:  "viewWrapped",
  tabSettings: "viewSettings",
};
function showTab(tid) {
  for (const [id, vid] of Object.entries(TAB_MAP)) {
    const tbtn = $(id);
    const view = $(vid);
    const active = id === tid;
    if (tbtn) tbtn.classList.toggle("active", active);
    if (view) view.style.display = active ? "block" : "none";
  }
}
function setupTabs() {
  for (const id of Object.keys(TAB_MAP)) {
    const btn = $(id);
    if (!btn) continue;
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      showTab(id);
    });
    btn.style.pointerEvents = "auto";
    btn.style.userSelect = "auto";
  }
  // start on Commands if nothing visible (belt & suspenders)
  const anyShown = Object.values(TAB_MAP).some(vid => $(vid)?.style.display === "block");
  if (!anyShown) showTab("tabCommands");
}
// Safe fallback in case something overlays clicks: delegate on document too
document.addEventListener("click", (e) => {
  const t = e.target?.closest?.("#tabCommands, #tabData, #tabStats, #tabAlbums, #tabSongs, #tabWrapped, #tabGames #tabLottery, #tabSettings, #tabGames");
  if (!t) return;
  e.preventDefault(); e.stopPropagation();
  showTab(t.id);
});

// Token helpers
function setTokenStatus(msg, ok=false) {
  if (!els.tokenStatus) return;
  els.tokenStatus.textContent = msg || "";
  els.tokenStatus.style.color = ok ? "#22c55e" : "";
}
function getToken() { return localStorage.getItem("JJ_MOD_TOKEN") || "" }
function setToken(val) { if (val) localStorage.setItem("JJ_MOD_TOKEN", val); else localStorage.removeItem("JJ_MOD_TOKEN") }
if (els.tokenInput) els.tokenInput.value = getToken();
if (els.tokenInput) els.tokenInput.addEventListener("keydown", (e) => { if (e.key === "Enter") saveTokenHandler(); });
if (els.toggleTokenVis && els.tokenInput) {
  els.toggleTokenVis.addEventListener('click', () => {
    const isPass = els.tokenInput.type === 'password';
    els.tokenInput.type = isPass ? 'text' : 'password';
    els.toggleTokenVis.textContent = isPass ? 'Hide' : 'Show';
  });
}
async function saveTokenHandler() {
  const val = (els.tokenInput?.value || "").trim();
  setToken(val);
  setTokenStatus(val ? "Saved. Checking access…" : "Cleared.");
  toast(val ? "Token saved" : "Token cleared");
  try { await refreshMod(); setTokenStatus(val ? "Saved. If mod still says Unauthorized, double-check the token." : "Cleared.", true); }
  catch { setTokenStatus("Saved, but error loading mod data.", false); }
}

// ─────────────────────────────────────────────────────────────
// DJ Wrapped (2026) — per-DJ recap
// ─────────────────────────────────────────────────────────────
let _djTotals = [];
let _djTopSongsRows = [];
let _djTopArtistsRows = [];

function renderSimpleTable(container, rows, cols, maxRows = 25) {
  if (!container) return;
  if (!Array.isArray(rows) || rows.length === 0) {
    container.innerHTML = `<div class="muted small">No data yet.</div>`;
    return;
  }

  const header = cols.map(c => `<th>${escapeHtml(c.label)}</th>`).join("");
  const body = rows.slice(0, maxRows).map((r, i) => {
    const tds = cols.map(c => `<td>${escapeHtml(String(r[c.key] ?? ""))}</td>`).join("");
    return `<tr><td style="text-align:center;">${i + 1}</td>${tds}</tr>`;
  }).join("");

  container.innerHTML = `
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th style="width:56px;text-align:center;">#</th>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
      <div class="muted small" style="margin-top:6px;">Showing top ${Math.min(maxRows, rows.length)}.</div>
    </div>
  `;
}

function renderDjWrappedSummary(djRow) {
  if (!els.djWrappedSummary) return;
  if (!djRow) {
    els.djWrappedSummary.innerHTML = `<div class="muted small">Select a DJ to view their stats.</div>`;
    return;
  }

  const plays = Number(djRow.plays ?? 0);
  const uniqueSongs = Number(djRow.uniqueSongs ?? 0);
  const uniqueArtists = Number(djRow.uniqueArtists ?? 0);

  els.djWrappedSummary.innerHTML = `
    <div class="row" style="gap:14px; flex-wrap:wrap;">
      <div class="card" style="flex:1 1 240px; min-width:220px;">
        <div class="muted small">DJ</div>
        <div style="font-weight:700; font-size:18px;">${escapeHtml(djRow.dj || "unknown")}</div>
      </div>
      <div class="card" style="flex:1 1 180px; min-width:180px;">
        <div class="muted small">Total plays</div>
        <div style="font-weight:800; font-size:22px;">${plays}</div>
      </div>
      <div class="card" style="flex:1 1 180px; min-width:180px;">
        <div class="muted small">Unique songs</div>
        <div style="font-weight:800; font-size:22px;">${uniqueSongs}</div>
      </div>
      <div class="card" style="flex:1 1 180px; min-width:180px;">
        <div class="muted small">Unique artists</div>
        <div style="font-weight:800; font-size:22px;">${uniqueArtists}</div>
      </div>
    </div>
  `;
}

function populateDjWrappedSelect() {
  if (!els.djWrappedSelect) return;

  if (!Array.isArray(_djTotals) || _djTotals.length === 0) {
    els.djWrappedSelect.innerHTML = `<option value="">No DJs yet</option>`;
    return;
  }

  const opts = _djTotals.map(r => {
    const uuid = String(r.djUuid || "");
    const name = String(r.dj || "unknown");
    const plays = Number(r.plays || 0);
    const label = `${name} (${plays})`;
    return `<option value="${escapeHtml(uuid)}">${escapeHtml(label)}</option>`;
  }).join("");

  els.djWrappedSelect.innerHTML = `<option value="">Select a DJ…</option>${opts}`;
}

function renderDjWrappedFor(uuid) {
  const djRow = _djTotals.find(r => String(r.djUuid || "") === String(uuid || ""));
  renderDjWrappedSummary(djRow);

  if (!uuid) {
    if (els.djWrappedTopSongs) els.djWrappedTopSongs.innerHTML = `<div class="muted small">Select a DJ…</div>`;
    if (els.djWrappedTopArtists) els.djWrappedTopArtists.innerHTML = `<div class="muted small">Select a DJ…</div>`;
    return;
  }

  const songs = _djTopSongsRows
    .filter(r => String(r.djUuid || "") === String(uuid))
    .sort((a,b) => Number(b.plays||0) - Number(a.plays||0));

  const artists = _djTopArtistsRows
    .filter(r => String(r.djUuid || "") === String(uuid))
    .sort((a,b) => Number(b.plays||0) - Number(a.plays||0));

  renderSimpleTable(els.djWrappedTopSongs, songs, [
    { key: "title", label: "Song" },
    { key: "artist", label: "Artist" },
    { key: "plays", label: "Plays" },
  ], 25);

  renderSimpleTable(els.djWrappedTopArtists, artists, [
    { key: "artist", label: "Artist" },
    { key: "plays", label: "Plays" },
  ], 25);
}

async function refreshDjWrapped() {
  const year = String(els.wrappedYear?.value || "2026").trim();

  const tTotals = `wrapped_${year}_dj_totals`;
  const tSongs = `wrapped_${year}_dj_top_songs`;
  const tArtists = `wrapped_${year}_dj_top_artists`;

  // Reset UI states
  if (els.djWrappedSummary) els.djWrappedSummary.innerHTML = `<div class="muted small">Loading…</div>`;
  if (els.djWrappedTopSongs) els.djWrappedTopSongs.innerHTML = `<div class="muted small">Loading…</div>`;
  if (els.djWrappedTopArtists) els.djWrappedTopArtists.innerHTML = `<div class="muted small">Loading…</div>`;

  try {
    const [totals, songs, artists] = await Promise.all([
      apiGet(`/api/db/${tTotals}`, false).catch(() => []),
      apiGet(`/api/db/${tSongs}`, false).catch(() => []),
      apiGet(`/api/db/${tArtists}`, false).catch(() => []),
    ]);

    _djTotals = Array.isArray(totals) ? totals : [];
    _djTopSongsRows = Array.isArray(songs) ? songs : [];
    _djTopArtistsRows = Array.isArray(artists) ? artists : [];

    populateDjWrappedSelect();

    // Auto-select first DJ if none selected
    const current = els.djWrappedSelect?.value || "";
    const next = current || (String(_djTotals[0]?.djUuid || "") || "");
    if (els.djWrappedSelect) els.djWrappedSelect.value = next;
    renderDjWrappedFor(next);
  } catch (e) {
    const msg = `<div class="muted small">Error: ${escapeHtml(e.message)}</div>`;
    if (els.djWrappedSummary) els.djWrappedSummary.innerHTML = msg;
    if (els.djWrappedTopSongs) els.djWrappedTopSongs.innerHTML = msg;
    if (els.djWrappedTopArtists) els.djWrappedTopArtists.innerHTML = msg;
  }
  await refreshDjWrapped();

}

if (els.djWrappedSelect) {
  els.djWrappedSelect.addEventListener("change", () => {
    const uuid = els.djWrappedSelect.value || "";
    renderDjWrappedFor(uuid);
  });
}

function clearTokenHandler() {
  setToken(""); if (els.tokenInput) els.tokenInput.value = ""; setTokenStatus("Cleared."); toast("Token cleared"); refreshMod();
}
if (els.saveToken)  els.saveToken.addEventListener("click", saveTokenHandler);
if (els.clearToken) els.clearToken.addEventListener("click", clearTokenHandler);

// ------------- API bootstrap -------------
async function pingOrigin(origin){
  try { const res = await fetch(`${origin}/api/tables`, { mode: "cors" }); if (res.ok) return true; } catch {}
  return false;
}
async function chooseApiOrigin(){
  for (const origin of CANDIDATE_ORIGINS) {
    if (await pingOrigin(origin)) { API_ORIGIN = origin; console.log(`[jj] using API_ORIGIN: ${origin}`); return; }
  }
  API_ORIGIN = CANDIDATE_ORIGINS[0];
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

// ------------- Render helpers -------------
function groupToHtml(group) {
  const items = (group.items || []).map(i => `<code class="tag">${escapeHtml(i)}</code>`).join(" ");
  return `<div class="card"><div class="small muted">${escapeHtml(group.group || "")}</div><div style="margin:6px 0 6px;">${items}</div></div>`;
}
function nameBtn(name, isMod=false) {
  const safe = escapeHtml(name);
  const call = isMod ? `loadTable('${safe}', true)` : `loadTable('${safe}', false)`;
  return `<button class="button secondary" style="margin:4px 6px 6px 0" onclick="${call}">${safe}</button>`;
}

// ------------- Public & Mod (Commands + Data) -------------
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
    if (els.modCmds) els.modCmds.innerHTML = (!mod ? "<div class='muted small'>Unauthorized</div>" :
      (mod || []).map(groupToHtml).join("") || "<div class='muted small'>None</div>");
    const list = await apiGet("/api/tables_mod", true).catch(() => null);
    const pub = await apiGet("/api/tables", false).catch(() => ({ public: [] }));
    window._publicTableNames = (pub?.public || []);
    window._modTableNames = (list?.mod || []);
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

// Table view
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
        <div class="row"><button class="button" onclick="downloadJson('${escapeHtml(name || "")}', ${mod})">Download JSON</button></div>
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

// ------------- Stats -------------
async function refreshStats() {
  try {
    const stats = await apiGet("/api/stats", false);
    const t = stats?.totals || {};
    if (els.totals) {
      els.totals.innerHTML = `
        <div><b>Updated</b> <span class="muted">${escapeHtml(t.updatedAt || "never")}</span></div>
        <div><b>Songs Tracked</b> ${t.songsTracked ?? 0}</div>
        <div><b>Albums Tracked</b> ${t.albumsTracked ?? 0}</div>
        <div><b>Song Reviews</b> ${t.songReviews ?? 0}</div>
        <div><b>Album Reviews</b> ${t.albumReviews ?? 0}</div>
      `;
    }
  } catch (e) {
    if (els.totals) els.totals.innerHTML = `<div class='muted small'>Error: Failed to fetch (${escapeHtml(e.message)})</div>`;
  }
}

// Refresh games: craps record and lottery winners
async function refreshGames() {
  // Craps record
  try {
    const rec = await apiGet("/api/db/craps_records_public");
    const container = els.gamesCrapsRecord;
    if (!container) return;
    if (!Array.isArray(rec) || rec.length === 0) {
      container.innerHTML = `<div class="muted small">No record yet.</div>`;
    } else {
      // Sort by max rolls descending and by achieved date descending to ensure we take
      // the highest and most recent record.  Some rooms may have multiple records.
      const sortedRec = Array.isArray(rec) ? [...rec].sort((a, b) => {
        const aRolls = Number(a.maxRolls ?? a.max_rolls ?? 0);
        const bRolls = Number(b.maxRolls ?? b.max_rolls ?? 0);
        if (bRolls !== aRolls) return bRolls - aRolls;
        // fallback: compare achieved timestamps (desc)
        const aDate = new Date(a.achievedAt || a.achieved_at || 0);
        const bDate = new Date(b.achievedAt || b.achieved_at || 0);
        return bDate - aDate;
      }) : rec;
      const r = Array.isArray(sortedRec) ? sortedRec[0] : sortedRec;
      // Build a richer card: highlight max rolls and shooter
      const maxRolls = Number(r.maxRolls ?? r.max_rolls ?? 0);
      const shooter  = r.shooterNickname || r.shooter || "—";
      const achieved = r.achievedAt || r.achieved_at || "";
      const room     = r.roomId || r.room || "—";
      container.innerHTML = `
        <div class="games-record">
          <div class="record-value">${maxRolls}</div>
          <div class="record-label">Max Rolls</div>
          <div class="record-player"><strong>Shooter:</strong> ${escapeHtml(shooter)}</div>
          <div class="record-room"><strong>Room:</strong> <code class="tag">${escapeHtml(room)}</code></div>
          <div class="record-date muted small">${escapeHtml(achieved)}</div>
        </div>
      `;
    }
  } catch (e) {
    const container = els.gamesCrapsRecord;
    if (container) container.innerHTML = `<div class="muted small">Error: ${escapeHtml(e.message)}</div>`;
  }

    // Horse Hall of Fame
  try {
    const hof = await apiGet("/api/db/horses_hof_public");
    const container = els.gamesHorseHof;
    if (!container) return;

    if (!Array.isArray(hof) || hof.length === 0) {
      container.innerHTML = `<div class="muted small">No Hall of Fame horses yet.</div>`;
    } else {
      const rows = [...hof].map((h, idx) => {
        const name = h.name || "—";
        const emoji = h.emoji || "🐎";
        const owner = h.ownerName || "House";
        const wins = Number(h.wins ?? 0);
        const races = Number(h.races ?? h.racesParticipated ?? 0);
        const wr = (h.winRatePct != null) ? `${h.winRatePct}%` : (races > 0 ? `${Math.round((wins / races) * 1000) / 10}%` : "0%");
        const tier = h.tier ? String(h.tier) : "";

        return `
          <div class="card" style="margin:8px 0;">
            <div class="row" style="justify-content:space-between; gap:12px;">
              <div style="font-weight:700;">
                ${idx + 1}. ${escapeHtml(emoji)} ${escapeHtml(name)}
                ${tier ? `<span class="tag" style="margin-left:8px;">${escapeHtml(tier)}</span>` : ""}
              </div>
              <div class="muted small" title="Wins / Races / Win rate">
                ${wins}W / ${races}R • ${escapeHtml(wr)}
              </div>
            </div>
            <div class="muted small" style="margin-top:6px;">
              Owner: <strong>${escapeHtml(owner)}</strong>
            </div>
          </div>
        `;
      }).join("");

      container.innerHTML = rows;
    }
  } catch (e) {
    const container = els.gamesHorseHof;
    if (container) container.innerHTML = `<div class="muted small">Error: ${escapeHtml(e.message)}</div>`;
  }


  // Lottery winners
try {
  const winners = await apiGet("/api/db/lottery_winners_public");
  const container = els.gamesLotteryWinners;
  if (!container) return;

  if (!Array.isArray(winners) || winners.length === 0) {
    container.innerHTML = `<div class="muted small">No winners yet.</div>`;
  } else {
    // Most recent first
    const sorted = [...winners].sort((a, b) => {
      const aTime = new Date(a.timestamp || a.time || a.createdAt || 0);
      const bTime = new Date(b.timestamp || b.time || b.createdAt || 0);
      return bTime - aTime;
    });

    // Render using the full card width and show winning number
    const html = sorted.map(w => {
      const name = escapeHtml(w.displayName || w.nickname || "—");
      const num  = escapeHtml(String(w.winningNumber ?? w.winning_number ?? "—"));
      const when = w.timestamp ? briefDate(w.timestamp) : "";

      return `
        <div class="winner-row">
          <div class="winner-left">
            <div class="winner-name">${name}</div>
            ${when ? `<div class="winner-when muted small">${escapeHtml(when)}</div>` : ``}
          </div>
          <div class="winner-right">
            <div class="winner-num" title="Winning number">🎱 ${num}</div>
          </div>
        </div>
      `;
    }).join("");

    // IMPORTANT: use the whole container width + add scroll when needed
    container.innerHTML = `<div class="winners-scroll">${html}</div>`;
  }
} catch (e) {
  const container = els.gamesLotteryWinners;
  if (container) container.innerHTML = `<div class="muted small">Error: ${escapeHtml(e.message)}</div>`;
}
}

// ------------- Albums (Top 5 + Rest) -------------
let _albumsRaw = [];
let _reviewCounts = {}; // { [albumId]: count }

async function getAlbumReviewCounts(){
  try {
    const aggPub = await apiGet("/api/db/album_review_counts_public");
    if (Array.isArray(aggPub)) {
      const map = {};
      for (const r of aggPub) {
        const id = Number(r.albumId ?? r.album_id ?? r.id);
        const c  = Number(r.reviews ?? r.count ?? r.c ?? 0);
        if (!isNaN(id)) map[id] = c;
      }
      return map;
    }
  } catch {}

  try {
    const aggMod = await apiGet("/api/db/album_review_counts", true);
    if (Array.isArray(aggMod)) {
      const map = {};
      for (const r of aggMod) {
        const id = Number(r.albumId ?? r.album_id ?? r.id);
        const c  = Number(r.reviews ?? r.count ?? r.c ?? 0);
        if (!isNaN(id)) map[id] = c;
      }
      return map;
    }
  } catch {}

  let raw = null;
  try { raw = await apiGet("/api/db/album_reviews"); } catch {}
  if (!Array.isArray(raw)) {
    try { raw = await apiGet("/api/db/album_reviews", true); } catch {}
  }

  const map = {};
  if (Array.isArray(raw)) {
    for (const r of raw) {
      const id = Number(r.albumId ?? r.album_id ?? r.albumID);
      if (!isNaN(id)) map[id] = (map[id] || 0) + 1;
    }
  }
  return map;
}

function renderAlbumsTable(list){
  const rows = list.map((a, i) => {
    const cover = a._cover
      ? `<img src="${escapeHtml(a._cover)}" alt="" loading="lazy" referrerpolicy="no-referrer"
              style="width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid #eee;" />`
      : `<div style="width:44px;height:44px;border-radius:6px;background:#f3f4f6;border:1px solid #eee;"></div>`;
    return `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td>${cover}</td>
        <td>${escapeHtml(a._title)}</td>
        <td>${escapeHtml(a._artist)}</td>
        <td style="text-align:right;">${Number(a._avg).toFixed(2)}</td>
        <td style="text-align:right;">${a._reviews}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="table-wrap">
      <table class="data" id="albumsDataTable">
        <thead>
          <tr>
            <th style="width:48px;text-align:center;">#</th>
            <th style="width:60px;">Cover</th>
            <th data-col="title">Album</th>
            <th data-col="artist">Artist</th>
            <th style="width:140px;text-align:right;" data-col="avg">Avg rating</th>
            <th style="width:140px;text-align:right;" data-col="reviews">Reviews</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="muted small" style="margin-top:6px;">Showing ${list.length} reviewed albums.</div>
    </div>
  `;
}

function renderAlbums(){
  if (!els.albumsAll) return;

  const q = (els.albumSearch?.value || "").toLowerCase().trim();
  const minReviews = Math.max(0, Number(els.albumMinPlays?.value || 0));
  const sortSel = (els.albumSort?.value || "avg:desc").toLowerCase(); // key:dir

  // normalize
  let rows = Array.isArray(_albumsRaw) ? [..._albumsRaw] : [];
  rows = rows.map(a => {
    const id      = Number(a.id ?? a.albumId ?? a.album_id);
    const title   = String(a.albumName ?? a.title ?? "");
    const artist  = String(a.artistName ?? a.artist ?? "");
    const cover   = String(a.albumArt ?? a.cover ?? "");
    const avgRaw  = a.averageReview ?? a.avg;
    const avg     = (avgRaw == null || isNaN(Number(avgRaw))) ? undefined : Number(avgRaw);
    const reviews = Number(_reviewCounts[id] || a.reviews || 0);
    return { ...a, _id:id, _title:title, _artist:artist, _cover:cover, _avg:avg, _reviews:reviews };
  });

  // reviewed only
  rows = rows.filter(a => (typeof a._avg === "number") && a._reviews > 0);

  // Group by album title (case-insensitive) to merge duplicates with different artist names
  const grouped = {};
  for (const a of rows) {
    const keyTitle = a._title.trim().toLowerCase();
    if (!grouped[keyTitle]) {
      grouped[keyTitle] = { ...a };
    } else {
      const g = grouped[keyTitle];
      // Save current review count before updating
      const prevReviews = g._reviews;
      // accumulate reviews and weighted average
      const totalReviews = prevReviews + a._reviews;
      const weightedAvg = ((g._avg ?? 0) * prevReviews + (a._avg ?? 0) * a._reviews) / totalReviews;
      g._reviews = totalReviews;
      g._avg = weightedAvg;
      // prefer cover art if missing on group
      if (!g._cover && a._cover) g._cover = a._cover;
      // choose artist name from whichever has more reviews (use previous count)
      if ((a._reviews > prevReviews) && a._artist) g._artist = a._artist;
    }
  }
  rows = Object.values(grouped);

  if (q) rows = rows.filter(a =>
    a._title.toLowerCase().includes(q) || a._artist.toLowerCase().includes(q)
  );
  if (minReviews > 0) rows = rows.filter(a => a._reviews >= minReviews);

  // ✅ Correct sorting (no .reverse())
  const [key, dir] = sortSel.split(':');
  const mult = dir === 'asc' ? 1 : -1;
  rows.sort((a,b) => {
    switch (key) {
      case 'reviews':
        return (a._reviews - b._reviews) * mult;
      case 'title':
        return a._title.localeCompare(b._title, undefined, { sensitivity: 'base' }) * mult;
      case 'artist':
        return a._artist.localeCompare(b._artist, undefined, { sensitivity: 'base' }) * mult;
      case 'avg':
      default: {
        const av = a._avg ?? -Infinity;
        const bv = b._avg ?? -Infinity;
        return (av - bv) * mult; // desc => largest first; asc => smallest first
      }
    }
  });

  els.albumsAll.innerHTML = rows.length
    ? renderAlbumsTable(rows)
    : `<div class="muted small">No reviewed albums match.</div>`;
}


async function refreshAlbums(){
  if (!els.albumsAll) return;
  try {
    els.albumsAll.innerHTML = `<div class="muted small">Loading…</div>`;

    // album stats (public view)
    const stats = await apiGet("/api/db/album_stats_public");
    _albumsRaw = Array.isArray(stats) ? stats : [];

    // review counts (prefer public aggregate)
    _reviewCounts = await getAlbumReviewCounts();

    renderAlbums();
  } catch (e) {
    const err = `<div class="muted small">Error: ${escapeHtml(e.message)}</div>`;
    els.albumsAll.innerHTML = err;
  }
}


// Controls
if (els.albumSearch)   els.albumSearch.addEventListener("input", renderAlbums);
if (els.albumMinPlays) els.albumMinPlays.addEventListener("input", renderAlbums);
if (els.albumMinRated) els.albumMinRated.addEventListener("change", renderAlbums);
if (els.albumSort)     els.albumSort.addEventListener("change", renderAlbums);

// ------------- Songs -------------
let _songsRaw = [];
// keep this helper if you already added it
function setSongSort(key, dir){
  const next = `${key}:${dir}`;
  if (els.songSort) els.songSort.value = next;
  renderSongs();
}

function renderSongs(){
  if (!els.songsList) return;

  const q = (els.songSearch?.value || "").toLowerCase().trim();
  const sortSel = (els.songSort?.value || "plays:desc").toLowerCase(); // key:dir

  let rows = Array.isArray(_songsRaw) ? [..._songsRaw] : [];

  // normalize fields coming from /api/db/top_songs (or songs_public)
  rows = rows.map(s => {
    const title    = String(val(s, "title","name") ?? "");
    const artist   = String(val(s, "artist","artist_name") ?? "");
    const plays    = Number(val(s, "plays","numPlays","total_plays")) || 0;
    const avgVal   = Number(val(s, "avg","avg_rating","avg_score"));
    const avg      = isNaN(avgVal) ? undefined : avgVal;
    const recent   = val(s, "lastPlayed","last_played","recent_played_at","updatedAt","updated_at");
    const likes    = Number(val(s, "likes","likeCount","like_count")) || 0;
    const dislikes = Number(val(s, "dislikes","dislikeCount","dislike_count")) || 0;
    const stars    = Number(val(s, "stars","starCount","star_count","starRating","star_rating")) || 0;
    return { ...s, _title:title, _artist:artist, _plays:plays, _avg:avg, _recent:recent, _likes:likes, _dislikes:dislikes, _stars:stars };
  });

  // drop “unknown”, then search
  rows = rows.filter(s => s._title && s._title.trim().toLowerCase() !== "unknown");
  if (q) rows = rows.filter(s =>
    s._title.toLowerCase().includes(q) || s._artist.toLowerCase().includes(q)
  );

  // sort
  const [key, dir] = sortSel.split(":");
  const mult = dir === "asc" ? 1 : -1;
  rows.sort((a,b) => {
    switch (key) {
      case "avg":      return ((a._avg ?? -Infinity) - (b._avg ?? -Infinity)) * mult;
      case "recency": {
        const at = a._recent ? new Date(typeof a._recent === 'number' && a._recent < 1e12 ? a._recent*1000 : a._recent).getTime() : 0;
        const bt = b._recent ? new Date(typeof b._recent === 'number' && b._recent < 1e12 ? b._recent*1000 : b._recent).getTime() : 0;
        return (at - bt) * mult;
      }
      case "title":    return a._title .localeCompare(b._title,  undefined, {sensitivity:"base"}) * mult;
      case "artist":   return a._artist.localeCompare(b._artist, undefined, {sensitivity:"base"}) * mult;
      case "likes":    return (a._likes    - b._likes)    * mult;
      case "dislikes": return (a._dislikes - b._dislikes) * mult;
      case "stars":    return (a._stars    - b._stars)    * mult;
      case "plays":
      default:         return (a._plays    - b._plays)    * mult;
    }
  });

  if (rows.length === 0) {
    els.songsList.innerHTML = `<div class="muted small">No songs match.</div>`;
    return;
  }

  const maxPlays = Math.max(1, ...rows.map(r => r._plays));
  const icon = (k) => {
    const [ck, cd] = sortSel.split(":");
    if (k !== ck) return `<span class="sort">↕</span>`;
    return `<span class="sort">${cd === "asc" ? "▲" : "▼"}</span>`;
  };

  const body = rows.map((s, i) => {
    const pct    = Math.round((s._plays / maxPlays) * 100);
    const avgTxt = (typeof s._avg === "number") ? s._avg.toFixed(2) : "—";
    const recent = s._recent ? briefDate(s._recent) : "—";
    return `
      <tr>
        <td class="rank">${i + 1}</td>
        <td class="title-cell">
          <span class="truncate" title="${escapeHtml(s._title)}">${escapeHtml(s._title)}</span>
          <span class="artist-mobile muted small truncate" title="${escapeHtml(s._artist)}">${escapeHtml(s._artist)}</span>
        </td>
        <td class="artist-cell"><span class="truncate" title="${escapeHtml(s._artist)}">${escapeHtml(s._artist)}</span></td>
        <td class="avg-cell"><span class="avg-badge">${avgTxt}</span></td>
        <td class="likes-cell"><span class="chip chip-ok" title="Likes">👍 ${s._likes}</span></td>
        <td class="dislikes-cell"><span class="chip chip-warn" title="Dislikes">👎 ${s._dislikes}</span></td>
        <td class="stars-cell"><span class="chip" title="Stars">⭐ ${s._stars}</span></td>
        <td class="plays-cell">
          <div class="plays" title="${s._plays} plays">
            <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
            <div class="count">${s._plays}</div>
          </div>
        </td>
        <td class="recent-cell small">${escapeHtml(recent)}</td>
      </tr>
    `;
  }).join("");

  els.songsList.innerHTML = `
    <div class="table-wrap">
      <table class="data" id="songsDataTable">
        <thead>
          <tr>
            <th style="width:56px;text-align:center;">#</th>
            <th data-col="title">Title ${icon("title")}</th>
            <th data-col="artist">Artist ${icon("artist")}</th>
            <th style="width:110px;text-align:right;" data-col="avg">Avg ${icon("avg")}</th>
            <th style="width:110px;text-align:right;" data-col="likes">Likes ${icon("likes")}</th>
            <th style="width:120px;text-align:right;" data-col="dislikes">Dislikes ${icon("dislikes")}</th>
            <th style="width:100px;text-align:right;" data-col="stars">Stars ${icon("stars")}</th>
            <th style="width:240px;" data-col="plays">Plays ${icon("plays")}</th>
            <th style="width:170px;" data-col="recency">Last played ${icon("recency")}</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
      <div class="muted small" style="margin-top:6px;">Showing ${rows.length} songs.</div>
    </div>
  `;

  // header-click sorting
  const thead = document.querySelector("#songsDataTable thead");
  if (thead) {
    thead.onclick = (ev) => {
      const th = ev.target.closest("th[data-col]");
      if (!th) return;
      const col = th.getAttribute("data-col");
      const [ck, cd] = sortSel.split(":");
      const defaultDir = (col === "title" || col === "artist") ? "asc" : "desc";
      const nextDir = (ck === col) ? (cd === "asc" ? "desc" : "asc") : defaultDir;
      setSongSort(col, nextDir);
    };
  }
}


async function refreshSongs(){
  if (!els.songsList) return;
  try {
    els.songsList.innerHTML = `<div class="muted small">Loading…</div>`;
    const songs = await apiGet("/api/db/top_songs");
    _songsRaw = Array.isArray(songs) ? songs : [];
    renderSongs();
  } catch (e) {
    els.songsList.innerHTML = `<div class="muted small">Error: ${escapeHtml(e.message)}</div>`;
  }
}

if (els.songSearch) els.songSearch.addEventListener("input", renderSongs);
if (els.songSort) els.songSort.addEventListener("change", renderSongs);

// ------------- Lottery tab -------------
async function refreshLottery(){
  if (!els.lotteryBalls) return;
  try {
    const res = await fetch(`${API_ORIGIN}/api/siteData`);
    if (!res.ok) throw new Error(`siteData ${res.status}`);
    const data = await res.json();

    const raw = Array.isArray(data?.lottery?.stats) ? data.lottery.stats : [];
    const stats = raw.map(b => ({ number: Number(b.number), count: Number(b.count) || 0 }));
    const byNum = new Map(stats.map(({ number, count }) => [number, count]));
    const MAX_BALL = 99;

    const html = Array.from({ length: MAX_BALL }, (_, i) => {
      const n = i + 1;
      const c = byNum.get(n) ?? 0;
      const cls = c >= 3 ? 'count-3' : (c === 2 ? 'count-2' : (c === 1 ? 'count-1' : ''));
      return `<div class="ball ${cls}" data-ball="${n}" data-count="${c}">
                <div class="num">${n}</div>
                <div class="cnt">${c}</div>
              </div>`;
    }).join("");

    els.lotteryBalls.innerHTML = `<div class="lottery-grid">${html}</div>`;
  } catch (e) {
    els.lotteryBalls.innerHTML = `<div class="muted small">Error: ${escapeHtml(e.message)}</div>`;
  }
}
// ------------- Wrapped (2026) -------------
function renderWrappedTable(container, rows, cols) {
  if (!container) return;
  if (!Array.isArray(rows) || rows.length === 0) {
    container.innerHTML = `<div class="muted small">No data yet.</div>`;
    return;
  }

  const header = cols.map(c => `<th>${escapeHtml(c.label)}</th>`).join("");
  const body = rows.slice(0, 50).map((r, i) => {
    const tds = cols.map(c => `<td>${escapeHtml(String(r[c.key] ?? ""))}</td>`).join("");
    return `<tr><td style="text-align:center;">${i + 1}</td>${tds}</tr>`;
  }).join("");

  container.innerHTML = `
    <div class="table-wrap">
      <table class="data">
        <thead>
          <tr><th style="width:56px;text-align:center;">#</th>${header}</tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
      <div class="muted small" style="margin-top:6px;">Showing top ${Math.min(50, rows.length)}.</div>
    </div>
  `;
}

async function refreshWrapped() {
  const year = String(els.wrappedYear?.value || "2026").trim();

  // Your publisher is creating these exact public tables:
  // wrapped_2026_top_songs, wrapped_2026_top_artists, wrapped_2026_top_djs
  const tSongs = `wrapped_${year}_top_songs`;
  const tArtists = `wrapped_${year}_top_artists`;
  const tDjs = `wrapped_${year}_top_djs`;

  if (els.wrappedTopSongs) els.wrappedTopSongs.innerHTML = `<div class="muted small">Loading…</div>`;
  if (els.wrappedTopArtists) els.wrappedTopArtists.innerHTML = `<div class="muted small">Loading…</div>`;
  if (els.wrappedTopDjs) els.wrappedTopDjs.innerHTML = `<div class="muted small">Loading…</div>`;

  try {
    const [songs, artists, djs] = await Promise.all([
      apiGet(`/api/db/${tSongs}`, false).catch(() => []),
      apiGet(`/api/db/${tArtists}`, false).catch(() => []),
      apiGet(`/api/db/${tDjs}`, false).catch(() => []),
    ]);

    renderWrappedTable(els.wrappedTopSongs, songs, [
      { key: "title", label: "Song" },
      { key: "artist", label: "Artist" },
      { key: "plays", label: "Plays" },
    ]);

    renderWrappedTable(els.wrappedTopArtists, artists, [
      { key: "artist", label: "Artist" },
      { key: "plays", label: "Plays" },
    ]);

    renderWrappedTable(els.wrappedTopDjs, djs, [
      { key: "dj", label: "DJ" },
      { key: "plays", label: "Plays" },
    ]);
  } catch (e) {
    const msg = `<div class="muted small">Error: ${escapeHtml(e.message)}</div>`;
    if (els.wrappedTopSongs) els.wrappedTopSongs.innerHTML = msg;
    if (els.wrappedTopArtists) els.wrappedTopArtists.innerHTML = msg;
    if (els.wrappedTopDjs) els.wrappedTopDjs.innerHTML = msg;
  }
}

if (els.wrappedRefresh) els.wrappedRefresh.addEventListener("click", refreshWrapped);
if (els.wrappedYear) els.wrappedYear.addEventListener("change", refreshWrapped);


// ------------- Boot -------------
async function refreshAll() {
  await Promise.all([
    refreshPublic(),
    refreshMod(),
    refreshStats(),
    refreshGames(),
    refreshAlbums(),
    refreshSongs(),
    refreshLottery(),
    refreshWrapped(),
  ]);
}

(async function init(){
  try {
    setupTabs();                // ensure tabs are clickable
    await chooseApiOrigin();
    await refreshAll();
    setInterval(refreshStats, 15000);
    setInterval(refreshGames, 30000);
    setInterval(refreshLottery, 30000);
    setInterval(refreshAlbums, 60000);
    setInterval(refreshSongs, 60000);
    setInterval(refreshWrapped, 60000);

  } catch (e) {
    console.error("[jj] init failed", e);
    toast("Init failed: " + e.message);
  }
})();
