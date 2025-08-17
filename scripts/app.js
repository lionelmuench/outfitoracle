import { log, downloadJSON, swatches } from "./utils.js";
import { loadConsent, saveConsent, collectSignals, measureClickLatency } from "./signals.js";
import { loadThreeImages, analyzeColors, analyzeImageTags } from "./images.js";
import { geolocate, geocodeCity, fetchWeather, renderWeather } from "./weather.js";
import { chooseTemplate, imageInfluence, buildOutfit, reasonText } from "./decision.js";

const SESSION_KEY = "wardrobe_sessions_v1";
const CATALOG_URL = "data/clothing_catalog_v2.json"; // relative for GitHub Pages subpaths

let catalog = null;
let consent = loadConsent();
let images = [];
let imageChoiceStart = 0;
let weatherState = null;
let step = 1;

const $ = s => document.querySelector(s);

async function init() {
  console.log("Outfit Oracle debug");
  await loadCatalog();
  mountConsentUI();
  bindUI();
  goTo(1);
}

async function loadCatalog() {
  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error("Failed to load catalog JSON");
  catalog = await res.json();
  console.log("Catalog", { items: catalog.items.length, templates: catalog.outfit_templates.length });
}

function setStepUI(n) {
  document.querySelectorAll("#steps [data-step]").forEach(el => {
    el.classList.toggle("step-active", Number(el.dataset.step) === n);
  });
  $("#section-intro").classList.toggle("hidden", n !== 1);
  $("#section-weather").classList.toggle("hidden", n !== 2);
  $("#section-images").classList.toggle("hidden", n !== 3);
  $("#section-result").classList.toggle("hidden", n !== 4);
}

function goTo(n) {
  step = n;
  setStepUI(step);
  if (step === 3) {
    // load images only when entering step 3
    loadThreeImages($("#image-grid")).then(arr => {
      images = arr;
      imageChoiceStart = performance.now();
    });
  }
  if (step === 4) {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }
}

/* consent + settings */
function mountConsentUI() {
  const toggles = [
    { key:"collectAnalytics", label:"Analytics (click latency)", def:true },
    { key:"collectBattery", label:"Battery (if supported)", def:false },
    { key:"collectGeolocation", label:"Geolocation for local weather", def:false },
    { key:"analyzeImages", label:"Image ML tags (optional)", def:true },
  ];

  const row = $("#consent-row");
  row.innerHTML = "";
  toggles.forEach(t => row.appendChild(createSwitch(`consent-${t.key}`, t.label, consent[t.key] ?? t.def)));

  const settingsWrap = $("#settings-toggles");
  settingsWrap.innerHTML = "";
  toggles.forEach(t => settingsWrap.appendChild(createSwitch(`settings-${t.key}`, t.label, consent[t.key] ?? t.def)));
}

function createSwitch(id, label, checked) {
  const wrap = document.createElement("label");
  wrap.className = "flex items-center gap-3 text-sm border rounded-md px-3 py-2";
  wrap.innerHTML = `
    <input id="${id}" type="checkbox" ${checked ? "checked" : ""} class="peer sr-only">
    <span class="inline-flex w-10 h-6 items-center rounded-full border relative
      after:content-[''] after:absolute after:left-1 after:top-1 after:w-4 after:h-4 after:rounded-full
      border-slate-300 peer-checked:bg-slate-900 peer-checked:after:translate-x-4
      after:bg-slate-300 peer-checked:after:bg-white transition"></span>
    <span>${label}</span>`;
  setTimeout(() => {
    const input = wrap.querySelector("input");
    input.addEventListener("change", () => {
      const key = id.includes("settings-") ? id.replace("settings-","") : id.replace("consent-","");
      consent[key] = input.checked;
      saveConsent(consent);
      console.log("Consent updated:", consent);
    });
  }, 0);
  return wrap;
}

/* bindings */
function bindUI() {
  $("#btn-settings").addEventListener("click", () => $("#settings-modal").showModal());
  $("#close-settings").addEventListener("click", () => $("#settings-modal").close());

  $("#btn-reset").addEventListener("click", () => {
    localStorage.removeItem(SESSION_KEY);
    alert("Cleared saved sessions.");
  });

  $("#btn-export").addEventListener("click", () => {
    const sessions = JSON.parse(localStorage.getItem(SESSION_KEY) || "[]");
    downloadJSON(`wardrobe_sessions_${new Date().toISOString().slice(0,10)}.json`, sessions);
  });

  $("#btn-start").addEventListener("click", onStart);
  $("#btn-weather-next").addEventListener("click", () => goTo(3));
  $("#btn-shuffle").addEventListener("click", async () => {
    images = await loadThreeImages($("#image-grid"));
    imageChoiceStart = performance.now();
  });
  $("#btn-use-geo").addEventListener("click", onUseGeo);
  $("#btn-city-search").addEventListener("click", onCitySearch);

  $("#image-grid").addEventListener("click", async (e) => {
    const img = e.target.closest("img");
    if (!img) return;
    try { await onChooseImage(img); }
    catch (err) {
      console.error("Choose image failed", err);
      alert("Something went wrong while analyzing. Try Shuffle.");
    }
  });

  $("#btn-try-again").addEventListener("click", () => {
    goTo(3);
  });
}

/* step 1 -> 2 */
async function onStart() {
  const sig = await collectSignals(consent);
  console.log("Signals:", sig);
  // optional: auto-geo if allowed
  if (consent.collectGeolocation) {
    try {
      const { lat, lon } = await geolocate();
      weatherState = await fetchWeather(lat, lon);
      renderWeather($("#weather-readout"), weatherState, "Using your location");
    } catch (e) {
      console.warn("Geolocation failed:", e);
    }
  }
  goTo(2);
}

/* weather handlers */
async function onUseGeo() {
  try {
    const { lat, lon } = await geolocate();
    weatherState = await fetchWeather(lat, lon);
    renderWeather($("#weather-readout"), weatherState, "Using your location");
  } catch (e) {
    alert("Couldn’t get your location.");
  }
}
async function onCitySearch() {
  const q = $("#city-input").value.trim();
  if (!q) return;
  try {
    const { lat, lon, name, country } = await geocodeCity(q);
    weatherState = await fetchWeather(lat, lon);
    renderWeather($("#weather-readout"), weatherState, `${name}, ${country}`);
  } catch {
    alert("City not found.");
  }
}

/* step 3 -> 4 */
async function onChooseImage(imgEl) {
  const latency = measureClickLatency(imageChoiceStart);
  const col = analyzeColors(imgEl);
  let tags = [];
  try { tags = await analyzeImageTags(imgEl, consent); }
  catch { tags = []; } // extra guard

  const chosen = { url: imgEl.src, colors: [col.avg, ...col.palette].slice(0,4), luminance: col.luminance, tags };
  $("#img-debug").textContent = `Latency: ${latency} ms • Colors: ${chosen.colors.join(", ")} • Tags: ${tags.join(", ") || "—"}`;

  if (!weatherState) {
    $("#weather-readout").textContent = "Tip: add weather (Use my location or search a city) for better picks.";
  }

  const influence = imageInfluence(chosen);
  const tpl = chooseTemplate(catalog, weatherState, {}, null);
  const outfit = buildOutfit(catalog, tpl, weatherState, influence, {});

  renderRecommendation(tpl, outfit, chosen, latency, influence);
  saveSession(latency, chosen, outfit, tpl);
  goTo(4);
}

function renderRecommendation(template, outfit, chosen, latency, influence) {
  const card = $("#rec-card");
  const why = $("#why-card");
  const palRow = $("#palette-row");
  const palette = catalog.color_palettes.find(p => p.id === outfit.paletteId) || catalog.color_palettes[0];

  const lines = [];
  for (const [role, arr] of Object.entries(outfit.items)) {
    (arr || []).forEach((id, idx) => {
      lines.push(`<div class="flex items-start gap-2"><span class="text-xs uppercase tracking-wide text-slate-500">${role}${arr.length>1?` ${idx+1}`:""}</span><span class="font-medium">${pretty(id)}</span></div>`);
    });
  }
  card.innerHTML = `
    <div class="card">
      <div class="text-xs text-slate-500 mb-1">${template.name}</div>
      ${lines.length ? lines.join("") : `<div class="text-sm">Couldn’t pick items for all slots — try Shuffle.</div>`}
      <div class="mt-3 text-xs text-slate-500">Palette: <span class="font-medium">${palette.name}</span></div>
    </div>
  `;
  why.textContent = reasonText(weatherState, influence, latency);
  swatches(palRow, (palette.colors || []).slice(0,5));
}

function pretty(id) {
  return id.replaceAll("_"," ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/ (Neutral|Style|Performance|Maternity|Adaptive|Modest)$/i, " ($1)");
}

function saveSession(latency, chosen, outfit, template) {
  const sessions = JSON.parse(localStorage.getItem(SESSION_KEY) || "[]");
  const session = {
    version: "2.0",
    ts: new Date().toISOString(),
    weather: weatherState?.today || null,
    images: { chosen, shown: images.map(i => i.url) },
    engine: { template_id: template.id, palette_id: outfit.paletteId },
    recommendation: outfit.items,
    why: $("#why-card").textContent
  };
  sessions.push(session);
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
  console.log("Saved session:", session);
}

init().catch(err => {
  console.error("Init error", err);
  alert("Failed to initialize app. Check console.");
});
