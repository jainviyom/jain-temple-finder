const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

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
    setStatus(`Found "${label}". Searching for temples…`);
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
      setStatus("Searching for temples near you…");
      await searchNearby(latitude, longitude, "your location");
    },
    (err) => {
      setStatus(`Couldn't get your location: ${err.message}`, true);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
});

radiusSelect.addEventListener("change", () => {
  if (centerMarker) {
    const { lat, lng } = centerMarker.getLatLng();
    searchNearby(lat, lng, centerMarker.__label || "this location");
  }
});

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
    const temples = await queryJainTemples(lat, lon, radius);
    renderResults(temples, lat, lon);
    if (temples.length === 0) {
      setStatus(`No Jain temples found in OpenStreetMap within ${radius / 1000} km of ${label}.`);
    } else {
      setStatus(`Found ${temples.length} Jain temple${temples.length === 1 ? "" : "s"} near ${label}.`);
    }
  } catch (err) {
    setStatus(err.message, true);
  }
}

async function queryJainTemples(lat, lon, radius) {
  const query = `
    [out:json][timeout:25];
    (
      node["amenity"="place_of_worship"]["religion"="jain"](around:${radius},${lat},${lon});
      way["amenity"="place_of_worship"]["religion"="jain"](around:${radius},${lat},${lon});
      relation["amenity"="place_of_worship"]["religion"="jain"](around:${radius},${lat},${lon});
    );
    out center tags;
  `;

  const res = await fetch(OVERPASS_URL, {
    method: "POST",
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error("Temple search failed (Overpass API error). Try again shortly.");
  const data = await res.json();

  return data.elements
    .map((el) => {
      const elLat = el.lat ?? el.center?.lat;
      const elLon = el.lon ?? el.center?.lon;
      if (elLat == null || elLon == null) return null;
      const tags = el.tags || {};
      return {
        id: `${el.type}/${el.id}`,
        name: tags.name || tags["name:en"] || "Unnamed Jain temple",
        lat: elLat,
        lon: elLon,
        address: buildAddress(tags),
        distance: haversineDistance(lat, lon, elLat, elLon),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distance - b.distance);
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

function renderResults(temples, originLat, originLon) {
  resultsList.innerHTML = "";
  resultCount.textContent = temples.length ? `(${temples.length})` : "";

  if (temples.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-state";
    li.textContent = "No results. Try a larger radius or a different place.";
    resultsList.appendChild(li);
    return;
  }

  temples.forEach((temple) => {
    const marker = L.marker([temple.lat, temple.lon]).addTo(markers);
    const popupHtml = `<strong>${escapeHtml(temple.name)}</strong>` +
      (temple.address ? `<br>${escapeHtml(temple.address)}` : "") +
      `<br>${temple.distance.toFixed(1)} km away`;
    marker.bindPopup(popupHtml);

    const li = document.createElement("li");
    li.innerHTML = `
      <span class="result-name">${escapeHtml(temple.name)}</span>
      <span class="result-meta">${temple.distance.toFixed(1)} km away${temple.address ? " · " + escapeHtml(temple.address) : ""}</span>
    `;
    li.addEventListener("click", () => {
      map.setView([temple.lat, temple.lon], 16);
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
