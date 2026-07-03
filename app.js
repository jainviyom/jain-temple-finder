const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const FAVORITES_KEY = "jtf_favorites_v1";

// TODO: replace with your real UPI ID (e.g. "yourname@okhdfcbank") before sharing —
// this placeholder will not accept payments.
const DONATION_UPI_ID = "your-upi-id@upi";

// Note: Overpass's case-insensitive regex flag ("~...",i) is dramatically slower
// than a case-sensitive alternation over both capitalizations, and times out at
// larger radii. So name matches are spelled out in both cases instead of using ",i".
// osmTypes is trimmed to what each category realistically maps to in OSM — fewer
// union branches keeps each category's Overpass query fast.
const CATEGORIES = {
  temple: {
    label: "Temple / Derasar",
    emoji: "🛕",
    filters: ['["amenity"="place_of_worship"]["religion"="jain"]'],
    osmTypes: ["node", "way", "relation"],
    test: (tags) => tags.amenity === "place_of_worship" && tags.religion === "jain",
  },
  dadabari: {
    label: "Dadabari",
    emoji: "🙏",
    filters: ['["amenity"="place_of_worship"]["name"~"Dadabari|dadabari|Dadawadi|dadawadi"]'],
    osmTypes: ["node", "way"],
    test: (tags) => /dadabari|dadawadi/i.test(tags.name || ""),
  },
  upashray: {
    label: "Upashray / Sthanak",
    emoji: "📿",
    filters: ['["amenity"="place_of_worship"]["name"~"Upashray|upashray|Upasray|upasray|Sthanak|sthanak"]'],
    osmTypes: ["node", "way"],
    test: (tags) => /upashray|upasray|sthanak/i.test(tags.name || ""),
  },
  panjrapole: {
    label: "Panjrapole / Goshala",
    emoji: "🐄",
    filters: [
      '["amenity"]["name"~"Panjrapole|panjrapole|Pinjrapole|pinjrapole|Pinjarapole|pinjarapole|Goshala|goshala"]',
    ],
    osmTypes: ["node", "way"],
    test: (tags) => /panjrapole|pinjrapole|pinjarapole|goshala/i.test(tags.name || ""),
  },
};

// Supplementary "near this place" lookups, triggered from a marker's popup rather
// than the main category filter — these are a fixed small radius around one chosen
// place, not a primary search category.
const AMENITY_QUERIES = {
  vegFood: {
    label: "Vegetarian food",
    emoji: "🍽️",
    radius: 3000,
    build: (lat, lon, radius) => `
      [out:json][timeout:25];
      (
        node["amenity"="restaurant"]["diet:vegetarian"="only"](around:${radius},${lat},${lon});
        node["amenity"="restaurant"]["diet:vegan"="only"](around:${radius},${lat},${lon});
      );
      out center tags;
    `,
  },
  dharamshala: {
    label: "Dharamshala",
    emoji: "🛏️",
    radius: 5000,
    build: (lat, lon, radius) => `
      [out:json][timeout:25];
      (
        node["tourism"="guest_house"]["name"~"Dharamshala|dharamshala|Dharmashala|dharmashala"](around:${radius},${lat},${lon});
        way["tourism"="guest_house"]["name"~"Dharamshala|dharamshala|Dharmashala|dharmashala"](around:${radius},${lat},${lon});
      );
      out center tags;
    `,
  },
};

const map = L.map("map").setView([20.5937, 78.9629], 5); // default: India
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

let markers = L.layerGroup().addTo(map);
let amenityMarkers = L.layerGroup().addTo(map);
let centerMarker = null;
let savedMarker = null;
let lastPlaces = [];
let placeMarkersByEntry = [];
let currentView = "results";

const form = document.getElementById("search-form");
const placeInput = document.getElementById("place-input");
const locateBtn = document.getElementById("locate-btn");
const radiusSelect = document.getElementById("radius-select");
const categorySelect = document.getElementById("category-select");
const statusEl = document.getElementById("status");
const resultsList = document.getElementById("results-list");
const resultCount = document.getElementById("result-count");
const savedCountEl = document.getElementById("saved-count");
const resultsTabBtn = document.getElementById("tab-results");
const savedTabBtn = document.getElementById("tab-saved");
const donateLink = document.getElementById("donate-link");
const upiIdDisplay = document.getElementById("upi-id-display");

donateLink.href = `upi://pay?pa=${encodeURIComponent(DONATION_UPI_ID)}&pn=${encodeURIComponent(
  "Jain Temple Finder"
)}&cu=INR`;
upiIdDisplay.textContent = DONATION_UPI_ID;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = placeInput.value.trim();
  if (!query) return;
  try {
    setStatus("Locating place…");
    const { lat, lon, label } = await geocodePlace(query);
    setStatus(`Found "${label}". Searching…`);
    await searchNearby(lat, lon, label);
  } catch (err) {
    setStatus(err.message, true);
  }
});

locateBtn.addEventListener("click", () => {
  if (!navigator.geolocation) {
    setStatus("Geolocation isn't supported by this browser.", true);
    return;
  }
  setStatus("Getting your location…");
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const { latitude, longitude } = pos.coords;
      setStatus("Searching near you…");
      await searchNearby(latitude, longitude, "your location");
    },
    (err) => {
      setStatus(`Couldn't get your location: ${err.message}`, true);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

radiusSelect.addEventListener("change", () => rerunSearch());
categorySelect.addEventListener("change", () => rerunSearch());
resultsTabBtn.addEventListener("click", () => switchView("results"));
savedTabBtn.addEventListener("click", () => switchView("saved"));

function rerunSearch() {
  if (centerMarker) {
    const { lat, lng } = centerMarker.getLatLng();
    searchNearby(lat, lng, centerMarker.__label || "this location");
  }
}

function switchView(view) {
  currentView = view;
  resultsTabBtn.classList.toggle("active", view === "results");
  savedTabBtn.classList.toggle("active", view === "saved");
  if (view === "results") {
    renderResultsList();
  } else {
    renderSaved();
  }
}

async function geocodePlace(query) {
  const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Place lookup failed. Try again.");
  const data = await res.json();
  if (!data.length) throw new Error(`Couldn't find "${query}". Try a different search.`);
  return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), label: data[0].display_name };
}

async function searchNearby(lat, lon, label) {
  const radius = parseInt(radiusSelect.value, 10);
  const category = categorySelect.value;

  markers.clearLayers();
  amenityMarkers.clearLayers();
  if (savedMarker) {
    map.removeLayer(savedMarker);
    savedMarker = null;
  }
  if (centerMarker) map.removeLayer(centerMarker);
  centerMarker = L.marker([lat, lon], {
    icon: L.divIcon({ className: "center-dot", html: "📍", iconSize: [24, 24] }),
  }).addTo(map);
  centerMarker.__label = label;
  centerMarker.bindPopup(`Center: ${label}`);
  map.setView([lat, lon], radiusToZoom(radius));

  try {
    const { places, failedCategories } = await queryJainPlaces(lat, lon, radius, category);
    renderResults(places);
    const categoryLabel = category === "all" ? "Jain places" : CATEGORIES[category].label;
    let message;
    if (places.length === 0) {
      message = `No ${categoryLabel} found in OpenStreetMap within ${radius / 1000} km of ${label}.`;
    } else {
      message = `Found ${places.length} ${categoryLabel}${places.length === 1 ? "" : "s"} near ${label}.`;
    }
    if (failedCategories.length) {
      message += ` (${failedCategories.join(", ")} search timed out — try a smaller radius for full results.)`;
    }
    setStatus(message, failedCategories.length > 0 && places.length === 0);
  } catch (err) {
    setStatus(err.message, true);
  }
}

// Each category runs as its own small Overpass query rather than one giant union —
// keeps individual queries fast and lets other categories still return results if
// one category's query times out.
function buildOverpassQuery(lat, lon, radius, categoryKey) {
  const cat = CATEGORIES[categoryKey];
  const clauses = [];
  cat.filters.forEach((filter) => {
    cat.osmTypes.forEach((type) => {
      clauses.push(`${type}${filter}(around:${radius},${lat},${lon});`);
    });
  });
  return `[out:json][timeout:25];(${clauses.join("")});out center tags;`;
}

function classify(tags, fallbackCategory) {
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    if (cat.test(tags)) return key;
  }
  return fallbackCategory === "all" ? "temple" : fallbackCategory;
}

function detectDenomination(tags) {
  const haystack = `${tags.denomination || ""} ${tags.name || ""}`.toLowerCase();
  if (haystack.includes("digambar")) return "Digambar";
  if (haystack.includes("svetambar") || haystack.includes("shwetambar") || haystack.includes("swetambar")) return "Shwetambar";
  if (haystack.includes("sthanakvasi")) return "Sthanakvasi";
  return null;
}

async function runOverpassQuery(query, { retriesLeft }) {
  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) {
    if (retriesLeft > 0) return runOverpassQuery(query, { retriesLeft: retriesLeft - 1 });
    throw new Error("Search failed (Overpass API error). Try again shortly.");
  }
  const data = await res.json();
  if (data.remark && /timed out/i.test(data.remark)) {
    if (retriesLeft > 0) return runOverpassQuery(query, { retriesLeft: retriesLeft - 1 });
    throw new Error("Search timed out under current load — try a smaller radius or try again shortly.");
  }
  return data;
}

async function queryJainPlaces(lat, lon, radius, category) {
  const keys = category === "all" ? Object.keys(CATEGORIES) : [category];
  const seen = new Set();
  const places = [];
  const failedCategories = [];

  for (const key of keys) {
    const query = buildOverpassQuery(lat, lon, radius, key);
    let data;
    try {
      data = await runOverpassQuery(query, { retriesLeft: 1 });
    } catch (err) {
      failedCategories.push(CATEGORIES[key].label);
      continue;
    }

    data.elements.forEach((el) => {
      const id = `${el.type}/${el.id}`;
      if (seen.has(id)) return;
      seen.add(id);

      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (elLat == null || elLon == null) return;
      const tags = el.tags || {};
      places.push({
        id,
        name: tags.name || tags["name:en"] || "Unnamed",
        category: classify(tags, key),
        denomination: detectDenomination(tags),
        lat: elLat,
        lon: elLon,
        address: buildAddress(tags),
        distance: haversineDistance(lat, lon, elLat, elLon),
      });
    });
  }

  places.sort((a, b) => a.distance - b.distance);
  return { places, failedCategories };
}

function buildAddress(tags) {
  const parts = [
    tags["addr:housenumber"],
    tags["addr:street"],
    tags["addr:suburb"],
    tags["addr:city"],
    tags["addr:state"],
  ].filter(Boolean);
  return parts.join(", ");
}

// ---------- Rendering: map markers + the "Results" tab list ----------

function renderResults(places) {
  lastPlaces = places;
  markers.clearLayers();
  amenityMarkers.clearLayers();
  resultCount.textContent = places.length ? `(${places.length})` : "";

  placeMarkersByEntry = places.map((place) => ({ place, marker: createPlaceMarker(place) }));

  if (currentView === "results") renderResultsList();
}

function createPlaceMarker(place) {
  const emoji = CATEGORIES[place.category]?.emoji || "🛕";
  const categoryLabel = CATEGORIES[place.category]?.label || "Jain place";

  const marker = L.marker([place.lat, place.lon], {
    icon: L.divIcon({ className: "place-icon", html: emoji, iconSize: [24, 24] }),
  }).addTo(markers);

  marker.bindPopup(buildPlacePopupHtml(place, emoji, categoryLabel));
  marker.on("popupopen", () => attachPopupAmenityHandlers(marker, place));
  return marker;
}

function buildPlacePopupHtml(place, emoji, categoryLabel) {
  return (
    `<strong>${escapeHtml(place.name)}</strong>` +
    `<br>${emoji} ${escapeHtml(categoryLabel)}${place.denomination ? " · " + escapeHtml(place.denomination) : ""}` +
    (place.address ? `<br>${escapeHtml(place.address)}` : "") +
    (typeof place.distance === "number" ? `<br>${place.distance.toFixed(1)} km away` : "") +
    `<div class="popup-actions">
       <button type="button" class="popup-amenity-btn" data-kind="vegFood">🍽️ Veg food nearby</button>
       <button type="button" class="popup-amenity-btn" data-kind="dharamshala">🛏️ Dharamshala nearby</button>
     </div>`
  );
}

function attachPopupAmenityHandlers(marker, place) {
  const node = marker.getPopup()?.getElement();
  if (!node) return;
  node.querySelectorAll(".popup-amenity-btn").forEach((btn) => {
    btn.onclick = () => findNearbyAmenity(place, btn.dataset.kind);
  });
}

function renderResultsList() {
  resultsList.innerHTML = "";
  if (lastPlaces.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-state";
    li.textContent = "No results. Try a larger radius, a different category, or a different place.";
    resultsList.appendChild(li);
    return;
  }

  placeMarkersByEntry.forEach(({ place, marker }) => {
    const li = buildResultLi(place);
    li.addEventListener("click", (e) => {
      if (e.target.closest(".action-btn")) return;
      map.setView([place.lat, place.lon], 16);
      marker.openPopup();
    });
    resultsList.appendChild(li);
  });
}

// ---------- Rendering: the "Saved" tab list (favorites, from localStorage) ----------

function renderSaved() {
  resultsList.innerHTML = "";
  const favorites = getFavorites();
  updateSavedCount();

  if (favorites.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-state";
    li.textContent = "No saved places yet. Tap ☆ on any result to save it here.";
    resultsList.appendChild(li);
    return;
  }

  const center = centerMarker ? centerMarker.getLatLng() : null;
  favorites
    .map((f) => ({
      ...f,
      distance: center ? haversineDistance(center.lat, center.lng, f.lat, f.lon) : undefined,
    }))
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0))
    .forEach((place) => {
      const li = buildResultLi(place);
      li.addEventListener("click", (e) => {
        if (e.target.closest(".action-btn")) return;
        showSavedMarker(place);
      });
      resultsList.appendChild(li);
    });
}

function showSavedMarker(place) {
  if (savedMarker) map.removeLayer(savedMarker);
  const emoji = CATEGORIES[place.category]?.emoji || "🛕";
  const categoryLabel = CATEGORIES[place.category]?.label || "Jain place";
  savedMarker = L.marker([place.lat, place.lon], {
    icon: L.divIcon({ className: "place-icon", html: emoji, iconSize: [26, 26] }),
  }).addTo(map);
  savedMarker.bindPopup(buildPlacePopupHtml(place, emoji, categoryLabel)).openPopup();
  savedMarker.on("popupopen", () => attachPopupAmenityHandlers(savedMarker, place));
  map.setView([place.lat, place.lon], 16);
}

// ---------- Shared result-row builder (used by both tabs) ----------

function buildResultLi(place) {
  const emoji = CATEGORIES[place.category]?.emoji || "🛕";
  const categoryLabel = CATEGORIES[place.category]?.label || "Jain place";

  const metaBits = [categoryLabel + (place.denomination ? " · " + place.denomination : "")];
  if (typeof place.distance === "number") metaBits.push(`${place.distance.toFixed(1)} km away`);
  if (place.address) metaBits.push(place.address);

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`;
  const editUrl = typeof place.id === "string" && place.id.includes("/") ? osmEditUrl(place) : null;
  const favored = isFavorite(place.id);

  const li = document.createElement("li");
  li.innerHTML = `
    <span class="result-name">${emoji} ${escapeHtml(place.name)}</span>
    <span class="result-meta">${metaBits.map(escapeHtml).join(" · ")}</span>
    <div class="result-actions">
      <a class="action-btn" href="${directionsUrl}" target="_blank" rel="noopener" title="Directions">🧭</a>
      <button type="button" class="action-btn share-btn" title="Share">🔗</button>
      ${editUrl ? `<a class="action-btn" href="${editUrl}" target="_blank" rel="noopener" title="Report a correction on OpenStreetMap">✏️</a>` : ""}
      <button type="button" class="action-btn fav-btn" title="${favored ? "Remove from saved" : "Save"}">${favored ? "★" : "☆"}</button>
    </div>
  `;

  li.querySelector(".share-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    sharePlace(place);
  });
  li.querySelector(".fav-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavorite(place);
    if (currentView === "saved") renderSaved();
    else renderResultsList();
  });

  return li;
}

function osmEditUrl(place) {
  const [type, id] = place.id.split("/");
  return `https://www.openstreetmap.org/edit?editor=id&${type}=${id}`;
}

// ---------- Favorites (localStorage — no account needed) ----------

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY)) || [];
  } catch {
    return [];
  }
}

function saveFavoritesList(list) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
}

function isFavorite(id) {
  return getFavorites().some((f) => f.id === id);
}

function toggleFavorite(place) {
  const list = getFavorites();
  const idx = list.findIndex((f) => f.id === place.id);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push({
      id: place.id,
      name: place.name,
      category: place.category,
      denomination: place.denomination,
      lat: place.lat,
      lon: place.lon,
      address: place.address,
    });
  }
  saveFavoritesList(list);
  updateSavedCount();
}

function updateSavedCount() {
  const n = getFavorites().length;
  savedCountEl.textContent = n ? `(${n})` : "";
}

// ---------- Share a single place via URL ----------

function buildShareUrl(place) {
  const params = new URLSearchParams({
    lat: place.lat.toFixed(6),
    lon: place.lon.toFixed(6),
    name: place.name,
    cat: place.category,
  });
  if (place.denomination) params.set("den", place.denomination);
  if (place.address) params.set("addr", place.address);
  return `${location.origin}${location.pathname}?${params.toString()}`;
}

async function sharePlace(place) {
  const url = buildShareUrl(place);
  if (navigator.share) {
    try {
      await navigator.share({ title: place.name, text: `${place.name} — Jain Temple Finder`, url });
      return;
    } catch (err) {
      // user cancelled the share sheet, or it's unsupported — fall through to clipboard copy
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    setStatus("Link copied to clipboard!");
  } catch (err) {
    setStatus(`Share link: ${url}`);
  }
}

function loadSharedPlaceFromUrl() {
  const params = new URLSearchParams(location.search);
  const lat = parseFloat(params.get("lat"));
  const lon = parseFloat(params.get("lon"));
  if (Number.isNaN(lat) || Number.isNaN(lon)) return;

  const name = params.get("name") || "Shared place";
  const category = CATEGORIES[params.get("cat")] ? params.get("cat") : "temple";
  const denomination = params.get("den") || null;
  const address = params.get("addr") || "";
  const emoji = CATEGORIES[category].emoji;
  const categoryLabel = CATEGORIES[category].label;

  map.setView([lat, lon], 15);
  const marker = L.marker([lat, lon], {
    icon: L.divIcon({ className: "place-icon", html: emoji, iconSize: [26, 26] }),
  }).addTo(markers);

  const popupHtml =
    buildPlacePopupHtml({ name, category, denomination, address, lat, lon }, emoji, categoryLabel) +
    `<button type="button" class="search-here-btn">Find more nearby</button>`;
  marker.bindPopup(popupHtml).openPopup();
  marker.on("popupopen", () => {
    attachPopupAmenityHandlers(marker, { name, category, denomination, address, lat, lon });
    const node = marker.getPopup()?.getElement();
    const btn = node?.querySelector(".search-here-btn");
    if (btn) btn.onclick = () => searchNearby(lat, lon, name);
  });
  setStatus(`Showing a shared place: ${name}.`);
}

// ---------- "Near this place" amenity lookups (from a marker's popup) ----------

async function findNearbyAmenity(place, kind) {
  const cfg = AMENITY_QUERIES[kind];
  if (!cfg) return;
  setStatus(`Looking for ${cfg.label.toLowerCase()} near ${place.name}…`);
  try {
    const query = cfg.build(place.lat, place.lon, cfg.radius);
    const data = await runOverpassQuery(query, { retriesLeft: 1 });
    amenityMarkers.clearLayers();

    let count = 0;
    data.elements.forEach((el) => {
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (elLat == null || elLon == null) return;
      const tags = el.tags || {};
      const name = tags.name || "Unnamed";
      const marker = L.marker([elLat, elLon], {
        icon: L.divIcon({ className: "amenity-icon", html: cfg.emoji, iconSize: [22, 22] }),
      }).addTo(amenityMarkers);
      marker.bindPopup(`<strong>${escapeHtml(name)}</strong><br>${cfg.emoji} ${escapeHtml(cfg.label)}`);
      count++;
    });

    setStatus(
      count
        ? `Found ${count} ${cfg.label.toLowerCase()} near ${place.name}.`
        : `No ${cfg.label.toLowerCase()} found near ${place.name} in OpenStreetMap.`
    );
  } catch (err) {
    setStatus(err.message, true);
  }
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function radiusToZoom(radiusMeters) {
  if (radiusMeters <= 5000) return 13;
  if (radiusMeters <= 10000) return 12;
  if (radiusMeters <= 25000) return 11;
  if (radiusMeters <= 50000) return 10;
  return 9;
}

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

updateSavedCount();
loadSharedPlaceFromUrl();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
