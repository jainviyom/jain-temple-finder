# Jain Temple Finder

A single-page web app to find Jain temples (derasars) near any location — handy while traveling.

## How it works
- Enter a place name (or tap "Use my location") to set a search center.
- The app geocodes the place via [Nominatim](https://nominatim.org/) (OpenStreetMap's search service).
- It then queries the [Overpass API](https://overpass-api.de/) for OSM points tagged
  `amenity=place_of_worship` + `religion=jain` within the chosen radius.
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
  major cities tend to be tagged; smaller or rural derasars may be missing. If you notice a
  gap, you can add the temple directly on [openstreetmap.org](https://www.openstreetmap.org).
- Both Nominatim and Overpass are shared public services with fair-use rate limits — fine for
  personal use, but avoid hammering them with rapid repeated searches.
