import { log } from "./utils.js";

export async function geolocate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation unsupported"));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      err => reject(err),
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 }
    );
  });
}

export async function geocodeCity(name) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`;
  const r = await fetch(url);
  const j = await r.json();
  if (!j.results || !j.results.length) throw new Error("City not found");
  const c = j.results[0];
  return { lat: c.latitude, lon: c.longitude, name: c.name, country: c.country_code };
}

export async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + `&current=temperature_2m,apparent_temperature,precipitation,relative_humidity_2m,wind_speed_10m,uv_index`
    + `&daily=temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_sum,wind_speed_10m_max&forecast_days=1&timezone=auto`;
  const r = await fetch(url);
  const j = await r.json();
  const daily = j.daily;
  const cur = j.current;
  return {
    source: "open-meteo",
    location: { lat, lon },
    today: {
      temp_c_max: daily?.temperature_2m_max?.[0],
      temp_c_min: daily?.temperature_2m_min?.[0],
      uv_index: daily?.uv_index_max?.[0],
      precip_mm: daily?.precipitation_sum?.[0] || 0,
      wind_kph: (daily?.wind_speed_10m_max?.[0] || 0) * 3.6
    },
    current: {
      temp_c: cur?.temperature_2m,
      feels_c: cur?.apparent_temperature,
      precip_mm: cur?.precipitation || 0,
      rh: cur?.relative_humidity_2m,
      wind_kph: cur?.wind_speed_10m * 3.6,
      uv_index: cur?.uv_index
    }
  };
}

export function renderWeather(el, w, label="") {
  if (!w) { el.textContent = "—"; return; }
  const t = w.today;
  const c = w.current;
  el.innerHTML = `
    <div class="text-sm">
      ${label ? `<div class="mb-1">${label}</div>` : ""}
      <div><span class="font-medium">Max:</span> ${Math.round(t.temp_c_max)}°C / ${Math.round(t.temp_c_max*9/5+32)}°F</div>
      <div><span class="font-medium">Min:</span> ${Math.round(t.temp_c_min)}°C / ${Math.round(t.temp_c_min*9/5+32)}°F</div>
      <div><span class="font-medium">Precip:</span> ${t.precip_mm.toFixed(1)} mm</div>
      <div><span class="font-medium">UV:</span> ${Math.round(t.uv_index)}</div>
      <div><span class="font-medium">Wind:</span> ${Math.round(t.wind_kph)} km/h</div>
    </div>`;
}
