import { log } from "./utils.js";

const CONSENT_KEY = "oo_consent_v1";

export function loadConsent() {
  const def = {
    collectAnalytics: true,
    collectBattery: false,
    collectGeolocation: false,
    analyzeImages: true
  };
  try {
    return { ...def, ...(JSON.parse(localStorage.getItem(CONSENT_KEY) || "{}")) };
  } catch { return def; }
}
export function saveConsent(c){ localStorage.setItem(CONSENT_KEY, JSON.stringify(c)); }

export async function collectSignals(consent) {
  const t0 = performance.now();
  const uaData = navigator.userAgentData?.toJSON?.() || null;
  const ua = navigator.userAgent;
  const mem = navigator.deviceMemory || null;
  const cores = navigator.hardwareConcurrency || null;
  const lang = navigator.languages || [navigator.language];
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const dpr = window.devicePixelRatio;
  const screenInfo = { w: screen.width, h: screen.height, availW: screen.availWidth, availH: screen.availHeight };
  const network = navigator.connection ? {
    downlink: navigator.connection.downlink,
    effectiveType: navigator.connection.effectiveType,
    rtt: navigator.connection.rtt
  } : null;

  // Battery (permissionless but often unsupported)
  let battery = null;
  if (consent.collectBattery && navigator.getBattery) {
    try {
      const b = await navigator.getBattery();
      battery = { charging: b.charging, level: b.level, chargingTime: b.chargingTime, dischargingTime: b.dischargingTime };
    } catch (e) { log("Battery not available", e); }
  }

  const t1 = performance.now();
  return {
    ua, uaData, mem, cores, lang, tz, dpr, screen: screenInfo, network, battery,
    visibilityStart: document.visibilityState, perfCollectMs: Math.round(t1 - t0)
  };
}

export function measureClickLatency(startTs) {
  return Math.round(performance.now() - startTs);
}
