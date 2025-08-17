export const log = (...args) => console.log("[OO]", ...args);
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function downloadJSON(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function fmtTempC(c){ return `${Math.round(c)}°C`; }
export function fmtTempF(c){ return `${Math.round(c*9/5+32)}°F`; }

export function createSwitch(id, label, checked) {
  const wrap = document.createElement("label");
  wrap.className = "flex items-center gap-2 text-sm border rounded-md px-3 py-2";
  wrap.innerHTML = `
    <input id="${id}" type="checkbox" ${checked ? "checked" : ""} class="peer sr-only">
    <span class="inline-flex w-10 h-6 items-center rounded-full border relative
      after:content-[''] after:absolute after:left-1 after:top-1 after:w-4 after:h-4 after:rounded-full
      border-slate-300 peer-checked:bg-slate-900 peer-checked:after:translate-x-4
      after:bg-slate-300 peer-checked:after:bg-white transition"></span>
    <span>${label}</span>`;
  return wrap;
}

export function swatches(el, colors) {
  el.innerHTML = "";
  colors.forEach(c => {
    const d = document.createElement("div");
    d.className = "palette-swatch";
    d.style.background = c;
    el.appendChild(d);
  });
}
