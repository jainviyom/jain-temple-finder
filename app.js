const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

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

const map = L.map("map").setView([20.5937, 78.9629], 5); // default: India
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

let markers = L.layerGroup().addTo(map);
let centerMarker = null;

const form = document.getElementById("search-form");
const placeInput = document.getElementById("place-input");
const locateBtn = document.getElementById("locate-btn");
const radiusSelect = document.getElementById("radius-select");
const categorySelect = document.getElementById("category-select");
const statusEl = document.getElementById("status");
const resultsList = document.getElementById("results-list");
const resultCount = document.getElementById("result-count");

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

function rerunSearch() {
  if (centerMarker) {
    const { lat, lng } = centerMarker.getLatLng();
    searchNearby(lat, lng, centerMarker.__label || "this location");
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
  if (centerMarker) map.removeLayer(centerMarker);
  centerMarker = L.marker([lat, lon], {
    icon: L.divIcon({ className: "center-dot", html: "📍", iconSize: [24, 24] }),
  }).addTo(map);
  centerMarker.__label = label;
  centerMarker.bindPopup(`Center: ${label}`);
  map.setView([lat, lon], radiusToZoom(radius));

  resultsList.innerHTML = "";
  resultCount.textContent = "";

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

function renderResults(places) {
  resultsList.innerHTML = "";
  resultCount.textContent = places.length ? `(${places.length})` : "";

  if (places.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-state";
    li.textContent = "No results. Try a larger radius, a different category, or a different place.";
    resultsList.appendChild(li);
    return;
  }

  places.forEach((place) => {
    const emoji = CATEGORIES[place.category]?.emoji || "🛕";
    const categoryLabel = CATEGORIES[place.category]?.label || "Jain place";

    const marker = L.marker([place.lat, place.lon], {
      icon: L.divIcon({ className: "place-icon", html: emoji, iconSize: [24, 24] }),
    }).addTo(markers);

    const popupHtml = `<strong>${escapeHtml(place.name)}</strong>` +
      `<br>${emoji} ${escapeHtml(categoryLabel)}${place.denomination ? " · " + escapeHtml(place.denomination) : ""}` +
      (place.address ? `<br>${escapeHtml(place.address)}` : "") +
      `<br>${place.distance.toFixed(1)} km away`;
    marker.bindPopup(popupHtml);

    const li = document.createElement("li");
    li.innerHTML = `
      <span class="result-name">${emoji} ${escapeHtml(place.name)}</span>
      <span class="result-meta">
        ${escapeHtml(categoryLabel)}${place.denomination ? " · " + escapeHtml(place.denomination) : ""}
        · ${place.distance.toFixed(1)} km away${place.address ? " · " + escapeHtml(place.address) : ""}
      </span>
    `;
    li.addEventListener("click", () => {
      map.setView([place.lat, place.lon], 16);
      marker.openPopup();
    });
    resultsList.appendChild(li);
  });
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
