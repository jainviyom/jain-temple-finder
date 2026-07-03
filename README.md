# Jain Temple Finder

A single-page web app to find Jain temples and other Jain community places near any
location — handy while traveling.

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

## Notes
- Coverage depends entirely on what's been mapped in OpenStreetMap. Well-known temples in
  major cities tend to be tagged; smaller or rural derasars, Dadabaris, Upashrays, and
  Panjrapoles may be missing or under-tagged. If you notice a gap, you can add the place
  directly on [openstreetmap.org](https://www.openstreetmap.org).
- Both Nominatim and Overpass are shared public services with fair-use rate limits — fine for
  personal use, but avoid hammering them with rapid repeated searches. Under heavy load a
  search may time out; the app retries once automatically and suggests a smaller radius if
  it still fails.
