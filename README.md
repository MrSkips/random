# The Long Box

A browser-based analyzer for ManaBox collection exports. Upload your CSV, and it
builds a dashboard of color identity, mana curve, card types, creature tribal
density, commander candidates, and a searchable/sortable full list — all
computed client-side, nothing leaves your browser except the card lookups sent
to Scryfall.

This is **V1 + V2** of a three-phase build. See the "Roadmap" section below for
what's planned in V3.

## Running it locally

No build step — it's plain HTML/CSS/JS. Just open `index.html` in a browser,
or serve the folder locally:

```
cd manabox-analyzer
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

(Opening `index.html` directly via `file://` also works for this project since
there's no server-side code, but some browsers restrict `fetch()` on `file://`
pages — if the Scryfall lookup silently fails, use the local server method
instead.)

## Animation pass

On top of V1/V2, the UI now has:

- **Entrance sequence** — masthead and upload card rise in on load; the
  spade icon has a slow, subtle idle animation.
- **Count-up numbers** — every stat (summary row, mini-stats) animates from
  0 to its value with an ease-out curve instead of just appearing.
- **Animated bars** — color/type/tribal/curve bars grow from 0 with a
  staggered delay per row, instead of snapping straight to their final width.
- **Staggered card entrances** — legend cards and deck-completeness cards
  fade/rise in with a per-card delay.
- **Cross-fades** between upload → progress → dashboard stages, instead of
  an abrupt show/hide.
- **Hover polish** — legend/deck cards lift on hover, table headers show a
  sort-direction arrow, a custom-styled range slider for the value threshold.
- **Full-table performance note**: the full card table intentionally does
  *not* stagger individual rows (it can hold thousands) — it gets a single
  quick fade on refresh instead, to stay smooth on large collections.
- Everything above respects `prefers-reduced-motion` — set that OS/browser
  preference and all of this collapses to instant, no-animation state.

## Deploying to GitHub Pages

1. Push this folder to a GitHub repo (either at the repo root, or in a `/docs`
   folder — your choice).
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch."
4. Pick your branch (e.g. `main`) and the folder (`/root` or `/docs` to match
   step 1).
5. Save. GitHub will give you a URL like
   `https://yourusername.github.io/your-repo-name/` — that's it, no CI/build
   step required since everything is static.

Any time you push changes to that branch, the live site updates automatically
within a minute or two.

## How it works

1. **Upload** — `js/parse.js` reads your ManaBox CSV with PapaParse and
   normalizes the columns (ManaBox has changed header names slightly across
   export versions, so this matches against a list of accepted aliases rather
   than assuming exact column names).
2. **Enrich** — `js/scryfall.js` batches your cards (75 at a time, using the
   Scryfall ID ManaBox already includes when available) against Scryfall's
   `/cards/collection` endpoint to pull mana cost, type line, color identity,
   keywords, rarity, and current market price. Results are cached in
   `localStorage`, so re-uploading the same collection later skips
   re-fetching anything already known.
3. **Analyze** — `js/analyze.js` computes every stat block (pip counts, curve
   buckets, tribal density, etc.) as pure functions over the merged data.
4. **Render** — `js/render.js` + `js/app.js` draw the dashboard and handle all
   the interactive bits (tabs, search, sort, filters). `js/animate.js` holds
   the shared animation helpers (count-up numbers, bar growth, staggered
   entrances, cross-fades) — everything there checks
   `prefers-reduced-motion` and skips straight to the final state if it's set.

## V1 feature list

- Color pip distribution + color identity breakdown
- Basic fixing/ramp inventory (dual lands, fetches, mana rocks, ramp spells,
  mana dorks — via oracle-text pattern matching)
- Mana curve histogram, filterable by color
- Card type composition (creature/instant/sorcery/etc.)
- Creature vs. noncreature ratio
- Keyword ability frequency
- Creature type (tribal) density table, searchable
- Legendary creature list with color identity + Commander legality, searchable
- Full collection table: search, sort by any column, filter by color/rarity
- Summary stats: unique cards, total cards, binders, estimated value,
  unmatched rows

## V2 feature list

- **Binder roles** — tag each binder as "Deck" or "Storage" (auto-guessed from
  the name, e.g. "White"/"Lands" guess storage; overrides are saved in
  `localStorage` and persist across re-uploads).
- **Free pool view** — everything not locked into a deck-tagged binder, with
  its own summary stats and color-identity breakdown.
- **Cards-per-binder breakdown**, as a bar chart.
- **Duplicate-across-decks flag** — card names that appear in more than one
  deck-tagged binder (heuristic: with only the CSV to go on, this can't
  distinguish "you own two copies" from "you're double-counting the same
  physical card" — it's a prompt to check, not a hard conflict).
- **Deck completeness cards** — per deck-tagged binder: total cards, land
  count, ramp/fixing count, average CMC, and flags for common structural
  issues (low land count, low ramp, high curve, incomplete deck). Deliberately
  does not attempt removal or win-condition detection — that's V3's job, where
  oracle-text tagging can get real accuracy work instead of a rushed heuristic.
- **Value panel** — total value, an adjustable bulk-vs-real threshold slider,
  value by binder, and a top-25 most valuable cards table.
- **Expanded full-table filters** — search, color, rarity, type, binder, and
  CMC min/max, all combinable.

## Known limitations (by design, for V1/V2)

- **Fixing/ramp detection is heuristic**, based on oracle text patterns — it
  will miss unusually-worded effects and occasionally over- or under-count.
- **Unmatched rows**: cards ManaBox exported with a name/set Scryfall can't
  resolve (misprints, some promos, non-English cards in edge cases) show up
  as "Unmatched" in the table rather than being silently dropped.
- **No persistence beyond the Scryfall cache and binder roles** — the
  dashboard itself rebuilds from the CSV each time you upload.
- **Duplicate-across-decks is a flag, not ground truth** — the CSV only knows
  binder assignments, not decklists, so it can't tell intentional multiples
  from accidental double-tagging.

## Roadmap

- **V3** — interaction tagging (removal/ramp/draw/wipe/recursion/sac-outlet
  detection), synergy clustering, export-over-time comparison, CSV/Archidekt
  export.
