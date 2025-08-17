import { log } from "./utils.js";

let mobilenet = null;
let tfLoaded = false;

async function ensureMobileNet(consent) {
  if (!consent?.analyzeImages) return null;
  if (mobilenet) return mobilenet;
  try {
    if (!tfLoaded) {
      await import("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.20.0/dist/tf.min.js");
      tfLoaded = true;
    }
    // Some SES/lockdown environments break ESM import for mobilenet.
    // Try ESM first; if it throws, disable ML gracefully.
    const m = await import("https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.0");
    mobilenet = await m.load({ version: 2, alpha: 1.0 });
    log("MobileNet loaded");
    return mobilenet;
  } catch (err) {
    console.warn("MobileNet unavailable, continuing without ML:", err);
    mobilenet = null;
    return null;
  }
}

export function randomPicsumUrl(seed, w=600, h=400) {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}

function skeletonCard() {
  const s = document.createElement("div");
  s.className = "rounded-lg border border-slate-200 dark:border-slate-800 h-56 animate-pulse bg-slate-200/40 dark:bg-slate-700/30";
  return s;
}

export async function loadThreeImages(container) {
  container.innerHTML = "";
  // show three skeletons first
  const skels = [skeletonCard(), skeletonCard(), skeletonCard()];
  skels.forEach(s => container.appendChild(s));

  const promises = Array.from({length:3}, (_,i)=>{
    const seed = Math.floor(Math.random()*10_000);
    const url = randomPicsumUrl(seed);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.loading = "eager";
    img.className = "fade-in w-full h-56 object-cover rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer hover:scale-[1.01] transition";
    img.src = url;
    return new Promise((res) => {
      img.onload = () => { img.classList.add("loaded"); res({ url, element: img, seed }); };
      img.onerror = () => res({ url, element: img, seed }); // still resolve
    });
  });

  const imgs = await Promise.all(promises);
  container.innerHTML = "";
  imgs.forEach(({element}) => {
    const wrap = document.createElement("div");
    wrap.appendChild(element);
    container.appendChild(wrap);
  });
  return imgs;
}

// Color analysis (same as before)
export function analyzeColors(imgEl) {
  const cnv = document.createElement("canvas");
  const w = cnv.width = imgEl.naturalWidth || 600;
  const h = cnv.height = imgEl.naturalHeight || 400;
  const ctx = cnv.getContext("2d", { willReadFrequently: true });
  try { ctx.drawImage(imgEl, 0, 0, w, h); }
  catch { return { avg: "#888888", palette: ["#888888","#BBBBBB","#444444"], luminance: 0.5 }; }
  const data = ctx.getImageData(0, 0, w, h).data;
  let r=0,g=0,b=0, count=0;
  const palette = new Map();
  const step = Math.max(1, Math.floor((w*h)/10_000));
  for (let i=0;i<data.length;i+=4*step){
    const R=data[i],G=data[i+1],B=data[i+2];
    r+=R; g+=G; b+=B; count++;
    const key = `${R>>4}-${G>>4}-${B>>4}`;
    palette.set(key,(palette.get(key)||0)+1);
  }
  r=Math.round(r/count); g=Math.round(g/count); b=Math.round(b/count);
  const avg = `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
  const lum = (0.2126*r + 0.7152*g + 0.0722*b)/255;
  const topBins = [...palette.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k])=>{
    const [R,G,B]=k.split("-").map(v => (parseInt(v,10)<<4)+8);
    return `#${R.toString(16).padStart(2,"0")}${G.toString(16).padStart(2,"0")}${B.toString(16).padStart(2,"0")}`;
  });
  return { avg, palette: topBins, luminance: Number(lum.toFixed(2)) };
}

export async function analyzeImageTags(imgEl, consent) {
  try {
    const model = await ensureMobileNet(consent);
    if (!model) return [];
    const res = await model.classify(imgEl);
    return res.map(x => x.className.split(",")[0].trim()).slice(0,5);
  } catch (e) {
    console.warn("Tagging failed; continuing without tags.", e);
    return [];
  }
}
