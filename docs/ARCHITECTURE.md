# System Architecture & Tech Stack — Jain Temple Finder

Last updated: 2026-07-03

## 1. Summary

Jain Temple Finder is a **static, client-only web app** — there is no application
server. All logic runs in the visitor's browser, which talks directly to a small
set of third-party public APIs. This keeps hosting cost at zero and the codebase
small (3 files today, plus a planned Firebase addition).

## 2. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Structure/markup | Plain HTML5 (`index.html`) | No framework needed for a single-screen app |
| Styling | Plain CSS (`style.css`), CSS variables for theming | No build step required |
| App logic | Vanilla JavaScript (`app.js`), no bundler/transpiler | Keeps the "clone and open in a browser" simplicity |
| Map rendering | [Leaflet.js](https://leafletjs.com/) 1.9.4 (via CDN) | Lightweight, no API key, works with OSM tiles out of the box |
| Map tiles | OpenStreetMap tile servers | Free, no key required |
| Geocoding (place name → coordinates) | [Nominatim](https://nominatim.org/) (OpenStreetMap) | Free, no key, matches the OSM-first data philosophy |
| Place data (temples, Dadabaris, etc.) | [Overpass API](https://overpass-api.de/) querying OpenStreetMap | Free, queryable by tag, no key |
| Community submissions *(planned)* | [Firebase Firestore](https://firebase.google.com/) | Generous free tier, no server to run, browser SDK works without a bundler via CDN/ES modules |
| Hosting | [GitHub Pages](https://pages.github.com/) | Free static hosting, deploys straight from the `main` branch |
| CI/CD | GitHub's built-in **Pages build and deployment** workflow | Runs automatically on every push to `main`, no custom pipeline authored |
| Source control | Git + GitHub (`jainviyom/jain-temple-finder`) | — |

Nothing in this stack requires a paid tier at the project's current scale.

## 3. High-level architecture

```
                                   ┌─────────────────────────┐
                                   │        Visitor's         │
                                   │        browser            │
                                   │  (index.html/app.js/css) │
                                   └────────────┬─────────────┘
                                                │
                ┌───────────────────────────────┼────────────────────────────────┐
                │                               │                                │
                ▼                               ▼                                ▼
     ┌─────────────────────┐        ┌─────────────────────┐        ┌─────────────────────────┐
     │      Nominatim        │        │     Overpass API      │        │  Firebase Firestore       │
     │  (place name search)  │        │  (place/POI queries)  │        │  (planned: community      │
     │                        │        │                        │        │   submissions, read+write)│
     └─────────────────────┘        └───────────┬─────────────┘        └─────────────────────────┘
                                                  │
                                                  ▼
                                     ┌─────────────────────────┐
                                     │   OpenStreetMap dataset    │
                                     │  (community-maintained)    │
                                     └─────────────────────────┘

     Hosting: GitHub Pages serves index.html / app.js / style.css as static files.
     Deployment: git push to `main` → GitHub's Pages workflow builds & deploys automatically.
```

There is no origin server the maintainer runs or pays for — every arrow above is
a direct browser-to-third-party-API call.

## 4. Component breakdown

- **`index.html`** — page structure: search form, radius/category selects,
  category legend, map container, results list, donation footer.
- **`style.css`** — all visual styling; CSS custom properties (`--accent`, `--bg`,
  etc.) centralize the color palette.
- **`app.js`** — all behavior:
  - `CATEGORIES` config: for each category (temple, Dadabari, Upashray, Panjrapole),
    defines its Overpass tag filter(s), which OSM element types to query
    (node/way/relation), a display emoji/label, and a `test()` function used to
    classify raw OSM tags back into a category.
  - `geocodePlace()` — calls Nominatim to turn a typed place name into coordinates.
  - `buildOverpassQuery()` / `runOverpassQuery()` / `queryJainPlaces()` — build and
    run one Overpass query **per category** (not one giant combined query — see
    §5 for why), with a one-time automatic retry on timeout, and per-category
    graceful degradation so one slow category doesn't block the others.
  - `renderResults()` — draws map markers and the results list from the merged,
    distance-sorted place list.
  - `classify()` / `detectDenomination()` — post-process raw OSM tags into a
    category and an optional Digambar/Shwetambar/Sthanakvasi badge.

## 5. Key design decisions & constraints

- **Case-sensitive regex, not `,i`**: Overpass's case-insensitive regex flag
  (`~"...",i`) is dramatically slower than listing both capitalizations in a
  plain alternation, and was observed to time out at larger radii. All name
  matching (Dadabari, Upashray, Panjrapole) spells out both cases instead.
- **Per-category queries, not one union query**: an early version combined all
  categories into a single Overpass query with many union branches; this timed
  out under load. Each category now runs as its own smaller, faster query, and
  a failure in one category doesn't prevent the others from returning results —
  the UI reports which category (if any) timed out.
- **No API keys anywhere in the current stack**: Nominatim and Overpass are used
  key-free under their fair-use policies. This is appropriate for the project's
  current scale (a friends/community network) but would need revisiting —
  e.g. a paid Overpass instance or self-hosting — if usage grew significantly.
- **Firebase config is not a secret**: when the community-submission feature
  ships, the `firebaseConfig` object (apiKey, projectId, etc.) will be visible
  in the client bundle by design — Firebase's actual access control is enforced
  server-side via Firestore **security rules**, not by hiding the config.

## 6. Deployment flow

1. Developer commits and pushes to `main` on `jainviyom/jain-temple-finder`.
2. GitHub's built-in Pages workflow (`pages build and deployment`) triggers
   automatically — no custom GitHub Actions YAML is authored for this.
3. It builds the static files and deploys them to `https://jainviyom.github.io/jain-temple-finder/`.
4. Typical end-to-end deploy time is under a minute; first-time deploys have
   occasionally needed a retry due to a transient "Deployment failed, try again
   later" error from GitHub's Pages service — pushing an empty commit re-triggers it.

## 7. Known scale limits (free tiers in use)

| Service | Free-tier limit (approximate) | Notes |
|---|---|---|
| Nominatim | ~1 request/second, fair use | Fine for interactive single-user searches |
| Overpass API (overpass-api.de) | No hard published quota, but shared/rate-limited and slows under load | Query design (§5) mitigates most timeout risk |
| GitHub Pages | 100 GB bandwidth/month (soft), 1 GB site size | Nowhere close to being hit at current scale |
| Firebase Firestore *(planned)* | 50K reads/day, 20K writes/day, 1 GiB storage | Ample for a community-scale place list |

## 8. Security & data integrity notes

- No secrets are stored in the codebase (nothing needs to be — see §5).
- Planned Firestore rules (to be pasted into the Firebase console, not committed
  as executable infra-as-code in this repo) will:
  - allow public **read** of the submissions collection,
  - allow **create** only when submitted data matches an expected shape
    (valid category enum, name length bounds, coordinates within valid ranges),
  - disallow **update/delete** entirely from the client, so no visitor can alter
    or remove another user's or OSM's data through the app.
- All map/POI data remains subject to OpenStreetMap's ODbL license; the app
  displays the required attribution in its footer.
