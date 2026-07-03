# Jain Temple Finder

A single-page web app to find Jain temples and other Jain community places near any
location — handy while traveling.

**Live site:** https://jainviyom.github.io/jain-temple-finder/

For the full picture beyond this quick-start:
- [docs/BRD.md](docs/BRD.md) — business requirements: goals, scope, requirements, roadmap, risks.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — tech stack, system architecture, key design decisions.
- [docs/documentation.html](https://jainviyom.github.io/jain-temple-finder/docs/documentation.html) —
  the same content as one browsable page (source at [docs/documentation.html](docs/documentation.html)).

## Features
- Search by typed place name or device geolocation.
- Filter by category: Temple/Derasar, Dadabari, Upashray/Sthanak, Panjrapole/Goshala, or all combined.
- Denomination badges (Digambar/Shwetambar/Sthanakvasi) shown where source data has them.
- Adjustable search radius (5–100 km).
- Map + distance-sorted list, with per-category icons.
- Graceful degradation: if one category's search times out, the others still return results.
- **Directions** — one tap opens Google Maps directions to any result.
- **Report a correction** — deep-links a result straight into OpenStreetMap's editor.
- **Share a place** — copies (or native-shares) a link that reopens the app centered on that
  exact place, via `?lat=&lon=&name=&cat=` URL parameters — no server round-trip needed.
- **Saved places** — a "⭐ Saved" tab lets you star results to a personal list stored in
  `localStorage`, no account required.
- **Nearby veg food / Dharamshala** — from any result's map popup, look up nearby
  vegetarian-only restaurants or Dharamshalas (guest houses) via their own small Overpass query.
- **Installable (PWA)** — add it to your phone's home screen; the app shell is cached for
  quick loads (search results still need a live connection).
- Voluntary UPI donation link in the footer to help offset hosting/domain costs.
- *(Planned)* Community "+ New" submissions via a live database — see [docs/BRD.md](docs/BRD.md#12-roadmap).
- *(Not yet designed)* Multi-stop/route search and "verified by trust" badges — flagged as
  needing their own design pass (a routing algorithm, and a real verification mechanism,
  respectively) before being built.

## How it works
- Enter a place name (or tap "Use my location") to set a search center.
- The app geocodes the place via [Nominatim](https://nominatim.org/) (OpenStreetMap's search service).
- It then queries the [Overpass API](https://overpass-api.de/) for OSM places matching the
  selected category, within the chosen radius:
  - 🛕 **Temples / Derasar** — `amenity=place_of_worship` + `religion=jain`
  - 🙏 **Dadabari** — place of worship whose name matches "Dadabari"/"Dadawadi"
  - 📿 **Upashray / Sthanak** — place of worship whose name matches "Upashray"/"Sthanak"
  - 🐄 **Panjrapole / Goshala** — any amenity whose name matches "Panjrapole"/"Pinjrapole"/"Goshala"
  - "All Jain places" runs each category as its own query and merges the results, so one slow
    category can't block the others.
- Where OSM has denomination data, results are also tagged Digambar / Shwetambar / Sthanakvasi.
- Results are plotted on a [Leaflet](https://leafletjs.com/) map and listed by distance.

No API keys, accounts, or build step required — it's static HTML/CSS/JS.

## Running locally
```bash
cd jain-temple-finder
python3 -m http.server 8000
```
Then open http://localhost:8000 in a browser.

## Configuration
- `DONATION_UPI_ID` in [app.js](app.js) is currently a placeholder (`your-upi-id@upi`)
  and will not accept real payments until it's replaced with a real UPI ID.

## Deployment
- Hosted on GitHub Pages, deployed automatically from the `main` branch via GitHub's
  built-in "pages build and deployment" workflow — no custom CI config in this repo.
- A push to `main` triggers a redeploy automatically; it typically goes live within a minute.
- See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#6-deployment-flow) for details, including a
  known first-deploy quirk (occasional transient failure that a re-push resolves).

## Notes
- Coverage depends entirely on what's been mapped in OpenStreetMap. Well-known temples in
  major cities tend to be tagged; smaller or rural derasars, Dadabaris, Upashrays, and
  Panjrapoles may be missing or under-tagged. If you notice a gap, you can add the place
  directly on [openstreetmap.org](https://www.openstreetmap.org).
- Both Nominatim and Overpass are shared public services with fair-use rate limits — fine for
  personal use, but avoid hammering them with rapid repeated searches. Under heavy load a
  search may time out; the app retries once automatically and suggests a smaller radius if
  it still fails.
