// ===== Road to Osaka – Running weather (Geolocation + Open-Meteo API) =====
// Open-Meteo is free and needs no API key: https://open-meteo.com

const DEFAULT_CITY = { name: "Seoul", lat: 37.5665, lon: 126.978 };
const WEATHER_CACHE_KEY = "rto-weather";
const CACHE_MINUTES = 30;

// WMO weather codes -> label and icon
const WEATHER_CODES = {
  0: ["Clear sky", "☀️"],
  1: ["Mainly clear", "🌤️"],
  2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"], 48: ["Fog", "🌫️"],
  51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌧️"],
  56: ["Freezing drizzle", "🌧️"], 57: ["Freezing drizzle", "🌧️"],
  61: ["Light rain", "🌦️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
  66: ["Freezing rain", "🌧️"], 67: ["Freezing rain", "🌧️"],
  71: ["Light snow", "🌨️"], 73: ["Snow", "🌨️"], 75: ["Heavy snow", "❄️"], 77: ["Snow grains", "🌨️"],
  80: ["Rain showers", "🌦️"], 81: ["Rain showers", "🌧️"], 82: ["Heavy showers", "⛈️"],
  85: ["Snow showers", "🌨️"], 86: ["Snow showers", "❄️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm with hail", "⛈️"], 99: ["Thunderstorm with hail", "⛈️"],
};

// ---------- Location ----------

// Resolves to { name, lat, lon } — falls back to Seoul if location is denied or unavailable
function getLocation() {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve({ ...DEFAULT_CITY, fallback: true });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ name: "Your location", lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve({ ...DEFAULT_CITY, fallback: true }),
      { timeout: 8000, maximumAge: 10 * 60 * 1000 }
    );
  });
}

// ---------- Weather API ----------

async function fetchWeather(lat, lon) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: lat.toFixed(3),
    longitude: lon.toFixed(3),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
    timezone: "auto",
  });

  const response = await fetch(url);
  if (!response.ok) throw new Error("Weather request failed: " + response.status);
  const data = await response.json();
  return data.current;
}

// Cache so the API is not called on every page load
function readCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY));
    if (cached && Date.now() - cached.savedAt < CACHE_MINUTES * 60 * 1000) return cached;
  } catch (err) {
    /* ignore broken cache */
  }
  return null;
}

function writeCache(place, current) {
  localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ place, current, savedAt: Date.now() }));
}

// ---------- Is it a good day to run? ----------

function runningRating(w) {
  const feels = w.apparent_temperature;
  const rain = w.precipitation;
  const wind = w.wind_speed_10m;
  const code = w.weather_code;

  if (code >= 95) return { level: "bad", text: "Thunderstorm – run indoors or wait it out." };
  if (feels >= 32) return { level: "bad", text: "Very hot – skip hard sessions and drink plenty of water." };
  if (feels <= -10) return { level: "bad", text: "Very cold – keep it short or run on a treadmill." };
  if (rain >= 2 || wind >= 40) return { level: "bad", text: "Heavy rain or strong wind – consider moving your run." };

  if (rain > 0) return { level: "ok", text: "Light rain – fine for an easy run, wear a cap." };
  if (feels >= 25) return { level: "ok", text: "Warm – run early or late and slow your pace a little." };
  if (feels <= 0) return { level: "ok", text: "Cold – wear layers, gloves and warm up well." };
  if (wind >= 25) return { level: "ok", text: "Windy – start into the wind and finish with it behind you." };

  return { level: "good", text: "Great running weather – enjoy your run!" };
}

// ---------- Display ----------

function renderWeather(box, place, w, savedAt) {
  const [desc, icon] = WEATHER_CODES[w.weather_code] || ["Unknown", "🌡️"];
  const rating = runningRating(w);
  const time = new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  box.innerHTML = `
    <div class="weather-main">
      <div class="weather-icon" aria-hidden="true">${icon}</div>
      <div>
        <div class="weather-temp">${Math.round(w.temperature_2m)}°C</div>
        <div class="weather-desc"></div>
      </div>
    </div>
    <div class="weather-details">
      <div>Feels like<strong>${Math.round(w.apparent_temperature)}°C</strong></div>
      <div>Humidity<strong>${Math.round(w.relative_humidity_2m)}%</strong></div>
      <div>Wind<strong>${Math.round(w.wind_speed_10m)} km/h</strong></div>
    </div>
    <div class="run-rating ${rating.level}"></div>
    <p class="weather-source"></p>
  `;
  // Text parts set with textContent
  box.querySelector(".weather-desc").textContent = `${desc} · ${place.name}`;
  box.querySelector(".run-rating").textContent = rating.text;
  box.querySelector(".weather-source").textContent =
    `Updated ${time} · Open-Meteo` + (place.fallback ? " · Location off, showing Seoul" : "");
}

function renderWeatherError(box) {
  box.innerHTML = '<p class="stat-label">Weather is unavailable right now.</p>';
  const retry = document.createElement("button");
  retry.className = "btn btn-outline";
  retry.style.marginTop = "10px";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => loadWeather(true));
  box.append(retry);
}

async function loadWeather(skipCache = false) {
  const box = document.getElementById("weather");
  if (!box) return;

  const cached = skipCache ? null : readCache();
  if (cached) {
    renderWeather(box, cached.place, cached.current, cached.savedAt);
    return;
  }

  box.innerHTML = '<p class="stat-label">Loading weather…</p>';
  try {
    const place = await getLocation();
    const current = await fetchWeather(place.lat, place.lon);
    writeCache(place, current);
    renderWeather(box, place, current, Date.now());
  } catch (err) {
    console.error(err);
    renderWeatherError(box);
  }
}

document.addEventListener("DOMContentLoaded", () => loadWeather());