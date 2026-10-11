/**
 * Lightweight visit tracking for the shared demo link.
 * 1) Always increments a free public counter (no signup).
 * 2) Optionally sends to Google Analytics 4 if you set a measurement ID.
 *
 * Check visit count anytime:
 *   https://api.counterapi.dev/v1/dom-meteorology-dc/pageviews
 *
 * Optional GA4: set window.__GA_MEASUREMENT_ID = 'G-XXXXXXXX' before this loads,
 * or add ?ga=G-XXXXXXXX once for local testing.
 */

const COUNTER_NAMESPACE = 'dom-meteorology-dc';
const COUNTER_KEY = 'pageviews';

function readGaId() {
    if (typeof window.__GA_MEASUREMENT_ID === 'string' && window.__GA_MEASUREMENT_ID.startsWith('G-')) {
        return window.__GA_MEASUREMENT_ID;
    }
    try {
        const params = new URLSearchParams(window.location.search);
        const fromQuery = params.get('ga');
        if (fromQuery && fromQuery.startsWith('G-')) return fromQuery;
        const saved = localStorage.getItem('dom-dc-ga-id');
        if (saved && saved.startsWith('G-')) return saved;
    } catch (_) {}
    return null;
}

async function bumpPublicCounter() {
    try {
        // Unique-ish session guard so refresh spam doesn't inflate too wildly
        const sessionKey = 'dom-dc-counted-session';
        if (sessionStorage.getItem(sessionKey)) return;
        sessionStorage.setItem(sessionKey, '1');

        const url = `https://api.counterapi.dev/v1/${COUNTER_NAMESPACE}/${COUNTER_KEY}/up`;
        const res = await fetch(url, { method: 'GET', mode: 'cors' });
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data?.count === 'number') {
            window.__DOM_DC_VISIT_COUNT = data.count;
        }
    } catch (_) {
        // Offline / blocked — ignore
    }
}

function initGoogleAnalytics(measurementId) {
    try {
        localStorage.setItem('dom-dc-ga-id', measurementId);
    } catch (_) {}

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', measurementId, { anonymize_ip: true });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
}

export function initAnalytics() {
    bumpPublicCounter();
    const gaId = readGaId();
    if (gaId) initGoogleAnalytics(gaId);
}

export async function fetchVisitCount() {
    try {
        const res = await fetch(
            `https://api.counterapi.dev/v1/${COUNTER_NAMESPACE}/${COUNTER_KEY}`,
            { mode: 'cors' }
        );
        if (!res.ok) return null;
        const data = await res.json();
        return typeof data?.count === 'number' ? data.count : null;
    } catch (_) {
        return null;
    }
}
