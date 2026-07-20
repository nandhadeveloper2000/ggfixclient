'use client';

/**
 * NearbyShops — the live, client-side half of /nearby-shops.
 *
 * WHY THIS IS A CLIENT COMPONENT
 * next.config.js sets `output: 'export'` in production, so there is no server at
 * request time and no SSR data fetching. Everything below runs in the browser,
 * inside useEffect, after hydration.
 *
 * WHAT THE BACKEND ACTUALLY RETURNS  (verified against the live service)
 *   GET /shops
 *     [{ id, name, slug, address, latitude, longitude, isOpen }]
 *   GET /shops/nearby?lat=&lng=&radiusKm=
 *     the same shape PLUS distanceKm (float)
 * That is the WHOLE DTO. There is no rating, no review count, no photo, no city,
 * no phone number, no opening hours and no service list. Nothing in this file
 * may render a field that is not in that list — a plausible-looking "4.8 ★" or
 * "Open until 8pm" would be fabricated, and the cards are deliberately sparse
 * instead.
 *
 * DESIGNED FOR A NEARLY-EMPTY DATABASE
 * There are two shops on the platform today. One, two or three cards is the
 * NORMAL case here, not a degenerate one, so the list is a centred max-w-4xl
 * two-column grid rather than a wide three-up grid that would leave an obvious
 * hole. A single result collapses to one centred column.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Compass,
  LocateFixed,
  MapPin,
  Navigation,
  Store,
  X,
} from 'lucide-react';

import { SHOP_BASE } from '@/lib/api';
import { Button, cx } from '@/components/site/ui';
import { clearGeo, readGeo, subscribe, writeGeo } from '@/components/site/geo';
import { NEARBY } from '@/lib/siteContent';

/* -------------------------------------------------------------------------- */
/* Transport                                                                   */
/* -------------------------------------------------------------------------- */
/**
 * These two endpoints are fetched directly rather than through `shopApi`.
 *
 * This is a deliberate deviation and worth reading before "fixing" it. The brief
 * asked for `shopApi.get(path, { skipAuthRedirect: true })`, but src/lib/api.js
 * (which is in the MUST-NOT-MODIFY list) declares:
 *
 *     get: (path) => request(SHOP_BASE(), path)
 *
 * — a one-argument function. A second `{ skipAuthRedirect: true }` argument is
 * silently dropped on the floor, so it would look correct at the call site and
 * do nothing. `request()` then attaches any `admin_token` in localStorage and,
 * on a 401/403, deletes that token and `window.location.assign('/login')`s.
 *
 * On a PUBLIC marketing page that is a real bug: an admin with an expired token
 * who browses to /nearby-shops would be silently signed out and thrown at the
 * login screen by a page that never needed auth in the first place. Both
 * endpoints are unauthenticated and CORS-open, so the correct fix is to send no
 * credentials at all. SHOP_BASE() is still imported from api.js, so the base URL
 * stays in exactly one place and env changes still flow through.
 *
 * If api.js ever grows an options passthrough on shopApi.get, this can become
 * `shopApi.get(path, { skipAuthRedirect: true })` with no other change.
 */
async function getShops(path, signal) {
  const base = String(SHOP_BASE() || '').replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, {
    signal,
    // No Authorization header, and credentials stay omitted: this is public data
    // and a stale admin session must not be able to affect (or be affected by) it.
    credentials: 'omit',
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`shop directory responded ${res.status}`);

  const data = await res.json();
  // A malformed body is a backend failure, not something to render around.
  if (!Array.isArray(data)) throw new Error('shop directory returned an unexpected body');
  return data;
}

/**
 * True when this page is on HTTPS but the shop service is plain HTTP.
 *
 * The backend is http:// on a bare IP. The moment this site is served over
 * HTTPS the browser blocks the request as mixed content BEFORE it leaves the
 * page — the fetch rejects with a bare TypeError and no status. Detecting the
 * combination lets the error state say something true and specific instead of
 * blaming the visitor's connection, and guarantees the failure surfaces as a
 * designed state rather than a spinner that never resolves.
 */
function isMixedContentBlocked() {
  if (typeof window === 'undefined') return false;
  try {
    return (
      window.location.protocol === 'https:' &&
      String(SHOP_BASE() || '').startsWith('http:')
    );
  } catch {
    return false;
  }
}

/**
 * Why geolocation cannot work here, or null if it should.
 *
 * `isSecureContext` is the one that actually bites in production. This site is
 * served over plain HTTP on a bare IP, and every modern browser refuses
 * geolocation on an insecure origin — Chrome does not even prompt, it invokes
 * the error callback with code 1 (PERMISSION_DENIED). Without this check that
 * code lands in the 'denied' branch below and we tell the visitor the
 * permission "was declined" and they can "allow location later", which is false
 * twice over: they declined nothing, and no browser setting can grant it on
 * this origin. localhost is exempt from the secure-origin rule, so this never
 * trips in development — which is exactly why it has to be handled explicitly
 * instead of discovered after deployment.
 *
 * LocationControl in the navbar already does this; keeping the two in step
 * means the same visitor cannot be told two different stories about the same
 * browser on the same page load.
 */
function detectGeoUnavailable() {
  if (typeof window === 'undefined') return null;
  if (typeof navigator === 'undefined' || !navigator.geolocation) return 'unsupported';
  if (window.isSecureContext === false) return 'insecure';
  return null;
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                  */
/* -------------------------------------------------------------------------- */
/**
 * The API sends distanceKm as a raw float — 0.9478635306185756. Rendering that
 * verbatim would be absurd, and rendering "0.9 km" for everything under a
 * kilometre throws away the only precision that actually matters to someone
 * deciding whether to walk.
 *
 *   < 1 km   -> metres, snapped to 10 m   (0.9478… -> "950 m")
 *   < 10 km  -> one decimal               (4.23    -> "4.2 km")
 *   >= 10 km -> whole kilometres          (18.7    -> "19 km")
 *
 * Returns null for anything non-finite, so a missing distanceKm renders no badge
 * rather than "NaN km".
 */
function formatDistance(km) {
  const value = Number(km);
  if (!Number.isFinite(value) || value < 0) return null;
  if (value < 1) return `${Math.max(10, Math.round((value * 1000) / 10) * 10)} m`;
  if (value < 10) return `${value.toFixed(1)} km`;
  return `${Math.round(value)} km`;
}

/** A Google Maps directions URL, built from the latitude/longitude we really have. */
function directionsHref(shop) {
  const lat = Number(shop && shop.latitude);
  const lng = Number(shop && shop.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

/** Stable React key. `id` should always be there; fall back rather than crash. */
function shopKey(shop, index) {
  return (shop && (shop.id || shop.slug)) || `shop-${index}`;
}

/* -------------------------------------------------------------------------- */
/* Presentational pieces                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The list wrapper. Column count is chosen from the RESULT COUNT, not from the
 * viewport alone, so a one- or two-shop list reads as composed instead of as a
 * three-up grid with holes in it.
 */
function ShopGrid({ count, children }) {
  return (
    <ul
      // list-style:none + display:grid makes WebKit drop list semantics, so the
      // explicit role is not redundant — without it VoiceOver stops announcing
      // "list, N items".
      role="list"
      className={cx(
        'mx-auto mt-10 grid list-none gap-5 p-0',
        count <= 1 ? 'max-w-xl' : 'max-w-4xl sm:grid-cols-2',
      )}
    >
      {children}
    </ul>
  );
}

/** Open / closed. Rendered ONLY when isOpen is a real boolean. */
function OpenPill({ isOpen }) {
  if (typeof isOpen !== 'boolean') return null;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide',
        isOpen
          ? 'bg-brand-soft text-brand-700'
          : 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
      )}
    >
      <span
        className={cx(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          isOpen ? 'bg-brand-600' : 'bg-slate-400',
        )}
        aria-hidden="true"
      />
      {isOpen ? NEARBY.openLabel : NEARBY.closedLabel}
    </span>
  );
}

function ShopCard({ shop }) {
  const name = (shop && shop.name) || 'GGFIX shop';
  const address = (shop && shop.address) || null;
  const distance = formatDistance(shop && shop.distanceKm);
  const maps = directionsHref(shop);

  return (
    <li className="h-full">
      <article
        className={cx(
          'flex h-full flex-col rounded-3xl border border-brand-line bg-white p-6 shadow-soft',
          'transition hover:border-brand-200 hover:shadow-lift motion-safe:hover:-translate-y-0.5',
        )}
      >
        <div className="flex items-start gap-4">
          {/* A neutral store mark, not an invented logo or initials-as-branding:
              these shops have no uploaded image in the API and faking one would
              read as a real brand asset. */}
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-700"
            aria-hidden="true"
          >
            <Store className="h-6 w-6" />
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold leading-snug tracking-tight text-brand-ink">
              {/* break-words: shop names are user-entered and can be one long
                  unbroken string, which would otherwise push the card wide and
                  scroll the whole page sideways at 360px. */}
              <span className="break-words">{name}</span>
            </h3>

            {distance ? (
              <p className="mt-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-accent-700">
                  <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
                  {distance} away
                </span>
              </p>
            ) : null}
          </div>
        </div>

        {address ? (
          <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-brand-muted">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
            <span className="min-w-0 break-words">{address}</span>
          </p>
        ) : null}

        {/* mt-auto pins the footer row to the bottom so cards of differing
            address length still line their pills up across the row. */}
        <div className="mt-auto flex flex-wrap items-center gap-3 pt-6">
          <OpenPill isOpen={shop && shop.isOpen} />

          {maps ? (
            <a
              href={maps}
              target="_blank"
              rel="noopener noreferrer"
              className={cx(
                'ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold',
                'text-brand-700 transition hover:bg-brand-soft',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2',
              )}
            >
              <Compass className="h-4 w-4" aria-hidden="true" />
              Directions
              <span className="sr-only"> to {name} (opens in a new tab)</span>
            </a>
          ) : null}
        </div>
      </article>
    </li>
  );
}

/**
 * Loading skeletons.
 *
 * Deliberately the same outer shape and roughly the same height as a real
 * ShopCard (icon block, two text lines, footer row), so results swapping in
 * causes no layout shift. Three of them, which is the top of the realistic
 * result range.
 */
function ShopSkeletons() {
  return (
    <ul
      role="list"
      aria-hidden="true"
      className="mx-auto mt-10 grid max-w-4xl list-none gap-5 p-0 sm:grid-cols-2"
    >
      {[0, 1, 2].map((index) => (
        <li key={index}>
          <div className="rounded-3xl border border-brand-line bg-white p-6 shadow-soft">
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 shrink-0 rounded-2xl bg-brand-soft motion-safe:animate-pulse" />
              <div className="min-w-0 flex-1">
                <div className="h-5 w-2/3 rounded-full bg-brand-soft motion-safe:animate-pulse" />
                <div className="mt-3 h-5 w-24 rounded-full bg-slate-100 motion-safe:animate-pulse" />
              </div>
            </div>
            <div className="mt-4 h-4 w-full rounded-full bg-slate-100 motion-safe:animate-pulse" />
            <div className="mt-2 h-4 w-1/2 rounded-full bg-slate-100 motion-safe:animate-pulse" />
            <div className="mt-6 h-7 w-28 rounded-full bg-slate-100 motion-safe:animate-pulse" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Shared shell for every non-list state, so they all sit on the same footprint. */
function StatePanel({ tone = 'brand', icon: Icon, title, body, children }) {
  return (
    <div className="mx-auto mt-10 max-w-2xl rounded-3xl border border-brand-line bg-white p-8 text-center shadow-soft sm:p-10">
      {Icon ? (
        <span
          className={cx(
            'inline-flex h-14 w-14 items-center justify-center rounded-2xl',
            tone === 'accent' ? 'bg-accent-soft text-accent-600' : 'bg-brand-soft text-brand-700',
          )}
        >
          <Icon className="h-7 w-7" aria-hidden="true" />
        </span>
      ) : null}
      <h3 className="mt-5 text-xl font-bold tracking-tight text-brand-ink sm:text-2xl">{title}</h3>
      {body ? (
        <p className="mx-auto mt-3 max-w-prose text-base leading-relaxed text-brand-muted">{body}</p>
      ) : null}
      {children ? (
        <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
          {children}
        </div>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export default function NearbyShops({ className }) {
  /* Coordinates. Seeded null on purpose and hydrated in an effect: readGeo()
     during the first render would disagree with the prerendered HTML (which
     always says "unset") and throw a hydration mismatch. */
  const [geo, setGeo] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [shops, setShops] = useState([]);
  const [mode, setMode] = useState('all'); // which query produced `shops`
  const [errorKind, setErrorKind] = useState(null); // 'network' | 'mixed-content'

  /* Geolocation permission outcome, separate from `errorKind`: a declined
     permission is not a failure of the page, and the shop list still renders. */
  // 'denied' | 'unavailable' | 'unsupported' | 'insecure'
  const [geoError, setGeoError] = useState(null);
  const [locating, setLocating] = useState(false);

  /* Set when the visitor, having been told there is nothing within the radius,
     asks to see the whole directory anyway. Reset whenever the location moves. */
  const [showAllAnyway, setShowAllAnyway] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  /* Guards every setState that follows an await. Without it, navigating away
     mid-request warns and, worse, resurrects state on a dead tree. */
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const radiusKm = Number(NEARBY.radiusKm) || 20;

  /* -- hydrate + stay in sync with the navbar ------------------------------ */
  useEffect(() => {
    setGeo(readGeo());
    setHydrated(true);

    // Surface a blocked-at-the-origin situation up front rather than waiting for
    // the visitor to press a button that cannot succeed. Runs after mount, not
    // during render: `isSecureContext` does not exist during the prerender, so
    // reading it in render would make the first client pass disagree with the
    // static HTML.
    setGeoError(detectGeoUnavailable());

    // subscribe() covers both the same-tab 'ggfix:geo' CustomEvent and the
    // cross-tab 'storage' event, so setting the location in the header updates
    // this page live with no reload.
    return subscribe((entry) => {
      if (!aliveRef.current) return;
      setGeo(entry);
      // A new location invalidates both the "show everything anyway" escape
      // hatch and any stale permission complaint.
      setShowAllAnyway(false);
      setGeoError(null);
    });
  }, []);

  /* -- fetch --------------------------------------------------------------- */
  const useNearby = Boolean(geo) && !showAllAnyway;

  useEffect(() => {
    if (!hydrated) return undefined; // don't fire the "all shops" query before we know the location

    const controller = new AbortController();
    let cancelled = false;

    setStatus('loading');
    setErrorKind(null);

    const path = useNearby
      ? `/shops/nearby?lat=${encodeURIComponent(geo.lat)}&lng=${encodeURIComponent(
          geo.lng,
        )}&radiusKm=${encodeURIComponent(radiusKm)}`
      : '/shops';

    getShops(path, controller.signal)
      .then((rows) => {
        if (cancelled || !aliveRef.current) return;
        // Sort ascending by distance. The API already returns nearest-first, but
        // ordering is presentation and this page owns it; entries missing a
        // distance sink to the bottom instead of jumping to the front via NaN.
        const sorted = useNearby
          ? [...rows].sort((a, b) => {
              const left = Number(a && a.distanceKm);
              const right = Number(b && b.distanceKm);
              if (!Number.isFinite(left)) return 1;
              if (!Number.isFinite(right)) return -1;
              return left - right;
            })
          : rows;

        setShops(sorted);
        setMode(useNearby ? 'nearby' : 'all');
        setStatus('ready');
      })
      .catch((error) => {
        // An abort is this component tearing down its own request, not a failure.
        if (cancelled || !aliveRef.current) return;
        if (error && error.name === 'AbortError') return;

        // Never surface `error.message` — it is a stack-adjacent string like
        // "Failed to fetch" or "shop directory responded 502", which tells a
        // visitor nothing and reads as a broken site.
        setErrorKind(isMixedContentBlocked() ? 'mixed-content' : 'network');
        setStatus('error');
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // `geo` is read only when useNearby is true; including the primitives keeps
    // the effect honest without re-firing on an identity-only change.
  }, [hydrated, useNearby, geo && geo.lat, geo && geo.lng, radiusKm, retryCount]);

  /* -- actions ------------------------------------------------------------- */

  const requestLocation = useCallback(() => {
    // Re-checked on every press, not just at hydration: `isSecureContext` is
    // fixed for the document, but reading it here keeps the button honest even
    // if this ever gets called before the hydrate effect has run.
    const blocked = detectGeoUnavailable();
    if (blocked) {
      setGeoError(blocked);
      return;
    }

    setGeoError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!aliveRef.current) return;
        setLocating(false);
        // writeGeo persists AND broadcasts, so the navbar control updates too.
        // The subscribe() handler above is what actually moves this page's
        // state — deliberately one path in, so both consumers can never drift.
        const stored = writeGeo({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          at: Date.now(),
        });
        // Defensive: if the coordinates failed validation nothing was broadcast,
        // so nothing would ever clear `locating`/update the list.
        if (!stored) setGeoError('unavailable');
      },
      (error) => {
        if (!aliveRef.current) return;
        setLocating(false);
        // 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
        setGeoError(error && error.code === 1 ? 'denied' : 'unavailable');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  const forgetLocation = useCallback(() => {
    setGeoError(null);
    clearGeo(); // broadcasts null; the subscription clears `geo` for us
  }, []);

  const retry = useCallback(() => setRetryCount((n) => n + 1), []);

  /* -- derived ------------------------------------------------------------- */

  /* Geolocation can never succeed on this origin/browser, so the button that
     asks for it is disabled rather than left as a trap. A denial or a timeout is
     NOT in here — those are retryable and the button stays live. */
  const geoBlocked = geoError === 'insecure' || geoError === 'unsupported';

  const showingNearby = mode === 'nearby' && status === 'ready';
  const isEmptyWithinRadius = showingNearby && shops.length === 0;

  const listHeading = useMemo(() => {
    if (showingNearby) {
      return {
        title: `Within ${radiusKm} km of you`,
        body: NEARBY.dataNote,
      };
    }
    return {
      // Honest label: this is the whole directory, not a proximity result.
      title: NEARBY.allShopsTitle,
      body: NEARBY.allShopsBody,
    };
  }, [showingNearby, radiusKm]);

  /* -- render -------------------------------------------------------------- */

  return (
    <div className={className}>
      {/* ---- Location control bar ----------------------------------------- */}
      <div className="mx-auto max-w-3xl rounded-3xl border border-brand-line bg-white p-6 shadow-soft sm:p-8">
        <div className="flex flex-col items-center gap-5 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-700">
            <LocateFixed className="h-6 w-6" aria-hidden="true" />
          </span>

          {/* Until hydration finishes we cannot know whether a location is set,
              so both branches would be wrong. Render the neutral prompt copy —
              it matches the prerendered HTML exactly, so hydration is clean. */}
          {hydrated && geo ? (
            <>
              <p className="text-base font-semibold text-brand-ink">
                Using your location to sort shops by distance.
              </p>
              <p className="text-sm leading-relaxed text-brand-muted">{NEARBY.permissionHint}</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  onClick={requestLocation}
                  variant="outline"
                  icon="Navigation"
                  disabled={locating || geoBlocked}
                >
                  {locating ? 'Locating…' : NEARBY.ctaLabelRetry}
                </Button>
                <button
                  type="button"
                  onClick={forgetLocation}
                  className={cx(
                    'inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold',
                    'text-brand-muted transition hover:bg-brand-soft hover:text-brand-700',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2',
                  )}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  {NEARBY.clearLabel}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-brand-ink">
                Share your location to see the closest shops first.
              </p>
              <p className="text-sm leading-relaxed text-brand-muted">{NEARBY.permissionHint}</p>
              <Button
                onClick={requestLocation}
                variant="primary"
                icon="Navigation"
                disabled={locating || geoBlocked}
              >
                {locating ? 'Locating…' : NEARBY.ctaLabel}
              </Button>
            </>
          )}

          {/* Permission outcome. Not an error state — the directory below still
              renders in full, so this is an inline note rather than a takeover. */}
          {geoError ? (
            <p
              role="status"
              className="mt-1 max-w-prose rounded-2xl bg-accent-soft px-4 py-3 text-sm leading-relaxed text-accent-700"
            >
              {geoError === 'denied' ? (
                <>
                  <strong className="font-bold">{NEARBY.deniedTitle}.</strong> {NEARBY.deniedBody}
                </>
              ) : geoError === 'insecure' ? (
                <>
                  <strong className="font-bold">
                    Location sharing needs a secure (https) connection.
                  </strong>{' '}
                  This page is not served over https yet, so your browser will not share a position
                  here — that is on us, not a setting you can change. Every GGFIX shop is listed
                  below instead.
                </>
              ) : geoError === 'unsupported' ? (
                <>
                  <strong className="font-bold">This browser cannot share a location.</strong> Every
                  GGFIX shop is listed below instead.
                </>
              ) : (
                <>
                  <strong className="font-bold">We could not read your location.</strong> Your device
                  did not return a position in time. Every GGFIX shop is listed below — you can try
                  again any time.
                </>
              )}
            </p>
          ) : null}
        </div>
      </div>

      {/* ---- Results ------------------------------------------------------- */}
      {/* aria-live so a screen reader hears the list change when the location is
          set from the navbar without any navigation happening. */}
      <div className="mt-12" aria-live="polite" aria-busy={status === 'loading'}>
        {status === 'loading' ? (
          <>
            <p className="text-center text-sm font-semibold uppercase tracking-widest text-brand-muted">
              {NEARBY.loadingLabel}
            </p>
            <ShopSkeletons />
          </>
        ) : status === 'error' ? (
          <StatePanel
            tone="accent"
            icon={AlertTriangle}
            title={NEARBY.errorTitle}
            body={
              errorKind === 'mixed-content'
                ? 'This page is served securely over HTTPS, but the shop directory is still on an unsecured address, so your browser blocked the request. This is on us, not on you — we are moving the directory to HTTPS.'
                : NEARBY.errorBody
            }
          >
            <Button onClick={retry} variant="primary" icon="RefreshCw" iconPosition="left">
              Try again
            </Button>
            <Button href="/contact" variant="outline">
              Contact us
            </Button>
          </StatePanel>
        ) : isEmptyWithinRadius ? (
          <StatePanel
            icon={MapPin}
            title={NEARBY.emptyNearbyTitle}
            body={NEARBY.emptyNearbyBody}
          >
            <Button onClick={() => setShowAllAnyway(true)} variant="primary" icon="Store" iconPosition="left">
              Show all shops instead
            </Button>
            <Button href="/contact" variant="outline">
              Contact us
            </Button>
          </StatePanel>
        ) : shops.length === 0 ? (
          /* The whole directory is empty. Distinct from empty-within-radius:
             widening the search would not help, so no "show all" button. */
          <StatePanel
            icon={Store}
            title="No shops are listed yet"
            body="No GGFIX shops are live on the platform right now. If you run a repair shop, we would love to hear from you."
          >
            <Button href="/shop" variant="primary" icon="ArrowRight">
              GGFIX for shops
            </Button>
          </StatePanel>
        ) : (
          <>
            <div className="text-center">
              <h2 className="text-2xl font-bold tracking-tight text-brand-ink sm:text-3xl">
                {listHeading.title}
              </h2>
              <p className="mx-auto mt-3 max-w-prose text-sm leading-relaxed text-brand-muted sm:text-base">
                {listHeading.body}
              </p>
              <p className="mt-3 text-sm font-semibold text-brand-700">
                {shops.length === 1 ? '1 shop' : `${shops.length} shops`}
                {showingNearby ? ` within ${radiusKm} km` : ' on the platform'}
              </p>
            </div>

            <ShopGrid count={shops.length}>
              {shops.map((shop, index) => (
                <ShopCard key={shopKey(shop, index)} shop={shop} />
              ))}
            </ShopGrid>

            {/* Escape hatch back to the full directory once a nearby search has
                narrowed it — otherwise the only way out is clearing the location. */}
            {showingNearby ? (
              <p className="mt-8 text-center">
                <button
                  type="button"
                  onClick={() => setShowAllAnyway(true)}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold',
                    'text-brand-700 transition hover:bg-brand-soft',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2',
                  )}
                >
                  <Store className="h-4 w-4" aria-hidden="true" />
                  Show every GGFIX shop instead
                </button>
              </p>
            ) : null}

            {/* Symmetric: having widened to "all shops", offer the way back. */}
            {!showingNearby && geo ? (
              <p className="mt-8 text-center">
                <button
                  type="button"
                  onClick={() => setShowAllAnyway(false)}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold',
                    'text-brand-700 transition hover:bg-brand-soft',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-700 focus-visible:ring-offset-2',
                  )}
                >
                  <Navigation className="h-4 w-4" aria-hidden="true" />
                  Back to shops within {radiusKm} km
                </button>
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
