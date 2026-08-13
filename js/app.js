/* ===========================================================
   app.js
   Wires upload -> parse -> enrich -> analyze -> render, plus
   all the interactive bits (tabs, search, sort, filters).
   =========================================================== */

let STATE = {
  entries: [],       // [{row, card}]
  tribal: [],
  legends: [],
  tableRows: [],
  tableSort: { key: 'name', dir: 1 },
  roles: {},          // { binderName: 'deck' | 'storage' }
  bulkThreshold: 1,
};

const BINDER_ROLES_KEY = 'longbox_binder_roles_v1';

function loadRoles() {
  try {
    const raw = localStorage.getItem(BINDER_ROLES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveRoles(roles) {
  try { localStorage.setItem(BINDER_ROLES_KEY, JSON.stringify(roles)); } catch {}
}

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const uploadHint = document.getElementById('uploadHint');
const uploadStage = document.getElementById('uploadStage');
const progressCard = document.getElementById('progressCard');
const progressFill = document.getElementById('progressFill');
const progressLabel = document.getElementById('progressLabel');
const progressSub = document.getElementById('progressSub');
const dashboardStage = document.getElementById('dashboardStage');
const dataFreshness = document.getElementById('dataFreshness');

/* ---------- upload wiring ---------- */

['dragover', 'dragenter'].forEach(evt =>
  dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); })
);
['dragleave', 'drop'].forEach(evt =>
  dropZone.addEventListener(evt, (e) => { e.preventDefault(); dropZone.classList.remove('drag-over'); })
);
dropZone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

async function handleFile(file) {
  if (!file.name.toLowerCase().endsWith('.csv')) {
    uploadHint.textContent = 'That doesn\u2019t look like a CSV file — export your collection from ManaBox and try again.';
    return;
  }
  uploadHint.textContent = '';
  crossFade(uploadStage.querySelector('.upload-card'), progressCard);

  try {
    progressLabel.textContent = 'Reading collection\u2026';
    progressFill.style.width = '8%';
    const { rows, skipped } = await parseManaBoxCSV(file);

    progressLabel.textContent = `Matching ${rows.length.toLocaleString()} cards against Scryfall\u2026`;
    const scryfallMap = await enrichWithScryfall(rows, (done, total) => {
      const pct = total === 0 ? 100 : Math.round((done / total) * 100);
      progressFill.style.width = `${Math.max(pct, 8)}%`;
      progressSub.textContent = total === 0
        ? 'Everything was already cached locally.'
        : `${done.toLocaleString()} / ${total.toLocaleString()} new cards looked up`;
    });

    progressFill.style.width = '100%';
    progressLabel.textContent = 'Building your dashboard\u2026';

    const entries = merged(rows, scryfallMap);
    STATE.entries = entries;

    if (skipped > 0) {
      showError(`Skipped ${skipped} row(s) with no card name.`);
    }

    buildDashboard(entries);

    crossFade(uploadStage, dashboardStage);
    dataFreshness.textContent = `Loaded ${new Date().toLocaleDateString()} \u00b7 ${cacheSize().toLocaleString()} cards cached locally`;
  } catch (err) {
    const card = uploadStage.querySelector('.upload-card');
    progressCard.hidden = true;
    progressCard.style.cssText = '';
    card.hidden = false;
    card.style.cssText = '';
    uploadHint.textContent = err.message || 'Something went wrong reading that file.';
  }
}

document.getElementById('resetButton').addEventListener('click', () => {
  dashboardStage.hidden = true;
  dashboardStage.style.cssText = '';
  uploadStage.hidden = false;
  uploadStage.style.cssText = '';
  const card = uploadStage.querySelector('.upload-card');
  card.hidden = false;
  card.style.cssText = '';
  progressCard.hidden = true;
  progressCard.style.cssText = '';
  progressFill.style.width = '0%';
  fileInput.value = '';
});

/* ---------- dashboard build ---------- */

function buildDashboard(entries) {
  const stats = summaryStats(entries);
  renderSummary(stats);

  renderBars('pipBars', pipCounts(entries), { labelMap: COLOR_NAMES });
  renderBars('identityBars', identityCounts(entries));
  renderBars('fixingBars', fixingCounts(entries), { sort: false });

  renderBars('typeBars', typeCounts(entries), { sort: false });
  renderBars('creatureRatioBars', creatureRatio(entries));
  renderBars('keywordBars', keywordCounts(entries));

  STATE.tribal = tribalCounts(entries);
  renderTribal(STATE.tribal);

  STATE.legends = legendaryCreatures(entries);
  renderLegends(STATE.legends);

  STATE.tableRows = fullTableRows(entries);
  populateBinderFilter(entries);
  applyTableFilters();

  buildCurveControls(entries);
  renderCurve(curveBuckets(entries));

  STATE.roles = loadRoles();
  buildBindersPanel(entries);
  buildValuePanel(entries);
}

/* ---------- V2: binders panel ---------- */

function buildBindersPanel(entries) {
  const binders = binderList(entries);

  renderRoleChips(binders, STATE.roles, (name, nextRole) => {
    STATE.roles[name] = nextRole;
    saveRoles(STATE.roles);
    buildBindersPanel(entries); // rebuild the whole panel so completeness/free-pool reflect the change
  });

  const breakdown = binderBreakdown(entries);
  const qtyByBinder = {};
  breakdown.forEach(b => { qtyByBinder[b.binder] = b.totalQty; });
  renderBars('binderQtyBars', qtyByBinder);

  const freePool = freePoolEntries(entries, STATE.roles);
  const freeStats = summaryStats(freePool);
  renderMiniStats('freePoolStats', [
    [freeStats.uniqueCount, 'Unique cards'],
    [freeStats.totalQty, 'Total cards'],
    [freeStats.totalValue, 'Est. value', { prefix: '$', decimals: 2 }],
  ]);
  renderBars('freePoolColorBars', identityCounts(freePool));

  renderDupeList(duplicateAcrossDecks(entries, STATE.roles));

  const deckBinders = binders.filter(b => (STATE.roles[b] ?? guessBinderRole(b)) === 'deck');
  const deckStats = deckBinders.map(b => deckCompleteness(entries, b));
  renderDeckCompletenessGrid(deckStats);
}

/* ---------- V2: value panel ---------- */

function buildValuePanel(entries) {
  const value = valueBreakdown(entries, STATE.bulkThreshold);
  const totalValue = value.bulkValue + value.realValue;

  renderMiniStats('valueStats', [
    [totalValue, 'Total value', { prefix: '$', decimals: 2 }],
    [value.bulkQty + value.realQty, 'Priced cards'],
  ]);

  renderBars('bulkSplitBars', {
    [`Under $${STATE.bulkThreshold.toFixed(2)}`]: Math.round(value.bulkValue * 100) / 100,
    [`$${STATE.bulkThreshold.toFixed(2)} and up`]: Math.round(value.realValue * 100) / 100,
  }, { sort: false });

  const byBinder = {};
  value.perBinder.forEach(b => { byBinder[b.binder] = Math.round(b.value * 100) / 100; });
  renderBars('valueByBinderBars', byBinder);

  renderTopValueTable(value.topCards);
}

document.getElementById('bulkThreshold').addEventListener('input', (e) => {
  STATE.bulkThreshold = parseFloat(e.target.value);
  document.getElementById('thresholdDisplay').textContent = STATE.bulkThreshold.toFixed(2);
  buildValuePanel(STATE.entries);
});

/* ---------- tabs ---------- */

document.getElementById('binderTabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(btn.dataset.panel).classList.add('active');
});
// Activate the first tab by default
document.querySelector('.tab').classList.add('active');
document.querySelector('.panel').classList.add('active');

/* ---------- curve color filter ---------- */

function buildCurveControls(entries) {
  const container = document.getElementById('curveControls');
  container.innerHTML = '';
  const options = [['All', null], ...MANA_COLORS.map(c => [COLOR_NAMES[c], c])];
  options.forEach(([label, colorKey], i) => {
    const btn = el('button', {}, label);
    if (i === 0) btn.classList.add('active');
    btn.addEventListener('click', () => {
      container.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filterFn = colorKey ? (card => (card.colors || []).includes(colorKey)) : null;
      renderCurve(curveBuckets(entries, filterFn));
    });
    container.appendChild(btn);
  });
}

/* ---------- tribal search ---------- */

document.getElementById('tribalSearch').addEventListener('input', (e) => {
  renderTribal(STATE.tribal, e.target.value);
});

/* ---------- legend search ---------- */

document.getElementById('legendSearch').addEventListener('input', (e) => {
  renderLegends(STATE.legends, e.target.value);
});

/* ---------- full table: search, filter, sort ---------- */

function populateBinderFilter(entries) {
  const select = document.getElementById('binderFilter');
  const current = select.value;
  select.innerHTML = '<option value="">All binders</option>';
  binderList(entries).forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
  select.value = current;
}

function applyTableFilters() {
  const search = document.getElementById('tableSearch').value.toLowerCase();
  const colorFilter = document.getElementById('colorFilter').value;
  const rarityFilter = document.getElementById('rarityFilter').value;
  const typeFilter = document.getElementById('typeFilter').value;
  const binderFilter = document.getElementById('binderFilter').value;
  const cmcMin = document.getElementById('cmcMin').value;
  const cmcMax = document.getElementById('cmcMax').value;

  let rows = STATE.tableRows.filter(r => {
    if (search && !r.name.toLowerCase().includes(search) && !r.type_line.toLowerCase().includes(search)) return false;
    if (rarityFilter && r.rarity !== rarityFilter) return false;
    if (typeFilter && !r.type_line.includes(typeFilter)) return false;
    if (binderFilter && r.binder !== binderFilter) return false;
    if (cmcMin !== '' && (r.cmc === null || r.cmc < parseFloat(cmcMin))) return false;
    if (cmcMax !== '' && (r.cmc === null || r.cmc > parseFloat(cmcMax))) return false;
    if (colorFilter) {
      const ci = r.color_identity || [];
      if (colorFilter === 'C' && ci.length !== 0) return false;
      if (colorFilter === 'M' && ci.length <= 1) return false;
      if (['W', 'U', 'B', 'R', 'G'].includes(colorFilter) && !(ci.length === 1 && ci[0] === colorFilter)) return false;
    }
    return true;
  });

  const { key, dir } = STATE.tableSort;
  rows = rows.slice().sort((a, b) => {
    let av = a[key], bv = b[key];
    if (av === null || av === undefined) av = key === 'cmc' || key === 'price' ? -1 : '';
    if (bv === null || bv === undefined) bv = key === 'cmc' || key === 'price' ? -1 : '';
    if (typeof av === 'string') return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  });

  renderTable(rows);
  updateSortIndicators(STATE.tableSort.key, STATE.tableSort.dir);
}

document.getElementById('tableSearch').addEventListener('input', applyTableFilters);
document.getElementById('colorFilter').addEventListener('change', applyTableFilters);
document.getElementById('rarityFilter').addEventListener('change', applyTableFilters);
document.getElementById('typeFilter').addEventListener('change', applyTableFilters);
document.getElementById('binderFilter').addEventListener('change', applyTableFilters);
document.getElementById('cmcMin').addEventListener('input', applyTableFilters);
document.getElementById('cmcMax').addEventListener('input', applyTableFilters);

document.querySelectorAll('#cardTable thead th').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.sort;
    if (STATE.tableSort.key === key) {
      STATE.tableSort.dir *= -1;
    } else {
      STATE.tableSort = { key, dir: 1 };
    }
    applyTableFilters();
  });
});
