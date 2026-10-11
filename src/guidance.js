const TOUR_KEY = 'dom-dc-tour-v1';

const TOUR_STEPS = [
    {
        title: 'Orbit the room',
        body: 'Drag with your mouse or one finger to look around. Scroll or pinch to zoom in on racks, PAC units, and power systems.'
    },
    {
        title: 'Inspect any system',
        body: 'Click or tap racks, cooling, UPS, fire systems, or the floor to read engineering specs. On phones, use Menu → Jump to a system if tapping is tricky.'
    },
    {
        title: 'Walk inside',
        body: 'Press Walk to enter at eye level. On desktop use WASD + mouse look (Esc to exit). On mobile, drag to look and use the left stick to move.'
    }
];

export function initGuidance({ announce } = {}) {
    const tourOverlay = document.getElementById('tour-overlay');
    const tourTitle = document.getElementById('tour-title');
    const tourBody = document.getElementById('tour-body');
    const tourStepLabel = document.getElementById('tour-step-label');
    const tourNext = document.getElementById('tour-next');
    const tourSkip = document.getElementById('tour-skip');

    const helpModal = document.getElementById('help-modal');
    const helpBtn = document.getElementById('help-btn');
    const helpClose = document.getElementById('help-close');
    const helpDone = document.getElementById('help-done');

    const instructions = document.getElementById('instructions');

    let step = 0;
    let lastFocus = null;

    function setDialogOpen(el, open) {
        if (!el) return;
        el.hidden = !open;
        document.body.classList.toggle('modal-open', open);
        if (open) {
            lastFocus = document.activeElement;
            const focusable = el.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
            focusable?.focus();
        } else if (lastFocus && typeof lastFocus.focus === 'function') {
            lastFocus.focus();
        }
    }

    function renderTour() {
        const s = TOUR_STEPS[step];
        if (!s) return;
        tourStepLabel.textContent = `Step ${step + 1} of ${TOUR_STEPS.length}`;
        tourTitle.textContent = s.title;
        tourBody.textContent = s.body;
        tourNext.textContent = step === TOUR_STEPS.length - 1 ? 'Start exploring' : 'Next';
    }

    function finishTour() {
        try { localStorage.setItem(TOUR_KEY, '1'); } catch (_) {}
        setDialogOpen(tourOverlay, false);
        announce?.('Tour finished. Drag to orbit, tap assets to inspect, or open help anytime.');
        scheduleHintFade();
    }

    function openTour(fromStart = true) {
        if (fromStart) step = 0;
        renderTour();
        setDialogOpen(tourOverlay, true);
        announce?.('Quick tour opened.');
    }

    function openHelp() {
        setDialogOpen(helpModal, true);
        announce?.('Help opened.');
    }

    function closeHelp() {
        setDialogOpen(helpModal, false);
    }

    function scheduleHintFade() {
        if (!instructions) return;
        window.setTimeout(() => {
            instructions.classList.add('fade-out');
        }, 12000);
    }

    tourNext?.addEventListener('click', () => {
        if (step >= TOUR_STEPS.length - 1) {
            finishTour();
            return;
        }
        step += 1;
        renderTour();
    });
    tourSkip?.addEventListener('click', finishTour);

    helpBtn?.addEventListener('click', openHelp);
    helpClose?.addEventListener('click', closeHelp);
    helpDone?.addEventListener('click', closeHelp);

    helpModal?.addEventListener('click', (e) => {
        if (e.target === helpModal) closeHelp();
    });

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Escape') {
            if (helpModal && !helpModal.hidden) closeHelp();
            else if (tourOverlay && !tourOverlay.hidden) finishTour();
        }
        if ((e.key === '?' || (e.shiftKey && e.key === '/')) && !e.ctrlKey && !e.metaKey) {
            const tag = document.activeElement?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
            if (document.body.classList.contains('walk-active')) return;
            openHelp();
        }
    });

    // First visit: show tour shortly after load
    let shown = false;
    try { shown = localStorage.getItem(TOUR_KEY) === '1'; } catch (_) {}

    return {
        openTour,
        openHelp,
        closeHelp,
        maybeStartTour() {
            if (!shown) {
                window.setTimeout(() => openTour(true), 700);
            } else {
                scheduleHintFade();
            }
        },
        fadeLookHint(el) {
            if (!el) return;
            window.setTimeout(() => el.classList.add('fade'), 4500);
        }
    };
}
