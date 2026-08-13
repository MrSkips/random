/* ===========================================================
   scryfall.js
   Enriches parsed rows with Scryfall card data via the
   /cards/collection endpoint (batches of 75 identifiers).
   Prefers the Scryfall ID ManaBox already exports; falls back
   to set code + collector number, then bare name.

   Results are cached in localStorage so re-uploading the same
   (or a mostly-overlapping) collection doesn't re-fetch
   everything.
   =========================================================== */

const SCRYFALL_CACHE_KEY = 'longbox_scryfall_cache_v1';
const BATCH_SIZE = 75;

// Fields we actually use downstream — trimmed to keep the
// localStorage cache small.
function trimCard(card) {
  const face = (card.card_faces && card.card_faces[0]) || null;
  return {
    id: card.id,
    name: card.name,
    mana_cost: card.mana_cost || (face && face.mana_cost) || '',
    cmc: card.cmc ?? 0,
    type_line: card.type_line || (face && face.type_line) || '',
    colors: card.colors || (face && face.colors) || [],
    color_identity: card.color_identity || [],
    keywords: card.keywords || [],
    rarity: card.rarity || '',
    oracle_text: card.oracle_text || (face && face.oracle_text) || '',
    legal_commander: card.legalities ? card.legalities.commander : 'not_legal',
    price_usd: card.prices ? (card.prices.usd || card.prices.usd_foil) : null,
    set: card.set || '',
    collector_number: card.collector_number || '',
  };
}

function loadCache() {
  try {
    const raw = localStorage.getItem(SCRYFALL_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveCache(cache) {
  try {
    localStorage.setItem(SCRYFALL_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Cache is best-effort — if storage is full or unavailable, just skip it.
  }
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * rows: parsed CSV rows (from parse.js)
 * onProgress(done, total): called after each batch
 * Returns: Map<rowIndex, trimmedScryfallCard | null>
 */
async function enrichWithScryfall(rows, onProgress) {
  const cache = loadCache();
  const results = new Map();

  // Build one identifier per unique card printing, preferring scryfallId.
  const identifierFor = (row) => {
    if (row.scryfallId) return { key: `id:${row.scryfallId}`, identifier: { id: row.scryfallId } };
    if (row.setCode && row.collectorNumber) {
      return {
        key: `sc:${row.setCode}:${row.collectorNumber}`,
        identifier: { set: row.setCode, collector_number: row.collectorNumber },
      };
    }
    return { key: `name:${row.name.toLowerCase()}`, identifier: { name: row.name } };
  };

  const rowKeys = rows.map(identifierFor);
  const uniqueByKey = new Map();
  rowKeys.forEach(({ key, identifier }) => {
    if (!uniqueByKey.has(key)) uniqueByKey.set(key, identifier);
  });

  const toFetch = [];
  const keyToCard = new Map();

  for (const [key, identifier] of uniqueByKey.entries()) {
    if (cache[key]) {
      keyToCard.set(key, cache[key]);
    } else {
      toFetch.push({ key, identifier });
    }
  }

  const totalBatches = Math.ceil(toFetch.length / BATCH_SIZE) || 0;
  let done = 0;
  onProgress(0, toFetch.length);

  for (const batch of chunk(toFetch, BATCH_SIZE)) {
    let json;
    try {
      const resp = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: batch.map(b => b.identifier) }),
      });
      json = await resp.json();
    } catch (err) {
      // Network hiccup on this batch — skip it, those cards stay unenriched.
      done += batch.length;
      onProgress(done, toFetch.length);
      continue;
    }

    const found = (json.data || []).map(trimCard);

    // Match found cards back to batch keys. Scryfall returns them in a
    // stable order matching valid identifiers, but "not_found" entries can
    // shift things — so match by identity fields instead of position.
    for (const item of batch) {
      let match = null;
      if (item.identifier.id) {
        match = found.find(c => c.id === item.identifier.id);
      } else if (item.identifier.set) {
        match = found.find(c =>
          c.set === item.identifier.set &&
          c.collector_number === item.identifier.collector_number
        );
      } else {
        match = found.find(c => c.name.toLowerCase() === item.identifier.name.toLowerCase());
      }
      if (match) {
        cache[item.key] = match;
        keyToCard.set(item.key, match);
      } else {
        keyToCard.set(item.key, null);
      }
    }

    done += batch.length;
    onProgress(done, toFetch.length);

    // Be polite to Scryfall's API between batches.
    await new Promise(r => setTimeout(r, 100));
  }

  saveCache(cache);

  rows.forEach((row, i) => {
    results.set(i, keyToCard.get(rowKeys[i].key) || null);
  });

  return results;
}

function clearScryfallCache() {
  try { localStorage.removeItem(SCRYFALL_CACHE_KEY); } catch {}
}

function cacheSize() {
  const cache = loadCache();
  return Object.keys(cache).length;
}
