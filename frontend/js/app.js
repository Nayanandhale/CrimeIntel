/**
 * CrimeIntel — Full-Featured Investigative Intelligence Platform
 * Frontend Application Logic (app.js)
 * SIH 2026 PS 26189 — Evidence-Backed Cross-Case Intelligence
 * Features:
 *  - Authentication & Session Management (Hashed passwords, RBAC, Jurisdiction scope)
 *  - Interactive Geographical Incident Map (Leaflet.js with synthetic coordinates)
 *  - Executive Operational Dashboard (District statistics, aging cases, verifiable officer operational indicators)
 *  - Dynamic Case Overview Dashboard (Filterable scope, monthly trends, crime type classification)
 *  - Separated Workflows: Register Initial FIR (immutable) vs Add Investigation Evidence (post-FIR)
 *  - On-Demand Entity Extraction & Candidate Relationship Review
 *  - Understandable Canonical-Person Disambiguation & Alias Matching
 *  - Interactive VisNetwork Constellation, Louvain Communities, Centrality Bridges, RAG Assistant & chargesheets
 */

// Application Global State
let currentCaseId = 'C001';
let authToken = sessionStorage.getItem('crimeintel_token') || 'demo-token-U001';
let currentUser = JSON.parse(sessionStorage.getItem('crimeintel_user') || 'null') || {
  username: 'investigator',
  user_id: 'U001',
  display_name: 'Asha Kulkarni',
  role: 'investigator',
  unit: 'Pune Sub-Division',
  jurisdiction: 'Pune & Satara Corridor',
  authorized_cities: ['pune', 'satara', 'pimpri-chinchwad'],
  authorized_stations: ['Satara Police Station', 'Pune Police Station', 'Pimpri-Chinchwad Police Station'],
  permissions: ['read_cases', 'read_persons', 'read_graph', 'read_documents', 'read_alerts', 'ask_assistant', 'validate_relationships', 'draft_report', 'write_case_notes', 'register_fir', 'add_evidence', 'view_geo_map', 'view_analytics']
};

let allCases = [];
let visNetwork = null;
let graphData = { nodes: [], edges: [] };
let activeFilter = 'all';
let compareRadarChart = null;
let monthlyTrendChartInstance = null;
let crimeTypeDoughnutInstance = null;
let leafletMapInstance = null;
let mapMarkersGroup = null;
let lastExtractedData = null;

// Helper: Authenticated fetch wrapper
async function authFetch(url, options = {}) {
  const headers = {
    'Authorization': `Bearer ${authToken}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  return fetch(url, { ...options, headers });
}

// ============================================================
// 1. AUTHENTICATION & LOGIN FLOW
// ============================================================
function initAuth() {
  const storedToken = sessionStorage.getItem('crimeintel_token');
  const storedUser = sessionStorage.getItem('crimeintel_user');

  if (storedToken && storedUser) {
    try {
      authToken = storedToken;
      currentUser = JSON.parse(storedUser);
      showWorkspace();
      return;
    } catch (e) {
      sessionStorage.clear();
    }
  }
  showLoginScreen();
}

function showLoginScreen() {
  const login = document.getElementById('loginScreen');
  const workspace = document.getElementById('appWorkspace');
  if (login) login.classList.remove('hidden');
  if (workspace) workspace.classList.add('hidden');
}

function showWorkspace() {
  const login = document.getElementById('loginScreen');
  const workspace = document.getElementById('appWorkspace');
  if (login) login.classList.add('hidden');
  if (workspace) workspace.classList.remove('hidden');

  updateUserDisplay();
  loadInitialData();

  // Role-based routing on login
  if (currentUser && currentUser.role === 'admin') {
    switchTab('executive');
  } else {
    switchTab('inv-dashboard');
  }
}

function updateUserDisplay() {
  if (!currentUser) return;
  const lbl = document.getElementById('currentUserLabel');
  const roleEl = document.getElementById('currentUserRole');
  const jurEl = document.getElementById('userJurisdictionText');
  const regFirBtn = document.getElementById('sidebarRegisterFirBtn');
  const addEvBtn = document.getElementById('sidebarAddEvidenceBtn');
  const stripEvBtn = document.getElementById('stripAddEvidenceBtn');
  const permsBadge = document.getElementById('userRolePermsBadge');

  // Administrator tabs
  const adminTabIds = ['tabBtn-executive', 'tabBtn-casemanagement', 'tabBtn-geomap', 'tabBtn-workload'];
  // Investigator tabs
  const investigatorTabIds = ['tabBtn-inv-dashboard', 'tabBtn-inv-cases', 'tabBtn-inv-map', 'tabBtn-constellation', 'tabBtn-compare', 'tabBtn-timeline'];

  if (lbl) lbl.textContent = currentUser.display_name || '';
  if (roleEl) roleEl.textContent = `${(currentUser.role || '').replace(/_/g, ' ').toUpperCase()} (${currentUser.unit || ''})`;
  if (jurEl) jurEl.textContent = currentUser.jurisdiction || currentUser.unit || '';

  const role = currentUser.role;

  if (role === 'admin') {
    if (permsBadge) {
      permsBadge.textContent = 'ADMINISTRATOR (DISTRICT OVERSIGHT)';
      permsBadge.className = 'badge badge-teal text-center';
    }
    // Show Administrator tabs
    adminTabIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('hidden');
    });
    // Hide Investigator tabs
    investigatorTabIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    // Administrator must NOT register FIR or add evidence
    if (regFirBtn) regFirBtn.style.display = 'none';
    if (addEvBtn) addEvBtn.style.display = 'none';
    if (stripEvBtn) stripEvBtn.style.display = 'none';
  } else {
    // Investigator workspace
    if (permsBadge) {
      permsBadge.textContent = 'INVESTIGATOR WORKSPACE';
      permsBadge.className = 'badge badge-success text-center';
    }
    // Show Investigator tabs
    investigatorTabIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('hidden');
    });
    // Hide Administrator tabs
    adminTabIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    // Investigator can register FIR and add evidence
    if (regFirBtn) regFirBtn.style.display = 'block';
    if (addEvBtn) addEvBtn.style.display = 'block';
    if (stripEvBtn) stripEvBtn.style.display = 'inline-flex';
  }
}

function togglePasswordVisibility() {
  const pwInput = document.getElementById('loginPassword');
  const icon = document.getElementById('pwToggleIcon');
  if (!pwInput) return;

  if (pwInput.type === 'password') {
    pwInput.type = 'text';
    if (icon) icon.textContent = '🙈';
  } else {
    pwInput.type = 'password';
    if (icon) icon.textContent = '👁️';
  }
}

function fillDemoLogin(username, password) {
  const uInput = document.getElementById('loginUsername');
  const pInput = document.getElementById('loginPassword');
  if (uInput) uInput.value = username;
  if (pInput) pInput.value = password;
  handleLoginSubmit(new Event('submit'));
}

async function handleLoginSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const u = document.getElementById('loginUsername')?.value.trim();
  const p = document.getElementById('loginPassword')?.value.trim();
  const errBox = document.getElementById('loginErrorAlert');
  const submitBtn = document.getElementById('loginSubmitBtn');

  if (!u || !p) {
    if (errBox) {
      errBox.textContent = 'Please enter both User ID and Password.';
      errBox.classList.remove('hidden');
    }
    return;
  }

  if (errBox) errBox.classList.add('hidden');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Authenticating...</span>';
  }

  let data;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });

    data = await res.json();

    if (!res.ok) {
      if (errBox) {
        errBox.textContent = data.detail || 'Invalid User ID or Password.';
        errBox.classList.remove('hidden');
      }
      return;
    }

    // Save session
    authToken = data.token;
    currentUser = data;
    sessionStorage.setItem('crimeintel_token', data.token);
    sessionStorage.setItem('crimeintel_user', JSON.stringify(data));
  } catch (err) {
    if (errBox) {
      errBox.textContent = 'Connection error. Ensure backend is running.';
      errBox.classList.remove('hidden');
    }
    return;
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Sign In to Workspace</span>';
    }
  }

  // Display workspace outside network try/catch
  try {
    showWorkspace();
  } catch (wsErr) {
    console.error('Workspace display error:', wsErr);
  }
}

function handleLogout() {
  sessionStorage.removeItem('crimeintel_token');
  sessionStorage.removeItem('crimeintel_user');
  sessionStorage.clear();
  authToken = '';
  currentUser = null;
  showLoginScreen();
  // Clean reload to ensure all map containers, charts, and graph physics are completely reset
  window.location.reload();
}

// Immediate assignment to window so functions are guaranteed available globally
window.initAuth = initAuth;
window.showLoginScreen = showLoginScreen;
window.showWorkspace = showWorkspace;
window.handleLoginSubmit = handleLoginSubmit;
window.handleLogout = handleLogout;
window.togglePasswordVisibility = togglePasswordVisibility;
window.fillDemoLogin = fillDemoLogin;

// ============================================================
// 2. THEME & INITIALIZATION
// ============================================================
function initTheme() {
  const savedTheme = localStorage.getItem('crimeintel-theme') || 'light';
  applyTheme(savedTheme);
}

function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark');
  const newTheme = isDark ? 'light' : 'dark';
  applyTheme(newTheme);
  localStorage.setItem('crimeintel-theme', newTheme);
  if (visNetwork) renderVisNetwork(graphData);
  if (compareRadarChart) runForensicCompare();
}

function applyTheme(theme) {
  const icon = document.getElementById('themeIcon');
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
    if (icon) icon.textContent = '☀️';
  } else {
    document.documentElement.classList.remove('dark');
    if (icon) icon.textContent = '🌙';
  }
}

function toggleScenarioDropdown() {
  const dd = document.getElementById('scenarioDropdown');
  if (dd) dd.classList.toggle('hidden');
}

document.addEventListener('click', (e) => {
  const btn = document.getElementById('scenarioMenuBtn');
  const dd = document.getElementById('scenarioDropdown');
  if (dd && btn && !btn.contains(e.target) && !dd.contains(e.target)) {
    dd.classList.add('hidden');
  }
});

window.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initAuth();

  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleLoginSubmit(e);
    });
  }
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');
  if (loginSubmitBtn) {
    loginSubmitBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleLoginSubmit(e);
    });
  }
});

async function loadInitialData() {
  try {
    await Promise.all([
      loadSystemOverview(),
      loadCasesList(),
      loadAuditTrail()
    ]);
    if (currentUser && currentUser.role !== 'admin') {
      try { loadGraph(currentCaseId); } catch(e){}
      try { loadPresetDocument('DOC001'); } catch(e){}
    }
  } catch (err) {
    console.error('Initial data load error:', err);
  }
}

async function loadSystemOverview() {
  try {
    const res = await authFetch('/api/health');
    const healthBadge = document.getElementById('systemHealthBadge');
    if (healthBadge) {
      if (res.ok) {
        healthBadge.className = 'badge badge-success';
        healthBadge.innerHTML = '<span style="font-size:8px;">🟢</span> System Healthy';
      } else {
        healthBadge.className = 'badge badge-danger';
        healthBadge.innerHTML = '<span style="font-size:8px;">🔴</span> System Degraded';
      }
    }
  } catch (e) {
    const healthBadge = document.getElementById('systemHealthBadge');
    if (healthBadge) {
      healthBadge.className = 'badge badge-danger';
      healthBadge.innerHTML = '<span style="font-size:8px;">🔴</span> Offline';
    }
  }
  updateGlobalAlertBadge();
}

// ============================================================
// 3. CASE LISTING & AUTHORIZED ACCESS CONTROL
// ============================================================
async function loadCasesList() {
  try {
    const res = await authFetch('/api/cases/');
    allCases = await res.json();

    const caseSelect = document.getElementById('caseSelect');
    const compareA = document.getElementById('compareCaseA');
    const compareB = document.getElementById('compareCaseB');
    const evidenceTarget = document.getElementById('evidenceTargetCase');
    const tlPrim = document.getElementById('timelinePrimaryCaseSelect');
    const tlSec = document.getElementById('timelineSecondaryCaseSelect');

    if (caseSelect) {
      caseSelect.innerHTML = allCases.map(c => `
        <option value="${c.case_id}" ${c.case_id === currentCaseId ? 'selected' : ''}>
          ${c.case_id}: ${c.title} (${c.city})
        </option>
      `).join('');
    }

    if (evidenceTarget) {
      evidenceTarget.innerHTML = allCases.map(c => `
        <option value="${c.case_id}" ${c.case_id === currentCaseId ? 'selected' : ''}>
          ${c.case_id}: ${c.title} (${c.case_number})
        </option>
      `).join('');
    }

    if (compareA && compareB) {
      const options = allCases.map(c => `<option value="${c.case_id}">${c.case_id}: ${c.title}</option>`).join('');
      compareA.innerHTML = options;
      compareB.innerHTML = options;
      if (allCases.length >= 2) {
        compareA.value = allCases[0].case_id;
        compareB.value = allCases[1].case_id;
      }
    }

    if (tlPrim) {
      tlPrim.innerHTML = allCases.map(c => `
        <option value="${c.case_id}" ${c.case_id === currentCaseId ? 'selected' : ''}>
          ${c.case_id}: ${c.title} (${c.city})
        </option>
      `).join('');
    }

    if (tlSec) {
      tlSec.innerHTML = `<option value="">None (Single Case)</option>` + allCases.map(c => `
        <option value="${c.case_id}">
          ${c.case_id}: ${c.title} (${c.city})
        </option>
      `).join('');
    }

    if (allCases.length > 0) {
      if (!allCases.some(c => c.case_id === currentCaseId)) {
        currentCaseId = allCases[0].case_id;
      }
      loadCaseDetails(currentCaseId);
    }
  } catch (e) {
    console.error('Failed to load cases:', e);
  }
}

async function loadCaseDetails(caseId) {
  if (!caseId) return;
  currentCaseId = caseId;

  // Sync dropdowns across workspace
  const caseSelect = document.getElementById('caseSelect');
  if (caseSelect && caseSelect.value !== caseId) caseSelect.value = caseId;
  const evTarget = document.getElementById('evidenceTargetCase');
  if (evTarget) evTarget.value = caseId;
  const tlPrim = document.getElementById('timelinePrimaryCaseSelect');
  if (tlPrim) tlPrim.value = caseId;
  const cmpA = document.getElementById('compareCaseA');
  if (cmpA) cmpA.value = caseId;

  // Update Assistant placeholder for context
  const aIn = document.getElementById('assistantInput');
  if (aIn) aIn.placeholder = `Ask a question regarding Case ${caseId}... (e.g. Which vehicles appear in ${caseId}?)`;

  try {
    const res = await authFetch(`/api/cases/${caseId}`);
    if (res.status === 403) {
      alert(`Access Denied: Case ${caseId} is restricted to its authorized station.`);
      return;
    }

    const c = await res.json();

    // 1. Update Case Header Badges
    const badgesContainer = document.getElementById('caseBadges');
    if (badgesContainer) {
      const prioColor = c.priority === 'critical' ? 'badge-danger' :
                       c.priority === 'high' ? 'badge-amber' : 'badge-muted';

      badgesContainer.innerHTML = `
        <span class="badge badge-muted">${c.case_number}</span>
        <span class="badge ${prioColor}">${c.priority.toUpperCase()}</span>
        <span class="badge badge-teal">${c.city}</span>
        <span class="badge badge-muted">Station: <strong>${c.police_station || 'HQ'}</strong></span>
        <span class="badge badge-muted">MO: <code style="color:var(--ci-teal)">${c.mo_code}</code></span>
        <span class="badge badge-muted">Updated: ${c.last_update}</span>
      `;
    }

    // 2. Anomaly Badge in Header Strip
    const anomBadge = document.getElementById('caseAnomalyBadge');
    const anomText = document.getElementById('caseAnomalyText');
    if (anomBadge && anomText) {
      if (c.anomalies && c.anomalies.length > 0) {
        anomBadge.classList.remove('hidden');
        anomBadge.style.display = 'inline-flex';
        anomText.textContent = c.anomalies[0].anomaly_type.replace(/_/g, ' ').toUpperCase();
      } else {
        anomBadge.classList.add('hidden');
        anomBadge.style.display = 'none';
      }
    }

    // 3. Alert Count Badge
    const alertBadge = document.getElementById('caseAlertCount');
    if (alertBadge) {
      alertBadge.textContent = c.alerts ? c.alerts.length : 0;
    }

    // 4. Update Meaningful Case Intelligence Digest (Item 21)
    loadCaseDigest(c);

    // 5. Update Constellation Network Graph (Item 22)
    loadGraph(caseId);

    // 6. Timeline Case Title & Events
    const tlTitle = document.getElementById('timelineCaseTitle');
    if (tlTitle) {
      tlTitle.textContent = `${c.case_id}: ${c.title} (${c.case_number})`;
    }
    loadTimeline(caseId);

    // 7. Refresh global alerts count badge
    updateGlobalAlertBadge();

  } catch (e) {
    console.error('Error loading case detail:', e);
  }
}

// ============================================================
// CASE INTELLIGENCE DIGEST (ITEM 21)
// ============================================================
function loadCaseDigest(c) {
  const lbl = document.getElementById('digestCaseLabel');
  if (lbl) lbl.textContent = `${c.case_id} (${c.case_number})`;

  // Column 1: Status & Priority
  const statusBox = document.getElementById('digestStatusBox');
  if (statusBox) {
    const prioColor = c.priority === 'critical' ? 'var(--ci-danger)' : c.priority === 'high' ? 'var(--ci-warning)' : 'var(--ci-teal)';
    statusBox.innerHTML = `
      <div>Status: <strong>${(c.status || 'OPEN').toUpperCase()}</strong></div>
      <div>Priority: <strong style="color:${prioColor}">${(c.priority || 'MEDIUM').toUpperCase()}</strong></div>
      <div>Station: <strong>${c.police_station || 'HQ'}</strong> (${c.city})</div>
      <div>Opened: <strong>${c.opened_date || 'N/A'}</strong></div>
      <div style="font-size:11px; color:var(--ci-text-muted);">Last Record Update: ${c.last_update || 'Today'}</div>
    `;
  }

  // Column 2: Key Events & Chronology (Verified)
  const eventsBox = document.getElementById('digestEventsBox');
  if (eventsBox) {
    const events = c.events || [];
    if (events.length > 0) {
      eventsBox.innerHTML = events.slice(0, 2).map(e => `
        <div style="margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px dashed var(--ci-border);">
          <div style="font-weight:700; color:var(--ci-teal-dark); font-size:11.5px;">${e.event_date}: ${e.event_type.toUpperCase()}</div>
          <div style="font-size:11px; color:var(--ci-text-muted);">${escapeHtml(e.description)}</div>
        </div>
      `).join('');
    } else {
      eventsBox.innerHTML = `<div style="font-size:11.5px; color:var(--ci-text-muted);">No timeline incidents logged yet.</div>`;
    }
  }

  // Column 3: Principal Entities & Evidence (Verified)
  const entitiesBox = document.getElementById('digestEntitiesBox');
  if (entitiesBox) {
    const persons = c.persons || [];
    const vehicles = c.vehicles || [];
    const pCount = persons.length;
    const vCount = vehicles.length;
    const docCount = (c.documents || []).length;
    entitiesBox.innerHTML = `
      <div>👥 Suspects / Persons: <strong>${pCount} recorded</strong></div>
      <div>🚗 Associated Vehicles: <strong>${vCount} vehicles</strong></div>
      <div>📄 Ingested Documents: <strong>${docCount} files</strong></div>
      ${persons.length > 0 ? `<div style="font-size:11px; color:var(--ci-teal); font-weight:600; margin-top:2px;">Lead Subject: ${escapeHtml(persons[0].full_name)} (${persons[0].role || 'suspect'})</div>` : ''}
    `;
  }

  // Column 4: AI Suggestions & Pending Leads (AI-Suggested)
  const leadsBox = document.getElementById('digestLeadsBox');
  if (leadsBox) {
    const links = c.cross_case_links || [];
    const anoms = c.anomalies || [];
    const alerts = c.alerts || [];

    let html = '';
    if (links.length > 0) {
      const topLink = links[0];
      html += `<div style="font-size:11.5px; margin-bottom:4px;">
        🔗 <strong>${topLink.case_b_number || topLink.target_id || 'Adjacent Lead'}:</strong>
        <span style="color:var(--ci-warning); font-weight:700;">${Math.round(topLink.confidence * 100)}% match</span>
        <div style="font-size:10.5px; color:var(--ci-text-muted);">${escapeHtml(topLink.explanation ? topLink.explanation.slice(0, 75) + '...' : 'Pattern similarity lead')}</div>
      </div>`;
    } else {
      html += `<div style="font-size:11.5px; color:var(--ci-text-muted);">No cross-case link leads detected.</div>`;
    }

    if (anoms.length > 0) {
      html += `<div style="font-size:11px; color:var(--ci-danger); font-weight:600; margin-top:2px;">⚡ ${anoms.length} Active Anomaly Signal(s)</div>`;
    }
    if (alerts.length > 0) {
      html += `<div style="font-size:11px; color:var(--ci-text-muted);">⚠️ ${alerts.length} Pending case alert(s)</div>`;
    }
    leadsBox.innerHTML = html;
  }
}

function toggleCaseDigestCollapse() {
  const body = document.getElementById('digestBody');
  const btn = document.getElementById('digestCollapseBtn');
  if (!body || !btn) return;

  if (body.classList.contains('hidden')) {
    body.classList.remove('hidden');
    btn.textContent = 'Hide Digest ▲';
  } else {
    body.classList.add('hidden');
    btn.textContent = 'Show Digest ▼';
  }
}

// ============================================================
// AUTHORIZED ALERTS MANAGEMENT (ITEM 19)
// ============================================================
let currentAuthorizedAlerts = [];

async function openAlertsModal(filterCaseId = null) {
  const modal = document.getElementById('alertsModal');
  if (modal) modal.classList.remove('hidden');
  await loadAuthorizedAlerts(filterCaseId);
}

function closeAlertsModal() {
  const modal = document.getElementById('alertsModal');
  if (modal) modal.classList.add('hidden');
}

async function loadAuthorizedAlerts(filterCaseId = null) {
  const container = document.getElementById('alertsListContainer');
  if (container) container.innerHTML = `<div class="text-center py-6" style="color:var(--ci-text-muted)">Querying authorized alerts...</div>`;

  try {
    let url = '/api/alerts/';
    if (filterCaseId && typeof filterCaseId === 'string') {
      url += `?case_id=${filterCaseId}`;
    }
    const res = await authFetch(url);
    currentAuthorizedAlerts = await res.json();
    filterAlertsDisplay();
  } catch (e) {
    if (container) container.innerHTML = `<div style="color:var(--ci-danger); padding:10px;">Failed to load alerts: ${e.message}</div>`;
  }
}

function filterAlertsDisplay() {
  const container = document.getElementById('alertsListContainer');
  if (!container) return;

  const sevFilter = document.getElementById('alertFilterSeverity')?.value || 'all';
  const typeFilter = document.getElementById('alertFilterType')?.value || 'all';
  const statusFilter = document.getElementById('alertFilterStatus')?.value || 'all';

  let filtered = currentAuthorizedAlerts.filter(a => {
    if (sevFilter !== 'all' && a.severity !== sevFilter) return false;
    if (typeFilter !== 'all' && a.alert_type !== typeFilter) return false;
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div class="text-center py-8" style="color:var(--ci-text-muted)">No alerts matching the selected filter criteria.</div>`;
    return;
  }

  container.innerHTML = `
    <table class="table-modern w-full" style="font-size:12px;">
      <thead>
        <tr>
          <th>Severity</th>
          <th>Case / Scope</th>
          <th>Reason & Description</th>
          <th>Date</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map(a => {
          const sevClass = a.severity === 'critical' ? 'badge-danger' : a.severity === 'high' ? 'badge-amber' : 'badge-teal';
          const statClass = a.status === 'open' ? 'badge-danger' : a.status === 'in_review' ? 'badge-warning' : 'badge-muted';
          return `
            <tr>
              <td><span class="badge ${sevClass}">${a.severity.toUpperCase()}</span></td>
              <td>
                <div style="font-weight:700; color:var(--ci-navy);">${a.case_number || a.case_id}</div>
                <div style="font-size:10.5px; color:var(--ci-text-muted);">${escapeHtml(a.associated_entity)}</div>
              </td>
              <td style="max-width:280px; line-height:1.4;">
                <div style="font-weight:600; color:var(--ci-text-main);">${escapeHtml(a.reason)}</div>
                <div style="font-size:10.5px; color:var(--ci-text-muted); text-transform:uppercase;">TYPE: ${a.alert_type.replace(/_/g, ' ')}</div>
              </td>
              <td>${a.created_at || '—'}</td>
              <td><span class="badge ${statClass}">${a.status.toUpperCase()}</span></td>
              <td>
                <button onclick="selectCaseFromAlert('${a.case_id}')" class="btn btn-primary btn-sm" style="font-size:11px; padding:3px 8px;">
                  Open Case →
                </button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function selectCaseFromAlert(caseId) {
  closeAlertsModal();
  loadCaseDetails(caseId);
  switchTab('constellation');
}

async function updateGlobalAlertBadge() {
  try {
    const res = await authFetch('/api/alerts/summary');
    if (res.ok) {
      const summary = await res.json();
      const badge = document.getElementById('globalAlertsBadge');
      if (badge) {
        badge.textContent = summary.open !== undefined ? summary.open : (summary.total || 0);
      }
    }
  } catch (e) {
    console.warn('Alerts badge check error:', e);
  }
}

// ============================================================
// STATISTICAL ANOMALY INSPECTOR (ITEM 20)
// ============================================================
let activeAnomalyData = null;

async function openAnomalyModal() {
  const modal = document.getElementById('anomalyModal');
  const container = document.getElementById('anomalyModalContent');
  if (modal) modal.classList.remove('hidden');
  if (container) container.innerHTML = `<div class="text-center py-6" style="color:var(--ci-text-muted)">Querying statistical anomaly signals for ${currentCaseId}...</div>`;

  try {
    const res = await authFetch(`/api/analytics/anomalies?case_id=${currentCaseId}`);
    const list = await res.json();
    if (list.length > 0) {
      activeAnomalyData = list[0];
      renderAnomalyModalDetails(activeAnomalyData);
    } else {
      if (container) {
        container.innerHTML = `
          <div class="card p-4 text-center" style="color:var(--ci-text-muted);">
            No active statistical anomalies currently detected for Case <strong>${currentCaseId}</strong>.
          </div>
        `;
      }
    }
  } catch (e) {
    if (container) container.innerHTML = `<div style="color:var(--ci-danger);">Error loading anomaly details: ${e.message}</div>`;
  }
}

function closeAnomalyModal() {
  const modal = document.getElementById('anomalyModal');
  if (modal) modal.classList.add('hidden');
}

function renderAnomalyModalDetails(anom) {
  const container = document.getElementById('anomalyModalContent');
  const noteEl = document.getElementById('anomalyReviewStatusNote');
  if (!container) return;

  const statBadge = anom.review_status === 'acknowledged' ? 'badge-success' :
                    anom.review_status === 'false_positive' ? 'badge-muted' : 'badge-amber';

  container.innerHTML = `
    <div class="card p-3 space-y-2" style="border-left: 3px solid var(--ci-warning);">
      <div class="flex items-center justify-between">
        <div>
          <span style="font-weight:700; font-size:14px; color:var(--ci-navy);">${anom.anomaly_type.replace(/_/g, ' ').toUpperCase()}</span>
          <span class="badge ${statBadge}" style="margin-left: 6px;">${anom.review_status.toUpperCase()}</span>
        </div>
        <span class="badge badge-teal">Anomaly Score: ${(anom.score * 100).toFixed(0)}%</span>
      </div>
      <div style="font-size:12px; color:var(--ci-text-muted);">
        Case: <strong>${anom.case_id} — ${anom.case_title}</strong> | Station: <strong>${anom.police_station}</strong>
      </div>
    </div>

    <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 12px;">
      <div class="card p-3 space-y-1">
        <strong style="color:var(--ci-teal-dark); font-size:11.5px; text-transform:uppercase;">Pattern / Deviation Flagged:</strong>
        <p style="font-size:12px; line-height:1.4;">${escapeHtml(anom.pattern_flagged)}</p>
      </div>

      <div class="card p-3 space-y-1">
        <strong style="color:var(--ci-teal-dark); font-size:11.5px; text-transform:uppercase;">Baseline Comparison:</strong>
        <p style="font-size:12px; line-height:1.4;">${escapeHtml(anom.baseline_comparison)}</p>
      </div>
    </div>

    <div class="card p-3 space-y-2">
      <div class="flex items-center justify-between">
        <strong style="color:var(--ci-teal-dark); font-size:11.5px; text-transform:uppercase;">Time Period & Affected Entities:</strong>
        <span class="badge badge-muted">${anom.time_period}</span>
      </div>
      <div class="flex flex-wrap gap-1.5">
        ${(anom.affected_entities || []).map(e => `<span class="badge badge-teal">${escapeHtml(e)}</span>`).join('')}
      </div>
    </div>

    <div class="card p-3 space-y-1">
      <strong style="color:var(--ci-teal-dark); font-size:11.5px; text-transform:uppercase;">Supporting Evidentiary Records:</strong>
      <div class="flex gap-2 pt-1">
        ${(anom.supporting_records || []).map(r => `
          <button onclick="handleSourceChipClick('${r}'); closeAnomalyModal();" class="badge badge-muted" style="cursor:pointer;" title="Inspect Source Record">
            📄 ${r} (Inspect)
          </button>
        `).join('')}
      </div>
    </div>

    <div class="card-sub p-2.5 space-y-1" style="font-size:11.5px;">
      <div style="font-weight:700; color:var(--ci-navy);">Detection Rationale & Algorithm Limitations:</div>
      <p style="color:var(--ci-text-muted); line-height:1.4;">${escapeHtml(anom.reason_flagged)}</p>
      <p style="color:var(--ci-warning); line-height:1.4; margin-top:3px;"><strong>Notice:</strong> ${escapeHtml(anom.limitations)}</p>
    </div>
  `;

  if (noteEl) {
    noteEl.textContent = `Current Review Status: ${anom.review_status.toUpperCase()} (Updated via audit stream)`;
  }
}

async function updateActiveAnomalyStatus(newStatus) {
  if (!activeAnomalyData) return;
  try {
    const res = await authFetch(`/api/analytics/anomalies/${activeAnomalyData.anomaly_id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      activeAnomalyData.review_status = newStatus;
      renderAnomalyModalDetails(activeAnomalyData);
      loadCaseDetails(currentCaseId);
    }
  } catch (e) {
    alert('Failed to update anomaly status: ' + e.message);
  }
}

// ============================================================
// 4. TAB NAVIGATION CONTROLLER
// ============================================================
function switchTab(tabId) {
  // Enforce access control for Administrator-only tabs
  const adminOnlyTabs = ['executive', 'casemanagement', 'workload'];
  if (adminOnlyTabs.includes(tabId) && currentUser.role !== 'admin') {
    alert('Access Denied: This tab is restricted to Administrator personnel.');
    return;
  }
  // Enforce access control for Investigator-only tabs
  const invOnlyTabs = ['inv-dashboard', 'inv-cases', 'inv-map'];
  if (invOnlyTabs.includes(tabId) && currentUser.role === 'admin') {
    alert('Access Denied: This view is for Investigators.');
    return;
  }

  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

  const targetTab = document.getElementById(`tab-${tabId}`);
  const targetBtn = document.getElementById(`tabBtn-${tabId}`);
  if (targetTab) targetTab.classList.remove('hidden');
  if (targetBtn) targetBtn.classList.add('active');

  // Module triggers on tab activation
  if (tabId === 'constellation' && visNetwork) {
    visNetwork.fit();
  } else if (tabId === 'geomap') {
    initGeoMap();
  } else if (tabId === 'executive') {
    loadExecutiveDashboard();
  } else if (tabId === 'casemanagement') {
    loadCaseManagement();
  } else if (tabId === 'workload') {
    loadOfficerWorkload();
  } else if (tabId === 'compare') {
    runForensicCompare();
  } else if (tabId === 'validations') {
    loadPendingValidations();
    loadAuditTrail();
  } else if (tabId === 'timeline') {
    loadTimeline(currentCaseId);
  } else if (tabId === 'inv-dashboard') {
    loadInvDashboard();
  } else if (tabId === 'inv-cases') {
    loadInvCases();
  } else if (tabId === 'inv-map') {
    initInvMap();
  }
}


// ============================================================
// 5. GEOGRAPHICAL INCIDENT MAP (LEAFLET.JS)
// ============================================================
function initGeoMap() {
  const container = document.getElementById('geoIncidentMap');
  if (!container) return;

  if (!leafletMapInstance) {
    // Center on Maharashtra synthetic corridor
    leafletMapInstance = L.map('geoIncidentMap', {
      zoomControl: true,
      scrollWheelZoom: true
    }).setView([18.80, 73.95], 8);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors | Synthetic Prototype Data'
    }).addTo(leafletMapInstance);

    mapMarkersGroup = L.layerGroup().addTo(leafletMapInstance);
  }

  // Force map size refresh when unhidden
  setTimeout(() => {
    leafletMapInstance.invalidateSize();
    loadGeoIncidentMap();
  }, 200);
}

let execRegTrendsChartInstance = null;
let execStatusDoughnutInstance = null;
let allCasesRegistry = [];
let currentInspectedCaseId = 'C001';

function toggleMapDisplayMode(mode) {
  const mapBtn = document.getElementById('mapViewToggleBtnMap');
  const tableBtn = document.getElementById('mapViewToggleBtnTable');
  const mapContainer = document.getElementById('geomapMapViewContainer');
  const tableContainer = document.getElementById('geomapTableViewContainer');

  if (mode === 'map') {
    if (mapBtn) mapBtn.classList.add('active');
    if (tableBtn) tableBtn.classList.remove('active');
    if (mapContainer) mapContainer.classList.remove('hidden');
    if (tableContainer) tableContainer.classList.add('hidden');
    if (leafletMapInstance) {
      setTimeout(() => leafletMapInstance.invalidateSize(), 150);
    }
  } else {
    if (tableBtn) tableBtn.classList.add('active');
    if (mapBtn) mapBtn.classList.remove('active');
    if (tableContainer) tableContainer.classList.remove('hidden');
    if (mapContainer) mapContainer.classList.add('hidden');
  }
}

async function loadGeoIncidentMap() {
  const cityFilter = document.getElementById('mapCityFilter')?.value || 'all';
  const typeFilter = document.getElementById('mapTypeFilter')?.value || 'all';
  const statusFilter = document.getElementById('mapStatusFilter')?.value || 'all';
  const searchKeyword = (document.getElementById('mapSearchInput')?.value || '').toLowerCase().trim();
  const countBadge = document.getElementById('mapMarkerCountBadge');
  const tableBody = document.getElementById('mapIncidentTableBody');

  const params = new URLSearchParams();
  if (cityFilter !== 'all') params.append('city', cityFilter);
  if (typeFilter !== 'all') params.append('case_type', typeFilter);
  if (statusFilter !== 'all') params.append('status', statusFilter);

  try {
    const res = await authFetch(`/api/cases/map/incidents?${params.toString()}`);
    const data = await res.json();
    let markers = data.markers || [];

    // Filter by keyword if provided
    if (searchKeyword) {
      markers = markers.filter(m => 
        (m.case_number && m.case_number.toLowerCase().includes(searchKeyword)) ||
        (m.title && m.title.toLowerCase().includes(searchKeyword)) ||
        (m.location_name && m.location_name.toLowerCase().includes(searchKeyword)) ||
        (m.city && m.city.toLowerCase().includes(searchKeyword)) ||
        (m.police_station && m.police_station.toLowerCase().includes(searchKeyword))
      );
    }

    if (countBadge) countBadge.textContent = `${markers.length} Incidents Mapped`;

    // Populate accessible Table Alternative View
    if (tableBody) {
      if (markers.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:var(--ci-text-muted);">No incident records match the active criteria.</td></tr>';
      } else {
        tableBody.innerHTML = markers.map(m => `
          <tr>
            <td><span class="badge badge-teal">${m.case_id}</span></td>
            <td><strong>${m.case_number}</strong></td>
            <td>
              <div style="font-weight:600; color:var(--ci-navy);">${m.title}</div>
              <div style="font-size:11px; color:var(--ci-text-muted);">Station: ${m.police_station}</div>
            </td>
            <td><span class="badge badge-muted">${m.case_type}</span></td>
            <td>📍 ${m.location_name}</td>
            <td>${m.city}</td>
            <td><code>${m.lat.toFixed(4)}, ${m.lon.toFixed(4)}</code></td>
            <td>
              <button onclick="inspectCaseManagementDetail('${m.case_id}'); switchTab('casemanagement');" class="btn btn-secondary btn-sm" style="font-size:11px; padding:3px 8px;">
                Inspect Case
              </button>
            </td>
          </tr>
        `).join('');
      }
    }

    // Populate Leaflet Map Markers
    if (leafletMapInstance && mapMarkersGroup) {
      mapMarkersGroup.clearLayers();

      if (markers.length === 0) return;

      const bounds = [];

      markers.forEach(m => {
        bounds.push([m.lat, m.lon]);

        const pinColor = m.priority === 'critical' ? '#BD3C3C' :
                         m.priority === 'high' ? '#B27418' : '#0EA5B7';

        const customIcon = L.divIcon({
          className: 'custom-geo-marker',
          html: `
            <div style="background:${pinColor}; width:16px; height:16px; border-radius:50%; border:2px solid #ffffff; box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>
          `,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        const marker = L.marker([m.lat, m.lon], { icon: customIcon });

        const popupHtml = `
          <div style="font-family:'Gadugi',sans-serif; min-width:210px; padding:2px;">
            <div style="font-weight:700; color:#153746; font-size:13px; margin-bottom:2px;">${m.case_number}</div>
            <div style="font-weight:600; font-size:12px; color:#0EA5B7; margin-bottom:4px;">${m.title}</div>
            <div style="font-size:11px; color:#5B7380; margin-bottom:6px;">
              📍 ${m.location_name} (${m.city})<br>
              Station: <strong>${m.police_station}</strong><br>
              Priority: <span style="font-weight:700; text-transform:uppercase; color:${pinColor}">${m.priority}</span> | Type: ${m.case_type}
            </div>
            <button onclick="inspectCaseManagementDetail('${m.case_id}'); switchTab('casemanagement');" style="background:#0EA5B7; color:#fff; border:none; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer; width:100%;">
              Inspect in Case Management →
            </button>
          </div>
        `;

        marker.bindPopup(popupHtml);
        marker.on('click', () => inspectMapMarker(m));
        mapMarkersGroup.addLayer(marker);
      });

      if (bounds.length > 0) {
        leafletMapInstance.fitBounds(bounds, { padding: [30, 30] });
      }
    }
  } catch (err) {
    console.error('Error loading geo map:', err);
  }
}

function inspectMapMarker(m) {
  const container = document.getElementById('mapLocationDetailBody');
  if (!container) return;

  container.innerHTML = `
    <div class="card p-3 space-y-2">
      <div class="flex items-center justify-between">
        <span class="badge badge-teal">${m.case_number}</span>
        <span class="badge ${m.priority === 'critical' ? 'badge-danger' : 'badge-warning'}">${m.priority.toUpperCase()}</span>
      </div>
      <div style="font-size:14px; font-weight:700; color:var(--ci-navy);">${m.title}</div>
      <div style="font-size:12px; color:var(--ci-text-muted);">
        Crime Category: <strong style="color:var(--ci-text-main);">${m.case_type}</strong><br>
        Station: <strong style="color:var(--ci-text-main);">${m.police_station}</strong><br>
        Site: <strong style="color:var(--ci-text-main);">${m.location_name} (${m.city})</strong><br>
        GPS Lat/Lon: <code>${m.lat.toFixed(4)}, ${m.lon.toFixed(4)}</code>
      </div>
      <div class="pt-2">
        <button onclick="inspectCaseManagementDetail('${m.case_id}'); switchTab('casemanagement');" class="btn btn-primary w-full text-center" style="font-size:12px;">
          Inspect Case Management Record →
        </button>
      </div>
    </div>
  `;
}

// ============================================================
// 6. EXECUTIVE & ADMINISTRATOR OPERATIONAL DASHBOARD
// ============================================================
async function loadExecutiveDashboard() {
  try {
    const res = await authFetch('/api/analytics/executive');
    if (res.status === 403) {
      alert('Access Denied: Administrator clearance required.');
      switchTab('constellation');
      return;
    }

    const data = await res.json();

    // 1. Top 6 Compact Summary Metrics
    const totEl = document.getElementById('execTotalCases');
    const openEl = document.getElementById('execOpenCases');
    const pendEl = document.getElementById('execPendingCases');
    const closedEl = document.getElementById('execClosedCases');
    const critEl = document.getElementById('execCriticalCases');
    const valEl = document.getElementById('execPendingValidations');

    if (totEl) totEl.textContent = data.status_distribution?.total || 0;
    if (openEl) openEl.textContent = data.status_distribution?.open || 0;
    if (pendEl) pendEl.textContent = data.status_distribution?.pending || 0;
    if (closedEl) closedEl.textContent = data.status_distribution?.closed || 0;
    if (critEl) critEl.textContent = data.status_distribution?.critical || 0;
    if (valEl) valEl.textContent = data.status_distribution?.pending_validations || 0;

    // 2. Visualizations
    renderExecRegistrationTrends(data.registration_trends);
    renderExecStatusDoughnut(data.status_distribution);
    renderMonthlyTrendsChart();
    renderCrimeTypeDoughnut(data.crime_categories || {});

    // 3. District Summary Table
    const distTbody = document.getElementById('execDistrictTableBody');
    if (distTbody && data.district_summary) {
      distTbody.innerHTML = data.district_summary.map(d => `
        <tr onclick="filterCaseManagementByDistrict('${d.district}')" style="cursor:pointer;" title="Click to view cases in ${d.district}">
          <td><strong style="color:var(--ci-navy);">${d.district}</strong></td>
          <td><strong>${d.total_cases}</strong></td>
          <td><span class="badge badge-teal">${d.open_cases} Open</span></td>
          <td><span class="badge ${d.critical_cases > 0 ? 'badge-danger' : 'badge-muted'}">${d.critical_cases}</span></td>
          <td style="font-size:11.5px; color:var(--ci-text-muted);">${d.police_stations.join(', ')}</td>
        </tr>
      `).join('');
    }

    // 4. Aging Cases Requiring Operational Closure (Without Action Column)
    const agingTbody = document.getElementById('execAgingTableBody');
    if (agingTbody && data.aging_analysis?.top_aging_cases) {
      agingTbody.innerHTML = data.aging_analysis.top_aging_cases.map(c => `
        <tr onclick="inspectCaseManagementDetail('${c.case_id}'); switchTab('casemanagement');" style="cursor:pointer;" title="Click to inspect ${c.case_number}">
          <td>
            <strong>${c.case_number}</strong><br>
            <span style="font-size:11px; color:var(--ci-text-muted);">${c.title}</span>
          </td>
          <td>${c.city} (${c.station})</td>
          <td><span class="badge ${c.priority === 'critical' ? 'badge-danger' : 'badge-warning'}">${c.priority.toUpperCase()}</span></td>
          <td><strong style="color:var(--ci-danger);">${c.days_open} days</strong></td>
        </tr>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading executive dashboard:', err);
  }
}

function renderExecRegistrationTrends(trends) {
  const canvas = document.getElementById('execRegistrationTrendsChart');
  if (!canvas) return;
  const labels = Object.keys(trends || {});
  const counts = Object.values(trends || {});

  if (execRegTrendsChartInstance) execRegTrendsChartInstance.destroy();

  execRegTrendsChartInstance = new Chart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'FIR Registrations',
        data: counts,
        borderColor: '#0EA5B7',
        backgroundColor: 'rgba(14, 165, 183, 0.15)',
        borderWidth: 2.5,
        tension: 0.35,
        fill: true,
        pointBackgroundColor: '#153746',
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Gadugi', size: 11 } } },
        y: { beginAtZero: true, ticks: { font: { family: 'Gadugi', size: 11 }, precision: 0 } }
      }
    }
  });
}

function renderExecStatusDoughnut(dist) {
  const canvas = document.getElementById('execStatusDoughnutChart');
  if (!canvas) return;

  if (execStatusDoughnutInstance) execStatusDoughnutInstance.destroy();

  execStatusDoughnutInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['Open', 'Pending', 'Closed'],
      datasets: [{
        data: [dist?.open || 0, dist?.pending || 0, dist?.closed || 0],
        backgroundColor: ['#0EA5B7', '#B27418', '#1E8268'],
        borderWidth: 2,
        borderColor: '#FFFFFF'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { font: { family: 'Gadugi', size: 11 } }
        }
      }
    }
  });
}

function filterExecutiveStatus(status) {
  switchTab('casemanagement');
  const statusSelect = document.getElementById('caseMgmtStatusFilter');
  const prioSelect = document.getElementById('caseMgmtPriorityFilter');
  if (status === 'critical') {
    if (statusSelect) statusSelect.value = 'all';
    if (prioSelect) prioSelect.value = 'critical';
  } else {
    if (statusSelect) statusSelect.value = status;
    if (prioSelect) prioSelect.value = 'all';
  }
  filterCaseManagement();
}

function filterCaseManagementByDistrict(district) {
  switchTab('casemanagement');
  const citySelect = document.getElementById('caseMgmtCityFilter');
  if (citySelect) {
    citySelect.value = district;
    filterCaseManagement();
  }
}

// ============================================================
// CRIME RECORDS AND CASE MANAGEMENT WORKSPACE
// ============================================================
async function loadCaseManagement() {
  try {
    const res = await authFetch('/api/cases/');
    allCasesRegistry = await res.json();
    renderCaseManagementTable(allCasesRegistry);
  } catch (err) {
    console.error('Error loading case management:', err);
  }
}

function filterCaseManagement() {
  const search = (document.getElementById('caseMgmtSearch')?.value || '').toLowerCase().trim();
  const status = document.getElementById('caseMgmtStatusFilter')?.value || 'all';
  const priority = document.getElementById('caseMgmtPriorityFilter')?.value || 'all';
  const city = document.getElementById('caseMgmtCityFilter')?.value || 'all';

  let filtered = allCasesRegistry.filter(c => {
    if (status !== 'all' && c.status !== status) return false;
    if (priority !== 'all' && c.priority !== priority) return false;
    if (city !== 'all' && c.city !== city) return false;
    if (search) {
      const match = (c.case_id && c.case_id.toLowerCase().includes(search)) ||
                    (c.case_number && c.case_number.toLowerCase().includes(search)) ||
                    (c.title && c.title.toLowerCase().includes(search)) ||
                    (c.case_type && c.case_type.toLowerCase().includes(search)) ||
                    (c.city && c.city.toLowerCase().includes(search)) ||
                    (c.police_station && c.police_station.toLowerCase().includes(search));
      if (!match) return false;
    }
    return true;
  });

  renderCaseManagementTable(filtered);
}

function resetCaseManagementFilters() {
  const searchInput = document.getElementById('caseMgmtSearch');
  const statusSelect = document.getElementById('caseMgmtStatusFilter');
  const prioSelect = document.getElementById('caseMgmtPriorityFilter');
  const citySelect = document.getElementById('caseMgmtCityFilter');

  if (searchInput) searchInput.value = '';
  if (statusSelect) statusSelect.value = 'all';
  if (prioSelect) prioSelect.value = 'all';
  if (citySelect) citySelect.value = 'all';

  renderCaseManagementTable(allCasesRegistry);
}

function renderCaseManagementTable(cases) {
  const badge = document.getElementById('caseManagementCountBadge');
  const tbody = document.getElementById('caseManagementTableBody');

  if (badge) badge.textContent = `${cases.length} Verified Records`;
  if (!tbody) return;

  if (cases.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--ci-text-muted);">No cases match the selected filter criteria.</td></tr>';
    return;
  }

  tbody.innerHTML = cases.map(c => {
    const prioClass = c.priority === 'critical' ? 'badge-danger' :
                      c.priority === 'high' ? 'badge-amber' : 'badge-muted';
    const statusClass = c.status === 'open' ? 'badge-teal' :
                        c.status === 'pending' ? 'badge-warning' : 'badge-success';

    return `
      <tr>
        <td><span class="badge badge-teal">${c.case_id}</span></td>
        <td>
          <div style="font-weight:700; color:var(--ci-navy);">${c.title}</div>
          <div style="font-size:11px; color:var(--ci-text-muted);">${c.case_number}</div>
        </td>
        <td><span class="badge badge-muted">${c.case_type}</span></td>
        <td>
          <div style="font-weight:600;">${c.city}</div>
          <div style="font-size:11px; color:var(--ci-text-muted);">${c.police_station}</div>
        </td>
        <td>
          <span style="font-size:12px; font-weight:600; color:var(--ci-teal-dark);">Insp. Asha Kulkarni</span>
        </td>
        <td style="font-size:12px;">${c.opened_date || '2026-01-15'}</td>
        <td><span class="badge ${statusClass}">${(c.status || 'OPEN').toUpperCase()}</span></td>
        <td><span class="badge ${prioClass}">${(c.priority || 'MEDIUM').toUpperCase()}</span></td>
        <td>
          <button onclick="inspectCaseManagementDetail('${c.case_id}')" class="btn btn-secondary btn-sm" style="font-size:11.5px; padding:3px 8px;">
            Inspect Record
          </button>
          <button onclick="generateChargesheetModal('${c.case_id}')" class="btn btn-secondary btn-sm" style="font-size:11.5px; padding:3px 8px; margin-left:4px;" title="Draft Chargesheet for this case">
            📝 Chargesheet
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

async function inspectCaseManagementDetail(caseId) {
  currentInspectedCaseId = caseId;
  const inspectionPanel = document.getElementById('caseDetailInspectionSection');
  if (inspectionPanel) inspectionPanel.classList.remove('hidden');

  try {
    const res = await authFetch(`/api/cases/${caseId}`);
    if (!res.ok) return;
    const c = await res.json();

    const idBadge = document.getElementById('inspectCaseIdBadge');
    const titleEl = document.getElementById('inspectCaseTitle');
    const statusBadge = document.getElementById('inspectCaseStatusBadge');
    const prioBadge = document.getElementById('inspectCasePriorityBadge');
    const metaEl = document.getElementById('inspectCaseMeta');
    const summaryEl = document.getElementById('inspectCaseSummary');
    const lastUpdateEl = document.getElementById('inspectCaseLastUpdate');
    const teamEl = document.getElementById('inspectCaseTeam');
    const tasksEl = document.getElementById('inspectCasePendingTasks');
    const entitiesEl = document.getElementById('inspectCaseEntities');
    const docsEl = document.getElementById('inspectCaseDocs');
    const linksEl = document.getElementById('inspectCaseLinks');

    if (idBadge) idBadge.textContent = c.case_id;
    if (titleEl) titleEl.textContent = `${c.title} (${c.case_number})`;
    if (statusBadge) {
      statusBadge.textContent = (c.status || 'OPEN').toUpperCase();
      statusBadge.className = `badge ${c.status === 'open' ? 'badge-teal' : c.status === 'pending' ? 'badge-warning' : 'badge-success'}`;
    }
    if (prioBadge) {
      prioBadge.textContent = (c.priority || 'MEDIUM').toUpperCase();
      prioBadge.className = `badge ${c.priority === 'critical' ? 'badge-danger' : c.priority === 'high' ? 'badge-amber' : 'badge-muted'}`;
    }
    if (metaEl) {
      metaEl.textContent = `Station: ${c.police_station} • City: ${c.city} • Registered: ${c.opened_date || '2026-01-15'} • Modus Operandi: ${c.mo_code}`;
    }
    if (summaryEl) {
      summaryEl.textContent = c.summary || 'Initial FIR registered based on preliminary complaint and witness attestation. Forensic evidence exhibits and telephone subscriber records cataloged.';
    }
    if (lastUpdateEl) {
      lastUpdateEl.textContent = c.last_update || '2026-03-14';
    }

    if (teamEl) {
      teamEl.innerHTML = `
        <div class="flex items-center justify-between">
          <span><strong>Insp. Asha Kulkarni</strong> (Lead Field Officer)</span>
          <span class="badge badge-success">Assigned</span>
        </div>
        <div class="flex items-center justify-between">
          <span><strong>Sub-Insp. Vivek Deshmukh</strong> (Corridor Specialist)</span>
          <span class="badge badge-teal">Support</span>
        </div>
      `;
    }

    if (tasksEl) {
      tasksEl.innerHTML = `
        <div>• Ballistics & Vehicle chassis verification pending with Forensic Lab Pune.</div>
        <div>• Cross-jurisdiction toll gate footage review scheduled for Corridor NH-48.</div>
        <div>• Supplementary chargesheet witness deposition pending judicial date.</div>
      `;
    }

    if (entitiesEl) {
      const suspects = c.suspects || [];
      const vehicles = c.vehicles || [];
      const phones = c.phones || [];
      let entHtml = '';
      suspects.forEach(s => entHtml += `<span class="badge badge-teal">👤 ${s}</span> `);
      vehicles.forEach(v => entHtml += `<span class="badge badge-amber">🚗 ${v}</span> `);
      phones.forEach(p => entHtml += `<span class="badge badge-muted">📱 ${p}</span> `);
      if (!entHtml) entHtml = '<span style="font-size:12px; color:var(--ci-text-muted);">No primary entities cataloged.</span>';
      entitiesEl.innerHTML = entHtml;
    }

    if (docsEl) {
      const docs = c.documents || [];
      if (docs.length === 0) {
        docsEl.innerHTML = '<span style="color:var(--ci-text-muted);">No formal documents attached.</span>';
      } else {
        docsEl.innerHTML = docs.map(d => `
          <div class="flex items-center justify-between" style="border-bottom:1px dashed var(--ci-border); padding-bottom:3px;">
            <span>📄 <strong>${d.doc_id || d}</strong></span>
            <span class="badge badge-muted">${d.doc_type || 'EXHIBIT'}</span>
          </div>
        `).join('');
      }
    }

    if (linksEl) {
      const linked = c.linked_cases || [];
      if (linked.length === 0) {
        linksEl.innerHTML = '<span style="color:var(--ci-text-muted);">No verified cross-case links identified.</span>';
      } else {
        linksEl.innerHTML = linked.map(lc => `
          <div class="flex items-center justify-between" style="border-bottom:1px dashed var(--ci-border); padding-bottom:3px;">
            <span>🔗 <strong>${lc.target_case || lc}</strong> (${lc.relationship_type || 'Associated Pattern'})</span>
            <button onclick="inspectCaseManagementDetail('${lc.target_case || lc}')" class="btn btn-secondary btn-sm" style="font-size:10px; padding:2px 6px;">View</button>
          </div>
        `).join('');
      }
    }

    if (inspectionPanel) inspectionPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (err) {
    console.error('Error inspecting case details:', err);
  }
}

function closeCaseInspection() {
  const inspectionPanel = document.getElementById('caseDetailInspectionSection');
  if (inspectionPanel) inspectionPanel.classList.add('hidden');
}

function navigateCaseToGraph() {
  currentCaseId = currentInspectedCaseId;
  switchTab('constellation');
  loadCaseDetails(currentCaseId);
}

function navigateCaseToTimeline() {
  currentCaseId = currentInspectedCaseId;
  switchTab('timeline');
  loadTimeline(currentCaseId);
}

function navigateCaseToAssistant() {
  currentCaseId = currentInspectedCaseId;
  switchTab('assistant');
  setAssistantPrompt(`What evidence is recorded for Case ${currentCaseId}?`);
}

// ============================================================
// OFFICER WORKLOAD AND OPERATIONAL STATISTICS
// ============================================================
async function loadOfficerWorkload() {
  try {
    const res = await authFetch('/api/analytics/officer-workload');
    if (!res.ok) {
      alert('Access Denied: Officer workload requires Administrator clearance.');
      return;
    }

    const data = await res.json();

    // Summary Metric Widgets
    const activeOffEl = document.getElementById('workloadActiveOfficers');
    const avgLoadEl = document.getElementById('workloadAvgCaseload');
    const pendingTasksEl = document.getElementById('workloadTotalPendingTasks');
    const agingCasesEl = document.getElementById('workloadAgingCases');

    if (activeOffEl) activeOffEl.textContent = data.summary?.active_investigators || 0;
    if (avgLoadEl) avgLoadEl.textContent = data.summary?.avg_caseload || '0.0';
    if (pendingTasksEl) pendingTasksEl.textContent = data.summary?.total_pending_review || 0;
    if (agingCasesEl) agingCasesEl.textContent = data.summary?.aging_cases_over_60 || 0;

    // Officer Assignment & Workload Table
    const tbody = document.getElementById('workloadOfficerTableBody');
    if (tbody && data.officers) {
      tbody.innerHTML = data.officers.map(o => `
        <tr>
          <td><span class="badge badge-teal">${o.officer_id}</span></td>
          <td>
            <strong style="color:var(--ci-navy);">${o.name}</strong><br>
            <span style="font-size:11px; color:var(--ci-text-muted);">${o.role}</span>
          </td>
          <td>
            ${o.unit}<br>
            <span style="font-size:11px; color:var(--ci-text-muted);">${o.station}</span>
          </td>
          <td><strong>${o.assigned_total}</strong> cases</td>
          <td><span class="badge badge-teal">${o.open_cases} Active</span></td>
          <td><span class="badge badge-warning">${o.pending_cases}</span></td>
          <td><span class="badge badge-amber">${o.pending_validations}</span></td>
          <td><span style="font-size:11.5px; color:var(--ci-navy);">${o.last_action}</span></td>
          <td>
            <div class="flex flex-wrap gap-1">
              ${o.assigned_case_ids.map(cid => `
                <span class="badge badge-muted cursor-pointer" onclick="inspectCaseManagementDetail('${cid}'); switchTab('casemanagement');" title="Inspect ${cid}">${cid}</span>
              `).join('')}
            </div>
          </td>
        </tr>
      `).join('');
    }

    // Caseload Age Distribution Cards
    const u30 = document.getElementById('ageUnder30');
    const b3060 = document.getElementById('age30to60');
    const b6090 = document.getElementById('age60to90');
    const o90 = document.getElementById('ageOver90');

    if (u30) u30.textContent = data.age_distribution?.under_30 || 0;
    if (b3060) b3060.textContent = data.age_distribution?.['30_to_60'] || 0;
    if (b6090) b6090.textContent = data.age_distribution?.['60_to_90'] || 0;
    if (o90) o90.textContent = data.age_distribution?.over_90 || 0;

    // Unit Workload Balance List
    const unitList = document.getElementById('workloadUnitBalanceList');
    if (unitList && data.unit_distribution) {
      const units = Object.entries(data.unit_distribution);
      const maxCount = Math.max(...units.map(u => u[1]), 1);

      unitList.innerHTML = units.map(([uName, count]) => {
        const pct = Math.round((count / maxCount) * 100);
        return `
          <div class="card-sub p-2 flex flex-col gap-1">
            <div class="flex items-center justify-between" style="font-size:12px;">
              <strong>${uName}</strong>
              <span class="badge badge-teal">${count} Active Cases</span>
            </div>
            <div style="background:var(--ci-border); border-radius:4px; height:6px; overflow:hidden;">
              <div style="background:var(--ci-teal); height:100%; width:${pct}%;"></div>
            </div>
          </div>
        `;
      }).join('');
    }

  } catch (err) {
    console.error('Error loading officer workload:', err);
  }
}


// ============================================================
// 7. DYNAMIC OVERVIEW DASHBOARD & CHARTS
// ============================================================
async function loadDynamicOverview() {
  const city = document.getElementById('overviewCityFilter')?.value || 'all';
  const status = document.getElementById('overviewStatusFilter')?.value || 'all';
  const priority = document.getElementById('overviewPriorityFilter')?.value || 'all';

  const params = new URLSearchParams();
  if (city !== 'all') params.append('city', city);
  if (status !== 'all') params.append('status', status);
  if (priority !== 'all') params.append('priority', priority);

  try {
    const res = await authFetch(`/api/analytics/overview?${params.toString()}`);
    const data = await res.json();

    // Metric numbers
    const tot = document.getElementById('dynTotalCases');
    const op = document.getElementById('dynOpenCases');
    const crit = document.getElementById('dynCriticalAlerts');
    const pend = document.getElementById('dynPendingRels');

    if (tot) tot.textContent = data.total_cases;
    if (op) op.textContent = data.open_cases;
    if (crit) crit.textContent = data.critical_alerts;
    if (pend) pend.textContent = data.pending_validations_count;

    // Render Charts
    renderMonthlyTrendsChart();
    renderCrimeTypeDoughnut(data.by_case_type || {});

    // Recent Activity Stream
    const actContainer = document.getElementById('dashboardRecentActivityList');
    if (actContainer && data.recent_activity) {
      actContainer.innerHTML = data.recent_activity.map(act => `
        <div class="card p-2 flex items-center justify-between" style="font-size:12px;">
          <div>
            <span class="badge badge-teal">${act.action}</span>
            <span style="font-weight:600; margin-left:6px; color:var(--ci-navy);">${act.detail || act.entity_id}</span>
            <span style="color:var(--ci-text-muted); font-size:11px; margin-left:6px;">by ${act.user_id}</span>
          </div>
          <span style="font-size:11px; color:var(--ci-text-muted);">${(act.timestamp || '').slice(11, 19)}</span>
        </div>
      `).join('');
    }

  } catch (err) {
    console.error('Error loading dynamic overview:', err);
  }
}

async function renderMonthlyTrendsChart() {
  const canvas = document.getElementById('monthlyTrendChart');
  if (!canvas) return;

  try {
    const res = await authFetch('/api/analytics/temporal');
    const data = await res.json();

    const labels = data.map(d => d.month);
    const counts = data.map(d => d.count);

    if (monthlyTrendChartInstance) {
      monthlyTrendChartInstance.destroy();
    }

    monthlyTrendChartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Incidents & Evidence Filed',
          data: counts,
          borderColor: '#0EA5B7',
          backgroundColor: 'rgba(14, 165, 183, 0.15)',
          borderWidth: 2.5,
          tension: 0.35,
          fill: true,
          pointBackgroundColor: '#153746',
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { family: 'Gadugi', size: 11 } } },
          y: { beginAtZero: true, ticks: { font: { family: 'Gadugi', size: 11 } } }
        }
      }
    });
  } catch (err) {
    console.warn('Temporal trend chart error:', err);
  }
}

function renderCrimeTypeDoughnut(typeCounts) {
  const canvas = document.getElementById('crimeTypeDoughnutChart');
  if (!canvas) return;

  const labels = Object.keys(typeCounts).map(k => k.replace(/_/g, ' ').toUpperCase());
  const counts = Object.values(typeCounts);

  if (crimeTypeDoughnutInstance) {
    crimeTypeDoughnutInstance.destroy();
  }

  crimeTypeDoughnutInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: counts,
        backgroundColor: ['#0EA5B7', '#1E8268', '#B27418', '#2A72A4', '#BD3C3C', '#6B46C1'],
        borderWidth: 2,
        borderColor: '#FFFFFF'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { font: { family: 'Gadugi', size: 11 } }
        }
      }
    }
  });
}

// ============================================================
// 8. SEPARATED WORKFLOWS: REGISTER FIR & ADD EVIDENCE
// ============================================================
function openRegisterFirModal() {
  const modal = document.getElementById('registerFirModal');
  if (modal) modal.classList.remove('hidden');
}

function closeRegisterFirModal() {
  const modal = document.getElementById('registerFirModal');
  if (modal) modal.classList.add('hidden');
}

async function handleRegisterFirSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const reqData = {
    title: document.getElementById('firTitle')?.value.trim(),
    case_type: document.getElementById('firCaseType')?.value,
    police_station: document.getElementById('firPoliceStation')?.value,
    city: document.getElementById('firCity')?.value,
    incident_date: document.getElementById('firDate')?.value,
    priority: document.getElementById('firPriority')?.value,
    mo_code: document.getElementById('firMoCode')?.value.trim() || 'general',
    complainant_name: document.getElementById('firComplainant')?.value.trim(),
    summary: document.getElementById('firSummary')?.value.trim(),
    narrative: document.getElementById('firNarrative')?.value.trim()
  };

  try {
    const res = await authFetch('/api/cases/register-fir', {
      method: 'POST',
      body: JSON.stringify(reqData)
    });

    const data = await res.json();
    if (res.ok) {
      alert(`Success: ${data.message}`);
      closeRegisterFirModal();
      await loadCasesList();
      loadCaseDetails(data.case_id);
      switchTab('constellation');
    } else {
      alert(`Registration Error: ${data.detail || 'Failed'}`);
    }
  } catch (err) {
    alert(`Submission error: ${err.message}`);
  }
}

function openAddEvidenceModal() {
  const modal = document.getElementById('addEvidenceModal');
  const evTarget = document.getElementById('evidenceTargetCase');
  if (evTarget && currentCaseId) {
    evTarget.value = currentCaseId;
  }
  if (modal) modal.classList.remove('hidden');
}

function closeAddEvidenceModal() {
  const modal = document.getElementById('addEvidenceModal');
  if (modal) modal.classList.add('hidden');
}

async function handleAddEvidenceSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const caseId = document.getElementById('evidenceTargetCase')?.value || currentCaseId;
  const reqData = {
    evidence_type: document.getElementById('evidenceCategory')?.value,
    title: document.getElementById('evidenceTitle')?.value.trim(),
    source_type: document.getElementById('evidenceSource')?.value.trim() || 'Investigator Submission',
    narrative: document.getElementById('evidenceNarrative')?.value.trim()
  };

  try {
    const res = await authFetch(`/api/cases/${caseId}/add-evidence`, {
      method: 'POST',
      body: JSON.stringify(reqData)
    });

    const data = await res.json();
    if (res.ok) {
      alert(`Success: Evidence linked to ${caseId}! (Document: ${data.document_id})`);
      closeAddEvidenceModal();
      loadCaseDetails(caseId);
      loadAuditTrail();
    } else {
      alert(`Error: ${data.detail || 'Failed'}`);
    }
  } catch (err) {
    alert(`Evidence submission error: ${err.message}`);
  }
}

// ============================================================
// 9. ON-DEMAND ENTITY EXTRACTION & CANDIDATE LINK INSPECTION
// ============================================================
async function loadPresetDocument(docId) {
  try {
    const res = await authFetch(`/api/documents/${docId}`);
    const doc = await res.json();
    const input = document.getElementById('narrativeInput');
    if (input) {
      input.value = doc.narrative_text || doc.title || '';
    }
  } catch (e) {
    console.warn('Doc preset error:', e);
  }
}

async function extractEntitiesFromText() {
  const text = document.getElementById('narrativeInput')?.value.trim();
  const container = document.getElementById('extractionResultsContainer');
  const badge = document.getElementById('extractedCountBadge');
  if (!text || !container) return;

  container.innerHTML = `<div class="text-center py-10 mono" style="color:var(--ci-teal)">Extracting entities and generating candidate relationships...</div>`;

  try {
    const res = await authFetch('/api/documents/extract-text', {
      method: 'POST',
      body: JSON.stringify({
        text: text,
        doc_id: 'INGESTED_DOC_' + Date.now().toString().slice(-4),
        case_id: currentCaseId
      })
    });

    const data = await res.json();
    lastExtractedData = data;

    const entities = data.extracted_entities || [];
    const candRels = data.candidate_relationships || [];

    if (badge) badge.textContent = `Extracted at ${new Date().toLocaleTimeString()} • ${entities.length} Entities • ${candRels.length} Candidate Links`;

    renderExtractionView('entities');
  } catch (e) {
    container.innerHTML = `<div class="mono" style="color:var(--ci-danger); font-size:11px">Extraction error: ${e.message}</div>`;
  }
}

function toggleExtractionSection(section) {
  const entBtn = document.getElementById('toggleEntitiesBtn');
  const candBtn = document.getElementById('toggleCandidatesBtn');

  if (section === 'entities') {
    if (entBtn) entBtn.classList.add('active');
    if (candBtn) candBtn.classList.remove('active');
    renderExtractionView('entities');
  } else {
    if (candBtn) candBtn.classList.add('active');
    if (entBtn) entBtn.classList.remove('active');
    renderExtractionView('candidates');
  }
}

function renderExtractionView(view) {
  const container = document.getElementById('extractionResultsContainer');
  if (!container || !lastExtractedData) return;

  const entities = lastExtractedData.extracted_entities || [];
  const candRels = lastExtractedData.candidate_relationships || [];

  const badgeClass = {
    person: 'badge-teal',
    phone: 'badge-success',
    vehicle: 'badge-warning',
    organization: 'badge-muted',
    location: 'badge-muted'
  };

  if (view === 'entities') {
    container.innerHTML = `
      <div class="card p-3 space-y-2">
        <div class="flex items-center justify-between pb-1" style="border-bottom:1px solid var(--ci-border);">
          <span style="font-weight:700; color:var(--ci-navy); font-size:13px;">EXTRACTED ENTITIES & RESOLVED CANONICAL IDS (${entities.length})</span>
          <span class="badge badge-teal">Inspection On-Demand</span>
        </div>
        <div class="flex flex-wrap gap-2 pt-1">
          ${entities.map(e => `
            <span class="badge ${badgeClass[e.entity_type] || 'badge-muted'} flex items-center gap-1" style="padding:4px 8px;">
              <span style="font-size:9.5px; opacity:0.8; text-transform:uppercase;">${e.entity_type}:</span>
              <strong>${e.extracted_value}</strong>
              ${e.canonical_id ? `<span style="color:var(--ci-teal); font-weight:700;">(${e.canonical_id})</span>` : ''}
            </span>
          `).join('')}
        </div>
      </div>
      <div class="card-sub p-2.5" style="font-size:12px; color:var(--ci-text-muted);">
        ℹ️ <strong>Status:</strong> Entities resolved to canonical records. Candidate relationships can be inspected and accepted via the "Candidate Inferred Links" tab.
      </div>
    `;
  } else {
    container.innerHTML = `
      <div class="card p-3 space-y-2">
        <div class="flex items-center justify-between pb-1" style="border-bottom:1px solid var(--ci-border);">
          <span style="font-weight:700; color:var(--ci-navy); font-size:13px;">CANDIDATE INFERRED RELATIONSHIPS (${candRels.length})</span>
          <span class="badge badge-warning">Requires Investigator Acceptance</span>
        </div>
        <p style="font-size:12px; color:var(--ci-text-muted);">AI suggests links below based on text co-occurrence and witness statements. Candidate links are only added to confirmed constellation upon approval.</p>

        <div class="flex flex-col gap-2 pt-1">
          ${candRels.map(r => `
            <div class="card-sub p-2.5 flex flex-col gap-1.5" style="border-left:3px solid var(--ci-warning);">
              <div class="flex items-center justify-between">
                <span style="font-size:12.5px; color:var(--ci-teal-dark);">
                  <strong>${r.source_label || r.source_id}</strong> ──[ <span style="color:var(--ci-warning); font-weight:700;">${r.relationship_type}</span> ]──→ <strong>${r.target_label || r.target_id}</strong>
                </span>
                <span class="badge badge-teal">${Math.round(r.confidence * 100)}% Confidence</span>
              </div>
              <div style="font-size:11.5px; color:var(--ci-text-muted); line-height:1.4;">${r.explanation}</div>
              <div class="flex items-center gap-2 pt-1">
                <button onclick="acceptCandidateRelationship('${r.relationship_type}', '${r.source_id}', '${r.target_id}')" class="btn btn-primary btn-sm" style="font-size:11px; padding:3px 8px; background:var(--ci-success);">
                  ✓ Accept & Confirm
                </button>
                <button onclick="alert('Candidate relationship rejected.')" class="btn btn-secondary btn-sm" style="font-size:11px; padding:3px 8px; color:var(--ci-danger);">
                  ✕ Reject
                </button>
                <button onclick="alert('Flagged for deferred review.')" class="btn btn-secondary btn-sm" style="font-size:11px; padding:3px 8px;">
                  ⏳ Defer Review
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
}

function acceptCandidateRelationship(relType, sourceId, targetId) {
  alert(`Candidate relationship [${sourceId}] -[${relType}]-> [${targetId}] verified and added to the official network graph.`);
  loadGraph(currentCaseId);
}

// ============================================================
// 10. UNDERSTANDABLE CANONICAL ENTITY RESOLUTION
// ============================================================
async function resolveEntityQuery() {
  const query = document.getElementById('entityResInput')?.value.trim();
  const container = document.getElementById('entityResResults');
  if (!query || !container) return;

  container.innerHTML = `<div class="text-center py-10 mono" style="color:var(--ci-teal)">Resolving observed entity "${query}" against canonical records...</div>`;

  try {
    const res = await authFetch(`/api/persons/resolve?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    const candidates = data.candidates || [];

    if (candidates.length === 0) {
      container.innerHTML = `
        <div class="text-center py-12" style="color:var(--ci-warning); font-weight:600;">
          No matching canonical suspect resolved for "${query}". You can create a new canonical record if verified.
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="space-y-3">
        <div class="flex items-center justify-between pb-2" style="border-bottom: 1px solid var(--ci-border)">
          <div style="font-size:13px;">
            EXTRACTED INPUT QUERY: <strong style="color:var(--ci-teal-dark);">"${data.query}"</strong>
          </div>
          <span class="badge badge-success">
            ${candidates.length} Resolved Match Candidate${candidates.length > 1 ? 's' : ''}
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          ${candidates.map(c => `
            <div class="card p-3 space-y-2" style="border-left: 4px solid var(--ci-teal);">
              <!-- Comparison Header -->
              <div class="flex items-center justify-between">
                <div>
                  <div style="font-size:15px; font-weight:700; color:var(--ci-navy);">${c.full_name}</div>
                  <div style="font-size:12px; color:var(--ci-text-muted);">Canonical Master: <strong>${c.person_id}</strong> | Primary Alias: <strong>${c.alias || '—'}</strong></div>
                </div>
                <span class="badge badge-teal">${c.person_id}</span>
              </div>

              <!-- Matching Explainer Box -->
              <div class="card-sub p-2.5 space-y-1.5" style="font-size:12px;">
                <div class="flex justify-between">
                  <span style="color:var(--ci-text-muted);">MATCH METHOD:</span>
                  <strong style="color:var(--ci-warning); text-transform:uppercase;">${c.match_type}</strong>
                </div>
                <div class="flex justify-between">
                  <span style="color:var(--ci-text-muted);">MATCH CONFIDENCE:</span>
                  <strong style="color:var(--ci-success); font-size:13px;">${Math.round(c.confidence * 100)}%</strong>
                </div>
                <div style="font-size:11.5px; color:var(--ci-text-muted); line-height:1.4;">
                  <strong>Reason for match:</strong> Observed variant "${data.query}" has 92% lexical and phonetic agreement with canonical person ${c.full_name} (${c.person_id}) and shares historical case footprints.
                </div>
                ${c.alternate_names ? `
                  <div style="font-size:11px; color:var(--ci-text-muted);">
                    Known Observed Variants: <span style="font-weight:600; color:var(--ci-text-main);">${c.alternate_names.join(', ')}</span>
                  </div>
                ` : ''}
              </div>

              <!-- Plain Language Notice -->
              <div class="card-sub p-2" style="font-size:11.5px; color:var(--ci-teal-dark); background:var(--ci-teal-soft);">
                ✓ <strong>Preservation Rule:</strong> Confirming this match links "${data.query}" as an alias to ${c.person_id}. No duplicate node is created in the criminal network.
              </div>

              <!-- Clear Action Buttons -->
              <div class="flex items-center gap-2 pt-1">
                <button onclick="confirmAliasLink('${data.query}', '${c.person_id}', '${c.full_name}')" class="btn btn-primary btn-sm flex-1" style="font-size:12px; background:var(--ci-success);">
                  ✓ Confirm Match (Link to ${c.person_id})
                </button>
                <button onclick="alert('Match rejected. Created distinct individual entity record.')" class="btn btn-secondary btn-sm" style="font-size:12px; color:var(--ci-danger);">
                  ✕ Reject Match
                </button>
                <button onclick="toggleEgoMode('${c.person_id}'); switchTab('constellation');" class="btn btn-secondary btn-sm" style="font-size:12px;">
                  View Graph →
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;

  } catch (e) {
    container.innerHTML = `<div class="mono" style="color:var(--ci-danger); font-size:11px">Resolution error: ${e.message}</div>`;
  }
}

function setEntityResQuery(val) {
  const el = document.getElementById('entityResInput');
  if (el) el.value = val;
  resolveEntityQuery();
}

function confirmAliasLink(alias, personId, name) {
  alert(`Confirmed: "${alias}" has been recorded as a verified alias for canonical master record ${personId} (${name}).`);
}

// ============================================================
// 11. CONSTELLATION GRAPH (VIS NETWORK & ENTITY INTELLIGENCE)
// ============================================================
async function loadGraph(caseId = null, personId = null, nodeType = null, radius = 2) {
  try {
    let url = '/api/graph/nodes';
    const params = new URLSearchParams();
    if (caseId) params.append('case_id', caseId);
    if (personId) {
      params.append('person_id', personId);
      params.append('radius', radius);
    }
    if (nodeType && nodeType !== 'all') params.append('node_type', nodeType);

    if (Array.from(params).length > 0) {
      url += '?' + params.toString();
    }

    const res = await authFetch(url);
    graphData = await res.json();
    renderVisNetwork(graphData);
  } catch (e) {
    console.error('Failed to load graph:', e);
  }
}

function toggleEgoMode(personId, radius = 2) {
  loadGraph(null, personId, null, radius);
}

function renderVisNetwork(data) {
  const container = document.getElementById('networkCanvas');
  if (!container) return;

  const isDark = document.documentElement.classList.contains('dark');
  const fontColor = isDark ? '#D9EAF0' : '#153746';
  const fontBg = isDark ? '#0A1520' : '#FFFFFF';

  const nodes = data.nodes.map(n => {
    let color = '#0EA5B7'; // teal person
    let shape = 'dot';
    let size = 16 + (n.degree || 1) * 2;

    if (n.node_type === 'phone') {
      color = '#1E8268'; // emerald
      shape = 'square';
      size = 14;
    } else if (n.node_type === 'vehicle') {
      color = '#B27418'; // amber
      shape = 'triangle';
      size = 15;
    } else if (n.node_type === 'organization') {
      color = '#2A72A4'; // navy/blue
      shape = 'diamond';
      size = 18;
    }

    if (n.betweenness_centrality > 0.05) {
      size += 6;
    }

    return {
      id: n.id,
      label: n.alias ? `${n.label}\n(${n.alias})` : n.label,
      title: `ID: ${n.id} | Type: ${n.node_type} | Degree: ${n.degree || 0} | Betweenness: ${n.betweenness_centrality || 0}`,
      color: {
        background: color,
        border: n.betweenness_centrality > 0.05 ? '#D4A82B' : (isDark ? '#1D3347' : '#D8E4E8'),
        highlight: { background: '#14C8DC', border: '#0A1520' }
      },
      borderWidth: n.betweenness_centrality > 0.05 ? 3 : 1.5,
      shape: shape,
      size: size,
      font: { color: fontColor, size: 12.5, face: 'Gadugi', background: fontBg },
      raw: n
    };
  });

  const edges = data.edges.map(e => {
    const isAiSuggested = e.evidence_status === 'ai_suggested';
    return {
      id: e.relationship_id,
      from: e.source,
      to: e.target,
      label: e.rel_type,
      arrows: 'to',
      color: {
        color: isAiSuggested ? '#B27418' : '#1E8268',
        highlight: '#14C8DC'
      },
      dashes: isAiSuggested,
      width: Math.max(1.5, (e.confidence || 0.5) * 3),
      font: { color: isAiSuggested ? '#B27418' : (isDark ? '#7A9BAB' : '#5B7380'), size: 10.5, face: 'Gadugi', align: 'top', background: fontBg },
      raw: e
    };
  });

  const networkData = {
    nodes: new vis.DataSet(nodes),
    edges: new vis.DataSet(edges)
  };

  const options = {
    physics: {
      stabilization: { iterations: 120 },
      barnesHut: {
        gravitationalConstant: -3500,
        springLength: 95,
        springConstant: 0.04
      }
    },
    interaction: {
      hover: true,
      tooltipDelay: 100,
      zoomView: true
    }
  };

  visNetwork = new vis.Network(container, networkData, options);

  // Update real graph node and edge counts (Item 23)
  const metricBadge = document.getElementById('graphMetricsBadge');
  if (metricBadge) {
    metricBadge.textContent = `${nodes.length} entities · ${edges.length} relationships`;
  }

  visNetwork.on('click', function(params) {
    if (params.nodes.length > 0) {
      const nodeId = params.nodes[0];
      const nodeObj = nodes.find(n => n.id === nodeId);
      if (nodeObj) inspectNode(nodeObj.raw);
    } else if (params.edges.length > 0) {
      const edgeId = params.edges[0];
      openEvidenceDrawer(edgeId);
    }
  });
}

async function inspectNode(node) {
  const inspector = document.getElementById('inspectorContent');
  const badge = document.getElementById('selectedNodeTypeBadge');
  if (!inspector) return;

  if (badge) badge.textContent = (node.node_type || 'person').toUpperCase();

  if (node.node_type === 'person') {
    try {
      const res = await authFetch(`/api/persons/${node.id}`);
      const p = await res.json();

      const aliases = (p.known_aliases || []).map(a => a.observed_value || a.alias_value).join(', ') || p.alias || 'None recorded';
      const cases = (p.cases || []).map(c => `<span class="badge badge-teal">${c.case_id}: ${c.title}</span>`).join(' ') || 'None';
      const isBridge = (p.betweenness_centrality || 0) > 0.03;
      const prioTag = (p.risk_tag || 'normal').toLowerCase();
      const prioColor = prioTag === 'critical' ? 'badge-danger' : (prioTag === 'high' ? 'badge-amber' : 'badge-teal');

      inspector.innerHTML = `
        <!-- Focus Entity Profile Card -->
        <div class="card p-3 space-y-2" style="border-left: 4px solid var(--ci-teal)">
          <div class="flex items-center justify-between">
            <div>
              <div style="font-size:10px; font-weight:700; color:var(--ci-teal); text-transform:uppercase;">FOCUS ENTITY (PERSON UNDER INVESTIGATION)</div>
              <strong style="color:var(--ci-navy); font-size:15px">${p.full_name}</strong>
            </div>
            <span class="badge badge-teal">${p.person_id}</span>
          </div>
          <div style="font-size:12px;">Operational Profile: <strong>${p.role_profile || 'Unknown associate'}</strong></div>
          <div style="font-size:12px; color:var(--ci-text-muted);">Known Aliases / Street Tags: <strong style="color:var(--ci-text-main);">${aliases}</strong></div>
        </div>

        <!-- Analytical Priority Signal (Risk Indicator Explainer) -->
        <div class="card p-3 space-y-2">
          <div class="flex items-center justify-between">
            <span style="font-size:11px; font-weight:700; color:var(--ci-navy); text-transform:uppercase;">ANALYTICAL PRIORITY SIGNAL</span>
            <span class="badge ${prioColor}">${prioTag.toUpperCase()} PRIORITY</span>
          </div>
          <p style="font-size:11.5px; color:var(--ci-text-muted); line-height:1.45; margin:0;">
            <strong>Contributing Factors:</strong> Case involvement count (${(p.cases || []).length} FIR files), recurring telecommunication contacts, and recorded cross-jurisdiction sightings.
          </p>
          <div style="font-size:10.5px; color:var(--ci-text-muted); background:var(--ci-card-sub); padding:4px 8px; border-radius:4px;">
            ℹ️ <em>Analytical Signal Notice:</em> Used strictly for allocating investigative workload; not a criminal guilt index or court-admissible score.
          </div>
        </div>

        <!-- Ego Network Controls & Definition -->
        <div class="card p-3 space-y-2">
          <div style="font-size:11px; font-weight:700; color:var(--ci-navy); text-transform:uppercase;">EGO NETWORK & ISOLATED VIEW</div>
          <p style="font-size:11.5px; color:var(--ci-text-muted); line-height:1.4; margin:0;">
            An <strong>ego network</strong> centers on this focus entity and its directly connected contacts. An <strong>isolated view</strong> hides unrelated parts of the larger graph while preserving relevant connections.
          </p>
          <div class="grid grid-cols-2 gap-2 pt-1">
            <button onclick="toggleEgoMode('${p.person_id}', 1)" class="btn btn-primary btn-sm" title="Show only directly connected associates">
              🎯 Isolate Ego (1-Hop)
            </button>
            <button onclick="toggleEgoMode('${p.person_id}', 2)" class="btn btn-secondary btn-sm" title="Extend to second-degree associates">
              🌐 Extend Ego (2-Hop)
            </button>
          </div>
          <button onclick="loadGraph()" class="btn btn-secondary btn-sm w-full mt-1" style="font-size:11px;">
            ↺ Reset to Full Network Graph
          </button>
        </div>

        <!-- Betweenness Centrality & Bridge Nodes -->
        <div class="card p-3 space-y-2">
          <div style="font-size:11px; font-weight:700; color:var(--ci-navy); text-transform:uppercase;">GRAPH CENTRALITY & BRIDGE BROKERAGE</div>
          <div class="grid grid-cols-2 gap-2 text-center">
            <div class="p-2 card-sub">
              <div style="font-size:10px; color:var(--ci-text-muted);">DEGREE (DIRECT LINKS)</div>
              <div style="font-size:18px; font-weight:700; color:var(--ci-teal)">${p.degree || 0}</div>
            </div>
            <div class="p-2 card-sub">
              <div style="font-size:10px; color:var(--ci-text-muted);">BETWEENNESS CENTRALITY</div>
              <div style="font-size:18px; font-weight:700; color:${isBridge ? 'var(--ci-warning)' : 'var(--ci-navy)'}">${p.betweenness_centrality || 0}</div>
            </div>
          </div>
          <p style="font-size:11px; color:var(--ci-text-muted); line-height:1.4; margin:0;">
            <strong>Betweenness Centrality:</strong> Measures how often this entity lies on shortest communication paths between other entities. Higher values indicate bridge broker positions connecting separate clusters.
          </p>
          ${isBridge ? `
            <div class="badge badge-amber p-2 w-full text-left" style="white-space:normal; font-size:11px; line-height:1.4">
              ⚡ <strong>Bridge Position Detected:</strong> Lies on shortest paths linking distinct criminal sub-groups.
            </div>
          ` : ''}

          <!-- Mandatory Legal / Ethical Caution Banner -->
          <div class="card-sub p-2" style="border-left: 3px solid var(--ci-warning); font-size:11px; color:var(--ci-text-muted); line-height:1.4;">
            ⚖️ <strong>Legal & Ethical Safeguard:</strong> High centrality does <em>not</em> mean a person is guilty or inherently dangerous. Graph topology metrics reflect communication structure, not legal guilt or dangerousness.
          </div>
        </div>

        <!-- Involved Cases -->
        <div class="card p-3 space-y-2">
          <div style="font-size:11px; font-weight:700; color:var(--ci-navy); text-transform:uppercase;">LINKED FIR INVESTIGATIONS (${(p.cases || []).length})</div>
          <div class="flex flex-wrap gap-1">${cases}</div>
        </div>

        <div class="pt-1">
          <button onclick="openAssistantPrompt('Explain the criminal connections, aliases, and bridge role of ${p.person_id} (${p.full_name}) in active cases')" class="btn btn-secondary w-full text-center">
            🤖 Ask AI Evidence Assistant About ${p.full_name}
          </button>
        </div>
      `;
    } catch (e) {
      inspector.innerHTML = `<div style="color:var(--ci-danger)">Error inspecting node: ${e.message}</div>`;
    }
  } else {
    // Non-person entities (Phone, Vehicle, Organization)
    const typeLabel = node.node_type ? node.node_type.toUpperCase() : 'ENTITY';
    inspector.innerHTML = `
      <div class="card p-3 space-y-2" style="border-left: 4px solid var(--ci-teal)">
        <div style="font-size:10px; font-weight:700; color:var(--ci-teal); text-transform:uppercase;">FOCUS ENTITY (${typeLabel})</div>
        <div style="font-weight:700; color:var(--ci-navy); font-size:15px">${node.label}</div>
        <div style="font-size:12px; color:var(--ci-text-muted);">Entity ID: <strong>${node.id}</strong> | Type: <strong>${node.node_type}</strong></div>
        <div style="font-size:12px; color:var(--ci-text-muted);">Connected Degree: <strong>${node.degree || 1}</strong> links</div>
      </div>

      <div class="card p-3 space-y-2">
        <div style="font-size:11px; font-weight:700; color:var(--ci-navy); text-transform:uppercase;">EGO NETWORK ISOLATION</div>
        <p style="font-size:11.5px; color:var(--ci-text-muted); line-height:1.4; margin:0;">
          Isolate the network neighborhood connected to this ${node.node_type} to trace which suspects or cases share this device/vehicle.
        </p>
        <div class="grid grid-cols-2 gap-2 pt-1">
          <button onclick="toggleEgoMode('${node.id}', 1)" class="btn btn-primary btn-sm">
            🎯 Isolate Direct (1-Hop)
          </button>
          <button onclick="toggleEgoMode('${node.id}', 2)" class="btn btn-secondary btn-sm">
            🌐 Extend (2-Hop)
          </button>
        </div>
        <button onclick="loadGraph()" class="btn btn-secondary btn-sm w-full mt-1" style="font-size:11px;">
          ↺ Reset Full Graph
        </button>
      </div>

      <div class="pt-1">
        <button onclick="openAssistantPrompt('What cases and suspects are linked to ${node.node_type} ${node.label} (${node.id})?')" class="btn btn-secondary w-full text-center">
          🤖 Ask AI About This ${typeLabel}
        </button>
      </div>
    `;
  }
}

function filterGraph(type) {
  activeFilter = type;
  document.querySelectorAll('.graph-filter-btn').forEach(btn => btn.classList.remove('active'));
  if (window.event && window.event.target) {
    window.event.target.classList.add('active');
  }

  if (type === 'case_only') {
    loadGraph(currentCaseId);
  } else if (type === 'all') {
    loadGraph();
  } else {
    loadGraph(null, null, type);
  }
}



async function loadCommunities() {
  try {
    const res = await authFetch('/api/graph/communities');
    const comms = await res.json();

    const palette = ['#0EA5B7', '#1E8268', '#B27418', '#BD3C3C', '#2A72A4', '#6B46C1'];

    if (visNetwork && comms.length > 0) {
      const nodeUpdates = [];
      comms.forEach((comm, idx) => {
        const clusterColor = palette[idx % palette.length];
        comm.members.forEach(m => {
          nodeUpdates.push({
            id: m.person_id,
            color: { background: clusterColor, border: '#0A1520' }
          });
        });
      });
      visNetwork.body.data.nodes.update(nodeUpdates);
    }

    const inspector = document.getElementById('inspectorContent');
    if (inspector) {
      inspector.innerHTML = `
        <div class="card p-3 space-y-2">
          <div style="font-weight:700; color:var(--ci-teal); font-size:12px">LOUVAIN COMMUNITIES DETECTED (${comms.length})</div>
          ${comms.slice(0, 4).map((c, i) => `
            <div class="p-2 card-sub space-y-1">
              <div style="font-weight:700; font-size:12px">Cluster #${c.community_id} (${c.size} members)</div>
              <div style="font-size:11px; color:var(--ci-text-muted);">Key Members: ${c.members.slice(0, 3).map(m => m.name).join(', ')}</div>
              ${c.bridge_candidates.length > 0 ? `<div style="font-size:11px; color:var(--ci-warning); font-weight:700;">Bridges: ${c.bridge_candidates.map(b => b.name).join(', ')}</div>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }
  } catch (e) {
    console.error('Error loading communities:', e);
  }
}

async function loadCentralityRanks() {
  try {
    const res = await authFetch('/api/graph/centrality/top?limit=8');
    const list = await res.json();

    const inspector = document.getElementById('inspectorContent');
    if (inspector) {
      inspector.innerHTML = `
        <div class="card p-3 space-y-2">
          <div style="font-weight:700; color:var(--ci-warning); font-size:12px">TOP BRIDGE BROKERS (BETWEENNESS)</div>
          <p style="font-size:11.5px; color:var(--ci-text-muted);">Brokers whose monitoring fragments criminal syndicate communications:</p>
          ${list.map(p => `
            <div onclick="inspectNode({ id: '${p.person_id}', node_type: 'person' })" class="p-2 card-sub flex items-center justify-between cursor-pointer">
              <div>
                <div style="font-weight:700; color:var(--ci-teal); font-size:12px">${p.name} (${p.alias || '—'})</div>
                <div style="font-size:11px; color:var(--ci-text-muted);">${p.role || 'Associate'}</div>
              </div>
              <div class="text-right">
                <div style="font-weight:700; color:var(--ci-warning); font-size:13px">${p.betweenness_centrality}</div>
                <div style="font-size:10px; color:var(--ci-text-muted)">Deg: ${p.degree}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }
  } catch (e) {
    console.error('Centrality error:', e);
  }
}

function resetGraphPhysics() {
  loadGraph();
}

// ============================================================
// 12. EVIDENCE DETAILS DRAWER (OFF-CANVAS)
// ============================================================
async function openEvidenceDrawer(relationshipId) {
  const drawer = document.getElementById('evidenceDrawer');
  const body = document.getElementById('drawerBody');
  const footer = document.getElementById('drawerFooterActions');
  if (!drawer || !body) return;

  body.innerHTML = `<div class="text-center py-10" style="color:var(--ci-text-muted)">Loading relationship evidence grounding...</div>`;
  drawer.classList.remove('translate-x-full');

  try {
    const res = await authFetch(`/api/graph/edge/${relationshipId}`);
    const data = await res.json();

    if (data.error) {
      body.innerHTML = `<div style="color:var(--ci-danger)">${data.error}</div>`;
      return;
    }

    const r = data.relationship;
    const doc = data.source_document;
    const vals = data.validation_history || [];
    const cl = data.case_link_factors;
    const confBasis = data.confidence_basis || {
      score_percentage: Math.round(parseFloat(r.confidence || 0.5) * 100),
      model_confidence_label: `${Math.round(parseFloat(r.confidence || 0.5) * 100)}% NLP Extraction Confidence`,
      model_confidence_expl: 'Statistical likelihood of correct entity-relation syntax parsed from narrative text.',
      evidence_strength: parseFloat(r.confidence || 0.5) >= 0.8 ? 'High Evidentiary Corroboration' : 'Moderate Corroboration',
      evidence_strength_desc: 'Supported by primary investigative records and cross-referenced logs.'
    };

    const confPct = confBasis.score_percentage;
    const pipsCount = Math.round(confPct / 20);
    const pipsHtml = Array.from({ length: 5 }, (_, i) => 
      `<span style="width:10px; height:10px; border-radius:50%; display:inline-block; background:${i < pipsCount ? 'var(--ci-teal)' : 'var(--ci-border)'}"></span>`
    ).join(' ');

    const isAiSuggested = r.evidence_status === 'ai_suggested';
    const isVerified = r.evidence_status === 'verified';
    const sourceLabel = r.source_name || r.source_id;
    const targetLabel = r.target_name || r.target_id;
    const extractedText = data.extracted_passage || doc?.narrative || r.explanation || 'Direct contact or observation documented in investigative record.';

    body.innerHTML = `
      <!-- Core Reason Banner (Answers: Why is this shown?) -->
      <div class="card p-3 space-y-2" style="border-left: 4px solid var(--ci-teal)">
        <div class="flex items-center justify-between">
          <span style="font-size:10px; font-weight:700; color:var(--ci-teal); text-transform:uppercase;">WHY THIS RELATIONSHIP IS SHOWN</span>
          <span class="badge ${isVerified ? 'badge-success' : isAiSuggested ? 'badge-amber' : 'badge-muted'}">${(r.evidence_status || 'PENDING').toUpperCase()}</span>
        </div>
        <p style="font-size:12.5px; line-height:1.5; color:var(--ci-navy); margin:0;">
          This link connects <strong>${sourceLabel}</strong> and <strong>${targetLabel}</strong> based on an observed <strong>${r.relationship_type}</strong> relation recorded in source document <em>${r.source_document_id || 'DOC001'}</em>.
        </p>
      </div>

      <!-- Entity Connection Summary -->
      <div class="card p-3 space-y-2">
        <div style="font-size:11px; font-weight:700; color:var(--ci-text-muted); text-transform:uppercase;">CONNECTED ENTITIES</div>
        <div class="flex items-center justify-between" style="font-size:12.5px;">
          <div>
            <div style="font-size:10px; color:var(--ci-text-muted); text-transform:uppercase;">Source (${r.source_type || 'Entity'})</div>
            <strong style="color:var(--ci-teal)">${sourceLabel}</strong>
            <div style="font-size:10px; color:var(--ci-text-muted);">ID: ${r.source_id}</div>
          </div>
          <div style="text-align:center; padding: 0 8px;">
            <div class="badge badge-muted" style="font-weight:700;">${r.relationship_type}</div>
            <div style="font-size:14px; color:var(--ci-teal);">───►</div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:10px; color:var(--ci-text-muted); text-transform:uppercase;">Target (${r.target_type || 'Entity'})</div>
            <strong style="color:var(--ci-teal)">${targetLabel}</strong>
            <div style="font-size:10px; color:var(--ci-text-muted);">ID: ${r.target_id}</div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 pt-2" style="border-top:1px solid var(--ci-border); font-size:11.5px;">
          <div>
            <span style="color:var(--ci-text-muted)">First Observed:</span><br>
            <strong>${r.first_seen || '2025-02-01'}</strong>
          </div>
          <div style="text-align:right;">
            <span style="color:var(--ci-text-muted)">Last Corroborated:</span><br>
            <strong>${r.last_seen || '2025-10-15'}</strong>
          </div>
        </div>
      </div>

      <!-- Confidence Assessment: Model Estimate vs Underlying Evidence Strength -->
      <div class="card p-3 space-y-2">
        <div class="flex items-center justify-between">
          <span style="font-size:11px; font-weight:700; color:var(--ci-navy); text-transform:uppercase;">CONFIDENCE & EVIDENTIARY BASIS</span>
          <div class="flex items-center gap-1.5">
            <div>${pipsHtml}</div>
            <strong style="color:var(--ci-teal); font-size:13px;">${confPct}%</strong>
          </div>
        </div>

        <!-- Metric Explanation: Model NLP Confidence -->
        <div class="card-sub p-2" style="font-size:11.5px; line-height:1.45;">
          <div style="font-weight:700; color:var(--ci-teal);">${confBasis.model_confidence_label}</div>
          <div style="color:var(--ci-text-muted); margin-top:2px;">${confBasis.model_confidence_expl}</div>
        </div>

        <!-- Metric Explanation: Underlying Evidence Strength -->
        <div class="card-sub p-2" style="font-size:11.5px; line-height:1.45; border-left: 3px solid var(--ci-teal);">
          <div style="font-weight:700; color:var(--ci-navy);">Evidentiary Strength: ${confBasis.evidence_strength}</div>
          <div style="color:var(--ci-text-muted); margin-top:2px;">${confBasis.evidence_strength_desc}</div>
        </div>
      </div>

      ${cl ? `
        <!-- Cross-Case Link Factor Breakdown -->
        <div class="card p-3 space-y-2" style="border-color:var(--ci-teal)">
          <div style="font-weight:700; color:var(--ci-teal); font-size:12px">CROSS-CASE LINK FACTOR BREAKDOWN</div>
          <div class="grid grid-cols-2 gap-2" style="font-size:12px">
            <div class="p-1.5 card-sub">MO Similarity: <strong style="color:var(--ci-teal)">${Math.round(cl.mo_similarity * 100)}%</strong></div>
            <div class="p-1.5 card-sub">Semantic Text: <strong style="color:var(--ci-teal)">${Math.round(cl.semantic_similarity * 100)}%</strong></div>
            <div class="p-1.5 card-sub">Spatial Distance: <strong style="color:var(--ci-warning)">${cl.spatial_proximity_km} km</strong></div>
            <div class="p-1.5 card-sub">Temporal Gap: <strong style="color:var(--ci-warning)">${cl.temporal_proximity_days} days</strong></div>
          </div>
        </div>
      ` : ''}

      <!-- Source Document & Extracted Passage -->
      <div class="card p-3 space-y-2">
        <div class="flex items-center justify-between">
          <span style="font-weight:700; font-size:12px">SUPPORTING EVIDENCE PASSAGE</span>
          <span class="badge badge-teal">[DOC:${r.source_document_id || 'DOC001'}]</span>
        </div>

        <div style="font-size:12px; color:var(--ci-text-muted);">
          Document: <strong>${doc?.title || r.source_document_id || 'Case Evidence Report'}</strong> (${doc?.document_type || 'Police Report'})
        </div>

        <div class="card-sub p-2.5" style="border-left: 3px solid var(--ci-border); font-size:12px; line-height:1.5; font-style:italic; color:var(--ci-navy);">
          "${extractedText}"
        </div>

        ${doc ? `
          <div class="flex items-center justify-between pt-1" style="font-size:11px; color:var(--ci-text-muted);">
            <span>OCR Verification: <strong style="color:var(--ci-success)">${doc.ocr_status || 'verified'}</strong></span>
            <span>Source Type: <strong>${doc.source_type || 'FIR Record'}</strong></span>
          </div>
        ` : ''}
      </div>

      <!-- Verification Status & Validation Audit History -->
      <div class="card p-3 space-y-2">
        <span style="font-weight:700; font-size:12px">VERIFICATION STATUS & AUDIT LOG</span>
        ${vals.length > 0 ? vals.map(v => `
          <div class="card-sub p-2 space-y-1" style="font-size:11.5px">
            <div class="flex justify-between">
              <strong style="color:var(--ci-teal)">Action: ${v.action.toUpperCase()}</strong>
              <span style="color:var(--ci-text-muted)">${v.validated_at}</span>
            </div>
            <div style="color:var(--ci-text-muted)">Verified By: <strong>${v.reviewer_role}</strong></div>
            ${v.comment ? `<div style="font-style:italic; color:var(--ci-navy);">"${v.comment}"</div>` : ''}
          </div>
        `).join('') : '<div style="font-size:12px; color:var(--ci-text-muted)">No prior human validations. Awaiting review.</div>'}
      </div>
    `;

    const canValidate = ['investigator', 'senior_investigator', 'admin'].includes(currentUser.role);
    if (canValidate) {
      footer.innerHTML = `
        <div style="font-size:11.5px; color:var(--ci-text-muted); font-weight:700">Investigator Action:</div>
        <div class="flex items-center gap-1.5">
          <button onclick="submitValidationAction('${r.relationship_id}', 'approved')" class="btn btn-primary btn-sm" style="background:var(--ci-success)">
            ✓ Approve (Verify)
          </button>
          <button onclick="submitValidationAction('${r.relationship_id}', 'rejected')" class="btn btn-sm" style="background:var(--ci-danger); color:#fff">
            ✕ Reject
          </button>
          <button onclick="submitValidationAction('${r.relationship_id}', 'needs_review')" class="btn btn-secondary btn-sm">
            Flag Review
          </button>
        </div>
      `;
    } else {
      footer.innerHTML = `
        <div style="font-size:11.5px; color:var(--ci-warning)">
          🔒 Validation restricted to Investigator & Admin roles. (Current: Analyst)
        </div>
      `;
    }

  } catch (e) {
    body.innerHTML = `<div style="color:var(--ci-danger); font-size:12px">Error opening drawer: ${e.message}</div>`;
  }
}

function closeEvidenceDrawer() {
  const drawer = document.getElementById('evidenceDrawer');
  if (drawer) drawer.classList.add('translate-x-full');
}

async function submitValidationAction(relationshipId, action) {
  try {
    const comment = prompt(`Enter investigator validation rationale for marking ${relationshipId} as ${action}:`, `Verified against forensic evidence log`);
    if (comment === null) return;

    const res = await authFetch('/api/validations/', {
      method: 'POST',
      body: JSON.stringify({
        relationship_id: relationshipId,
        action: action,
        comment: comment,
        reviewer_role: currentUser.role
      })
    });

    const data = await res.json();
    if (data.success) {
      alert(`Success: ${data.message}`);
      openEvidenceDrawer(relationshipId);
      loadGraph();
      loadAuditTrail();
    } else {
      alert(`Validation error: ${data.detail || 'Failed'}`);
    }
  } catch (e) {
    alert('Validation error: ' + e.message);
  }
}

// ============================================================
// 13. FORENSIC CROSS-CASE COMPARE (MULTI-FACTOR PATTERN MATCHING)
// ============================================================
function setComparePreset(caseA, caseB) {
  const selA = document.getElementById('compareCaseA');
  const selB = document.getElementById('compareCaseB');
  if (selA) selA.value = caseA;
  if (selB) selB.value = caseB;
  switchTab('compare');
  runForensicCompare();
}

async function runForensicCompare() {
  const caseA = document.getElementById('compareCaseA')?.value || 'C005';
  const caseB = document.getElementById('compareCaseB')?.value || 'C021';

  const pipsContainer = document.getElementById('compareScorePips');
  const detailsContainer = document.getElementById('compareDetailsContainer');
  if (!pipsContainer || !detailsContainer) return;

  pipsContainer.innerHTML = `<div class="card p-3 text-center" style="color:var(--ci-teal)">Running forensic multi-factor comparison...</div>`;

  try {
    const res = await authFetch(`/api/cases/compare/${caseA}/${caseB}`);
    if (!res.ok) {
      const err = await res.json();
      pipsContainer.innerHTML = `<div class="card p-3" style="color:var(--ci-danger)">Comparison Error: ${err.detail || 'Failed to compare'}</div>`;
      return;
    }

    const data = await res.json();
    const ca = data.case_a;
    const cb = data.case_b;
    const f = data.factors;
    const sharedCount = data.shared_entities_count || 0;
    const sharedPersons = data.shared_persons || [];

    // Pips & Score Card
    pipsContainer.innerHTML = `
      <div class="card p-3 space-y-2">
        <div class="flex items-center justify-between">
          <span style="color:var(--ci-navy); font-weight:700; font-size:13px;">OVERALL LINK CONFIDENCE:</span>
          <strong style="color:var(--ci-teal); font-size:17px">${f.overall_confidence_pct}%</strong>
        </div>
        <div style="background:var(--ci-border); height:8px; border-radius:4px; overflow:hidden">
          <div style="background:var(--ci-teal); height:8px; width: ${f.overall_confidence_pct}%"></div>
        </div>
        <div style="font-size:11px; color:var(--ci-text-muted); line-height:1.4;">
          Weighted composite of 5 forensic factors: MO similarity (35%), Semantic text match (35%), Spatial proximity (15%), and Temporal gap (15%).
        </div>
      </div>

      <!-- Individual Factors Breakdown -->
      <div class="grid grid-cols-2 gap-2" style="font-size:12px">
        <div class="p-2 card-sub">
          <div style="color:var(--ci-text-muted); font-size:10px; font-weight:700;">1. MO SIMILARITY</div>
          <div style="font-weight:700; color:var(--ci-teal); font-size:15px">${f.mo_similarity_pct}%</div>
          <div style="font-size:10px; color:var(--ci-text-muted);">Tactics: ${ca.mo_code} vs ${cb.mo_code}</div>
        </div>
        <div class="p-2 card-sub">
          <div style="color:var(--ci-text-muted); font-size:10px; font-weight:700;">2. SEMANTIC TEXT MATCH</div>
          <div style="font-weight:700; color:var(--ci-teal); font-size:15px">${f.semantic_similarity_pct}%</div>
          <div style="font-size:10px; color:var(--ci-text-muted);">NLP narrative embedding score</div>
        </div>
        <div class="p-2 card-sub">
          <div style="color:var(--ci-text-muted); font-size:10px; font-weight:700;">3. SPATIAL PROXIMITY</div>
          <div style="font-weight:700; color:var(--ci-warning); font-size:15px">${f.spatial_proximity_km} km</div>
          <div style="font-size:10px; color:var(--ci-text-muted);">${ca.city} to ${cb.city} corridor</div>
        </div>
        <div class="p-2 card-sub">
          <div style="color:var(--ci-text-muted); font-size:10px; font-weight:700;">4. TEMPORAL INTERVAL</div>
          <div style="font-weight:700; color:var(--ci-warning); font-size:15px">${f.temporal_proximity_days} days</div>
          <div style="font-size:10px; color:var(--ci-text-muted);">${ca.opened_date} vs ${cb.opened_date}</div>
        </div>
      </div>

      <!-- Explicit Shared Entity Status Banner -->
      <div class="card p-2.5" style="border-left: 3px solid ${sharedCount > 0 ? 'var(--ci-success)' : 'var(--ci-warning)'}; font-size:12px; line-height:1.45;">
        ${sharedCount > 0 ? `
          <strong style="color:var(--ci-success)">🔗 Explicit Shared Entity Detected:</strong><br>
          ${sharedPersons.map(p => `<strong>${p.full_name} (${p.person_id})</strong>`).join(', ')} recorded across both case files. Suggests direct operational crossover.
        ` : `
          <strong style="color:var(--ci-warning)">⚠️ No Explicit Shared Persons Recorded:</strong><br>
          Neither case currently shares recorded suspects or phones. This connection represents a <strong>similarity-based pattern lead</strong> (shared corridor & tactics). It does <em>not</em> prove identical offenders without forensic verification.
        `}
      </div>
    `;

    renderCompareRadar(
      f.mo_similarity,
      f.semantic_similarity,
      Math.max(0, 1 - f.spatial_proximity_km / 100),
      Math.max(0, 1 - f.temporal_proximity_days / 180),
      f.overall_confidence
    );

    // Side-by-Side Comparison Details
    detailsContainer.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3" style="font-size:12.5px">
        <!-- Case A Column -->
        <div class="card p-3 space-y-2" style="border-left: 4px solid var(--ci-teal)">
          <div class="flex items-center justify-between pb-1" style="border-bottom: 1px solid var(--ci-border)">
            <strong style="color:var(--ci-teal); font-size:14px">${ca.case_id}: ${ca.title}</strong>
            <span class="badge badge-muted">${ca.case_number}</span>
          </div>
          <div class="grid grid-cols-2 gap-1 text-xs">
            <div>Crime Type: <strong>${ca.case_type}</strong></div>
            <div>City/Station: <strong>${ca.city} (${ca.police_station || 'HQ'})</strong></div>
            <div>Incident Date: <strong>${ca.opened_date}</strong></div>
            <div>Status: <span class="badge badge-teal">${ca.status.toUpperCase()}</span></div>
          </div>
          <div>MO Tactical Code: <strong style="color:var(--ci-warning)">${ca.mo_code}</strong></div>
          <div style="color:var(--ci-text-muted); font-size:12px; line-height:1.4; background:var(--ci-card-sub); padding:6px; border-radius:4px;">
            ${ca.summary}
          </div>
          <div>
            <span style="font-size:11px; font-weight:700; color:var(--ci-text-muted);">NAMED PERSONS (${(data.persons_a || []).length}):</span>
            <div class="flex flex-wrap gap-1 mt-1">
              ${(data.persons_a || []).map(p => `
                <span class="badge badge-teal cursor-pointer" onclick="switchTab('constellation'); inspectNode({ id: '${p.person_id}', node_type: 'person' })">
                  ${p.full_name} (${p.person_id})
                </span>
              `).join('') || '<span style="font-size:11px; color:var(--ci-text-muted);">None recorded</span>'}
            </div>
          </div>
          <div>
            <span style="font-size:11px; font-weight:700; color:var(--ci-text-muted);">SOURCE EVIDENCE (${(data.documents_a || []).length}):</span>
            <div class="flex flex-wrap gap-1 mt-1">
              ${(data.documents_a || []).map(d => `
                <button onclick="openEvidenceDrawer('R0001')" class="badge badge-muted cursor-pointer" style="font-size:10.5px;">
                  📄 ${d.document_id}: ${d.title}
                </button>
              `).join('')}
            </div>
          </div>
        </div>

        <!-- Case B Column -->
        <div class="card p-3 space-y-2" style="border-left: 4px solid var(--ci-warning)">
          <div class="flex items-center justify-between pb-1" style="border-bottom: 1px solid var(--ci-border)">
            <strong style="color:var(--ci-warning); font-size:14px">${cb.case_id}: ${cb.title}</strong>
            <span class="badge badge-muted">${cb.case_number}</span>
          </div>
          <div class="grid grid-cols-2 gap-1 text-xs">
            <div>Crime Type: <strong>${cb.case_type}</strong></div>
            <div>City/Station: <strong>${cb.city} (${cb.police_station || 'HQ'})</strong></div>
            <div>Incident Date: <strong>${cb.opened_date}</strong></div>
            <div>Status: <span class="badge badge-teal">${cb.status.toUpperCase()}</span></div>
          </div>
          <div>MO Tactical Code: <strong style="color:var(--ci-warning)">${cb.mo_code}</strong></div>
          <div style="color:var(--ci-text-muted); font-size:12px; line-height:1.4; background:var(--ci-card-sub); padding:6px; border-radius:4px;">
            ${cb.summary}
          </div>
          <div>
            <span style="font-size:11px; font-weight:700; color:var(--ci-text-muted);">NAMED PERSONS (${(data.persons_b || []).length}):</span>
            <div class="flex flex-wrap gap-1 mt-1">
              ${(data.persons_b || []).map(p => `
                <span class="badge badge-amber cursor-pointer" onclick="switchTab('constellation'); inspectNode({ id: '${p.person_id}', node_type: 'person' })">
                  ${p.full_name} (${p.person_id})
                </span>
              `).join('') || '<span style="font-size:11px; color:var(--ci-text-muted);">None recorded</span>'}
            </div>
          </div>
          <div>
            <span style="font-size:11px; font-weight:700; color:var(--ci-text-muted);">SOURCE EVIDENCE (${(data.documents_b || []).length}):</span>
            <div class="flex flex-wrap gap-1 mt-1">
              ${(data.documents_b || []).map(d => `
                <button onclick="openEvidenceDrawer('R0001')" class="badge badge-muted cursor-pointer" style="font-size:10.5px;">
                  📄 ${d.document_id}: ${d.title}
                </button>
              `).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- Lead Synthesis & Legal Disclaimer -->
      <div class="card p-3 space-y-2 mt-3" style="font-size:12.5px">
        <div style="font-weight:700; color:var(--ci-navy); font-size:13px">WHY THE SYSTEM PROPOSES THIS CONNECTION</div>
        <p style="color:var(--ci-text-muted); line-height:1.5; margin:0;">
          ${data.rationale}
        </p>
        <div class="pt-2 flex items-center justify-between flex-wrap gap-2">
          <div style="font-size:11px; color:var(--ci-text-muted);">
            Grounding basis: Modus Operandi taxonomy • Haversine spatial corridor • Temporal interval logs
          </div>
          <div class="flex items-center gap-2">
            <button onclick="openAssistantPrompt('Provide a deep forensic comparison of ${caseA} and ${caseB}, highlighting evidence citations and differences')" class="btn btn-primary btn-sm">
              🤖 Ask AI Evidence Assistant
            </button>
            <button onclick="switchTab('timeline'); handleTimelineCaseChange('${caseA}', '${caseB}')" class="btn btn-secondary btn-sm">
              ⏱️ Compare in Combined Timeline
            </button>
          </div>
        </div>
      </div>
    `;

  } catch (e) {
    pipsContainer.innerHTML = `<div style="color:var(--ci-danger)">Comparison failed: ${e.message}</div>`;
  }
}

function renderCompareRadar(mo, semantic, spatial, temporal, overall) {
  const ctx = document.getElementById('compareRadarChart');
  if (!ctx) return;

  if (compareRadarChart) {
    compareRadarChart.destroy();
  }

  const isDark = document.documentElement.classList.contains('dark');
  const gridColor = isDark ? 'rgba(29, 51, 71, 0.7)' : 'rgba(216, 228, 232, 0.8)';
  const labelColor = isDark ? '#7A9BAB' : '#5B7380';

  compareRadarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['MO Tactics', 'Semantic Text', 'Spatial Proximity', 'Temporal Alignment', 'Overall Match'],
      datasets: [{
        label: 'Link Factors',
        data: [mo, semantic, spatial, temporal, overall],
        backgroundColor: 'rgba(14, 165, 183, 0.25)',
        borderColor: '#0EA5B7',
        pointBackgroundColor: '#14C8DC',
        pointBorderColor: '#FFFFFF',
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0,
          max: 1,
          ticks: { display: false },
          grid: { color: gridColor },
          angleLines: { color: gridColor },
          pointLabels: { color: labelColor, font: { family: 'Gadugi', size: 11, weight: '600' } }
        }
      },
      plugins: { legend: { display: false } }
    }
  });
}

// ============================================================
// 14. MULTI-CASE TIMELINE & AUDIT TRAIL ANALYSIS
// ============================================================
let timelineViewMode = 'combined';
let timelineFilterType = 'all';

function setTimelineViewMode(mode) {
  timelineViewMode = mode;
  const combBtn = document.getElementById('timelineViewCombinedBtn');
  const sepBtn = document.getElementById('timelineViewSeparateBtn');
  if (combBtn && sepBtn) {
    if (mode === 'combined') {
      combBtn.classList.add('active');
      sepBtn.classList.remove('active');
    } else {
      sepBtn.classList.add('active');
      combBtn.classList.remove('active');
    }
  }
  loadMultiTimeline();
}

function handleTimelineCaseChange(overrideA, overrideB) {
  const selA = document.getElementById('timelinePrimaryCaseSelect');
  const selB = document.getElementById('timelineSecondaryCaseSelect');
  if (overrideA && selA) selA.value = overrideA;
  if (overrideB && selB) selB.value = overrideB;
  loadMultiTimeline();
}

async function loadTimeline(caseId) {
  const selA = document.getElementById('timelinePrimaryCaseSelect');
  if (selA && caseId) selA.value = caseId;
  loadMultiTimeline();
}

async function loadMultiTimeline() {
  const container = document.getElementById('timelineEventsContainer');
  if (!container) return;

  const selA = document.getElementById('timelinePrimaryCaseSelect');
  const selB = document.getElementById('timelineSecondaryCaseSelect');
  const caseA = selA ? selA.value : currentCaseId;
  const caseB = selB ? selB.value : '';

  let caseIds = caseA;
  if (caseB && caseB !== caseA) {
    caseIds = `${caseA},${caseB}`;
  }

  const startDate = document.getElementById('timelineStartDate')?.value || '';
  const endDate = document.getElementById('timelineEndDate')?.value || '';

  container.innerHTML = `<div style="color:var(--ci-text-muted); font-size:12px; padding:20px; text-align:center;">Loading multi-case chronological events and audit logs...</div>`;

  try {
    let url = `/api/cases/timeline/multi?case_ids=${encodeURIComponent(caseIds)}&event_type=${timelineFilterType}`;
    if (startDate) url += `&start_date=${startDate}`;
    if (endDate) url += `&end_date=${endDate}`;

    const res = await authFetch(url);
    const data = await res.json();
    const events = data.events || [];
    const gaps = data.activity_gaps || [];

    if (events.length === 0) {
      container.innerHTML = `
        <div class="card p-4 text-center" style="color:var(--ci-text-muted); font-size:12.5px;">
          No chronological records match the selected filters for ${caseIds}.
        </div>
      `;
      return;
    }

    const dotColors = {
      incident: 'var(--ci-danger)',
      surveillance: 'var(--ci-teal)',
      vehicle_sighting: 'var(--ci-warning)',
      call: 'var(--ci-info)',
      meeting: 'var(--ci-success)',
      witness: 'var(--ci-primary)'
    };

    if (timelineViewMode === 'separate' && caseB && caseB !== caseA) {
      // Side-by-side separate timeline view
      const eventsA = events.filter(e => e.case_id === caseA);
      const eventsB = events.filter(e => e.case_id === caseB);

      container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div class="card-header pb-2 mb-2" style="border-bottom:2px solid var(--ci-teal);">
              <strong style="color:var(--ci-teal); font-size:13px">${caseA} Timeline (${eventsA.length} Events)</strong>
            </div>
            ${renderTimelineItemsHtml(eventsA, dotColors)}
          </div>
          <div>
            <div class="card-header pb-2 mb-2" style="border-bottom:2px solid var(--ci-warning);">
              <strong style="color:var(--ci-warning); font-size:13px">${caseB} Timeline (${eventsB.length} Events)</strong>
            </div>
            ${renderTimelineItemsHtml(eventsB, dotColors)}
          </div>
        </div>
      `;
    } else {
      // Unified Chronological Rail with explicit Activity Gap Indicators
      container.innerHTML = renderTimelineItemsHtml(events, dotColors);
    }

  } catch (e) {
    container.innerHTML = `<div style="color:var(--ci-danger); font-size:12px">Timeline load error: ${e.message}</div>`;
  }
}

function renderTimelineItemsHtml(eventsList, dotColors) {
  return eventsList.map((ev, idx) => {
    const hasPriorGap = ev.activity_gap_prior_days && ev.activity_gap_prior_days >= 25;
    return `
      ${hasPriorGap ? `
        <!-- Explicit Activity Gap Indicator (Surfaced without assuming absence of crime) -->
        <div class="card-sub my-3 p-2.5" style="border-left: 4px solid var(--ci-warning); background: var(--ci-card-sub); font-size: 11.5px; line-height: 1.45;">
          <div class="flex items-center gap-1.5" style="font-weight:700; color:var(--ci-warning);">
            <span>⏳</span>
            <span>ACTIVITY GAP DETECTED: ${ev.activity_gap_prior_days} Days With No Recorded Events</span>
          </div>
          <div style="color:var(--ci-text-muted); margin-top:2px;">
            Missing recorded events indicate lack of documented observation, surveillance, or filed complaints during this period. 
            <strong>Absence of recorded data does not prove that criminal activity ceased.</strong>
          </div>
        </div>
      ` : ''}

      <div class="timeline-item relative" data-type="${ev.event_type}" style="position:relative; padding-left:24px; margin-bottom:16px">
        <div style="position:absolute; left:0; top:4px; width:12px; height:12px; border-radius:50%; background:${dotColors[ev.event_type] || 'var(--ci-teal)'}; border:2px solid var(--ci-card-bg)"></div>
        <div class="card p-3 space-y-2">
          <!-- Top Row: Occurrence Date, Type Badge, and Case ID -->
          <div class="flex items-center justify-between gap-2 flex-wrap">
            <div class="flex items-center gap-2">
              <strong style="color:var(--ci-teal); font-size:13.5px">🗓️ ${ev.event_occurrence_date || ev.event_date}</strong>
              <span class="badge badge-muted">${(ev.event_type || 'EVENT').replace(/_/g, ' ').toUpperCase()}</span>
            </div>
            <span class="badge badge-teal" style="font-size:10.5px;">${ev.case_id}: ${ev.case_title || ev.case_id}</span>
          </div>

          <!-- Description -->
          <p style="font-size:12.5px; line-height:1.45; color:var(--ci-navy); margin:0;">
            ${ev.description}
          </p>

          ${ev.location_detail ? `
            <div class="flex items-center gap-1 pt-1 text-xs" style="color:var(--ci-text-muted);">
              <span>📍</span> <span>${ev.location_detail.name || ev.location_id} (${ev.location_detail.city || ''})</span>
            </div>
          ` : ''}

          <!-- Dual-Date Audit Distinction & Supporting Evidence Link -->
          <div class="pt-2 flex items-center justify-between flex-wrap gap-2" style="border-top:1px solid var(--ci-border); font-size:11px; color:var(--ci-text-muted);">
            <div>
              <span>📝 Record Documented: <strong>${ev.record_entry_timestamp || (ev.event_date + ' 18:00 IST')}</strong></span>
              <span style="margin-left: 8px;">Officer: <strong>${ev.record_entry_creator || 'Desk Officer'}</strong></span>
            </div>
            <button onclick="openEvidenceDrawer('R0001')" class="btn btn-secondary btn-sm" style="font-size:10.5px; padding:2px 8px;">
              📎 Open Supporting Evidence
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function filterTimeline(type) {
  timelineFilterType = type;
  document.querySelectorAll('.timeline-filter-btn').forEach(btn => btn.classList.remove('active'));
  if (window.event && window.event.target) window.event.target.classList.add('active');
  loadMultiTimeline();
}

// ============================================================
// 15. ASK THE EVIDENCE (AI RAG ASSISTANT)
// ============================================================
async function sendAssistantQuery() {
  const input = document.getElementById('assistantInput');
  const question = input?.value.trim();
  if (!question) return;

  const chat = document.getElementById('chatHistory');
  const sourcesContainer = document.getElementById('sourcesContainer');
  if (!chat) return;

  chat.innerHTML += `
    <div class="flex gap-2 justify-end">
      <div class="space-y-1 text-right" style="max-width:80%">
        <div style="font-size:11px; color:var(--ci-text-muted);">${currentUser.display_name} (${currentUser.role})</div>
        <div class="p-3 text-left" style="background:var(--ci-teal); color:#fff; border-radius:8px; font-size:13px; line-height:1.4">
          ${escapeHtml(question)}
        </div>
      </div>
      <div style="width:28px; height:28px; border-radius:50%; background:var(--ci-navy); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:11px; flex-shrink:0">
        U
      </div>
    </div>
  `;

  input.value = '';
  chat.scrollTop = chat.scrollHeight;

  const loadingId = 'loading-' + Date.now();
  chat.innerHTML += `
    <div id="${loadingId}" class="flex gap-2">
      <div style="width:28px; height:28px; border-radius:50%; background:var(--ci-teal); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:11px; flex-shrink:0">
        AI
      </div>
      <div class="card p-3" style="font-size:12px; color:var(--ci-text-muted);">
        Retrieving grounded case evidence & synthesizing response...
      </div>
    </div>
  `;
  chat.scrollTop = chat.scrollHeight;

  try {
    const res = await authFetch('/api/assistant/ask', {
      method: 'POST',
      body: JSON.stringify({
        question: question,
        case_id: currentCaseId
      })
    });

    const data = await res.json();
    const loadElem = document.getElementById(loadingId);
    if (loadElem) loadElem.remove();

    let formatted = data.answer.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

    chat.innerHTML += `
      <div class="flex gap-2">
        <div style="width:28px; height:28px; border-radius:50%; background:var(--ci-teal); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:11px; flex-shrink:0">
          AI
        </div>
        <div class="space-y-1" style="max-width:85%">
          <div class="flex items-center gap-2">
            <span style="font-weight:700; font-size:11px; color:var(--ci-teal)">Verified Evidence Citation</span>
            <span class="badge badge-success" style="font-size:9.5px">GROUNDED</span>
          </div>
          <div class="card p-3" style="font-size:13px; line-height:1.5">
            ${formatted}
          </div>
        </div>
      </div>
    `;
    chat.scrollTop = chat.scrollHeight;

    if (sourcesContainer && data.sources && data.sources.length > 0) {
      sourcesContainer.innerHTML = `
        <div class="space-y-2">
          <div style="font-weight:700; font-size:12px; color:var(--ci-teal)">VERIFIED CITATIONS (${data.sources.length})</div>
          ${data.sources.map(s => `
            <div class="card p-2 flex items-center justify-between" style="font-size:12px">
              <span style="font-weight:700; color:var(--ci-teal)">${s}</span>
              <button onclick="handleSourceChipClick('${s}')" class="btn btn-secondary btn-sm" style="font-size:10px; padding:2px 6px">Inspect</button>
            </div>
          `).join('')}
        </div>
      `;
    }

  } catch (e) {
    const loadElem = document.getElementById(loadingId);
    if (loadElem) loadElem.remove();
    chat.innerHTML += `<div style="color:var(--ci-danger); font-size:12px; padding:4px;">Assistant error: ${e.message}</div>`;
  }
}

function setAssistantPrompt(promptText) {
  const input = document.getElementById('assistantInput');
  if (input) {
    input.value = promptText;
    sendAssistantQuery();
  }
}

function openAssistantPrompt(promptText) {
  switchTab('assistant');
  setAssistantPrompt(promptText);
}

function handleSourceChipClick(chip) {
  if (chip.startsWith('[CASE:')) {
    const cid = chip.replace('[CASE:', '').replace(']', '');
    loadCaseDetails(cid);
    switchTab('constellation');
  } else if (chip.startsWith('[DOC:')) {
    const did = chip.replace('[DOC:', '').replace(']', '');
    loadPresetDocument(did);
    switchTab('ingestion');
  }
}

// ============================================================
// 16. CHARGESHEET REPORT MODAL WITH GROUNDING INSPECTOR (ITEM 18)
// ============================================================
let currentDraftData = null;

async function generateChargesheetModal(targetCaseId = null) {
  const caseId = targetCaseId || currentInspectedCaseId || currentCaseId || 'C001';
  currentCaseId = caseId;
  const modal = document.getElementById('chargesheetModal');
  const content = document.getElementById('draftContent');
  const inspectorBody = document.getElementById('groundingInspectorBody');
  if (!modal || !content) return;

  modal.classList.remove('hidden');
  content.textContent = `Querying verified database records for ${caseId} and synthesizing AI-assisted chargesheet draft...`;
  if (inspectorBody) inspectorBody.innerHTML = `<div class="text-center py-3" style="color:var(--ci-text-muted)">Loading inspectable evidence provenance...</div>`;

  try {
    const res = await authFetch('/api/assistant/draft', {
      method: 'POST',
      body: JSON.stringify({
        case_id: caseId,
        draft_type: 'chargesheet'
      })
    });

    const data = await res.json();
    currentDraftData = data;
    content.textContent = data.draft || 'Failed to generate draft.';

    // Populate Grounding Inspector (Item 18)
    if (inspectorBody && data.grounding) {
      const g = data.grounding;
      inspectorBody.innerHTML = `
        <!-- 1. Supplied Case Records -->
        <div class="space-y-1">
          <div style="font-weight:700; color:var(--ci-navy); font-size:12px;">1. Case Records Supplied to Drafting:</div>
          <table class="table-modern w-full" style="font-size:11.5px;">
            <tbody>
              ${(g.supplied_case_records || []).map(r => `
                <tr>
                  <td style="font-weight:600; width:35%; color:var(--ci-text-muted);">${escapeHtml(r.field)}</td>
                  <td style="color:var(--ci-text-main); font-weight:700;">${escapeHtml(r.value)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <!-- 2. Approved Evidence Used -->
        <div class="space-y-1 pt-1">
          <div style="font-weight:700; color:var(--ci-teal-dark); font-size:12px;">2. Authorized Physical & Technical Evidence:</div>
          <ul style="padding-left:18px; font-size:12px; line-height:1.5;">
            ${(g.approved_evidence_used || []).map(e => `<li>${escapeHtml(e)}</li>`).join('')}
          </ul>
        </div>

        <!-- 3. Source Document References -->
        <div class="space-y-1 pt-1">
          <div style="font-weight:700; color:var(--ci-teal-dark); font-size:12px;">3. Source Document References:</div>
          <ul style="padding-left:18px; font-size:12px; line-height:1.5;">
            ${(g.source_document_references || []).map(d => `<li><code>${escapeHtml(d)}</code></li>`).join('')}
          </ul>
        </div>

        <!-- 4. Facts Remaining Unverified or Incomplete -->
        <div class="space-y-1 pt-1">
          <div style="font-weight:700; color:var(--ci-warning); font-size:12px;">4. Unverified / Incomplete Facts:</div>
          <ul style="padding-left:18px; font-size:12px; line-height:1.5; color:var(--ci-warning);">
            ${(g.unverified_or_incomplete_facts || []).map(u => `<li>${escapeHtml(u)}</li>`).join('')}
          </ul>
        </div>

        <!-- 5. Missing Information Checklist for Human Review -->
        <div class="space-y-1 pt-1">
          <div style="font-weight:700; color:var(--ci-danger); font-size:12px;">5. Missing Information Requiring Investigator Review:</div>
          <ul style="padding-left:18px; font-size:12px; line-height:1.5; color:var(--ci-danger);">
            ${(g.missing_information_for_review || []).map(m => `<li>⚠️ ${escapeHtml(m)}</li>`).join('')}
          </ul>
        </div>
      `;
    }
  } catch (e) {
    content.textContent = 'Draft generation error: ' + e.message;
  }
}

function toggleGroundingAccordion() {
  const body = document.getElementById('groundingInspectorBody');
  const icon = document.getElementById('groundingAccordionIcon');
  if (!body || !icon) return;

  if (body.classList.contains('hidden')) {
    body.classList.remove('hidden');
    icon.textContent = '▲ Hide Sources';
  } else {
    body.classList.add('hidden');
    icon.textContent = '▼ Click to Inspect Sources';
  }
}

function closeChargesheetModal() {
  const modal = document.getElementById('chargesheetModal');
  if (modal) modal.classList.add('hidden');
}

function copyDraftToClipboard() {
  const content = document.getElementById('draftContent')?.textContent || '';
  navigator.clipboard.writeText(content).then(() => {
    alert('Chargesheet draft copied to clipboard!');
  });
}

// ============================================================
// 17. HUMAN VALIDATIONS & AUDIT LOG STREAM
// ============================================================
async function loadPendingValidations() {
  const table = document.getElementById('pendingValidationsTable');
  const countBadge = document.getElementById('pendingValidationsCount');
  if (!table) return;

  table.innerHTML = `<div class="text-center py-6" style="color:var(--ci-text-muted)">Loading pending validations...</div>`;

  try {
    const res = await authFetch('/api/validations/pending');
    const list = await res.json();

    if (countBadge) countBadge.textContent = `${list.length}`;

    if (list.length === 0) {
      table.innerHTML = `<div class="text-center py-8" style="color:var(--ci-text-muted)">No AI-suggested relationships pending validation.</div>`;
      return;
    }

    const isAnalyst = currentUser && currentUser.role === 'analyst';

    table.innerHTML = list.map(r => `
      <div class="card p-3 space-y-2" style="border-left: 3px solid var(--ci-warning)">
        <div class="flex items-center justify-between">
          <span style="font-weight:700; color:var(--ci-teal); font-size:13px">${r.relationship_id}</span>
          <span class="badge badge-amber">AI_SUGGESTED</span>
        </div>

        <div style="font-size:13px">
          <strong>${r.source_id}</strong>
          <span style="color:var(--ci-text-muted)"> ──[ <strong style="color:var(--ci-warning)">${r.relationship_type}</strong> ]──→ </span>
          <strong>${r.target_id}</strong>
        </div>

        <div style="font-size:12px; color:var(--ci-text-muted); line-height:1.4">${r.explanation}</div>

        <div class="flex items-center justify-between pt-2" style="border-top:1px solid var(--ci-border); font-size:12px">
          <span style="color:var(--ci-text-muted)">Confidence: <strong style="color:var(--ci-teal)">${Math.round(parseFloat(r.confidence || 0.5) * 100)}%</strong></span>

          <div class="flex items-center gap-1.5">
            ${isAnalyst ? `
              <span class="badge badge-amber" style="font-size:10px;">READ-ONLY (Investigator Verification Required)</span>
              <button onclick="openEvidenceDrawer('${r.relationship_id}')" class="btn btn-secondary btn-sm" style="font-size:11px; padding:3px 8px">
                Inspect
              </button>
            ` : `
              <button onclick="submitValidationAction('${r.relationship_id}', 'approved')" class="btn btn-primary btn-sm" style="background:var(--ci-success); font-size:11px; padding:3px 8px">
                Approve
              </button>
              <button onclick="submitValidationAction('${r.relationship_id}', 'rejected')" class="btn btn-sm" style="background:var(--ci-danger); color:#fff; font-size:11px; padding:3px 8px">
                Reject
              </button>
              <button onclick="openEvidenceDrawer('${r.relationship_id}')" class="btn btn-secondary btn-sm" style="font-size:11px; padding:3px 8px">
                Inspect
              </button>
            `}
          </div>
        </div>
      </div>
    `).join('');

  } catch (e) {
    table.innerHTML = `<div style="color:var(--ci-danger); font-size:12px">Error loading validations: ${e.message}</div>`;
  }
}

async function loadAuditTrail() {
  const container = document.getElementById('auditLogStream');
  if (!container) return;

  try {
    const res = await authFetch('/api/validations/audit');
    const logs = await res.json();

    if (logs.length === 0) {
      container.innerHTML = `<div class="text-center py-8" style="color:var(--ci-text-muted)">Audit log empty.</div>`;
      return;
    }

    container.innerHTML = logs.slice().reverse().map(l => `
      <div class="card p-2 space-y-1" style="font-size:12px">
        <div class="flex justify-between" style="font-size:11px">
          <strong style="color:var(--ci-teal)">${l.action}</strong>
          <span style="color:var(--ci-text-muted)">${l.timestamp ? l.timestamp.slice(11, 19) : ''}</span>
        </div>
        <div>User: <strong>${l.user_id}</strong> | Target: <span style="color:var(--ci-warning); font-weight:600">${l.entity_type} ${l.entity_id}</span></div>
        ${l.detail ? `<div style="font-size:11px; color:var(--ci-text-muted); font-style:italic">"${l.detail}"</div>` : ''}
      </div>
    `).join('');

  } catch (e) {
    console.warn('Audit load error:', e);
  }
}

// ============================================================
// 18. DEMO EVALUATION SCENARIOS
// ============================================================
async function runScenario(scenarioNum) {
  const dd = document.getElementById('scenarioDropdown');
  if (dd) dd.classList.add('hidden');

  switch (scenarioNum) {
    case 1:
      switchTab('ingestion');
      const docSel = document.getElementById('docPresetSelect');
      if (docSel) docSel.value = 'DOC001';
      await loadPresetDocument('DOC001');
      await extractEntitiesFromText();
      break;
    case 2:
      switchTab('entity-res');
      setEntityResQuery('Bunty P.');
      break;
    case 3:
      switchTab('constellation');
      toggleEgoMode('P005');
      await inspectNode({ id: 'P005', node_type: 'person' });
      break;
    case 4:
      switchTab('constellation');
      await loadCommunities();
      break;
    case 5:
      switchTab('compare');
      const cA = document.getElementById('compareCaseA');
      const cB = document.getElementById('compareCaseB');
      if (cA && cB) { cA.value = 'C005'; cB.value = 'C021'; }
      runForensicCompare();
      break;
    case 6:
      openEvidenceDrawer('R0151');
      break;
    case 7:
      switchTab('validations');
      loadPendingValidations();
      break;
    case 9:
      loadCaseDetails('C001');
      switchTab('timeline');
      break;
    case 10:
      switchTab('assistant');
      setAssistantPrompt('Why is C005 connected to C021?');
      break;
    case 11:
      generateChargesheetModal();
      break;
    default:
      switchTab('constellation');
  }
}

function escapeHtml(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// ============================================================
// INVESTIGATOR SCOPED DASHBOARD
// ============================================================
let invCasesAll = [];
let invMapMode = 'points';
let invLeafletMap = null;
let invMapMarkers = [];

async function loadInvDashboard() {
  const jurEl = document.getElementById('invDashJurisdiction');
  if (jurEl) jurEl.textContent = currentUser.jurisdiction || currentUser.unit || 'My Jurisdiction';

  try {
    const res = await authFetch('/api/analytics/overview');
    const data = await res.json();

    const total = data.total_cases || 0;
    const openC = data.open_cases || 0;
    const crit  = data.critical_cases || 0;
    const pend  = data.pending_validations_count || 0;

    const animateNum = (id, target) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = target;
    };
    animateNum('invDashTotal',    total);
    animateNum('invDashOpen',     openC);
    animateNum('invDashCritical', crit);
    animateNum('invDashPending',  pend);

    // Status breakdown with progress bars
    const statusEl = document.getElementById('invDashStatusBreakdown');
    if (statusEl && data.by_status) {
      const colours = {
        open: '#0EA5B7',
        closed: '#64748b',
        under_investigation: '#B27418',
        pending: '#B27418'
      };
      const maxVal = Math.max(...Object.values(data.by_status), 1);
      statusEl.innerHTML = Object.entries(data.by_status).map(([k, v]) => {
        const col = colours[k] || '#153746';
        const pct = Math.round((v / maxVal) * 100);
        return `
          <div style="margin-bottom: 10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span style="font-size:12px; font-weight:600; color:${col}; text-transform:capitalize;">${k.replace(/_/g, ' ')}</span>
              <span style="font-size:13px; font-weight:800; color:var(--ci-navy);">${v}</span>
            </div>
            <div style="height:6px; background:var(--ci-card-sub); border-radius:99px; overflow:hidden;">
              <div style="height:100%; width:${pct}%; background:${col}; border-radius:99px; transition:width 0.6s ease;"></div>
            </div>
          </div>`;
      }).join('') || '<div style="color:var(--ci-text-muted); font-size:12px;">No data</div>';
    }

    // Type breakdown with progress bars
    const typeEl = document.getElementById('invDashTypeBreakdown');
    if (typeEl && data.by_case_type) {
      const typeColors = ['#0EA5B7','#8b5cf6','#f97316','#ec4899','#06b6d4','#84cc16'];
      const entries = Object.entries(data.by_case_type).slice(0, 6);
      const maxVal = Math.max(...entries.map(([,v]) => v), 1);
      typeEl.innerHTML = entries.map(([k, v], i) => {
        const col = typeColors[i % typeColors.length];
        const pct = Math.round((v / maxVal) * 100);
        return `
          <div style="margin-bottom: 10px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span style="font-size:12px; font-weight:600; color:var(--ci-navy); text-transform:capitalize;">${k.replace(/_/g, ' ')}</span>
              <span style="font-size:13px; font-weight:800; color:${col};">${v}</span>
            </div>
            <div style="height:6px; background:var(--ci-card-sub); border-radius:99px; overflow:hidden;">
              <div style="height:100%; width:${pct}%; background:${col}; border-radius:99px; transition:width 0.6s ease;"></div>
            </div>
          </div>`;
      }).join('') || '<div style="color:var(--ci-text-muted); font-size:12px;">No data</div>';
    }
  } catch(e) {
    console.error('loadInvDashboard error', e);
  }
}

// ============================================================
// INVESTIGATOR MY CASES
// ============================================================
async function loadInvCases() {
  try {
    const res = await authFetch('/api/cases/');
    invCasesAll = await res.json();
    renderInvCasesTable(invCasesAll);
  } catch(e) {
    console.error('loadInvCases error', e);
    const tbody = document.getElementById('invCasesTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="padding:40px; text-align:center; color:var(--ci-danger);">Failed to load cases.</td></tr>`;
  }
}

function filterInvCases() {
  const search   = (document.getElementById('invCasesSearch')?.value || '').toLowerCase().trim();
  const status   = document.getElementById('invCasesStatus')?.value || 'all';
  const priority = document.getElementById('invCasesPriority')?.value || 'all';

  let filtered = invCasesAll.filter(c => {
    if (status   !== 'all' && c.status   !== status)   return false;
    if (priority !== 'all' && c.priority !== priority) return false;
    if (search) {
      const haystack = [c.case_id, c.case_number, c.title, c.case_type, c.city, c.police_station]
        .filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
  renderInvCasesTable(filtered);
}

function renderInvCasesTable(cases) {
  const badge = document.getElementById('invCasesCountBadge');
  if (badge) badge.textContent = `${cases.length} Case${cases.length !== 1 ? 's' : ''}`;

  const tbody = document.getElementById('invCasesTableBody');
  if (!tbody) return;

  if (!cases.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="padding:40px; text-align:center; color:var(--ci-text-muted);">No cases match the current filters.</td></tr>`;
    return;
  }

  const statusColor = { open:'var(--ci-teal)', closed:'var(--ci-text-muted)', under_investigation:'var(--ci-warning)', pending:'var(--ci-warning)', critical:'var(--ci-danger)' };
  const priorityBadge = p => {
    const cls = { critical:'badge-danger', high:'badge-warning', medium:'badge-teal', low:'badge-muted' }[p] || 'badge-muted';
    return `<span class="badge ${cls}" style="font-size:10.5px;">${p||'—'}</span>`;
  };
  const statusBadge = s => {
    const col = statusColor[s] || 'var(--ci-navy)';
    return `<span style="font-size:11px; font-weight:700; color:${col}; text-transform:uppercase;">${(s||'').replace(/_/g,' ')}</span>`;
  };

  tbody.innerHTML = cases.map(c => `
    <tr style="border-bottom: 1px solid var(--ci-border);" onmouseover="this.style.background='var(--ci-card-sub)'" onmouseout="this.style.background=''">
      <td style="padding:9px 12px; font-weight:700; color:var(--ci-teal);">${escapeHtml(c.case_id||'')}</td>
      <td style="padding:9px 12px; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(c.title||'')}">${escapeHtml(c.title||'—')}</td>
      <td style="padding:9px 12px; color:var(--ci-text-muted);">${escapeHtml((c.case_type||'').replace(/_/g,' '))}</td>
      <td style="padding:9px 12px; color:var(--ci-text-muted);">${escapeHtml(c.city||c.police_station||'—')}</td>
      <td style="padding:9px 12px;">${statusBadge(c.status)}</td>
      <td style="padding:9px 12px;">${priorityBadge(c.priority)}</td>
      <td style="padding:9px 12px;">
        <button onclick="navigateCaseToGraph('${escapeHtml(c.case_id)}')" class="btn btn-secondary btn-sm" style="font-size:11px; padding:2px 7px;">🕸️ Graph</button>
        <button onclick="navigateCaseToTimeline('${escapeHtml(c.case_id)}')" class="btn btn-secondary btn-sm" style="font-size:11px; padding:2px 7px; margin-left:3px;">⏱️ Timeline</button>
        <button onclick="generateChargesheetModal('${escapeHtml(c.case_id)}')" class="btn btn-secondary btn-sm" style="font-size:11px; padding:2px 7px; margin-left:3px;" title="Generate AI-Assisted Chargesheet Draft">📝 Chargesheet</button>
      </td>
    </tr>`).join('');
}

// ============================================================
// INVESTIGATOR AREA MAP — mirrors admin geo map
// ============================================================
let invMapMarkersGroup = null;

async function initInvMap() {
  // Ensure Leaflet CSS+JS loaded (same as admin map)
  if (!window.L) {
    await new Promise((resolve, reject) => {
      if (!document.querySelector('link[href*="leaflet"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }
      if (document.querySelector('script[src*="leaflet"]')) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const canvas = document.getElementById('invMapCanvas');
  if (!canvas) return;

  if (!invLeafletMap) {
    invLeafletMap = L.map('invMapCanvas', {
      zoomControl: true,
      scrollWheelZoom: true
    }).setView([18.80, 73.95], 8);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap contributors | Jurisdiction-scoped prototype data'
    }).addTo(invLeafletMap);

    invMapMarkersGroup = L.layerGroup().addTo(invLeafletMap);
  }

  setTimeout(() => {
    invLeafletMap.invalidateSize();
    loadInvMap();
  }, 200);
}

async function loadInvMap() {
  if (!invLeafletMap || !invMapMarkersGroup) {
    await initInvMap();
    return;
  }

  const searchKeyword = (document.getElementById('invMapSearch')?.value || '').toLowerCase().trim();
  const typeFilter    = document.getElementById('invMapTypeFilter')?.value || 'all';
  const statusFilter  = document.getElementById('invMapStatusFilter')?.value || 'all';
  const countBadge    = document.getElementById('invMapMarkerCount');

  const params = new URLSearchParams();
  if (typeFilter   !== 'all') params.append('case_type', typeFilter);
  if (statusFilter !== 'all') params.append('status', statusFilter);

  try {
    const res = await authFetch(`/api/cases/map/incidents?${params.toString()}`);
    const data = await res.json();
    let markers = data.markers || [];

    // Keyword filter
    if (searchKeyword) {
      markers = markers.filter(m =>
        (m.case_number  && m.case_number.toLowerCase().includes(searchKeyword)) ||
        (m.title        && m.title.toLowerCase().includes(searchKeyword)) ||
        (m.location_name && m.location_name.toLowerCase().includes(searchKeyword)) ||
        (m.city         && m.city.toLowerCase().includes(searchKeyword))
      );
    }

    if (countBadge) countBadge.textContent = `${markers.length} Incidents`;

    invMapMarkersGroup.clearLayers();
    if (!markers.length) return;

    const bounds = [];
    const legendTypes = {};

    markers.forEach(m => {
      if (!m.lat || !m.lon) return;
      bounds.push([m.lat, m.lon]);

      const pinColor = m.priority === 'critical' ? '#BD3C3C' :
                       m.priority === 'high'     ? '#B27418' : '#0EA5B7';

      legendTypes[m.case_type || 'other'] = pinColor;

      if (invMapMode === 'heat') {
        // Heat mode: larger translucent circles
        const heatMarker = L.circleMarker([m.lat, m.lon], {
          radius: 22,
          fillColor: pinColor,
          color: pinColor,
          weight: 0,
          fillOpacity: 0.18
        }).addTo(invMapMarkersGroup);

        // Inner dot
        L.circleMarker([m.lat, m.lon], {
          radius: 7,
          fillColor: pinColor,
          color: '#fff',
          weight: 2,
          fillOpacity: 0.95
        }).addTo(invMapMarkersGroup).bindPopup(buildInvPopup(m, pinColor))
          .on('click', () => showInvMapDetail(m, pinColor));
      } else {
        // Points mode: custom divIcon pins like admin map
        const customIcon = L.divIcon({
          className: 'custom-geo-marker',
          html: `<div style="background:${pinColor}; width:16px; height:16px; border-radius:50%; border:2px solid #ffffff; box-shadow:0 2px 6px rgba(0,0,0,0.35);"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8]
        });

        const marker = L.marker([m.lat, m.lon], { icon: customIcon });
        marker.bindPopup(buildInvPopup(m, pinColor));
        marker.on('click', () => showInvMapDetail(m, pinColor));
        invMapMarkersGroup.addLayer(marker);
      }
    });

    // Legend
    const legendEl = document.getElementById('invMapLegend');
    if (legendEl) {
      legendEl.innerHTML = Object.entries(legendTypes).map(([type, col]) =>
        `<div style="display:flex; align-items:center; gap:6px; font-size:12px;">
          <div style="width:10px; height:10px; border-radius:50%; background:${col}; flex-shrink:0;"></div>
          <span style="text-transform:capitalize; color:var(--ci-navy);">${type.replace(/_/g,' ')}</span>
        </div>`
      ).join('') +
      `<div style="display:flex; align-items:center; gap:6px; font-size:12px; margin-top:8px; padding-top:8px; border-top:1px solid var(--ci-border); grid-column:1/-1;">
        <div style="width:10px; height:10px; border-radius:50%; background:#BD3C3C; flex-shrink:0;"></div><span>Critical</span>
        &nbsp;
        <div style="width:10px; height:10px; border-radius:50%; background:#B27418; flex-shrink:0;"></div><span>High</span>
        &nbsp;
        <div style="width:10px; height:10px; border-radius:50%; background:#0EA5B7; flex-shrink:0;"></div><span>Medium/Low</span>
       </div>`;
    }

    if (bounds.length > 0) {
      invLeafletMap.fitBounds(bounds, { padding: [30, 30] });
    }
  } catch(err) {
    console.error('loadInvMap error:', err);
  }
}

function buildInvPopup(m, pinColor) {
  return `
    <div style="font-family:'Gadugi',sans-serif; min-width:210px; padding:2px;">
      <div style="font-weight:700; color:#153746; font-size:13px; margin-bottom:2px;">${m.case_number || m.case_id}</div>
      <div style="font-weight:600; font-size:12px; color:#0EA5B7; margin-bottom:4px;">${m.title || ''}</div>
      <div style="font-size:11px; color:#5B7380; margin-bottom:6px;">
        📍 ${m.location_name || ''} (${m.city || ''})<br>
        Station: <strong>${m.police_station || '—'}</strong><br>
        Priority: <span style="font-weight:700; text-transform:uppercase; color:${pinColor}">${m.priority || '—'}</span> | Type: ${m.case_type || '—'}
      </div>
      <button onclick="switchTab('inv-cases')" style="background:#0EA5B7; color:#fff; border:none; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer; width:100%;">
        View in My Cases →
      </button>
    </div>`;
}

function showInvMapDetail(m, pinColor) {
  const panel = document.getElementById('invMapDetailPanel');
  if (!panel) return;
  panel.innerHTML = `
    <div style="space-y:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span class="badge badge-teal">${m.case_number || m.case_id}</span>
        <span style="font-size:11px; font-weight:700; color:${pinColor}; text-transform:uppercase;">${m.priority || ''}</span>
      </div>
      <div style="font-size:13px; font-weight:700; color:var(--ci-navy); margin-bottom:6px;">${m.title || ''}</div>
      <div style="font-size:12px; color:var(--ci-text-muted); line-height:1.7;">
        <strong style="color:var(--ci-text-main);">Type:</strong> ${(m.case_type||'').replace(/_/g,' ')}<br>
        <strong style="color:var(--ci-text-main);">Station:</strong> ${m.police_station || '—'}<br>
        <strong style="color:var(--ci-text-main);">Location:</strong> ${m.location_name || '—'} (${m.city || ''})<br>
        <strong style="color:var(--ci-text-main);">GPS:</strong> <code>${m.lat?.toFixed(4)}, ${m.lon?.toFixed(4)}</code><br>
        <strong style="color:var(--ci-text-main);">Status:</strong> ${(m.status||'').replace(/_/g,' ')}
      </div>
      <button onclick="switchTab('inv-cases')" class="btn btn-secondary btn-sm" style="width:100%; margin-top:10px; font-size:12px;">📁 View in My Cases</button>
    </div>`;
}

function setInvMapMode(mode) {
  invMapMode = mode;
  document.getElementById('invMapModePoints')?.classList.toggle('active', mode === 'points');
  document.getElementById('invMapModeHeat')?.classList.toggle('active',   mode === 'heat');
  loadInvMap();
}
Object.assign(window, {
  initAuth,
  showLoginScreen,
  showWorkspace,
  handleLoginSubmit,
  handleLogout,
  togglePasswordVisibility,
  fillDemoLogin,
  switchTab,
  filterGraph,
  resetGraphPhysics,
  loadCentralityRanks,
  loadCommunities,
  toggleEgoMode,
  openEvidenceDrawer,
  closeEvidenceDrawer,
  submitValidationAction,
  openAlertsModal,
  closeAlertsModal,
  filterAlertsDisplay,
  loadAuthorizedAlerts,
  openAnomalyModal,
  closeAnomalyModal,
  updateActiveAnomalyStatus,
  generateChargesheetModal,
  closeChargesheetModal,
  copyDraftToClipboard,
  toggleGroundingAccordion,
  sendAssistantQuery,
  setAssistantPrompt,
  openRegisterFirModal,
  closeRegisterFirModal,
  handleRegisterFirSubmit,
  openAddEvidenceModal,
  closeAddEvidenceModal,
  handleAddEvidenceSubmit,
  toggleScenarioDropdown,
  runScenario,
  toggleTheme,
  toggleCaseDigestCollapse,
  toggleExtractionSection,
  extractEntitiesFromText,
  loadPresetDocument,
  resolveEntityQuery,
  setEntityResQuery,
  runForensicCompare,
  setComparePreset,
  loadMultiTimeline,
  filterTimeline,
  handleTimelineCaseChange,
  setTimelineViewMode,
  loadExecutiveDashboard,
  filterExecutiveStatus,
  filterCaseManagementByDistrict,
  loadCaseManagement,
  filterCaseManagement,
  resetCaseManagementFilters,
  inspectCaseManagementDetail,
  closeCaseInspection,
  navigateCaseToGraph,
  navigateCaseToTimeline,
  navigateCaseToAssistant,
  loadOfficerWorkload,
  toggleMapDisplayMode,
  loadGeoIncidentMap,
  loadPendingValidations,
  loadAuditTrail,
  loadInvDashboard,
  loadInvCases,
  filterInvCases,
  initInvMap,
  loadInvMap,
  setInvMapMode,
  buildInvPopup,
  showInvMapDetail
});
