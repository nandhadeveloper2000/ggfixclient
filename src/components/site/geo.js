/**
 * geo.js — the single source of truth for the visitor's chosen location.
 *
 * Two independent pieces of UI care about this value: the navbar
 * <LocationControl /> (which sets it) and the /nearby-shops page (which reads it
 * and calls /shops/nearby with it). They are never mounted in the same React
 * tree branch, so the coordinates live in localStorage and changes are broadcast
 * on a window CustomEvent rather than through context or props.
 *
 * Contract — do not change these without updating BOTH consumers:
 *   storage key   'ggfix_geo'  -> JSON { lat:number, lng:number, at:number }
 *   event name    'ggfix:geo'  -> CustomEvent, detail = the entry, or null on clear
 *
 * This module is import-safe from a server component: it declares no 'use client'
 * directive, holds no React state, and every window/localStorage access is
 * guarded. Under `output: 'export'` the whole site prerenders in Node, where
 * `window` does not exist — an unguarded access here would fail the build, not
 * just the browser.
 */

export const GEO_STORAGE_KEY = 'ggfix_geo';
export const GEO_EVENT = 'ggfix:geo';

/** True only in a real browser. Checked before every window/storage touch. */
function isBrowser() {
  return typeof window !== 'undefined';
}

/**
 * localStorage can throw on *access*, not just on read: Safari in private mode
 * and any browser with site-data blocked raise a SecurityError just for
 * touching `window.localStorage`. Everything below therefore treats storage as
 * best-effort — losing the saved location is a degraded experience, never a
 * crash, and the visitor can simply set it again.
 */
function safeStorage() {
  if (!isBrowser()) return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Coerce an unknown value into a valid geo entry, or null.
 *
 * Anything can end up under this key — a stale entry from an older build, a
 * value another script wrote, or hand-edited junk from devtools — so the shape
 * is validated on the way in AND on the way out. Note `Number.isFinite` rather
 * than a plain type check: JSON.parse happily yields NaN-producing values, and
 * NaN coordinates would sail through `typeof x === 'number'` and then poison the
 * /shops/nearby query string as `lat=NaN`.
 */
function normalize(raw) {
  if (!raw || typeof raw !== 'object') return null;

  // Accept BOTH our own {lat,lng} shape and the browser's GeolocationCoordinates,
  // which spells them `latitude`/`longitude`. Without the second pair, passing
  // `position.coords` straight in — exactly what the writeGeo docs invite, and
  // what LocationControl did — normalised to null, so every navbar "Set location"
  // press silently failed with "Couldn't get your location".
  const lat = Number(raw.lat !== undefined ? raw.lat : raw.latitude);
  const lng = Number(raw.lng !== undefined ? raw.lng : raw.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;

  const at = Number.isFinite(Number(raw.at)) ? Number(raw.at) : Date.now();
  return { lat, lng, at };
}

/**
 * Read the stored location.
 *
 * @returns {{lat:number, lng:number, at:number}|null} null when unset, when
 *   running on the server, or when the stored value is unusable.
 *
 * NEVER call this to seed useState during the first render of a client
 * component: the server renders "unset" and this would render "set", which is a
 * hydration mismatch. Seed with null and hydrate inside useEffect.
 */
export function readGeo() {
  const storage = safeStorage();
  if (!storage) return null;

  let rawText;
  try {
    rawText = storage.getItem(GEO_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!rawText) return null;

  try {
    return normalize(JSON.parse(rawText));
  } catch {
    // Corrupt JSON. Treat as unset and drop it so it cannot fail forever.
    try {
      storage.removeItem(GEO_STORAGE_KEY);
    } catch {
      /* nothing further we can do */
    }
    return null;
  }
}

/** Fire the broadcast. Wrapped because CustomEvent is browser-only. */
function emit(detail) {
  if (!isBrowser()) return;
  try {
    window.dispatchEvent(new CustomEvent(GEO_EVENT, { detail }));
  } catch {
    /* pre-CustomEvent-constructor browsers: storage still holds the truth */
  }
}

/**
 * Persist a location and notify every listener.
 *
 * @param {{lat:number, lng:number, at?:number}} coords Raw coordinates —
 *   a GeolocationCoordinates object works as-is.
 * @returns {{lat:number, lng:number, at:number}|null} the stored entry, or null
 *   if the input was not usable (in which case nothing is written or emitted).
 *
 * The event fires even when the write fails, so the UI still reflects the
 * visitor's action in this tab for as long as the page is open.
 */
export function writeGeo(coords) {
  // Hand the object to normalize as-is. The previous version re-projected it to
  // {lat, lng, at} first, which threw away `latitude`/`longitude` and made the
  // documented "a GeolocationCoordinates object works as-is" false. normalize()
  // reads either spelling and ignores any extra properties, so projecting here
  // bought nothing and silently broke the navbar's only write path.
  const entry = normalize(coords && typeof coords === 'object' ? coords : null);
  if (!entry) return null;

  const storage = safeStorage();
  if (storage) {
    try {
      storage.setItem(GEO_STORAGE_KEY, JSON.stringify(entry));
    } catch {
      /* quota / private mode — session-only location is still useful */
    }
  }

  emit(entry);
  return entry;
}

/** Forget the stored location and broadcast `null`. */
export function clearGeo() {
  const storage = safeStorage();
  if (storage) {
    try {
      storage.removeItem(GEO_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  emit(null);
}

/**
 * Subscribe to location changes.
 *
 * @param {(entry: {lat:number, lng:number, at:number}|null) => void} cb
 * @returns {() => void} unsubscribe. Safe to call on the server, where it is a
 *   no-op — so a useEffect can `return subscribe(...)` unconditionally.
 *
 * Listens on two channels:
 *  - 'ggfix:geo'  — same-tab updates from writeGeo/clearGeo.
 *  - 'storage'    — other tabs. The browser fires this only in OTHER documents,
 *                   so it never double-fires alongside the CustomEvent above.
 *                   Without it, setting a location in one tab would leave a
 *                   second open tab showing a stale "Set location" button.
 *
 * The storage branch re-reads through readGeo() rather than trusting
 * event.newValue, which re-runs validation on a payload this tab did not write.
 */
export function subscribe(cb) {
  if (!isBrowser() || typeof cb !== 'function') return () => {};

  const onCustom = (event) => {
    cb(normalize(event && event.detail));
  };

  const onStorage = (event) => {
    // key === null means the whole store was cleared (storage.clear()).
    if (event && event.key !== null && event.key !== GEO_STORAGE_KEY) return;
    cb(readGeo());
  };

  window.addEventListener(GEO_EVENT, onCustom);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(GEO_EVENT, onCustom);
    window.removeEventListener('storage', onStorage);
  };
}

/**
 * Format coordinates for display.
 *
 * Deliberately the ONLY presentation helper here, and deliberately dumb: we run
 * no reverse-geocoding service, so there is no honest way to turn these numbers
 * into "Cuddalore" or "near MG Road". Callers show this as a small muted detail
 * that reads as coordinates, never styled or labelled as an address.
 *
 * 4 decimal places ~= 11 m, which is precise enough to be recognisable and
 * coarse enough not to advertise a doorstep.
 */
export function formatGeo(entry, digits = 4) {
  const value = normalize(entry);
  if (!value) return '';
  return `${value.lat.toFixed(digits)}, ${value.lng.toFixed(digits)}`;
}
