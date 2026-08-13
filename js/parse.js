/* ===========================================================
   parse.js
   Turns a raw ManaBox CSV into a normalized array of rows:
   { name, setCode, setName, collectorNumber, foil, rarity,
     quantity, scryfallId, manaboxId, purchasePrice, condition,
     language, binder }

   ManaBox has shifted its export header names slightly across
   versions, so every field is matched against a list of
   accepted aliases (case-insensitive, trimmed) rather than a
   single hardcoded name.
   =========================================================== */

const HEADER_ALIASES = {
  binder:          ['binder name', 'binder', 'folder'],
  name:            ['name', 'card name'],
  setCode:         ['set code', 'set'],
  setName:         ['set name'],
  collectorNumber: ['collector number', 'collector_number', 'number'],
  foil:            ['foil'],
  rarity:          ['rarity'],
  quantity:        ['quantity', 'qty', 'count'],
  manaboxId:       ['manabox id', 'manabox_id'],
  scryfallId:      ['scryfall id', 'scryfall_id'],
  purchasePrice:   ['purchase price', 'price'],
  misprint:        ['misprint'],
  altered:         ['altered'],
  condition:       ['condition'],
  language:        ['language', 'lang'],
  currency:        ['purchase price currency', 'currency'],
};

function buildHeaderMap(rawHeaders) {
  const normalized = rawHeaders.map(h => (h || '').trim().toLowerCase());
  const map = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalized.findIndex(h => aliases.includes(h));
    if (idx !== -1) map[field] = rawHeaders[idx];
  }
  return map;
}

function toNumber(val, fallback = 0) {
  if (val === undefined || val === null || val === '') return fallback;
  const n = parseFloat(String(val).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

function toBool(val) {
  if (typeof val === 'boolean') return val;
  const s = String(val || '').trim().toLowerCase();
  return s === 'true' || s === 'yes' || s === '1' || s === 'foil';
}

/**
 * Parses a File object (CSV) and resolves with:
 * { rows: [...], skipped: number, headerMap: {...} }
 */
function parseManaBoxCSV(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        try {
          const rawHeaders = results.meta.fields || [];
          const map = buildHeaderMap(rawHeaders);

          if (!map.name) {
            reject(new Error(
              "Couldn't find a card name column in this file. " +
              "Make sure you're uploading a ManaBox collection export."
            ));
            return;
          }

          let skipped = 0;
          const rows = [];

          for (const raw of results.data) {
            const name = (raw[map.name] || '').trim();
            if (!name) { skipped++; continue; }

            rows.push({
              binder:          map.binder ? (raw[map.binder] || '').trim() : '',
              name,
              setCode:         map.setCode ? (raw[map.setCode] || '').trim().toLowerCase() : '',
              setName:         map.setName ? (raw[map.setName] || '').trim() : '',
              collectorNumber: map.collectorNumber ? (raw[map.collectorNumber] || '').trim() : '',
              foil:            map.foil ? toBool(raw[map.foil]) : false,
              rarity:          map.rarity ? (raw[map.rarity] || '').trim().toLowerCase() : '',
              quantity:        map.quantity ? toNumber(raw[map.quantity], 1) : 1,
              manaboxId:       map.manaboxId ? (raw[map.manaboxId] || '').trim() : '',
              scryfallId:      map.scryfallId ? (raw[map.scryfallId] || '').trim() : '',
              purchasePrice:   map.purchasePrice ? toNumber(raw[map.purchasePrice], null) : null,
              condition:       map.condition ? (raw[map.condition] || '').trim() : '',
              language:        map.language ? (raw[map.language] || '').trim() : '',
            });
          }

          if (rows.length === 0) {
            reject(new Error('No valid card rows were found in this file.'));
            return;
          }

          resolve({ rows, skipped, headerMap: map });
        } catch (err) {
          reject(err);
        }
      },
      error(err) { reject(err); }
    });
  });
}
