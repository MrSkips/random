/* ===========================================================
   analyze.js
   Takes merged rows (CSV row + Scryfall card, or null if the
   card couldn't be matched) and produces every stat block the
   dashboard needs. Pure functions — no DOM access here.
   =========================================================== */

const COLOR_NAMES = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
const MANA_COLORS = ['W', 'U', 'B', 'R', 'G'];

// Simple oracle-text heuristics for the "fixing & ramp" panel.
const FIXING_PATTERNS = [
  { key: 'Dual / fixing lands', test: (c) => c.type_line.includes('Land') && /add\s+\{[wubrg]\}.*\{[wubrg]\}/i.test(c.oracle_text || '') },
  { key: 'Fetch lands', test: (c) => c.type_line.includes('Land') && /search your library for a .*land/i.test(c.oracle_text || '') },
  { key: 'Mana rocks', test: (c) => c.type_line.includes('Artifact') && !c.type_line.includes('Creature') && /add\s+\{/i.test(c.oracle_text || '') },
  { key: 'Ramp spells', test: (c) => !c.type_line.includes('Land') && /search your library for a .*land/i.test(c.oracle_text || '') },
  { key: 'Mana dorks', test: (c) => c.type_line.includes('Creature') && /add\s+\{/i.test(c.oracle_text || '') },
];

function merged(rows, scryfallMap) {
  return rows.map((row, i) => ({ row, card: scryfallMap.get(i) || null }));
}

function summaryStats(entries) {
  const matched = entries.filter(e => e.card);
  const uniqueCount = entries.length;
  const totalQty = entries.reduce((s, e) => s + (e.row.quantity || 1), 0);
  const unmatched = entries.length - matched.length;

  let totalValue = 0;
  let priceKnownFor = 0;
  entries.forEach(e => {
    const price = e.card && e.card.price_usd ? parseFloat(e.card.price_usd) : (e.row.purchasePrice || null);
    if (price !== null && !Number.isNaN(price)) {
      totalValue += price * (e.row.quantity || 1);
      priceKnownFor += e.row.quantity || 1;
    }
  });

  const binders = new Set(entries.map(e => e.row.binder).filter(Boolean));

  return { uniqueCount, totalQty, unmatched, totalValue, priceKnownFor, binderCount: binders.size };
}

function pipCounts(entries) {
  const counts = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  entries.forEach(({ row, card }) => {
    if (!card || !card.mana_cost) return;
    const qty = row.quantity || 1;
    const symbols = card.mana_cost.match(/\{[^}]+\}/g) || [];
    symbols.forEach(sym => {
      MANA_COLORS.forEach(c => {
        if (sym.includes(c)) counts[c] += qty;
      });
    });
  });
  return counts;
}

function identityCounts(entries) {
  const counts = { W: 0, U: 0, B: 0, R: 0, G: 0, Colorless: 0, Multicolor: 0 };
  entries.forEach(({ row, card }) => {
    if (!card) return;
    if (card.type_line.includes('Land')) return; // lands excluded — basics would otherwise dominate the chart
    const qty = row.quantity || 1;
    const ci = card.color_identity || [];
    if (ci.length === 0) counts.Colorless += qty;
    else if (ci.length > 1) counts.Multicolor += qty;
    else counts[ci[0]] += qty;
  });
  return counts;
}

function fixingCounts(entries) {
  const counts = {};
  FIXING_PATTERNS.forEach(p => counts[p.key] = 0);
  entries.forEach(({ row, card }) => {
    if (!card) return;
    const qty = row.quantity || 1;
    FIXING_PATTERNS.forEach(p => {
      if (p.test(card)) counts[p.key] += qty;
    });
  });
  return counts;
}

function typeCounts(entries) {
  const TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Battle'];
  const counts = {};
  TYPES.forEach(t => counts[t] = 0);
  entries.forEach(({ row, card }) => {
    if (!card) return;
    const qty = row.quantity || 1;
    TYPES.forEach(t => {
      if (card.type_line.includes(t)) counts[t] += qty;
    });
  });
  return counts;
}

function creatureRatio(entries) {
  let creature = 0, noncreature = 0;
  entries.forEach(({ row, card }) => {
    if (!card) return;
    const qty = row.quantity || 1;
    if (card.type_line.includes('Land')) return; // lands excluded from this ratio
    if (card.type_line.includes('Creature')) creature += qty;
    else noncreature += qty;
  });
  return { Creature: creature, Noncreature: noncreature };
}

function keywordCounts(entries, topN = 12) {
  const counts = {};
  entries.forEach(({ row, card }) => {
    if (!card || !card.keywords) return;
    const qty = row.quantity || 1;
    card.keywords.forEach(k => { counts[k] = (counts[k] || 0) + qty; });
  });
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .reduce((obj, [k, v]) => { obj[k] = v; return obj; }, {});
}

function curveBuckets(entries, filterFn = null) {
  const buckets = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7+': 0 };
  entries.forEach(({ row, card }) => {
    if (!card) return;
    if (card.type_line.includes('Land')) return;
    if (filterFn && !filterFn(card)) return;
    const qty = row.quantity || 1;
    const cmc = Math.floor(card.cmc || 0);
    const key = cmc >= 7 ? '7+' : String(cmc);
    buckets[key] += qty;
  });
  return buckets;
}

function tribalCounts(entries) {
  const counts = {};
  entries.forEach(({ row, card }) => {
    if (!card || !card.type_line.includes('Creature')) return;
    const qty = row.quantity || 1;
    const afterDash = card.type_line.split('—')[1];
    if (!afterDash) return;
    afterDash.trim().split(/\s+/).forEach(type => {
      counts[type] = (counts[type] || 0) + qty;
    });
  });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function legendaryCreatures(entries) {
  const seen = new Map();
  entries.forEach(({ row, card }) => {
    if (!card) return;
    if (!card.type_line.includes('Legendary') || !card.type_line.includes('Creature')) return;
    if (seen.has(card.name)) return;
    seen.set(card.name, {
      name: card.name,
      color_identity: card.color_identity || [],
      legal: card.legal_commander === 'legal',
      type_line: card.type_line,
    });
  });
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function fullTableRows(entries) {
  return entries.map(({ row, card }) => ({
    name: row.name,
    cmc: card ? card.cmc : null,
    type_line: card ? card.type_line : 'Unmatched',
    rarity: card ? card.rarity : (row.rarity || ''),
    qty: row.quantity || 1,
    price: card && card.price_usd ? parseFloat(card.price_usd) : row.purchasePrice,
    binder: row.binder || '—',
    color_identity: card ? (card.color_identity || []) : [],
  }));
}

/* ===========================================================
   V2 — binder / deck structure, value, expanded filtering
   =========================================================== */

// Names commonly used for color/storage binders (vs. dedicated deck
// binders). Used only as a starting guess — the user can override any
// binder's role, and that override is what actually gets used.
const STORAGE_NAME_HINTS = [
  'white', 'blue', 'black', 'red', 'green', 'multi', 'multicolor',
  'colorless', 'land', 'lands', 'legend', 'legends', 'value', 'bulk',
  'unsorted', 'sideboard', 'binder',
];

function guessBinderRole(binderName) {
  const n = (binderName || '').toLowerCase();
  if (!n) return 'storage';
  return STORAGE_NAME_HINTS.some(hint => n.includes(hint)) ? 'storage' : 'deck';
}

function binderList(entries) {
  const names = new Set(entries.map(e => e.row.binder).filter(Boolean));
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function binderBreakdown(entries) {
  const map = new Map();
  entries.forEach(({ row, card }) => {
    const name = row.binder || '(no binder)';
    const qty = row.quantity || 1;
    const price = card && card.price_usd ? parseFloat(card.price_usd) : row.purchasePrice;
    if (!map.has(name)) map.set(name, { binder: name, uniqueCount: 0, totalQty: 0, totalValue: 0 });
    const b = map.get(name);
    b.uniqueCount += 1;
    b.totalQty += qty;
    if (price !== null && price !== undefined && !Number.isNaN(price)) b.totalValue += price * qty;
  });
  return Array.from(map.values()).sort((a, b) => b.totalQty - a.totalQty);
}

/**
 * roles: { binderName: 'deck' | 'storage' }
 * Returns entries not locked into any binder tagged 'deck' — i.e. the
 * pool actually available to build something new from.
 */
function freePoolEntries(entries, roles) {
  return entries.filter(({ row }) => {
    const role = roles[row.binder] ?? guessBinderRole(row.binder);
    return role !== 'deck';
  });
}

/**
 * Card names that appear in more than one binder tagged 'deck'. This is a
 * heuristic flag, not a hard conflict: ManaBox tracks physical copies per
 * binder, so the same name in two deck binders usually just means you own
 * two copies — but it's worth a glance, especially for singleton staples.
 */
function duplicateAcrossDecks(entries, roles) {
  const nameToBinders = new Map();
  entries.forEach(({ row }) => {
    const role = roles[row.binder] ?? guessBinderRole(row.binder);
    if (role !== 'deck' || !row.binder) return;
    if (!nameToBinders.has(row.name)) nameToBinders.set(row.name, new Set());
    nameToBinders.get(row.name).add(row.binder);
  });
  return Array.from(nameToBinders.entries())
    .filter(([, binders]) => binders.size > 1)
    .map(([name, binders]) => ({ name, binders: Array.from(binders).sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const RAMP_KEYS = new Set(['Mana rocks', 'Ramp spells', 'Mana dorks', 'Fetch lands']);

/**
 * Structural health check for a single deck-tagged binder — land count,
 * curve, and ramp density. Deliberately does NOT try to detect removal or
 * win conditions here; that needs the oracle-text tagging work planned
 * for V3, where it can get proper accuracy treatment instead of a rushed
 * heuristic bolted onto this panel.
 */
function deckCompleteness(entries, binderName) {
  const deckEntries = entries.filter(e => e.row.binder === binderName);
  const matched = deckEntries.filter(e => e.card);

  let landCount = 0, nonlandCount = 0, cmcSum = 0, cmcCards = 0;
  const fixing = fixingCounts(deckEntries);
  let rampCount = 0;
  Object.entries(fixing).forEach(([k, v]) => { if (RAMP_KEYS.has(k)) rampCount += v; });

  matched.forEach(({ row, card }) => {
    const qty = row.quantity || 1;
    if (card.type_line.includes('Land')) {
      landCount += qty;
    } else {
      nonlandCount += qty;
      cmcSum += (card.cmc || 0) * qty;
      cmcCards += qty;
    }
  });

  const avgCmc = cmcCards > 0 ? cmcSum / cmcCards : 0;
  const totalCards = landCount + nonlandCount;

  const flags = [];
  if (landCount > 0 && landCount < 33) flags.push(`Only ${landCount} lands — most 100-card Commander decks want 36–38.`);
  if (rampCount < 8) flags.push(`Only ${rampCount} ramp/fixing sources detected — consider adding more mana rocks or dorks.`);
  if (avgCmc > 3.5) flags.push(`Average CMC is ${avgCmc.toFixed(2)}, which is high — the deck may be top-heavy.`);
  if (totalCards > 0 && totalCards < 95) flags.push(`Only ${totalCards} cards found in this binder — below a full 100-card deck.`);

  return { binder: binderName, totalCards, landCount, nonlandCount, avgCmc, rampCount, flags };
}

function valueBreakdown(entries, bulkThreshold = 1) {
  const perBinder = binderBreakdown(entries).map(b => ({ binder: b.binder, value: b.totalValue }));

  let bulkValue = 0, bulkQty = 0, realValue = 0, realQty = 0;
  const priced = [];

  entries.forEach(({ row, card }) => {
    const price = card && card.price_usd ? parseFloat(card.price_usd) : row.purchasePrice;
    const qty = row.quantity || 1;
    if (price === null || price === undefined || Number.isNaN(price)) return;
    if (price < bulkThreshold) { bulkValue += price * qty; bulkQty += qty; }
    else { realValue += price * qty; realQty += qty; }
    priced.push({ name: row.name, price, qty, total: price * qty, binder: row.binder || '—' });
  });

  const topCards = priced.sort((a, b) => b.total - a.total).slice(0, 25);

  return { perBinder, bulkValue, bulkQty, realValue, realQty, topCards };
}

