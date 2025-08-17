import { log, clamp } from "./utils.js";

// Pick a template based on catalog rules + weather + day/time
export function chooseTemplate(catalog, weather, userProfile = {}, activity = null) {
  const weekday = new Date().getDay() || 7; // 1-7
  const hour = new Date().getHours();

  // Weather-driven nudges
  const tMax = weather?.today?.temp_c_max ?? 20;
  const precip = weather?.today?.precip_mm ?? 0;
  const uv = weather?.today?.uv_index ?? 5;
  const wind = weather?.today?.wind_kph ?? 0;

  const ruleBias = new Set();

  // Base layering rules
  if (tMax <= -10) ruleBias.add("winter_layered");
  else if (tMax <= 5) ruleBias.add("winter_layered");
  else if (precip >= 2) ruleBias.add("rain_day_commute");
  else if (tMax >= 24 && uv >= 7) ruleBias.add("summer_breeze");

  // Weekday bias
  if (weekday <= 5) ruleBias.add("work_smart_casual");
  else ruleBias.add("weekend_street");

  // Profile constraints
  if (userProfile?.maternity) ruleBias.add("maternity_casual");
  if (userProfile?.adaptive_needs) ruleBias.add("adaptive_comfort");
  if (userProfile?.modest_required) ruleBias.add("modest_smart");

  // Activity override
  if (activity === "beach") ruleBias.add("beach_day");
  if (activity === "cycling") ruleBias.add("cycling_kit");
  if (activity === "skiing") ruleBias.add("ski_day");
  if (activity === "festival") ruleBias.add("festival_rave");

  // Pick first matching template that exists
  const all = new Map(catalog.outfit_templates.map(t => [t.id, t]));
  for (const id of ruleBias) if (all.has(id)) return all.get(id);
  // fallback
  return catalog.outfit_templates[0];
}

// Turn chosen image analysis into palette/aesthetic hints
export function imageInfluence(chosen) {
  const warm = (hex) => {
    const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    // simple hue-ish heuristic
    return (r > g && r > b) || (r>150 && g>100);
  };
  const warmCount = (chosen.colors || []).filter(warm).length;
  const paletteHint = warmCount >= 2 ? "warm" : "cool";
  const aestheticHint = (chosen.tags||[]).some(t => /beach|sea|palm|surf|boat/.test(t)) ? "coastal"
                       : (chosen.tags||[]).some(t => /snow|mountain|ski|ice/.test(t)) ? "gorpcore"
                       : (chosen.tags||[]).some(t => /city|street|car|building/.test(t)) ? "streetwear"
                       : null;
  return { paletteHint, aestheticHint };
}

// Pick concrete items for each slot from catalog items
export function buildOutfit(catalog, template, weather, influence, constraints={}) {
  const tMax = weather?.today?.temp_c_max ?? 20;
  const itemsByName = new Map(catalog.items.map(i => [i.id, i]));
  // Build a fast lookup from base name -> variants
  const variantsByBase = new Map();
  for (const it of catalog.items) {
    const base = it.id.replace(/_(neutral|style|performance|maternity|adaptive|modest)$/, "");
    if (!variantsByBase.has(base)) variantsByBase.set(base, []);
    variantsByBase.get(base).push(it);
  }

  function pickVariant(allowedBases) {
    const pool = [];
    for (const base of allowedBases) {
      const variants = variantsByBase.get(base) || [];
      // filter by warmth, and flags if required
      const candidates = variants.filter(v => {
        const w = v.warmth_c || {};
        const okWarm = tMax >= (w.min ?? -50) && tMax <= (w.max ?? 60);
        const okModest = constraints.modest_required ? v.modest_required || true : true;
        const okAdaptive = constraints.adaptive_friendly ? (v.adaptive_friendly || true) : true;
        const okMaternity = constraints.maternity_friendly ? (v.maternity_friendly || true) : true;
        return okWarm && okModest && okAdaptive && okMaternity;
      });
      pool.push(...candidates);
    }
    if (!pool.length) return null;
    // prefer style or neutral randomly
    pool.sort((a,b)=> (a.id.includes("_style")? -1:0) - (b.id.includes("_style")? -1:0));
    return pool[Math.floor(Math.random()*pool.length)];
  }

  const chosen = {};
  for (const slot of template.slots) {
    const v = pickVariant(slot.allowed);
    if (!v && slot.optional) continue;
    if (!v) continue; // skip if truly nothing
    const roleKey = slot.role; // top/bottom/dress/outerwear/footwear/accessory/uniform/swimwear
    if (!chosen[roleKey]) chosen[roleKey] = [];
    chosen[roleKey].push(v.id);
  }

  // Palette pick: bias to catalog palettes by influence
  const palettes = catalog.color_palettes;
  let paletteId = palettes[0]?.id || "neutrals";
  const wanted = (template.palettes || []).slice();
  if (influence.paletteHint === "warm") wanted.unshift("autumn","summer","tropical","warm");
  if (influence.paletteHint === "cool") wanted.unshift("coastal","winter","cool");
  const match = palettes.find(p => wanted.includes(p.id));
  if (match) paletteId = match.id;

  return { items: chosen, paletteId };
}

export function reasonText(weather, influence, clickLatencyMs) {
  const bits = [];
  const tMax = weather?.today?.temp_c_max;
  if (typeof tMax === "number") {
    if (tMax <= 5) bits.push("cold temps");
    else if (tMax <= 15) bits.push("cool weather");
    else if (tMax >= 26) bits.push("hot day");
  }
  const precip = weather?.today?.precip_mm || 0;
  if (precip >= 2) bits.push("rain chance");
  const uv = weather?.today?.uv_index || 0;
  if (uv >= 7) bits.push("high UV");

  if (influence.aestheticHint) bits.push(`${influence.aestheticHint} vibe from your image`);
  if (clickLatencyMs < 2000) bits.push("decisive pick");
  else if (clickLatencyMs > 10000) bits.push("took your time");

  if (!bits.length) return "Balanced pick based on today’s weather and your image.";
  return bits.join(" · ") + ".";
}
