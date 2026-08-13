/* ===========================================================
   render.js
   Pure DOM-writing functions. Each takes a container id and
   the data produced by analyze.js.
   =========================================================== */

const MANA_HEX = {
  W: 'var(--mana-w)', U: 'var(--mana-u)', B: 'var(--mana-b)',
  R: 'var(--mana-r)', G: 'var(--mana-g)',
  Colorless: 'var(--mana-c)', Multicolor: 'var(--mana-m)',
  Creature: 'var(--mana-g)', Noncreature: 'var(--mana-c)',
};

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach(c => {
    if (c === null || c === undefined) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

function renderBars(containerId, dataObj, opts = {}) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  const entries = Object.entries(dataObj);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  const sorted = opts.sort === false ? entries : entries.sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0 || sorted.every(([, v]) => v === 0)) {
    container.appendChild(el('p', { class: 'panel-sub' }, 'No data available for this collection.'));
    return;
  }

  const fillNodes = [];
  sorted.forEach(([label, value], i) => {
    const pct = Math.round((value / max) * 100);
    const color = MANA_HEX[label] || 'var(--accent)';
    const displayLabel = opts.labelMap ? (opts.labelMap[label] || label) : label;
    const fill = el('div', { class: 'bar-fill', style: `background:${color};` });
    const valueSpan = el('span', { class: 'bar-value' }, '0');
    const row = el('div', { class: 'bar-row stagger-in' }, [
      el('span', { class: 'bar-label' }, displayLabel),
      el('div', { class: 'bar-track' }, fill),
      valueSpan,
    ]);
    row.style.animationDelay = `${Math.min(i * 25, 350)}ms`;
    container.appendChild(row);
    fillNodes.push({ fill, pct, i, valueSpan, value });
  });

  fillNodes.forEach(({ fill, pct, i, valueSpan, value }) => {
    growBar(fill, pct, i);
    animateCount(valueSpan, value, { duration: 600 });
  });
}

function renderSummary(stats) {
  const container = document.getElementById('summaryRow');
  container.innerHTML = '';
  const cells = [
    [stats.uniqueCount, 'Unique cards', {}],
    [stats.totalQty, 'Total cards', {}],
    [stats.binderCount, 'Binders', {}],
    [stats.totalValue, 'Est. value', { prefix: '$', decimals: 2 }],
    [stats.unmatched, 'Unmatched rows', {}],
  ];
  cells.forEach(([num, label, fmt], i) => {
    const numSpan = el('span', { class: 'num' }, '0');
    const cell = el('div', { class: 'summary-cell stagger-in' }, [
      numSpan,
      el('span', { class: 'label' }, label),
    ]);
    cell.style.animationDelay = `${i * 45}ms`;
    container.appendChild(cell);
    if (fmt.prefix === '$' && num <= 0) {
      numSpan.textContent = '—';
    } else {
      animateCount(numSpan, num, { duration: 800, ...fmt });
    }
  });
}

function renderCurve(buckets) {
  const container = document.getElementById('curveChart');
  container.innerHTML = '';
  const max = Math.max(1, ...Object.values(buckets));
  const bars = [];
  Object.entries(buckets).forEach(([cmc, count], i) => {
    const heightPct = Math.round((count / max) * 100);
    const bar = el('div', { class: 'curve-bar' });
    const col = el('div', { class: 'curve-col stagger-in' }, [
      el('span', { class: 'curve-count' }, String(count)),
      bar,
      el('span', { class: 'curve-x' }, cmc),
    ]);
    col.style.animationDelay = `${i * 30}ms`;
    container.appendChild(col);
    bars.push({ bar, pct: Math.max(heightPct, count > 0 ? 3 : 0), i });
  });
  bars.forEach(({ bar, pct, i }) => growCurveBar(bar, pct, i));
}

function renderTribal(tribalEntries, filterText = '') {
  const container = document.getElementById('tribalTable');
  container.innerHTML = '';
  const filtered = tribalEntries.filter(([type]) =>
    type.toLowerCase().includes(filterText.toLowerCase())
  );
  if (filtered.length === 0) {
    container.appendChild(el('p', { class: 'panel-sub' }, 'No matching creature types.'));
    return;
  }
  const max = Math.max(1, ...filtered.map(([, v]) => v));
  const fills = [];
  filtered.slice(0, 60).forEach(([type, count], i) => {
    const pct = Math.round((count / max) * 100);
    const fill = el('div', { class: 'bar-fill', style: 'background:var(--mana-r);' });
    const row = el('div', { class: 'tribal-row stagger-in' }, [
      el('span', { class: 'tribal-name' }, type),
      el('div', { class: 'bar-track' }, fill),
      el('span', { class: 'tribal-count' }, String(count)),
    ]);
    row.style.animationDelay = `${Math.min(i * 18, 350)}ms`;
    container.appendChild(row);
    fills.push({ fill, pct, i });
  });
  fills.forEach(({ fill, pct, i }) => growBar(fill, pct, i));
}

function renderLegends(legends, filterText = '') {
  const container = document.getElementById('legendGrid');
  container.innerHTML = '';
  const filtered = legends.filter(l => l.name.toLowerCase().includes(filterText.toLowerCase()));
  if (filtered.length === 0) {
    container.appendChild(el('p', { class: 'panel-sub' }, 'No matching legendary creatures.'));
    return;
  }
  filtered.forEach((l, i) => {
    const pips = (l.color_identity.length ? l.color_identity : ['C']).map(c =>
      el('span', { class: 'pip', style: `background:${MANA_HEX[c] || 'var(--mana-c)'};` })
    );
    const card = el('div', { class: 'legend-card stagger-in' }, [
      el('div', { class: 'name' }, l.name),
      el('div', { class: 'meta' }, [
        el('div', { class: 'pip-row' }, pips),
        el('span', { class: l.legal ? 'legal-yes' : 'legal-no' }, l.legal ? 'Commander legal' : 'Not legal'),
      ]),
    ]);
    card.style.animationDelay = `${Math.min(i * 20, 400)}ms`;
    container.appendChild(card);
  });
}

function renderTable(rows) {
  const tbody = document.getElementById('cardTableBody');
  const wrap = document.querySelector('.table-wrap');
  tbody.innerHTML = '';
  const frag = document.createDocumentFragment();
  rows.forEach(r => {
    frag.appendChild(el('tr', {}, [
      el('td', {}, r.name),
      el('td', {}, r.cmc === null || r.cmc === undefined ? '—' : String(r.cmc)),
      el('td', {}, r.type_line || '—'),
      el('td', {}, r.rarity || '—'),
      el('td', {}, String(r.qty)),
      el('td', {}, r.price ? `$${r.price.toFixed(2)}` : '—'),
      el('td', {}, r.binder),
    ]));
  });
  tbody.appendChild(frag);
  document.getElementById('tableCount').textContent = `${rows.length.toLocaleString()} rows shown`;

  // A single fade on the whole table (not per-row — this table can hold
  // thousands of rows, so per-row stagger would be both slow and pointless
  // since most rows are offscreen anyway).
  if (wrap && !prefersReducedMotion()) {
    wrap.style.opacity = '0.4';
    requestAnimationFrame(() => {
      wrap.style.transition = 'opacity 0.2s ease';
      wrap.style.opacity = '1';
    });
  }
}

function updateSortIndicators(activeKey, dir) {
  document.querySelectorAll('#cardTable thead th').forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === activeKey) {
      th.classList.add(dir === 1 ? 'sort-asc' : 'sort-desc');
    }
  });
}

function showError(message) {
  const toast = document.getElementById('errorToast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showError._t);
  showError._t = setTimeout(() => { toast.hidden = true; }, 6000);
}

/* ===========================================================
   V2 render functions
   =========================================================== */

function renderMiniStats(containerId, cells) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  cells.forEach(([num, label, fmt = {}], i) => {
    const numSpan = el('span', { class: 'num' }, '0');
    const cell = el('div', { class: 'mini-stat stagger-in' }, [
      numSpan,
      el('span', { class: 'label' }, label),
    ]);
    cell.style.animationDelay = `${i * 45}ms`;
    container.appendChild(cell);
    if (typeof num !== 'number') {
      numSpan.textContent = num;
    } else if (fmt.prefix === '$' && num <= 0) {
      numSpan.textContent = '—';
    } else {
      animateCount(numSpan, num, { duration: 700, ...fmt });
    }
  });
}

function renderRoleChips(binders, roles, onToggle) {
  const container = document.getElementById('roleChips');
  container.innerHTML = '';
  if (binders.length === 0) {
    container.appendChild(el('p', { class: 'panel-sub' }, 'No binder names found in this export.'));
    return;
  }
  binders.forEach(name => {
    const role = roles[name] ?? guessBinderRole(name);
    const btn = el('button', {
      class: role === 'deck' ? 'active-deck' : 'active-storage'
    }, role === 'deck' ? 'Deck' : 'Storage');
    btn.addEventListener('click', () => {
      const next = role === 'deck' ? 'storage' : 'deck';
      onToggle(name, next);
    });
    container.appendChild(el('div', { class: 'role-chip' }, [
      el('span', { class: 'chip-name' }, name),
      btn,
    ]));
  });
}

function renderDeckCompletenessGrid(deckStats) {
  const container = document.getElementById('deckCompletenessGrid');
  container.innerHTML = '';
  if (deckStats.length === 0) {
    container.appendChild(el('p', { class: 'panel-sub' }, 'No binders are currently tagged as decks.'));
    return;
  }
  deckStats.forEach((d, i) => {
    const statPairs = [
      [String(d.totalCards), 'Total cards'],
      [String(d.landCount), 'Lands'],
      [String(d.rampCount), 'Ramp/fixing'],
      [d.avgCmc.toFixed(2), 'Avg. CMC (spells)'],
    ];
    const flagList = d.flags.length
      ? el('ul', { class: 'deck-flags' }, d.flags.map(f => el('li', {}, f)))
      : el('ul', { class: 'deck-flags clean' }, el('li', {}, '\u2713 No structural issues detected.'));

    const card = el('div', { class: 'deck-card stagger-in' }, [
      el('div', { class: 'deck-name' }, d.binder),
      el('div', { class: 'deck-stats' }, statPairs.map(([v, l]) =>
        el('span', {}, `${l}: ${v}`)
      )),
      flagList,
    ]);
    card.style.animationDelay = `${i * 40}ms`;
    container.appendChild(card);
  });
}

function renderDupeList(dupes) {
  const container = document.getElementById('dupeList');
  container.innerHTML = '';
  if (dupes.length === 0) {
    container.appendChild(el('p', { class: 'panel-sub' }, 'No card names found across more than one deck binder.'));
    return;
  }
  dupes.forEach(d => {
    container.appendChild(el('div', { class: 'dupe-row' }, [
      el('span', {}, d.name),
      el('span', { class: 'dupe-binders' }, d.binders.join(' · ')),
    ]));
  });
}

function renderTopValueTable(topCards) {
  const tbody = document.getElementById('topValueBody');
  tbody.innerHTML = '';
  if (topCards.length === 0) {
    tbody.appendChild(el('tr', {}, el('td', { colspan: '5' }, 'No priced cards found.')));
    return;
  }
  topCards.forEach(c => {
    tbody.appendChild(el('tr', {}, [
      el('td', {}, c.name),
      el('td', {}, c.binder),
      el('td', {}, String(c.qty)),
      el('td', {}, `$${c.price.toFixed(2)}`),
      el('td', {}, `$${c.total.toFixed(2)}`),
    ]));
  });
}
