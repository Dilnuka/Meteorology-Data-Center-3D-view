/**
 * Lightweight visit tracking for the shared demo link.
 *
 * Uses hits.sh (no API key / signup). CounterAPI v1 is deprecated and v2
 * requires a secret API key that cannot be safely shipped in a public site.
 *
 * Check visit count anytime (opens a small badge with the number):
 *   https://hits.sh/dilnuka.github.io/Meteorology-Data-Center-3D-view.svg
 *
 * Optional GA4: set window.__GA_MEASUREMENT_ID = 'G-XXXXXXXX' before this loads.
 */

const PAGE_PATH = 'dilnuka.github.io/Meteorology-Data-Center-3D-view';
const HITS_SVG = `https://hits.sh/${PAGE_PATH}.svg`;

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

function bumpPublicCounter() {
    try {
        const sessionKey = 'dom-dc-counted-session';
        if (sessionStorage.getItem(sessionKey)) return;
        sessionStorage.setItem(sessionKey, '1');

        // Image beacon works without CORS issues
        const img = new Image();
        img.referrerPolicy = 'no-referrer-when-downgrade';
        img.alt = '';
        img.width = 1;
        img.height = 1;
        img.src = `${HITS_SVG}?view=today-total`;

        // Best-effort parse of current total for debugging
        fetch(`${HITS_SVG}?view=today-total`, { mode: 'cors', cache: 'no-store' })
            .then((res) => (res.ok ? res.text() : ''))
            .then((svg) => {
                const match = svg.match(/hits:\s*([\d,]+)/i) || svg.match(/aria-label="([\d,]+)/);
                if (match) {
                    const n = Number(String(match[1]).replace(/,/g, ''));
                    if (!Number.isNaN(n)) window.__DOM_DC_VISIT_COUNT = n;
                }
            })
            .catch(() => {});
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

export function getVisitBadgeUrl() {
    return `${HITS_SVG}?view=today-total`;
}
