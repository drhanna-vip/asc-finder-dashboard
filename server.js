'use strict';
const express = require('express');
const session = require('express-session');
const csrf = require('csurf');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10002;
const DASH_PASSWORD = process.env.DASH_PASSWORD || 'vip41';
const AUTH_USER = process.env.AUTH_USER || 'gh';
const SESSION_SECRET = process.env.SESSION_SECRET || 'asc-finder-secret-2026';

// Pre-hash password
const PASS_HASH = bcrypt.hashSync(DASH_PASSWORD, 10);

const DATA_DIR = path.join(__dirname, 'data');
const VIP_LOC_FILE = path.join(DATA_DIR, 'vip-locations.json');
const ASCS_FILE = path.join(DATA_DIR, 'ascs.json');
const NOTES_FILE = path.join(DATA_DIR, 'user-notes.json');

// Ensure data files exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(NOTES_FILE)) fs.writeFileSync(NOTES_FILE, '{}');

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch(e) { return fallback; }
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  name: 'gh_asc_auth',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

const csrfProtection = csrf();

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.redirect('/login');
}

// ==================== LOGIN ====================
app.get('/login', csrfProtection, (req, res) => {
  const err = req.query.err ? '<p class="error">Invalid credentials</p>' : '';
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VIP ASC Finder — Login</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a1628;display:flex;align-items:center;justify-content:center;height:100vh;font-family:'Segoe UI',sans-serif}
.card{background:#fff;border-radius:12px;padding:48px 40px;width:380px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.logo{text-align:center;margin-bottom:32px}
.logo h1{color:#0a1628;font-size:1.6rem;font-weight:800}
.logo p{color:#c8a951;font-size:.85rem;letter-spacing:.05em;text-transform:uppercase;margin-top:4px}
label{display:block;font-size:.8rem;font-weight:600;color:#555;margin-bottom:6px;margin-top:16px}
input{width:100%;padding:10px 14px;border:1px solid #ddd;border-radius:6px;font-size:.95rem;outline:none}
input:focus{border-color:#0a1628}
button{width:100%;background:#c8a951;color:#0a1628;border:none;padding:13px;border-radius:6px;font-size:1rem;font-weight:700;cursor:pointer;margin-top:24px;letter-spacing:.03em}
button:hover{background:#b8963f}
.error{color:#e33;font-size:.85rem;margin-top:12px;text-align:center}
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <h1>VIP ASC Finder</h1>
    <p>Ambulatory Surgical Center Intelligence</p>
  </div>
  <form method="POST" action="/login">
    <input type="hidden" name="_csrf" value="${req.csrfToken()}">
    <label>Username</label>
    <input type="text" name="username" autocomplete="username" required>
    <label>Password</label>
    <input type="password" name="password" autocomplete="current-password" required>
    <button type="submit">Sign In</button>
    ${err}
  </form>
</div>
</body></html>`);
});

app.post('/login', csrfProtection, async (req, res) => {
  const { username, password } = req.body;
  if (username === AUTH_USER && await bcrypt.compare(password, PASS_HASH)) {
    req.session.authenticated = true;
    res.redirect('/');
  } else {
    res.redirect('/login?err=1');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ==================== API ====================
app.get('/api/vip-locations', requireAuth, (req, res) => {
  res.json(readJSON(VIP_LOC_FILE, []));
});

app.get('/api/ascs', requireAuth, (req, res) => {
  const ascs = readJSON(ASCS_FILE, []);
  const notes = readJSON(NOTES_FILE, {});
  // Merge notes into ASC objects
  const merged = ascs.map(a => {
    const n = notes[a.id] || {};
    return { ...a, notes: n.notes || a.notes || '', checklist: n.checklist || a.checklist || {} };
  });
  res.json(merged);
});

app.post('/api/ascs/:id/notes', requireAuth, express.json(), (req, res) => {
  const { id } = req.params;
  const { notes, checklist } = req.body;
  const allNotes = readJSON(NOTES_FILE, {});
  allNotes[id] = { notes: notes || '', checklist: checklist || {}, updatedAt: new Date().toISOString() };
  writeJSON(NOTES_FILE, allNotes);
  res.json({ ok: true });
});

app.get('/api/stats', requireAuth, (req, res) => {
  const ascs = readJSON(ASCS_FILE, []);
  const vips = readJSON(VIP_LOC_FILE, []);
  const notes = readJSON(NOTES_FILE, {});
  const states = [...new Set(ascs.map(a => a.state))].sort();
  res.json({
    vipCount: vips.length,
    ascCount: ascs.length,
    innLikely: ascs.filter(a => a.innStatus === 'INN-likely').length,
    innVerify: ascs.filter(a => a.innStatus === 'INN-verify').length,
    withNotes: Object.keys(notes).filter(k => notes[k].notes).length,
    states
  });
});

// ==================== MAIN DASHBOARD ====================
app.get('/', requireAuth, (req, res) => {
  res.send(getDashboardHTML());
});

function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>VIP ASC Finder Dashboard</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#0a1628;--gold:#c8a951;--gold-light:#e8c96b;--light-bg:#f4f6f9;
  --white:#fff;--gray:#6b7280;--border:#e5e7eb;--success:#10b981;--warn:#f59e0b;
}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--light-bg);color:#1f2937;overflow:hidden;height:100vh;display:flex;flex-direction:column}

/* HEADER */
.header{background:var(--navy);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;z-index:1000}
.header-left{display:flex;align-items:center;gap:16px}
.brand{color:var(--white);font-size:1.1rem;font-weight:800;letter-spacing:.02em}
.brand span{color:var(--gold)}
.header-stats{display:flex;gap:16px}
.stat-chip{background:rgba(255,255,255,.08);border-radius:20px;padding:4px 12px;font-size:.75rem;color:var(--gold-light)}
.stat-chip b{color:var(--white)}
.logout-btn{color:rgba(255,255,255,.6);font-size:.8rem;text-decoration:none;padding:6px 12px;border:1px solid rgba(255,255,255,.2);border-radius:6px}
.logout-btn:hover{background:rgba(255,255,255,.1);color:var(--white)}

/* TABS */
.tabs{background:var(--white);border-bottom:2px solid var(--border);padding:0 20px;display:flex;gap:4px;flex-shrink:0}
.tab-btn{padding:12px 20px;font-size:.88rem;font-weight:600;color:var(--gray);border:none;background:none;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px;transition:.15s}
.tab-btn:hover{color:var(--navy)}
.tab-btn.active{color:var(--navy);border-bottom-color:var(--gold)}

/* CONTENT */
.content{flex:1;overflow:hidden;display:flex}
.tab-panel{display:none;flex:1;overflow:hidden}
.tab-panel.active{display:flex}

/* ===== TAB 1: MAP ===== */
#tab-map{flex-direction:column}
.map-controls{background:var(--white);padding:12px 16px;display:flex;align-items:center;gap:12px;border-bottom:1px solid var(--border);flex-shrink:0;flex-wrap:wrap}
.radius-group{display:flex;gap:4px;align-items:center}
.radius-group label{font-size:.8rem;font-weight:600;color:var(--gray)}
.radius-btn{padding:5px 14px;border:2px solid var(--border);border-radius:20px;background:none;font-size:.78rem;font-weight:600;cursor:pointer;transition:.15s}
.radius-btn.active{background:var(--navy);color:var(--white);border-color:var(--navy)}
.filter-group{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.filter-group label{font-size:.8rem;font-weight:600;color:var(--gray)}
select.filter-sel{padding:5px 10px;border:1px solid var(--border);border-radius:6px;font-size:.8rem;background:var(--white)}
.map-body{flex:1;display:flex;overflow:hidden}
#map{flex:1}
.map-sidebar{width:340px;background:var(--white);border-left:1px solid var(--border);overflow-y:auto;display:flex;flex-direction:column;transition:.3s}
.sidebar-header{padding:16px;background:var(--navy);color:var(--white);font-weight:700;font-size:.9rem}
.sidebar-header span{font-size:.75rem;font-weight:400;opacity:.7;display:block;margin-top:2px}
.asc-list-item{padding:14px 16px;border-bottom:1px solid var(--border);cursor:pointer;transition:.1s}
.asc-list-item:hover{background:var(--light-bg)}
.asc-name{font-weight:600;font-size:.88rem;color:var(--navy)}
.asc-meta{font-size:.75rem;color:var(--gray);margin-top:3px}
.inn-badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.7rem;font-weight:700}
.inn-likely{background:#d1fae5;color:#065f46}
.inn-verify{background:#fef3c7;color:#92400e}
.distance-tag{font-size:.72rem;color:var(--gray);margin-top:2px}
.no-selection{padding:32px 16px;text-align:center;color:var(--gray);font-size:.88rem}
.no-selection .icon{font-size:2.5rem;margin-bottom:12px}

/* ===== TAB 2: DATABASE ===== */
#tab-db{flex-direction:column}
.db-toolbar{padding:14px 20px;background:var(--white);border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center;flex-wrap:wrap;flex-shrink:0}
.search-box{flex:1;min-width:200px;max-width:360px;position:relative}
.search-box input{width:100%;padding:8px 12px 8px 36px;border:1px solid var(--border);border-radius:8px;font-size:.88rem}
.search-box::before{content:'🔍';position:absolute;left:10px;top:50%;transform:translateY(-50%);font-size:.8rem}
.db-filters{display:flex;gap:8px;flex-wrap:wrap}
.db-filters select{padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:.8rem}
.db-table-wrap{flex:1;overflow:auto;padding:0 0 20px}
table{width:100%;border-collapse:collapse;font-size:.83rem}
thead{background:var(--navy);color:var(--white);position:sticky;top:0;z-index:10}
th{padding:12px 14px;text-align:left;font-weight:600;white-space:nowrap;cursor:pointer;user-select:none}
th:hover{background:rgba(255,255,255,.1)}
th.sort-asc::after{content:' ↑'}
th.sort-desc::after{content:' ↓'}
td{padding:10px 14px;border-bottom:1px solid var(--border);vertical-align:middle}
tr:hover td{background:#f9fafb}
.action-btn{padding:4px 10px;border-radius:5px;border:1px solid var(--border);background:var(--white);font-size:.75rem;cursor:pointer;margin-right:4px}
.action-btn:hover{background:var(--navy);color:var(--white);border-color:var(--navy)}
.action-btn.checklist-btn{border-color:var(--gold)}
.action-btn.checklist-btn:hover{background:var(--gold);color:var(--navy)}
.note-inline{width:100%;padding:6px 8px;border:1px solid var(--gold);border-radius:4px;font-size:.8rem;margin-top:6px;resize:vertical;min-height:60px}
.note-save-btn{padding:5px 12px;background:var(--navy);color:var(--white);border:none;border-radius:4px;font-size:.75rem;cursor:pointer;margin-top:4px}
.note-saved{color:var(--success);font-size:.75rem;margin-top:4px}

/* ===== TAB 3: VIP LOCATIONS ===== */
#tab-vip{flex-direction:column}
.vip-toolbar{padding:14px 20px;background:var(--white);border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center;flex-shrink:0}
.vip-table-wrap{flex:1;overflow:auto;padding:0 0 20px}

/* ===== MODAL ===== */
.modal-overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.5);z-index:9999;align-items:center;justify-content:center}
.modal-overlay.open{display:flex}
.modal{background:var(--white);border-radius:12px;padding:28px 32px;width:540px;max-height:80vh;overflow-y:auto;position:relative}
.modal h2{color:var(--navy);font-size:1.1rem;margin-bottom:6px}
.modal .asc-subtitle{color:var(--gray);font-size:.82rem;margin-bottom:20px}
.modal-close{position:absolute;top:16px;right:20px;background:none;border:none;font-size:1.4rem;cursor:pointer;color:var(--gray)}
.checklist-section label{display:block;font-size:.85rem;padding:8px 0;border-bottom:1px solid var(--border);cursor:pointer;display:flex;align-items:center;gap:8px}
.checklist-section label:last-child{border-bottom:none}
.checklist-section input[type=checkbox]{width:16px;height:16px;accent-color:var(--navy)}
.designation-btns{display:flex;gap:8px;margin-top:12px}
.desig-btn{flex:1;padding:8px;border:2px solid var(--border);border-radius:6px;font-size:.8rem;font-weight:600;cursor:pointer;background:none;transition:.15s}
.desig-btn.active-desig{background:var(--navy);color:var(--white);border-color:var(--navy)}
.custom-checklist-input{margin-top:12px;display:flex;gap:8px}
.custom-checklist-input input{flex:1;padding:7px 10px;border:1px solid var(--border);border-radius:5px;font-size:.82rem}
.custom-checklist-input button{padding:7px 14px;background:var(--gold);color:var(--navy);border:none;border-radius:5px;font-weight:700;cursor:pointer}
.save-checklist-btn{width:100%;padding:11px;background:var(--navy);color:var(--white);border:none;border-radius:6px;font-size:.9rem;font-weight:700;cursor:pointer;margin-top:20px}
.save-checklist-btn:hover{background:#1a2d4e}
.leaflet-popup-content{font-size:.82rem;line-height:1.6}
.popup-name{font-weight:700;font-size:.9rem;color:var(--navy);margin-bottom:4px}
.popup-inn{font-size:.75rem;font-weight:700;padding:2px 7px;border-radius:10px;display:inline-block;margin-bottom:6px}

/* Responsive */
@media(max-width:768px){
  .map-sidebar{display:none}
  .header-stats{display:none}
}
</style>
</head>
<body>

<!-- HEADER -->
<div class="header">
  <div class="header-left">
    <div class="brand">VIP <span>ASC Finder</span></div>
    <div class="header-stats" id="headerStats">
      <span class="stat-chip"><b id="statVips">—</b> VIP Offices</span>
      <span class="stat-chip"><b id="statAscs">—</b> ASCs</span>
      <span class="stat-chip"><b id="statInn">—</b> INN-likely</span>
    </div>
  </div>
  <a href="/logout" class="logout-btn">Sign Out</a>
</div>

<!-- TABS -->
<div class="tabs">
  <button class="tab-btn active" onclick="showTab('map',this)">🗺 Map View</button>
  <button class="tab-btn" onclick="showTab('db',this)">📋 ASC Database</button>
  <button class="tab-btn" onclick="showTab('vip',this)">📍 VIP Locations</button>
</div>

<!-- CONTENT -->
<div class="content">

  <!-- TAB 1: MAP -->
  <div class="tab-panel active" id="tab-map">
    <div style="display:flex;flex-direction:column;flex:1;overflow:hidden">
      <div class="map-controls">
        <div class="radius-group">
          <label>Radius:</label>
          <button class="radius-btn" onclick="setRadius(5,this)">5 mi</button>
          <button class="radius-btn active" onclick="setRadius(10,this)">10 mi</button>
          <button class="radius-btn" onclick="setRadius(25,this)">25 mi</button>
        </div>
        <div class="filter-group">
          <label>State:</label>
          <select class="filter-sel" id="mapStateFilter" onchange="applyMapFilters()">
            <option value="">All States</option>
            <option value="NY">NY</option><option value="NJ">NJ</option>
            <option value="CT">CT</option><option value="MD">MD</option>
            <option value="TX">TX</option><option value="CA">CA</option>
          </select>
          <label>INN:</label>
          <select class="filter-sel" id="mapInnFilter" onchange="applyMapFilters()">
            <option value="">All</option>
            <option value="INN-likely">INN-likely</option>
            <option value="INN-verify">INN-verify</option>
          </select>
        </div>
        <div style="margin-left:auto;font-size:.8rem;color:var(--gray)" id="mapCounter">Loading data...</div>
      </div>
      <div class="map-body">
        <div id="map"></div>
        <div class="map-sidebar" id="mapSidebar">
          <div class="no-selection">
            <div class="icon">📍</div>
            <p>Click a <b>VIP office</b> (blue marker) to see nearby ASCs</p>
            <p style="margin-top:8px;font-size:.75rem">Use radius buttons to adjust search distance</p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- TAB 2: DATABASE -->
  <div class="tab-panel" id="tab-db">
    <div style="display:flex;flex-direction:column;flex:1;overflow:hidden">
      <div class="db-toolbar">
        <div class="search-box">
          <input type="text" id="dbSearch" placeholder="Search ASC name, city..." oninput="renderTable()">
        </div>
        <div class="db-filters">
          <select id="dbState" onchange="renderTable()">
            <option value="">All States</option>
            <option value="NY">NY</option><option value="NJ">NJ</option>
            <option value="CT">CT</option><option value="MD">MD</option>
            <option value="TX">TX</option><option value="CA">CA</option>
          </select>
          <select id="dbInn" onchange="renderTable()">
            <option value="">All INN Status</option>
            <option value="INN-likely">INN-likely</option>
            <option value="INN-verify">INN-verify</option>
          </select>
          <select id="dbNotes" onchange="renderTable()">
            <option value="">All</option>
            <option value="notes">Has Notes</option>
            <option value="checklist">Has Checklist</option>
          </select>
        </div>
        <span id="dbCount" style="font-size:.8rem;color:var(--gray);margin-left:auto"></span>
      </div>
      <div class="db-table-wrap">
        <table id="ascTable">
          <thead>
            <tr>
              <th onclick="sortTable('name')">Name</th>
              <th onclick="sortTable('state')">State</th>
              <th onclick="sortTable('city')">City</th>
              <th onclick="sortTable('innStatus')">INN Status</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="ascTableBody">
            <tr><td colspan="6" style="text-align:center;padding:40px;color:var(--gray)">Loading ASC data...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- TAB 3: VIP LOCATIONS -->
  <div class="tab-panel" id="tab-vip">
    <div style="display:flex;flex-direction:column;flex:1;overflow:hidden">
      <div class="vip-toolbar">
        <input type="text" id="vipSearch" placeholder="Search VIP locations..." oninput="renderVipTable()"
          style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;font-size:.88rem;width:280px">
        <select id="vipStateFilter" onchange="renderVipTable()"
          style="padding:8px 10px;border:1px solid var(--border);border-radius:6px;font-size:.8rem">
          <option value="">All States</option>
          <option value="NY">NY</option><option value="NJ">NJ</option>
          <option value="CT">CT</option><option value="MD">MD</option>
          <option value="TX">TX</option><option value="CA">CA</option>
        </select>
        <span id="vipCount" style="font-size:.8rem;color:var(--gray);margin-left:auto"></span>
      </div>
      <div class="vip-table-wrap">
        <table id="vipTable">
          <thead>
            <tr>
              <th>#</th><th>Name</th><th>State</th><th>City</th><th>Address</th><th>Action</th>
            </tr>
          </thead>
          <tbody id="vipTableBody"></tbody>
        </table>
      </div>
    </div>
  </div>
</div>

<!-- CHECKLIST MODAL -->
<div class="modal-overlay" id="checklistModal">
  <div class="modal">
    <button class="modal-close" onclick="closeModal()">×</button>
    <h2 id="modalTitle">ASC Checklist</h2>
    <div class="asc-subtitle" id="modalSubtitle"></div>
    
    <div class="checklist-section" id="checklistItems"></div>
    
    <div style="margin-top:16px">
      <label style="font-size:.8rem;font-weight:600;color:var(--gray);display:block;margin-bottom:6px">Backup Designation:</label>
      <div class="designation-btns" id="designationBtns">
        <button class="desig-btn" data-desig="active" onclick="setDesig('active')">✓ Active</button>
        <button class="desig-btn" data-desig="contingency" onclick="setDesig('contingency')">Contingency</button>
        <button class="desig-btn" data-desig="inactive" onclick="setDesig('inactive')">Inactive</button>
      </div>
    </div>
    
    <div class="custom-checklist-input">
      <input type="text" id="customCheckItem" placeholder="Add custom checklist item...">
      <button onclick="addCustomItem()">+Add</button>
    </div>
    
    <button class="save-checklist-btn" onclick="saveChecklist()">💾 Save Checklist</button>
  </div>
</div>

<script>
// ==================== DATA ====================
let vipLocations = [];
let allAscs = [];
let sortCol = 'name', sortDir = 1;
let currentRadius = 10;
let map, vipMarkers = [], ascMarkers = [], circleLayer = null;
let activeVipId = null;
let modalAscId = null;

const CHECKLIST_DEFAULTS = [
  {key:'outreach', label:'Initial outreach made'},
  {key:'contract', label:'Contract reviewed'},
  {key:'credentialing', label:'Credentialing complete'},
  {key:'network_confirmed', label:'Network status confirmed'},
  {key:'vip_vein', label:'VIP procedures: Vein'},
  {key:'vip_pain', label:'VIP procedures: Pain'},
  {key:'contact_confirmed', label:'Contact name + direct line confirmed'},
];

// ==================== INIT ====================
async function init() {
  await Promise.all([loadVipLocations(), loadAscs()]);
  loadStats();
  initMap();
  renderTable();
  renderVipTable();
}

async function loadVipLocations() {
  const r = await fetch('/api/vip-locations');
  vipLocations = await r.json();
}

async function loadAscs() {
  const r = await fetch('/api/ascs');
  allAscs = await r.json();
}

async function loadStats() {
  const r = await fetch('/api/stats');
  const s = await r.json();
  document.getElementById('statVips').textContent = s.vipCount;
  document.getElementById('statAscs').textContent = s.ascCount;
  document.getElementById('statInn').textContent = s.innLikely;
}

// ==================== TABS ====================
function showTab(name, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-'+name).classList.add('active');
  btn.classList.add('active');
  if (name === 'map') { setTimeout(() => map && map.invalidateSize(), 100); }
}

// ==================== MAP ====================
function initMap() {
  map = L.map('map', { center: [40.75, -73.98], zoom: 10 });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors', maxZoom: 19
  }).addTo(map);
  
  const vipIcon = L.divIcon({
    html: '<div style="background:#0a1628;color:#c8a951;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid #c8a951;box-shadow:0 2px 6px rgba(0,0,0,.4)">V</div>',
    iconSize:[28,28], iconAnchor:[14,14], className:''
  });
  
  const ascIcon = L.divIcon({
    html: '<div style="background:#c8a951;color:#0a1628;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px;border:2px solid #0a1628;box-shadow:0 2px 6px rgba(0,0,0,.3)">✦</div>',
    iconSize:[22,22], iconAnchor:[11,11], className:''
  });

  // Place VIP markers
  vipLocations.filter(v => v.lat && v.lng).forEach(v => {
    const m = L.marker([v.lat, v.lng], { icon: vipIcon })
      .addTo(map)
      .bindTooltip(v.name, {permanent:false, direction:'top'});
    m.on('click', () => selectVip(v));
    vipMarkers.push({ vip: v, marker: m });
  });

  // Place ASC markers (hidden initially, shown by filter)
  allAscs.filter(a => a.lat && a.lng).forEach(a => {
    const c = a.innStatus === 'INN-likely' ? '#10b981' : '#f59e0b';
    const icon = L.divIcon({
      html: \`<div style="background:\${c};color:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:9px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.3)">✦</div>\`,
      iconSize:[18,18], iconAnchor:[9,9], className:''
    });
    const m = L.marker([a.lat, a.lng], { icon })
      .bindPopup(buildAscPopup(a, null));
    m.vipAsc = a;
    ascMarkers.push({ asc: a, marker: m });
  });

  applyMapFilters();
}

function buildAscPopup(a, distMi) {
  const inn = a.innStatus === 'INN-likely'
    ? '<span class="popup-inn" style="background:#d1fae5;color:#065f46">INN-likely</span>'
    : '<span class="popup-inn" style="background:#fef3c7;color:#92400e">INN-verify</span>';
  const dist = distMi != null ? \`<div style="color:#6b7280;font-size:.75rem">📏 \${distMi.toFixed(1)} mi from selected VIP</div>\` : '';
  const notePreview = a.notes ? \`<div style="margin-top:6px;font-size:.75rem;color:#374151;background:#f9fafb;padding:5px 7px;border-radius:4px">\${a.notes.substring(0,80)}\${a.notes.length>80?'...':''}</div>\` : '';
  return \`<div class="leaflet-popup-content" style="min-width:220px">
    <div class="popup-name">\${a.name}</div>
    \${inn}
    <div>\${a.address}, \${a.city}, \${a.state} \${a.zip}</div>
    \${a.phone ? '<div>📞 '+a.phone+'</div>' : ''}
    \${dist}
    \${notePreview}
    <button onclick="openChecklist('\${a.id}')" style="margin-top:8px;padding:4px 10px;background:#0a1628;color:#fff;border:none;border-radius:4px;font-size:.75rem;cursor:pointer">📋 Checklist</button>
  </div>\`;
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R*2*Math.asin(Math.sqrt(a));
}

function setRadius(r, btn) {
  currentRadius = r;
  document.querySelectorAll('.radius-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  if (activeVipId) {
    const v = vipLocations.find(x => x.id === activeVipId);
    if (v) selectVip(v);
  } else {
    applyMapFilters();
  }
}

function applyMapFilters() {
  const stateF = document.getElementById('mapStateFilter').value;
  const innF = document.getElementById('mapInnFilter').value;
  
  let visible = 0;
  ascMarkers.forEach(({ asc, marker }) => {
    const stateOk = !stateF || asc.state === stateF;
    const innOk = !innF || asc.innStatus === innF;
    if (stateOk && innOk && asc.lat && asc.lng) {
      if (!map.hasLayer(marker)) marker.addTo(map);
      visible++;
    } else {
      if (map.hasLayer(marker)) marker.remove();
    }
  });
  
  // VIP markers filter
  vipMarkers.forEach(({ vip, marker }) => {
    const stateOk = !stateF || vip.state === stateF;
    if (stateOk) { if (!map.hasLayer(marker)) marker.addTo(map); }
    else { if (map.hasLayer(marker)) marker.remove(); }
  });
  
  document.getElementById('mapCounter').textContent = \`\${visible} ASCs visible\`;
}

function selectVip(v) {
  activeVipId = v.id;
  if (circleLayer) { map.removeLayer(circleLayer); circleLayer = null; }
  
  // Draw radius circle (approx in meters: 1mi ≈ 1609m)
  const radiusM = currentRadius * 1609;
  circleLayer = L.circle([v.lat, v.lng], {
    radius: radiusM, color: '#c8a951', fillColor: '#c8a951', fillOpacity: 0.05, weight: 2
  }).addTo(map);
  
  map.setView([v.lat, v.lng], currentRadius <= 5 ? 13 : currentRadius <= 10 ? 12 : 10);
  
  const stateF = document.getElementById('mapStateFilter').value;
  const innF = document.getElementById('mapInnFilter').value;
  
  // Find nearby ASCs
  const nearby = [];
  ascMarkers.forEach(({ asc, marker }) => {
    if (!asc.lat || !asc.lng) return;
    const dist = haversine(v.lat, v.lng, asc.lat, asc.lng);
    const stateOk = !stateF || asc.state === stateF;
    const innOk = !innF || asc.innStatus === innF;
    if (dist <= currentRadius && stateOk && innOk) {
      nearby.push({ asc, dist });
      // Update popup with distance
      marker.setPopupContent(buildAscPopup(asc, dist));
      if (!map.hasLayer(marker)) marker.addTo(map);
    }
  });
  
  nearby.sort((a,b) => a.dist - b.dist);
  
  // Render sidebar
  const sidebar = document.getElementById('mapSidebar');
  if (nearby.length === 0) {
    sidebar.innerHTML = \`
      <div class="sidebar-header">\${v.name}<span>\${v.address}</span></div>
      <div class="no-selection"><div class="icon">🔍</div><p>No ASCs found within \${currentRadius} miles</p><p style="margin-top:8px;font-size:.75rem">Try increasing the radius</p></div>
    \`;
  } else {
    let items = nearby.map(({asc, dist}) => {
      const badge = asc.innStatus === 'INN-likely'
        ? '<span class="inn-badge inn-likely">INN-likely</span>'
        : '<span class="inn-badge inn-verify">INN-verify</span>';
      return \`<div class="asc-list-item" onclick="focusAsc('\${asc.id}')">
        <div class="asc-name">\${asc.name}</div>
        <div class="asc-meta">\${asc.city}, \${asc.state} · \${badge}</div>
        <div class="distance-tag">📏 \${dist.toFixed(1)} mi · \${asc.phone || 'No phone'}</div>
      </div>\`;
    }).join('');
    sidebar.innerHTML = \`
      <div class="sidebar-header">\${v.name}<span>\${nearby.length} ASC\${nearby.length!==1?'s':''} within \${currentRadius} mi</span></div>
      \${items}
    \`;
  }
}

function focusAsc(id) {
  const entry = ascMarkers.find(x => x.asc.id === id);
  if (entry && entry.asc.lat) {
    map.setView([entry.asc.lat, entry.asc.lng], 14);
    entry.marker.openPopup();
  }
}

// ==================== TABLE ====================
function renderTable() {
  const search = document.getElementById('dbSearch').value.toLowerCase();
  const stateF = document.getElementById('dbState').value;
  const innF = document.getElementById('dbInn').value;
  const notesF = document.getElementById('dbNotes').value;

  let filtered = allAscs.filter(a => {
    const match = !search || a.name.toLowerCase().includes(search) || a.city.toLowerCase().includes(search) || a.address.toLowerCase().includes(search);
    const stateOk = !stateF || a.state === stateF;
    const innOk = !innF || a.innStatus === innF;
    const notesOk = !notesF ||
      (notesF === 'notes' && a.notes) ||
      (notesF === 'checklist' && Object.keys(a.checklist||{}).length > 0);
    return match && stateOk && innOk && notesOk;
  });

  filtered.sort((a,b) => {
    let va = (a[sortCol]||'').toString().toLowerCase();
    let vb = (b[sortCol]||'').toString().toLowerCase();
    return va < vb ? -sortDir : va > vb ? sortDir : 0;
  });

  document.getElementById('dbCount').textContent = \`\${filtered.length} ASC\${filtered.length!==1?'s':''}\`;

  const tbody = document.getElementById('ascTableBody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#9ca3af">No ASCs match your filters</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    const badge = a.innStatus === 'INN-likely'
      ? '<span class="inn-badge inn-likely">INN-likely</span>'
      : '<span class="inn-badge inn-verify">INN-verify</span>';
    const noteSnippet = a.notes ? \`<span style="font-size:.75rem;color:#374151">\${a.notes.substring(0,50)}\${a.notes.length>50?'...':''}</span>\` : '<span style="color:#9ca3af;font-size:.75rem">—</span>';
    const checkCount = Object.values(a.checklist||{}).filter(v=>v===true).length;
    const checkTotal = Object.keys(a.checklist||{}).length;
    const checkInfo = checkTotal > 0 ? \`<span style="font-size:.72rem;color:var(--gray)">\${checkCount}/\${checkTotal} done</span>\` : '';
    
    return \`<tr>
      <td><b style="color:var(--navy)">\${a.name}</b>${'<br>'}<span style="font-size:.72rem;color:#9ca3af">NPI: \${a.npi}</span></td>
      <td>\${a.state}</td>
      <td>\${a.city}</td>
      <td>\${badge}</td>
      <td>\${noteSnippet}\${checkInfo ? '<br>'+checkInfo : ''}</td>
      <td>
        <button class="action-btn" onclick="toggleNote('\${a.id}')">📝 Note</button>
        <button class="action-btn checklist-btn" onclick="openChecklist('\${a.id}')">☑️ Checklist</button>
        <button class="action-btn" onclick="showOnMap('\${a.id}')">🗺 Map</button>
      </td>
    </tr>
    <tr id="note-row-\${a.id}" style="display:none">
      <td colspan="6" style="background:#fffbeb;padding:10px 16px">
        <textarea class="note-inline" id="note-text-\${a.id}" placeholder="Add notes about this ASC...">\${a.notes||''}</textarea>
        <br><button class="note-save-btn" onclick="saveNote('\${a.id}')">Save Note</button>
        <span id="note-saved-\${a.id}" class="note-saved" style="display:none">✓ Saved!</span>
      </td>
    </tr>\`;
  }).join('');
}

function toggleNote(id) {
  const row = document.getElementById('note-row-'+id);
  row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}

async function saveNote(id) {
  const notes = document.getElementById('note-text-'+id).value;
  const asc = allAscs.find(a => a.id === id);
  if (!asc) return;
  await fetch(\`/api/ascs/\${id}/notes\`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ notes, checklist: asc.checklist || {} })
  });
  asc.notes = notes;
  const el = document.getElementById('note-saved-'+id);
  el.style.display = 'inline';
  setTimeout(() => { el.style.display = 'none'; }, 2000);
}

function sortTable(col) {
  if (sortCol === col) sortDir *= -1;
  else { sortCol = col; sortDir = 1; }
  document.querySelectorAll('th').forEach(th => th.classList.remove('sort-asc','sort-desc'));
  const thMap = {name:0,state:1,city:2,innStatus:3};
  const idx = thMap[col];
  if (idx !== undefined) {
    const ths = document.querySelectorAll('#ascTable thead th');
    ths[idx].classList.add(sortDir === 1 ? 'sort-asc' : 'sort-desc');
  }
  renderTable();
}

function showOnMap(id) {
  showTab('map', document.querySelector('.tab-btn'));
  setTimeout(() => {
    const entry = ascMarkers.find(x => x.asc.id === id);
    if (entry && entry.asc.lat) {
      if (!map.hasLayer(entry.marker)) entry.marker.addTo(map);
      map.setView([entry.asc.lat, entry.asc.lng], 14);
      entry.marker.openPopup();
    }
  }, 200);
}

// ==================== VIP TABLE ====================
function renderVipTable() {
  const search = document.getElementById('vipSearch').value.toLowerCase();
  const stateF = document.getElementById('vipStateFilter').value;
  const filtered = vipLocations.filter(v => {
    const match = !search || v.name.toLowerCase().includes(search) || v.city.toLowerCase().includes(search) || v.address.toLowerCase().includes(search);
    const stateOk = !stateF || v.state === stateF;
    return match && stateOk;
  });
  document.getElementById('vipCount').textContent = \`\${filtered.length} locations\`;
  document.getElementById('vipTableBody').innerHTML = filtered.map((v,i) => \`
    <tr>
      <td style="color:#9ca3af">\${i+1}</td>
      <td><b>\${v.name}</b></td>
      <td><span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:10px;font-size:.75rem;font-weight:700">\${v.state}</span></td>
      <td>\${v.city}</td>
      <td style="font-size:.8rem;color:#374151">\${v.address}</td>
      <td><button class="action-btn" onclick="centerMapOnVip('\${v.id}')">🗺 Find ASCs</button></td>
    </tr>
  \`).join('');
}

function centerMapOnVip(id) {
  showTab('map', document.querySelector('.tab-btn'));
  setTimeout(() => {
    const v = vipLocations.find(x => x.id === id);
    if (v && v.lat) {
      map.setView([v.lat, v.lng], 12);
      selectVip(v);
    }
  }, 200);
}

// ==================== CHECKLIST MODAL ====================
function openChecklist(id) {
  const asc = allAscs.find(a => a.id === id);
  if (!asc) return;
  modalAscId = id;
  document.getElementById('modalTitle').textContent = asc.name;
  document.getElementById('modalSubtitle').textContent = \`\${asc.city}, \${asc.state} · \${asc.innStatus}\`;
  
  const cl = asc.checklist || {};
  const customItems = Object.keys(cl).filter(k => !CHECKLIST_DEFAULTS.find(d => d.key === k) && k !== 'designation');
  
  let html = CHECKLIST_DEFAULTS.map(item => \`
    <label>
      <input type="checkbox" id="cl-\${item.key}" \${cl[item.key] ? 'checked' : ''}>
      \${item.label}
    </label>
  \`).join('');
  
  customItems.forEach(k => {
    html += \`<label>
      <input type="checkbox" id="cl-\${k}" \${cl[k] ? 'checked' : ''}>
      \${k}
    </label>\`;
  });
  
  document.getElementById('checklistItems').innerHTML = html;
  
  // Set designation
  const desig = cl['designation'] || '';
  document.querySelectorAll('.desig-btn').forEach(b => {
    b.classList.toggle('active-desig', b.dataset.desig === desig);
  });
  
  document.getElementById('checklistModal').classList.add('open');
}

function setDesig(d) {
  document.querySelectorAll('.desig-btn').forEach(b => b.classList.toggle('active-desig', b.dataset.desig === d));
}

function addCustomItem() {
  const input = document.getElementById('customCheckItem');
  const label = input.value.trim();
  if (!label) return;
  const key = label.toLowerCase().replace(/[^a-z0-9]/g,'_');
  const div = document.createElement('label');
  div.innerHTML = \`<input type="checkbox" id="cl-\${key}"> \${label}\`;
  document.getElementById('checklistItems').appendChild(div);
  input.value = '';
}

async function saveChecklist() {
  const asc = allAscs.find(a => a.id === modalAscId);
  if (!asc) return;
  const cl = {};
  document.querySelectorAll('#checklistItems input[type=checkbox]').forEach(cb => {
    const key = cb.id.replace('cl-','');
    cl[key] = cb.checked;
  });
  const activeDesig = document.querySelector('.desig-btn.active-desig');
  if (activeDesig) cl['designation'] = activeDesig.dataset.desig;
  
  await fetch(\`/api/ascs/\${modalAscId}/notes\`, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ notes: asc.notes || '', checklist: cl })
  });
  asc.checklist = cl;
  closeModal();
  renderTable();
}

function closeModal() {
  document.getElementById('checklistModal').classList.remove('open');
}
document.getElementById('checklistModal').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal();
});

// Start
init();
</script>
</body>
</html>`;
}

app.listen(PORT, () => {
  console.log(`VIP ASC Finder Dashboard running on port ${PORT}`);
});
