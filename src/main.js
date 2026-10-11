import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import gsap from 'gsap';
import { initGuidance } from './guidance.js';
import { initAnalytics } from './analytics.js';

// Core Setup
const container = document.getElementById('canvas-container');
const fallbackEl = document.getElementById('webgl-fallback');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf1f5f9);
scene.fog = new THREE.FogExp2(0xf1f5f9, 0.005);

const ORBIT_FOV = 40;
const WALK_FOV = 70;
const camera = new THREE.PerspectiveCamera(ORBIT_FOV, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(18, 22, 22);

const isCoarsePointer = () => window.matchMedia('(pointer: coarse)').matches;
const preferPerf = isCoarsePointer() || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

let renderer;
try {
    renderer = new THREE.WebGLRenderer({
        antialias: !preferPerf,
        powerPreference: preferPerf ? 'low-power' : 'high-performance'
    });
} catch (err) {
    document.getElementById('loader')?.remove();
    if (fallbackEl) fallbackEl.hidden = false;
    throw err;
}

if (!renderer.getContext()) {
    document.getElementById('loader')?.remove();
    if (fallbackEl) fallbackEl.hidden = false;
    throw new Error('WebGL unavailable');
}

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preferPerf ? 1.5 : 2));
renderer.shadowMap.enabled = !preferPerf;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);
renderer.domElement.setAttribute('tabindex', '0');
renderer.domElement.setAttribute('aria-label', 'Interactive 3D canvas');
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    announce('Graphics context lost. Refresh the page if the view freezes.');
});

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxPolarAngle = Math.PI / 2 - 0.05;
controls.minDistance = 5;
controls.maxDistance = 150;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN
};
controls.rotateSpeed = isCoarsePointer() ? 0.55 : 0.85;
controls.zoomSpeed = isCoarsePointer() ? 0.9 : 1.0;
controls.panSpeed = isCoarsePointer() ? 0.7 : 1.0;
controls.target.set(5.5, 1.5, 7);
controls.listenToKeyEvents(window);
controls.addEventListener('start', () => {
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(controls.target);
});

const DEFAULT_CAM = { x: 18, y: 22, z: 22 };
const DEFAULT_TARGET = { x: 5.5, y: 1.5, z: 7 };
const savedOrbit = {
    cam: { ...DEFAULT_CAM },
    target: { ...DEFAULT_TARGET }
};

// First Person / Walk Controls
const fpControls = new PointerLockControls(camera, document.body);
let isFirstPerson = false;
let mobileWalkActive = false;
let walkPending = false;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
const walkForward = new THREE.Vector3();
const walkRight = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);
let prevTime = performance.now();
const walkEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const joyInput = { x: 0, y: 0 };

const fpBtn = document.getElementById('fp-btn');
const walkFab = document.getElementById('walk-fab');
const crosshair = document.getElementById('crosshair');
const mobileWalkUi = document.getElementById('mobile-walk-ui');
const desktopWalkHud = document.getElementById('desktop-walk-hud');
const exitWalkBtn = document.getElementById('exit-walk-btn');
const desktopExitWalk = document.getElementById('desktop-exit-walk');
const joystickEl = document.getElementById('joystick');
const joystickKnob = document.getElementById('joystick-knob');
const lookHint = document.getElementById('look-hint');
const srAnnouncer = document.getElementById('sr-announcer');
const drillBanner = document.getElementById('drill-banner');
const inspectPeek = document.getElementById('inspect-peek');
const peekTitle = document.getElementById('peek-title');
const peekDesc = document.getElementById('peek-desc');

function announce(msg) {
    if (srAnnouncer) {
        srAnnouncer.textContent = '';
        void srAnnouncer.offsetWidth;
        srAnnouncer.textContent = msg;
    }
}

const guidance = initGuidance({ announce });

function setPressed(el, pressed) {
    if (!el) return;
    el.setAttribute('aria-pressed', pressed ? 'true' : 'false');
}

function hideChromeForWalk() {
    document.body.classList.add('walk-active');
    document.getElementById('app-chrome')?.classList.add('walk-hidden');
    document.getElementById('main-hud-panel')?.classList.add('hidden');
    document.getElementById('main-hud-panel')?.setAttribute('inert', '');
    document.getElementById('toggle-hud-btn')?.setAttribute('aria-expanded', 'false');
    const backdrop = document.getElementById('hud-backdrop');
    if (backdrop) {
        backdrop.hidden = true;
        backdrop.classList.remove('visible');
    }
    document.body.classList.remove('panel-open');
    hidePeek();
}

function beginWalkCamera() {
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(controls.target);
    savedOrbit.cam = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    savedOrbit.target = { x: controls.target.x, y: controls.target.y, z: controls.target.z };
    camera.position.set(5.5, 1.7, 12);
    camera.fov = WALK_FOV;
    camera.updateProjectionMatrix();
    walkEuler.set(0, 0, 0);
    camera.quaternion.setFromEuler(walkEuler);
}

function activateMobileWalk() {
    mobileWalkActive = true;
    isFirstPerson = true;
    controls.enabled = false;
    crosshair.style.display = 'none';
    hideChromeForWalk();
    if (mobileWalkUi) {
        mobileWalkUi.hidden = false;
        mobileWalkUi.setAttribute('aria-hidden', 'false');
    }
    if (lookHint) lookHint.classList.remove('fade');
    guidance.fadeLookHint(lookHint);
    fpBtn.textContent = 'Exit Walk Mode';
    setPressed(fpBtn, true);
    setPressed(walkFab, true);
    announce('Walk mode on. Drag to look, use the left stick to move, Exit Walk when done.');
}

function enterWalkMode() {
    if (isFirstPerson || walkPending) return;
    beginWalkCamera();

    if (isCoarsePointer()) {
        activateMobileWalk();
        return;
    }

    walkPending = true;
    fpBtn.textContent = 'Click to lock…';
    announce('Click the screen if prompted to capture the mouse for walk mode.');
    fpControls.lock();
}

function exitWalkMode() {
    if (fpControls.isLocked) {
        fpControls.unlock();
        return;
    }
    finishExitWalk();
}

function finishExitWalk() {
    walkPending = false;
    isFirstPerson = false;
    mobileWalkActive = false;
    controls.enabled = true;
    crosshair.style.display = 'none';
    joyInput.x = 0;
    joyInput.y = 0;
    moveForward = moveBackward = moveLeft = moveRight = false;
    velocity.set(0, 0, 0);
    if (joystickKnob) joystickKnob.style.transform = 'translate(-50%, -50%)';
    if (mobileWalkUi) {
        mobileWalkUi.hidden = true;
        mobileWalkUi.setAttribute('aria-hidden', 'true');
    }
    if (desktopWalkHud) desktopWalkHud.hidden = true;
    document.body.classList.remove('walk-active');
    document.getElementById('app-chrome')?.classList.remove('walk-hidden');
    fpBtn.textContent = 'Enter Walk Mode';
    setPressed(fpBtn, false);
    setPressed(walkFab, false);
    camera.fov = ORBIT_FOV;
    camera.updateProjectionMatrix();
    camera.position.set(savedOrbit.cam.x, savedOrbit.cam.y, savedOrbit.cam.z);
    controls.target.set(savedOrbit.target.x, savedOrbit.target.y, savedOrbit.target.z);
    announce('Walk mode ended. Orbit controls restored.');
}

function abortWalkPending() {
    walkPending = false;
    camera.fov = ORBIT_FOV;
    camera.updateProjectionMatrix();
    camera.position.set(savedOrbit.cam.x, savedOrbit.cam.y, savedOrbit.cam.z);
    controls.target.set(savedOrbit.target.x, savedOrbit.target.y, savedOrbit.target.z);
    controls.enabled = true;
    fpBtn.textContent = 'Enter Walk Mode';
    setPressed(fpBtn, false);
    setPressed(walkFab, false);
    announce('Walk mode cancelled. Click Walk again to retry.');
}

fpBtn.addEventListener('click', () => {
    if (isFirstPerson) exitWalkMode();
    else enterWalkMode();
});

walkFab?.addEventListener('click', () => {
    if (isFirstPerson) exitWalkMode();
    else enterWalkMode();
});

exitWalkBtn?.addEventListener('click', () => exitWalkMode());
desktopExitWalk?.addEventListener('click', () => exitWalkMode());

fpControls.addEventListener('lock', () => {
    walkPending = false;
    isFirstPerson = true;
    mobileWalkActive = false;
    controls.enabled = false;
    crosshair.style.display = 'block';
    hideChromeForWalk();
    if (desktopWalkHud) desktopWalkHud.hidden = false;
    fpBtn.textContent = 'Exit Walk Mode';
    setPressed(fpBtn, true);
    setPressed(walkFab, true);
    announce('Walk mode locked. WASD moves, mouse looks, click inspects, Escape exits.');
});

fpControls.addEventListener('unlock', () => {
    finishExitWalk();
});

document.addEventListener('pointerlockerror', () => {
    if (walkPending) abortWalkPending();
});

// Click-to-inspect while pointer-locked (events hit document.body)
document.addEventListener('click', (e) => {
    if (!fpControls.isLocked) return;
    if (e.target.closest?.('button, a, select, input, .desktop-walk-hud')) return;
    inspectAtClient(window.innerWidth / 2, window.innerHeight / 2);
});

const onKeyDown = function (event) {
    if (!isFirstPerson) return;
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': moveForward = true; break;
        case 'ArrowLeft':
        case 'KeyA': moveLeft = true; break;
        case 'ArrowDown':
        case 'KeyS': moveBackward = true; break;
        case 'ArrowRight':
        case 'KeyD': moveRight = true; break;
        case 'Escape':
            if (mobileWalkActive) exitWalkMode();
            break;
    }
};

const onKeyUp = function (event) {
    if (!isFirstPerson) return;
    switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': moveForward = false; break;
        case 'ArrowLeft':
        case 'KeyA': moveLeft = false; break;
        case 'ArrowDown':
        case 'KeyS': moveBackward = false; break;
        case 'ArrowRight':
        case 'KeyD': moveRight = false; break;
    }
};

document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

document.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && !isFirstPerson) {
        const panel = document.getElementById('main-hud-panel');
        if (panel && !panel.classList.contains('hidden') && window.matchMedia('(max-width: 820px)').matches) {
            panel.classList.add('hidden');
            document.getElementById('toggle-hud-btn')?.setAttribute('aria-expanded', 'false');
            document.body.classList.remove('panel-open');
            const bd = document.getElementById('hud-backdrop');
            if (bd) {
                bd.hidden = true;
                bd.classList.remove('visible');
            }
        }
    }
});

/* Mobile joystick */
let joyPointerId = null;
function updateJoystick(clientX, clientY) {
    if (!joystickEl || !joystickKnob) return;
    const rect = joystickEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const max = rect.width * 0.35;
    const len = Math.hypot(dx, dy) || 1;
    if (len > max) {
        dx = (dx / len) * max;
        dy = (dy / len) * max;
    }
    joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    joyInput.x = dx / max;
    joyInput.y = dy / max;
}

function resetJoystick() {
    joyPointerId = null;
    joyInput.x = 0;
    joyInput.y = 0;
    if (joystickKnob) joystickKnob.style.transform = 'translate(-50%, -50%)';
}

joystickEl?.addEventListener('pointerdown', (e) => {
    if (!mobileWalkActive) return;
    joyPointerId = e.pointerId;
    joystickEl.setPointerCapture(e.pointerId);
    updateJoystick(e.clientX, e.clientY);
    e.preventDefault();
    e.stopPropagation();
});

joystickEl?.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyPointerId) return;
    updateJoystick(e.clientX, e.clientY);
    e.preventDefault();
    e.stopPropagation();
});

joystickEl?.addEventListener('pointerup', (e) => {
    if (e.pointerId !== joyPointerId) return;
    resetJoystick();
});
joystickEl?.addEventListener('pointercancel', resetJoystick);

/* Touch look while walking */
let lookPointerId = null;
let lastLookX = 0;
let lastLookY = 0;
const LOOK_SENS = 0.0045;

renderer.domElement.addEventListener('pointerdown', (e) => {
    if (!mobileWalkActive || e.target.closest?.('#joystick, #exit-walk-btn, .hud-panel, .app-chrome')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    lookPointerId = e.pointerId;
    lastLookX = e.clientX;
    lastLookY = e.clientY;
    try { renderer.domElement.setPointerCapture(e.pointerId); } catch (_) {}
});

renderer.domElement.addEventListener('pointermove', (e) => {
    if (!mobileWalkActive || e.pointerId !== lookPointerId) return;
    const dx = e.clientX - lastLookX;
    const dy = e.clientY - lastLookY;
    lastLookX = e.clientX;
    lastLookY = e.clientY;
    walkEuler.setFromQuaternion(camera.quaternion);
    walkEuler.y -= dx * LOOK_SENS;
    walkEuler.x -= dy * LOOK_SENS;
    walkEuler.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, walkEuler.x));
    camera.quaternion.setFromEuler(walkEuler);
});

const endLook = (e) => {
    if (e.pointerId === lookPointerId) lookPointerId = null;
};
renderer.domElement.addEventListener('pointerup', endLook);
renderer.domElement.addEventListener('pointercancel', endLook);

// Smart Data Center Hemisphere Lighting
let ambientLight = new THREE.HemisphereLight(0xffffff, 0xd1d5db, 0.7); // Light mode default
scene.add(ambientLight);

// Night-mode cinematic accent lights (hidden by default)
const darkThemeLightsGroup = new THREE.Group();
darkThemeLightsGroup.visible = false;
scene.add(darkThemeLightsGroup);

const pacLight1 = new THREE.PointLight(0x0ea5e9, 4.0, 15);
pacLight1.position.set(13.8, 3.5, 5.7);
darkThemeLightsGroup.add(pacLight1);

const pacLight2 = new THREE.PointLight(0x0ea5e9, 4.0, 15);
pacLight2.position.set(11.5, 3.5, 9.8);
darkThemeLightsGroup.add(pacLight2);

const secLight = new THREE.PointLight(0x10b981, 4.0, 15);
secLight.position.set(2.0, 3.0, 11.0);
darkThemeLightsGroup.add(secLight);

const upsLight = new THREE.PointLight(0x3b82f6, 4.0, 15);
upsLight.position.set(5.5, 3.0, 1.5);
darkThemeLightsGroup.add(upsLight);

const serverLEDs = [];

const keyLight = new THREE.DirectionalLight(0xf0f4ff, 1.4); // Bright in light mode
keyLight.position.set(10, 30, 15);
keyLight.castShadow = true;
keyLight.shadow.mapSize.width = preferPerf ? 1024 : 2048;
keyLight.shadow.mapSize.height = preferPerf ? 1024 : 2048;
scene.add(keyLight);

// Global lists for dynamic simulation
const interactableObjects = [];
const airflowParticles = [];
let raisedFloorMesh;
let subFloorMat;
let wallMat;
let rackMat;

// Label setup mapping screen divs to world vectors (updated coords)
// Mobile starts with labels off — too many pins crowd a small screen.
let showLabels = !isCoarsePointer();
const labels = [
    { element: document.getElementById('lbl-ups'), pos: new THREE.Vector3(5.5, 2.3, 1.2), xrayOnly: false, priority: 9 },
    { element: document.getElementById('lbl-pac-l'), pos: new THREE.Vector3(14.0, 2.7, 6.0), xrayOnly: false, priority: 9 },
    { element: document.getElementById('lbl-pac-r'), pos: new THREE.Vector3(11.0, 2.7, 10.0), xrayOnly: false, priority: 8 },
    { element: document.getElementById('lbl-racks'), pos: new THREE.Vector3(5.0, 2.7, 6.8), xrayOnly: false, priority: 10 },
    { element: document.getElementById('lbl-fire'), pos: new THREE.Vector3(-1.0, 2.5, 8.0), xrayOnly: false, priority: 8 },
    { element: document.getElementById('lbl-security'), pos: new THREE.Vector3(6.44, 2.8, 12.75), xrayOnly: false, priority: 8 },
    { element: document.getElementById('lbl-panel'), pos: new THREE.Vector3(0.5, 2.2, 4.5), xrayOnly: false, priority: 7 },
    { element: document.getElementById('lbl-tray'), pos: new THREE.Vector3(8.0, 0.25, 8.8), xrayOnly: true, priority: 4 },
    { element: document.getElementById('lbl-leak'), pos: new THREE.Vector3(12.5, 0.15, 8.0), xrayOnly: true, priority: 3 },
    { element: document.getElementById('lbl-overhead-data'), pos: new THREE.Vector3(8.0, 3.4, 8.8), xrayOnly: false, priority: 5 },
    { element: document.getElementById('lbl-overhead-power'), pos: new THREE.Vector3(8.0, 3.4, 6.5), xrayOnly: false, priority: 4 },
    { element: document.getElementById('lbl-vesda'), pos: new THREE.Vector3(8.0, 3.4, 7.8), xrayOnly: false, priority: 4 },
    { element: document.getElementById('lbl-smoke'), pos: new THREE.Vector3(10.5, 3.4, 9.2), xrayOnly: false, priority: 3 },
    { element: document.getElementById('lbl-busbar'), pos: new THREE.Vector3(8.0, 0.15, 9.8), xrayOnly: true, priority: 3 },
    { element: document.getElementById('lbl-earth'), pos: new THREE.Vector3(7.0, 0.15, 8.8), xrayOnly: true, priority: 2 }
].filter((l) => l.element);

// Specs mapped from the Bidding PDF
const CONTRACT_SPECS = {
    room: {
        title: "Section 1: Architecture & Plenum",
        desc: "Total Area: 57 sq.m. with 3.5m true height. Sealed concrete boundary with a 300 mm raised access floor system creating a 17.1 cubic meter under-floor plenum for high-pressure downflow precision cold air distribution."
    },
    security: {
        title: "Section 2: Physical Security",
        desc: "Equipped with 1200 lbs electromagnetic locks, Wall-mounted biometric readers outside, green Emergency Break-Glass override inside, illuminated Abort switches, and touchless infrared exit sensors (REX)."
    },
    racks: {
        title: "Section 3: Core IT Cabinets",
        desc: "Two rows of heavy-duty 45U server racks in premium black powder-coated finish. Features highly perforated hexagonal mesh doors (80% open area), smart swing-handle locks, dual Zero-U Intelligent Switched PDUs, and blanking panels."
    },
    cooling: {
        title: "Section 4: N+1 redundant PAC",
        desc: "Two downflow 80kW Precision Air Conditioning (PAC) units (2.4m H x 2.1m W x 1m D) designed for 24/7 continuous duty cycle. Pushes cool air into the under-floor plenum to blast directly upwards through perforated floor tiles in the Cold Aisle."
    },
    power: {
        title: "Section 5: 2N Standalone UPS System",
        desc: "Two identical 80kVA standalone UPS systems. Includes matching VRLA/Lithium-ion battery cabinets and a wall-mounted 3-phase electrical distribution board with digital multi-tariff kWh energy meters."
    },
    fire: {
        title: "Section 6: Fire Suppression & EMS",
        desc: "Automatic inert gas total-flooding clean-agent system using red Schedule 40 ceiling piping, brass 360-degree discharge nozzles, and a high-sensitivity VESDA smoke detection network integrated with dual-zoned digital temperature and humidity EMS sensors."
    },
    plenum: {
        title: "Section 7: Under-Floor (X-Ray)",
        desc: "Plenum contains neatly segregated galvanized steel cable trays (one for Path A power, one for Path B power), Cat6 communication lines, and a neon-green continuous water leak detection rope wrapped around the base of the PAC systems."
    }
};

// --- Procedural 3D Scene Modeler ---

function createStandardBox(w, h, d, color, roughness = 0.45) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({ color: color, roughness: roughness });
    return new THREE.Mesh(geo, mat);
}

// Room Shape (6 distinct edges to properly demonstrate purpose)
const roomPts = [
    new THREE.Vector2(0, 0),       // 1. Top-Left
    new THREE.Vector2(16, 0),      // 2. Top Wall (UPS) -> Desk corner
    new THREE.Vector2(16, 4),      // 3. Desk Wall (Vertical drop)
    new THREE.Vector2(8, 14),      // 4. PAC Wall (Slanted down-left)
    new THREE.Vector2(0, 7.2)      // 5. Single Slanted Wall (merged Ramp and Chamfer)
    // Returns to (0,0) as the Left Wall
];
const roomShape = new THREE.Shape(roomPts);

// Room Shell
function buildStructuralEnclosure() {
    // Sub-floor concrete slab
    const extrudeSettings = { depth: 0.2, bevelEnabled: false };
    const subFloorGeo = new THREE.ExtrudeGeometry(roomShape, extrudeSettings);
    subFloorMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.9 });
    const subFloor = new THREE.Mesh(subFloorGeo, subFloorMat);
    subFloor.rotation.x = Math.PI / 2;
    subFloor.position.y = 0; // The extrusion goes from Y=0 to Y=-0.2 in world space
    subFloor.receiveShadow = true;
    scene.add(subFloor);

    // 300mm raised access floor system (X-Ray Transparent Control)
    const raisedFloorSettings = { depth: 0.05, bevelEnabled: false };
    const raisedFloorGeo = new THREE.ExtrudeGeometry(roomShape, raisedFloorSettings);
    const raisedFloorMat = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1, // Light-mode raised floor tiles
        roughness: 0.1,
        metalness: 0.3,
        transparent: true,
        opacity: 0.95
    });
    raisedFloorMesh = new THREE.Mesh(raisedFloorGeo, raisedFloorMat);
    raisedFloorMesh.rotation.x = Math.PI / 2;
    raisedFloorMesh.position.y = 0.35; // Extrudes down to 0.3
    raisedFloorMesh.receiveShadow = true;
    raisedFloorMesh.userData = { specKey: "room" };
    interactableObjects.push(raisedFloorMesh);
    scene.add(raisedFloorMesh);

    // Create the perimeter walls dynamically
    const wallHeight = 3.5;
    const wallThickness = 0.3;
    wallMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.9 });

    for (let i = 0; i < roomPts.length; i++) {
        const p1 = roomPts[i];
        const p2 = roomPts[(i + 1) % roomPts.length];
        
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const length = Math.sqrt(dx*dx + dy*dy);
        const angle = Math.atan2(dy, dx);
        
        // Segment 3 is the Bottom Wall (Ramp Wall) from V3 to V4
        // Leave a gap for the door starting just after the pillar (0.4m from corner)
        if (i === 3) {
            const dirX = dx / length;
            const dirY = dy / length;
            const gapStart = 0.4;
            const doorWidth = 3.2;
            const gapEnd = gapStart + doorWidth;
            
            // 1. Build the small wall sliver before the door (0 to 0.4m)
            if (gapStart > 0) {
                const startWallGeo = new THREE.BoxGeometry(gapStart, wallHeight, wallThickness);
                const startWall = new THREE.Mesh(startWallGeo, wallMat);
                const startMidX = p1.x + dirX * (gapStart / 2);
                const startMidZ = p1.y + dirY * (gapStart / 2);
                startWall.position.set(startMidX, wallHeight / 2, startMidZ);
                startWall.rotation.y = -angle;
                startWall.receiveShadow = true;
                startWall.castShadow = true;
                scene.add(startWall);
            }

            // 2. Build the rest of the wall after the door (3.6m to end)
            const newStart = new THREE.Vector2(
                p1.x + dirX * gapEnd,
                p1.y + dirY * gapEnd
            );
            const newLength = length - gapEnd;
            if (newLength > 0) {
                const wallGeo = new THREE.BoxGeometry(newLength, wallHeight, wallThickness);
                const wall = new THREE.Mesh(wallGeo, wallMat);
                const midX = (newStart.x + p2.x) / 2;
                const midZ = (newStart.y + p2.y) / 2;
                wall.position.set(midX, wallHeight / 2, midZ);
                wall.rotation.y = -angle;
                wall.receiveShadow = true;
                wall.castShadow = true;
                scene.add(wall);
                
                // Add Neon Trim
                const trimGeo = new THREE.BoxGeometry(newLength, 0.05, 0.02);
                const trimMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 });
                const trim = new THREE.Mesh(trimGeo, trimMat);
                trim.position.set(midX - Math.sin(angle)*0.16, 2.5, midZ + Math.cos(angle)*0.16);
                trim.rotation.y = -angle;
                darkThemeLightsGroup.add(trim);
            }
            continue; 
        }

        const wallGeo = new THREE.BoxGeometry(length, wallHeight, wallThickness);
        const wall = new THREE.Mesh(wallGeo, wallMat);
        
        // Position at the midpoint of the segment
        const midX = (p1.x + p2.x) / 2;
        const midZ = (p1.y + p2.y) / 2;
        wall.position.set(midX, 0.3 + wallHeight / 2, midZ);
        
        // Rotate to match the segment angle
        wall.rotation.y = -angle;
        wall.receiveShadow = true;
        wall.castShadow = true;
        scene.add(wall);
        
        // Add Neon Trim
        const trimGeo = new THREE.BoxGeometry(length, 0.05, 0.02);
        const trimMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 });
        const trim = new THREE.Mesh(trimGeo, trimMat);
        trim.position.set(midX - Math.sin(angle)*0.16, 2.5, midZ + Math.cos(angle)*0.16);
        trim.rotation.y = -angle;
        darkThemeLightsGroup.add(trim);
    }

    // Concrete Pillars (from floor plan)
    const pillarGeo = new THREE.BoxGeometry(0.8, wallHeight, 0.8);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
    const pillars = [
        new THREE.Vector3(0.4, 0, 0.4),     // 1. Top-Left Corner pillar
        new THREE.Vector3(15.6, 0, 0.4),    // 2. Top-right (desk corner)
        new THREE.Vector3(8.0, 0, 14.0),    // 3. Bottom-right corner (PAC/Ramp)
        new THREE.Vector3(0.4, 0, 7.0),     // 4. Bottom-left near chamfer
        new THREE.Vector3(10.0, 0, 4.0),    // 5. Middle room free space
        new THREE.Vector3(3.0, 0, 4.0),     // 6. Free space near DB Panel / UPS 1
    ];
    pillars.forEach(p => {
        const pillar = new THREE.Mesh(pillarGeo, pillarMat);
        pillar.position.set(p.x, 0.3 + wallHeight / 2, p.z);
        pillar.receiveShadow = true;
        pillar.castShadow = true;
        scene.add(pillar);
    });
}

// Security Double Doors and Hardware (At the Ramp Wall)
let alarmBeacon;
let warningSignMat;
function buildDoubleDoorSecurity() {
    const doorGroup = new THREE.Group();
    // Segment 3 is the Single Slanted Wall: from V3(8, 14) to V4(0, 7.2).
    // dx = -8, dy = -6.8. Direction is (-0.7619, -0.6476)
    // The center is 2.0m from V3 along this vector.
    // X = 8 - 2.0 * 0.7619 = 6.476
    // Z = 14 - 2.0 * 0.6476 = 12.705
    doorGroup.position.set(6.476, 0.3, 12.705); 
    doorGroup.rotation.y = -Math.atan2(-6.8, -8.0); // Exact same rotation as the wall

    // Ramp outside the door (sloping down from the raised floor)
    const rampGeo = new THREE.BoxGeometry(3.0, 0.05, 2.0);
    const rampMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });
    const ramp = new THREE.Mesh(rampGeo, rampMat);
    // Slope the ramp
    ramp.rotation.x = 0.15;
    ramp.position.set(0, -0.15, 1.0);
    doorGroup.add(ramp);

    // Double door frame
    const frame = createStandardBox(3.4, 2.5, 0.2, 0x334155);
    frame.position.y = 1.25;
    doorGroup.add(frame);

    // Fire-rated doors (Left and Right)
    const doorLeft = createStandardBox(1.5, 2.4, 0.1, 0x475569);
    doorLeft.position.set(-0.8, 1.2, 0);
    const doorRight = createStandardBox(1.5, 2.4, 0.1, 0x475569);
    doorRight.position.set(0.8, 1.2, 0);
    doorGroup.add(doorLeft, doorRight);

    // Inside: Electromagnetic lock (1200 lbs holding force)
    const emLock = createStandardBox(1.0, 0.15, 0.2, 0x94a3b8, 0.1);
    emLock.position.set(0, 2.3, -0.15);
    
    // Chrome door loops transferring cabling
    const loopGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.3, 8);
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.9, roughness: 0.1 });
    const loop1 = new THREE.Mesh(loopGeo, chromeMat);
    loop1.position.set(-0.4, 2.35, -0.2);
    loop1.rotation.x = Math.PI / 4;
    const loop2 = new THREE.Mesh(loopGeo, chromeMat);
    loop2.position.set(0.4, 2.35, -0.2);
    loop2.rotation.x = Math.PI / 4;
    
    doorGroup.add(emLock, loop1, loop2);

    // Outside: Access Controls
    const biometricReader = createStandardBox(0.18, 0.35, 0.08, 0x0ea5e9);
    biometricReader.position.set(2.0, 1.3, 0.15);
    doorGroup.add(biometricReader);

    // Outside: Red Fire Alarm Control Panel (FACP)
    const facp = createStandardBox(0.5, 0.6, 0.1, 0xd97706);
    facp.position.set(2.5, 1.3, 0.15);
    doorGroup.add(facp);

    // Outside: Red flashing strobe beacon & Warning Sign
    warningSignMat = new THREE.MeshBasicMaterial({ color: 0x334155 });
    const warningSignGeo = new THREE.PlaneGeometry(1.2, 0.4);
    const warningSign = new THREE.Mesh(warningSignGeo, warningSignMat);
    warningSign.position.set(0, 2.8, 0.15);
    doorGroup.add(warningSign);

    const beaconGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.22, 8);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x7f1d1d });
    alarmBeacon = new THREE.Mesh(beaconGeo, beaconMat);
    alarmBeacon.position.set(0, 3.05, 0.1);
    doorGroup.add(alarmBeacon);

    // Inside: Emergency Break-Glass, Abort Unit, & REX Sensor
    const breakGlass = createStandardBox(0.12, 0.12, 0.05, 0x16a34a);
    breakGlass.position.set(-2.0, 1.3, -0.15);
    doorGroup.add(breakGlass);

    const abortSwitch = createStandardBox(0.12, 0.12, 0.05, 0xb91c1c);
    abortSwitch.position.set(-2.4, 1.3, -0.15);
    doorGroup.add(abortSwitch);
    
    const rex = createStandardBox(0.15, 0.08, 0.02, 0x1f2937);
    rex.position.set(0, 2.5, -0.11); // Above the door frame
    doorGroup.add(rex);

    // Illuminated EVACUATE Sign (Inside)
    const evacSignGeo = new THREE.PlaneGeometry(1.2, 0.2);
    const evacSignMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const evacSign = new THREE.Mesh(evacSignGeo, evacSignMat);
    evacSign.position.set(0, 2.7, -0.11);
    doorGroup.add(evacSign);

    doorGroup.userData = { specKey: "security" };
    interactableObjects.push(doorLeft, doorRight, emLock, facp, biometricReader, breakGlass, abortSwitch);
    scene.add(doorGroup);
}

// Two rows of 4 Core 45U Racks, aligned with the bottom-left 45-deg wall
function spawnCoreITInfrastructure() {
    const racksGroup = new THREE.Group();
    // Position center of racks in the left half of the room
    racksGroup.position.set(5.0, 0.35, 6.8); 
    // Rotate one time (90 degrees) to the right (clockwise)
    racksGroup.rotation.y = -Math.atan2(-6.8, -8.0) + Math.PI - (Math.PI / 2);

    const rackGeo = new THREE.BoxGeometry(0.8, 2.1, 1.2);
    rackMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.15 });
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x88ccff, transparent: true, opacity: 0.2, roughness: 0.1 });
    
    const cableMatBlue = new THREE.MeshStandardMaterial({ color: 0x0ea5e9, roughness: 0.4 }); // Cat6 Blue
    const cableMatBlack = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6 }); // Power Black

    // --- OVERHEAD CABLE TRAYS (Galvanized Ladder-style) ---
    const trayGeo = new THREE.BoxGeometry(3.2, 0.05, 0.4);
    const trayMat = new THREE.MeshStandardMaterial({ color: 0xa1a1aa, metalness: 0.8, roughness: 0.2 });
    
    // Data Tray (Far Row, rear)
    const trayData = new THREE.Mesh(trayGeo, trayMat);
    trayData.position.set(0, 2.9, 1.79);
    racksGroup.add(trayData);

    // Power Tray (Near Row, rear)
    const trayPower = new THREE.Mesh(trayGeo, trayMat);
    trayPower.position.set(0, 2.9, -1.79);
    racksGroup.add(trayPower);

    // Main Cables running along the trays
    const mainCableGeo = new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8);
    mainCableGeo.rotateZ(Math.PI / 2);
    
    const dataCableBundles = new THREE.Mesh(mainCableGeo, cableMatBlue);
    dataCableBundles.position.set(0, 2.93, 1.79);
    racksGroup.add(dataCableBundles);

    const powerCableBundles = new THREE.Mesh(mainCableGeo, cableMatBlack);
    powerCableBundles.position.set(0, 2.93, -1.79);
    racksGroup.add(powerCableBundles);
    
    // Add support rods from ceiling to trays
    const rodGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.25, 8);
    const rodMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.9 });
    for (let x = -1.5; x <= 1.5; x += 3.0) {
        const rod1 = new THREE.Mesh(rodGeo, rodMat);
        rod1.position.set(x, 3.025, 1.79);
        const rod2 = new THREE.Mesh(rodGeo, rodMat);
        rod2.position.set(x, 3.025, -1.79);
        racksGroup.add(rod1, rod2);
    }

    // Generate Far Row (row=0) and Near Row (row=1)
    for (let row = 0; row < 2; row++) {
        for (let i = 0; i < 4; i++) {
            const xPos = -1.2 + i * 0.8;
            const zPos = (row === 0) ? 1.19 : -1.19; 
            
            // (Pillar 5 was originally here, but has been moved to a free space in the room)

            const rack = new THREE.Mesh(rackGeo, rackMat);
            rack.position.set(xPos, 1.05, zPos);
            // Face the racks towards the center aisle (Z=0)
            if (row === 0) rack.rotation.y = Math.PI; 
            rack.castShadow = true;

            // --- MODERN CYBERPUNK SERVER BLADES ---
            const serverGeo = new THREE.BoxGeometry(0.74, 0.11, 0.6);
            const serverMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
            const emissiveColors = [0x00aaff, 0x0088ff, 0x00ffff, 0x00ddff];
            
            for (let s = 0; s < 14; s++) {
                const server = new THREE.Mesh(serverGeo, serverMat);
                server.position.set(0, -0.9 + (s * 0.14), 0.3); // Extends out towards the front
                
                // Front glowing panel
                const glowColor = emissiveColors[s % emissiveColors.length];
                const panelGeo = new THREE.PlaneGeometry(0.7, 0.08);
                const panelMat = new THREE.MeshStandardMaterial({ 
                    color: 0xffffff, 
                    emissive: glowColor, 
                    emissiveIntensity: Math.random() * 2.0 + 1.0 
                });
                const panel = new THREE.Mesh(panelGeo, panelMat);
                panel.position.set(0, 0, 0.301);
                server.add(panel);
                rack.add(server);
            }

            // Vertical LED Strips on the front posts
            const stripGeo = new THREE.PlaneGeometry(0.02, 2.0);
            const stripMat = new THREE.MeshStandardMaterial({ color: 0x00bbff, emissive: 0x00aaff, emissiveIntensity: 3.0 });
            const leftStrip = new THREE.Mesh(stripGeo, stripMat);
            leftStrip.position.set(-0.37, 0, 0.601);
            const rightStrip = new THREE.Mesh(stripGeo, stripMat);
            rightStrip.position.set(0.37, 0, 0.601);
            rack.add(leftStrip, rightStrip);

            // Sleek Tinted Glass Front Door with Hex Perforation approximation
            const glassGeo = new THREE.PlaneGeometry(0.74, 2.05);
            // Simulate 80% open-area hex mesh using wireframe trick
            const glassMat = new THREE.MeshStandardMaterial({ 
                color: 0x0f172a, 
                wireframe: true,
                transparent: true,
                opacity: 0.8
            });
            const frontDoor = new THREE.Mesh(glassGeo, glassMat);
            frontDoor.position.set(0, 0, 0.62);

            // Smart swing-handle electronic lock on front door
            const lockGeo = new THREE.BoxGeometry(0.06, 0.2, 0.04);
            const lockMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.5 });
            const handleLock = new THREE.Mesh(lockGeo, lockMat);
            handleLock.position.set(0.28, 0, 0.02); // Offset to the side of the door
            
            // Keycard reader LED on lock
            const lockLedGeo = new THREE.CircleGeometry(0.015, 8);
            const lockLedMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
            const lockLed = new THREE.Mesh(lockLedGeo, lockLedMat);
            lockLed.position.set(0, 0.06, 0.021);
            handleLock.add(lockLed);
            
            frontDoor.add(handleLock);
            rack.add(frontDoor);

            // --- MODERN LIGHTING (Server LEDs & Beacons) ---
            // 1. Top-of-rack Status Beacon (Cyan/Green)
            const beaconGeo = new THREE.BoxGeometry(0.7, 0.02, 0.05);
            const beaconMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.9 });
            const beacon = new THREE.Mesh(beaconGeo, beaconMat);
            beacon.position.set(0, 1.05, 0.55); // Top front edge
            rack.add(beacon);

            // 2. Server Network LEDs Matrix
            const ledGeo = new THREE.PlaneGeometry(0.015, 0.015);
            const ledColors = [0x10b981, 0x3b82f6, 0xf59e0b]; // Green, Blue, Amber
            const ledMaterials = ledColors.map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true }));
            
            // Front LEDs (on the glass/mesh door)
            for(let s = 0; s < 60; s++) { 
                const sLed = new THREE.Mesh(ledGeo, ledMaterials[Math.floor(Math.random() * ledMaterials.length)]);
                sLed.position.set(
                    -0.3 + Math.random() * 0.6, // Random X across front
                    -0.9 + Math.random() * 1.8, // Random Y height
                    0.625 // Just outside the front door
                );
                // Assign a blink rate
                sLed.userData = { 
                    blinkRate: Math.random() * 0.1 + 0.02, 
                    progress: Math.random() * Math.PI * 2,
                    baseOpacity: 0.8 + Math.random() * 0.2
                };
                rack.add(sLed);
                serverLEDs.push(sLed);
            }
            
            // Rear LEDs (Red/Amber for hot aisle)
            const rearLedMaterials = [new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true }), new THREE.MeshBasicMaterial({ color: 0xf59e0b, transparent: true })];
            for(let s = 0; s < 30; s++) {
                const rLed = new THREE.Mesh(ledGeo, rearLedMaterials[Math.floor(Math.random() * rearLedMaterials.length)]);
                rLed.position.set(
                    -0.3 + Math.random() * 0.6, 
                    -0.9 + Math.random() * 1.8, 
                    -0.625 // Rear door
                );
                rLed.rotation.y = Math.PI;
                rLed.userData = { 
                    blinkRate: Math.random() * 0.1 + 0.02, 
                    progress: Math.random() * Math.PI * 2,
                    baseOpacity: 0.8 + Math.random() * 0.2
                };
                rack.add(rLed);
                serverLEDs.push(rLed);
            }

            // Split wardrobe-style rear doors (perforated)
            const doorGeo = new THREE.PlaneGeometry(0.35, 2.0);
            const doorMat = new THREE.MeshStandardMaterial({ color: 0x111827, wireframe: true, transparent: true, opacity: 0.8 });
            const rearDoorL = new THREE.Mesh(doorGeo, doorMat);
            rearDoorL.position.set(-0.18, 0, -0.61);
            const rearDoorR = new THREE.Mesh(doorGeo, doorMat);
            rearDoorR.position.set(0.18, 0, -0.61);
            rack.add(rearDoorL, rearDoorR);

            // Interior: Zero-U intelligent switched PDUs
            const pduGeo = new THREE.BoxGeometry(0.06, 1.9, 0.04);
            const pduMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.3 });
            const pdu1 = new THREE.Mesh(pduGeo, pduMat);
            pdu1.position.set(-0.33, 0, -0.55);
            
            // Add outlets to PDUs
            const outletGeo = new THREE.BoxGeometry(0.03, 0.02, 0.01);
            const outletMat = new THREE.MeshBasicMaterial({ color: 0x374151 });
            for (let out = 0; out < 20; out++) {
                const outlet = new THREE.Mesh(outletGeo, outletMat);
                outlet.position.set(0, -0.9 + (out * 0.095), -0.02);
                pdu1.add(outlet);
            }
            
            const pdu2 = pdu1.clone();
            pdu2.position.set(0.33, 0, -0.55);
            rack.add(pdu1, pdu2);

            // --- CURVED OVERHEAD DROPS ---
            // Local coordinates: Top of rack is Y=1.05. Tray is Y=1.55. Back of rack is Z=-0.6.
            
            // Blue drop (Cat6)
            const curveBlue = new THREE.CatmullRomCurve3([
                new THREE.Vector3(0.15, 1.85, -0.6),  // Tap into main trunk on tray
                new THREE.Vector3(0.15, 1.6, -0.6),   // Vertical drop
                new THREE.Vector3(0.15, 1.2, -0.6),   // Smooth curve
                new THREE.Vector3(0.15, 1.05, -0.6)   // Vertical drop straight into rack roof
            ]);
            const dropGeoBlue = new THREE.TubeGeometry(curveBlue, 16, 0.02, 8, false);
            const dropBlue = new THREE.Mesh(dropGeoBlue, cableMatBlue);
            
            // Wire mesh Waterfall Guide (small bracket routing cables down)
            const waterfallGeo = new THREE.BoxGeometry(0.3, 0.8, 0.05, 4, 3, 1);
            const waterfall = new THREE.Mesh(waterfallGeo, trayMat);
            waterfall.position.set(0.15, 1.45, -0.57);

            rack.add(dropBlue, waterfall);

            // Internal patch cables plugging into servers
            const patchGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.25, 8);
            for(let c = 0; c < 12; c++) {
                const patch = new THREE.Mesh(patchGeo, cableMatBlue);
                patch.rotation.z = Math.PI / 2;
                patch.position.set(0.15, -0.8 + (c * 0.15), -0.55);
                rack.add(patch);
            }

            // Magnetic Digital Temp & Humidity (EMS) sensors
            const emsSensorBase = createStandardBox(0.08, 0.08, 0.02, 0x1f2937);
            const emsScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.04), new THREE.MeshBasicMaterial({ color: 0x0ea5e9 }));
            emsScreen.position.set(0, 0, 0.011);
            emsSensorBase.add(emsScreen);
            
            // Sensor on Front door (Cold Aisle)
            const emsFront = emsSensorBase.clone();
            emsFront.position.set(-0.25, 0.8, 0.63);
            
            // Sensor on Rear door (Hot Aisle)
            const emsRear = emsSensorBase.clone();
            emsRear.position.set(0.25, 0.8, -0.63);
            emsRear.rotation.y = Math.PI;

            rack.add(emsFront, emsRear);

            rack.userData = { specKey: "racks" };
            interactableObjects.push(rack);
            racksGroup.add(rack);
        }
    }

    // --- AISLE LIGHTING (Casts a blue glow on the reflective floor) ---
    const blueLight1 = new THREE.PointLight(0x00aaff, 2.0, 15);
    blueLight1.position.set(0, 1.0, 0); // Center of the aisle
    const blueLight2 = new THREE.PointLight(0x0088ff, 1.5, 12);
    blueLight2.position.set(-1.5, 1.0, 0); // Left side of aisle
    const blueLight3 = new THREE.PointLight(0x0088ff, 1.5, 12);
    blueLight3.position.set(1.5, 1.0, 0); // Right side of aisle
    
    // --- MODERN AISLE PATH LIGHTING (LED Strips) ---
    const stripPathGeo = new THREE.PlaneGeometry(3.2, 0.03);
    stripPathGeo.rotateX(-Math.PI / 2);
    
    const stripPathMatCold = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.9 });
    const floorStripL = new THREE.Mesh(stripPathGeo, stripPathMatCold);
    floorStripL.position.set(0, 0.05, 0.65); // Raised to prevent z-fighting with floor
    
    const stripPathMatHot = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.9 });
    const floorStripR = new THREE.Mesh(stripPathGeo, stripPathMatHot);
    floorStripR.position.set(0, 0.05, -0.65);
    
    racksGroup.add(floorStripL, floorStripR);
    // --- PERFORATED COLD AISLE FLOOR TILES ---
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#94a3b8'; // Metallic grey frame
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#020617'; // Dark holes
    for(let x = 4; x < 128; x += 12) {
        for(let y = 4; y < 128; y += 12) {
            ctx.fillRect(x, y, 6, 6);
        }
    }
    const grateTex = new THREE.CanvasTexture(canvas);
    grateTex.wrapS = THREE.RepeatWrapping;
    grateTex.wrapT = THREE.RepeatWrapping;
    grateTex.repeat.set(1, 2);

    const grateMat = new THREE.MeshStandardMaterial({
        map: grateTex,
        roughness: 0.5,
        metalness: 0.7
    });

    const tileGeo = new THREE.PlaneGeometry(0.8, 1.18); 
    tileGeo.rotateX(-Math.PI / 2);
    
    // Place one tile directly in front of each rack pair
    for (let i = 0; i < 4; i++) {
        const xPos = -1.2 + i * 0.8; 
        const tile = new THREE.Mesh(tileGeo, grateMat);
        tile.position.set(xPos, 0.005, 0); // 5mm above the solid floor
        racksGroup.add(tile);
    }

    // --- COLD AISLE CONTAINMENT (CAC) ---
    const cacGlassMat = new THREE.MeshStandardMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.3,
        roughness: 0.1,
        metalness: 0.8,
        side: THREE.DoubleSide
    });

    // Glass Roof
    const roofGeo = new THREE.BoxGeometry(3.2, 0.04, 1.18);
    const roof = new THREE.Mesh(roofGeo, cacGlassMat);
    roof.position.set(0, 2.12, 0); // Just above racks
    
    // Roof Frame
    const roofFrameGeo = new THREE.BoxGeometry(3.25, 0.06, 1.23);
    const roofFrameMat = new THREE.MeshStandardMaterial({ color: 0x334155, wireframe: true });
    const roofFrame = new THREE.Mesh(roofFrameGeo, roofFrameMat);
    roofFrame.position.set(0, 2.12, 0);

    // Sliding Glass Doors (Left & Right Ends of Aisle)
    const doorGeo = new THREE.PlaneGeometry(1.18, 2.1);
    const doorL = new THREE.Mesh(doorGeo, cacGlassMat);
    doorL.position.set(-1.6, 1.05, 0);
    doorL.rotation.y = Math.PI / 2;

    const doorR = new THREE.Mesh(doorGeo, cacGlassMat);
    doorR.position.set(1.6, 1.05, 0);
    doorR.rotation.y = -Math.PI / 2;

    racksGroup.add(roof, roofFrame, doorL, doorR);

    scene.add(racksGroup);
}

// N+1 Redundant 80kW PAC Units positioned against angled walls
function spawnPrecisionCooling() {
    function createModernPAC() {
        const pacGroup = new THREE.Group();
        
        // 1. Main Cabinet Body (Lighter dark-grey so shadows are visible)
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4, metalness: 0.1 });
        const bodyGeo = new THREE.BoxGeometry(2.1, 2.4, 1.0);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.castShadow = true;
        body.receiveShadow = true;
        pacGroup.add(body);

        // 2. Base Plinth (Black base)
        const baseGeo = new THREE.BoxGeometry(2.1, 0.15, 0.95);
        const baseMat = new THREE.MeshStandardMaterial({ color: 0x030712 });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.set(0, -1.125, 0);
        pacGroup.add(base);

        // 3. Three Front Doors
        const doorWidth = 0.65;
        const doorHeight = 2.2;
        const doorDepth = 0.04;
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.4 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 }); // For grilles backing
        const silverMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 });

        for (let i = 0; i < 3; i++) {
            const doorGroup = new THREE.Group();
            const xOffset = (i - 1) * 0.68; 
            doorGroup.position.set(xOffset, 0.05, 0.51);

            // Door panel
            const door = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth), doorMat);
            doorGroup.add(door);

            // Door Handle
            const handle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.03), silverMat);
            handle.position.set(i === 0 ? 0.28 : -0.28, 0, 0.03); // Handles on edges
            doorGroup.add(handle);

            // Lower Ventilation Grille (Cutout backing + Slats)
            const grilleWidth = 0.5;
            const grilleHeight = 0.8;
            const grilleBacking = new THREE.Mesh(new THREE.PlaneGeometry(grilleWidth, grilleHeight), darkMat);
            grilleBacking.position.set(0, -0.5, 0.021);
            doorGroup.add(grilleBacking);

            // 3D Louvers (Slats) for Lower Grille
            const slatGeo = new THREE.BoxGeometry(grilleWidth, 0.015, 0.02);
            for (let s = 0; s < 25; s++) {
                const slat = new THREE.Mesh(slatGeo, doorMat);
                slat.position.set(0, -0.88 + (s * 0.032), 0.025);
                slat.rotation.x = 0.2; // Angle downwards
                doorGroup.add(slat);
            }

            // Upper Ventilation Grille (only on outer doors)
            if (i !== 1) {
                const topGrilleBacking = new THREE.Mesh(new THREE.PlaneGeometry(grilleWidth, 0.4), darkMat);
                topGrilleBacking.position.set(0, 0.7, 0.021);
                doorGroup.add(topGrilleBacking);
                
                for (let s = 0; s < 12; s++) {
                    const slat = new THREE.Mesh(slatGeo, doorMat);
                    slat.position.set(0, 0.52 + (s * 0.032), 0.025);
                    slat.rotation.x = 0.2;
                    doorGroup.add(slat);
                }
            }

            // Center door gets the Control Panel
            if (i === 1) {
                // Screen housing
                const screenBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.25, 0.03), darkMat);
                screenBox.position.set(0, 0.6, 0.03);
                doorGroup.add(screenBox);

                // LCD Screen
                const lcd = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.16), new THREE.MeshBasicMaterial({ color: 0x0ea5e9 }));
                lcd.position.set(-0.02, 0.62, 0.046);
                doorGroup.add(lcd);

                // UI Lines on screen (Fake text)
                const uiLine1 = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.015), new THREE.MeshBasicMaterial({ color: 0xffffff }));
                uiLine1.position.set(-0.02, 0.67, 0.047);
                const uiLine2 = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.015), new THREE.MeshBasicMaterial({ color: 0xffffff }));
                uiLine2.position.set(-0.05, 0.64, 0.047);
                doorGroup.add(uiLine1, uiLine2);

                // LED Indicators & Buttons
                const btnGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.01, 8);
                btnGeo.rotateX(Math.PI / 2);
                
                const btnGreen = new THREE.Mesh(btnGeo, new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x10b981, emissiveIntensity: 0.5 }));
                btnGreen.position.set(0.15, 0.65, 0.046);
                const btnRed = new THREE.Mesh(btnGeo, new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.5 }));
                btnRed.position.set(0.15, 0.59, 0.046);
                
                // E-Stop button (larger, red)
                const estopGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.015, 12);
                estopGeo.rotateX(Math.PI / 2);
                const estop = new THREE.Mesh(estopGeo, new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.2 }));
                estop.position.set(0, 0.45, 0.035);
                
                // Warning Label (Yellow)
                const warnLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.05), new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
                warnLabel.position.set(0, 0.35, 0.021);

                doorGroup.add(btnGreen, btnRed, estop, warnLabel);
            }

            pacGroup.add(doorGroup);
        }

        // Condensate / Insulated copper lines running into plenum floor
        const pipeGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8);
        const pipeMat = new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.8 });
        const pipe1 = new THREE.Mesh(pipeGeo, pipeMat);
        pipe1.position.set(0.8, -0.6, 0.2);
        const pipe2 = new THREE.Mesh(pipeGeo, new THREE.MeshStandardMaterial({ color: 0xb45309 })); // Copper
        pipe2.position.set(0.9, -0.6, 0.2);
        pacGroup.add(pipe1, pipe2);

        // Make the body interactive
        body.userData = { specKey: "cooling" };
        interactableObjects.push(body);

        return pacGroup;
    }

    // PAC wall vector is (-8, 10).
    const pacAngle = -Math.atan2(10, -8);
    
    const pac1 = createModernPAC();
    pac1.position.set(14.12, 1.55, 6.34); 
    pac1.rotation.y = pacAngle; 
    scene.add(pac1);

    const pac2 = createModernPAC();
    pac2.position.set(11.00, 1.55, 10.25);
    pac2.rotation.y = pacAngle;
    scene.add(pac2);

    function createOutdoorPAC() {
        const outGroup = new THREE.Group();
        
        // Base Pallet (wooden)
        const palletGeo = new THREE.BoxGeometry(2.3, 0.1, 1.2);
        const palletMat = new THREE.MeshStandardMaterial({ color: 0xc19a6b, roughness: 0.9 });
        const pallet = new THREE.Mesh(palletGeo, palletMat);
        pallet.position.set(0, -1.15, 0);
        outGroup.add(pallet);

        // Lower body (solid grey)
        const lowerBodyGeo = new THREE.BoxGeometry(2.2, 1.0, 1.1);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.5, metalness: 0.2 });
        const lowerBody = new THREE.Mesh(lowerBodyGeo, bodyMat);
        lowerBody.position.set(0, -0.6, 0);
        outGroup.add(lowerBody);

        // Upper body (grey frame)
        const upperBodyGeo = new THREE.BoxGeometry(2.2, 1.4, 1.1);
        const upperBody = new THREE.Mesh(upperBodyGeo, bodyMat);
        upperBody.position.set(0, 0.6, 0);
        outGroup.add(upperBody);

        // Grilles on the front of upper body
        const grilleGeo = new THREE.PlaneGeometry(1.0, 0.6);
        const grilleMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.8 });
        const frameMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0 });
        
        for (let row = 0; row < 2; row++) {
            for (let col = 0; col < 2; col++) {
                const xPos = (col === 0) ? -0.52 : 0.52;
                const yPos = (row === 0) ? 0.9 : 0.25;
                
                const grille = new THREE.Mesh(grilleGeo, grilleMat);
                grille.position.set(xPos, yPos, 0.551);
                
                // Add fins
                for(let f = 0; f < 10; f++) {
                    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.01, 0.01), frameMat);
                    fin.position.set(0, -0.25 + (f * 0.055), 0.01);
                    grille.add(fin);
                }
                outGroup.add(grille);
            }
        }
        
        // Control box on the side
        const ctrlBox = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.4, 0.3), new THREE.MeshStandardMaterial({ color: 0x475569 }));
        ctrlBox.position.set(-1.15, 0, 0);
        outGroup.add(ctrlBox);

        outGroup.userData = { specKey: "cooling" };
        interactableObjects.push(upperBody, lowerBody);

        return outGroup;
    }

    // Outdoor Unit (Large single unit based on floor plan)
    const outdoor1 = createOutdoorPAC();
    outdoor1.scale.set(1.5, 1.5, 1.5);
    outdoor1.position.set(14.34, 1.8, 10.87);
    outdoor1.rotation.y = pacAngle + Math.PI; // Face the wall
    scene.add(outdoor1);

    // Pipelines from Outdoor to Indoor
    const outPipeMat = new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.8 }); // Black insulation
    const copperMat = new THREE.MeshStandardMaterial({ color: 0xb45309 }); // Copper
    
    // PAC pipes connecting through the wall
    const pipeAngle = -Math.atan2(-8, 10); // Normal outward vector
    const pipe1A = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.0, 8), outPipeMat);
    pipe1A.rotation.x = Math.PI / 2;
    pipe1A.rotation.z = pipeAngle;
    pipe1A.position.set(12.6, 0.15, 9.6);
    const pipe1B = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.0, 8), copperMat);
    pipe1B.rotation.x = Math.PI / 2;
    pipe1B.rotation.z = pipeAngle;
    pipe1B.position.set(12.7, 0.15, 9.7);
    scene.add(pipe1A, pipe1B);
}

// 2N Standalone UPS Units positioned along Top Wall
function spawnPowerSystems() {
    const powerGroup = new THREE.Group();
    powerGroup.position.set(0, 0.35, 0); 

    const upsGeo = new THREE.BoxGeometry(1.2, 2.0, 1.0);
    const upsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 });
    const batteryMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.5 });

    // UPS 01 & Battery
    const ups1 = new THREE.Mesh(upsGeo, upsMat);
    ups1.position.set(3.0, 1.0, 1.2);
    ups1.castShadow = true;
    const bat1 = new THREE.Mesh(upsGeo, batteryMat);
    bat1.position.set(4.2, 1.0, 1.2);
    bat1.castShadow = true;

    // UPS 02 & Battery
    const ups2 = new THREE.Mesh(upsGeo, upsMat);
    ups2.position.set(8.0, 1.0, 1.2);
    ups2.castShadow = true;
    const bat2 = new THREE.Mesh(upsGeo, batteryMat);
    bat2.position.set(9.2, 1.0, 1.2);
    bat2.castShadow = true;

    // Full Desktop Computer Setup in the Alcove
    const deskGroup = new THREE.Group();
    deskGroup.position.set(13.5, 0.35, 2.0);
    
    // Table
    const tableMat = new THREE.MeshStandardMaterial({color: 0x334155, roughness: 0.8});
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.05, 1.0), tableMat);
    tableTop.position.set(0, 0.75, 0);
    
    const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.75, 8);
    const legMat = new THREE.MeshStandardMaterial({color: 0x94a3b8, metalness: 0.8});
    [[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]].forEach(pos => {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(pos[0], 0.375, pos[1]);
        deskGroup.add(leg);
    });

    // Ergonomic Office Chair
    const chairBase = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.6), new THREE.MeshStandardMaterial({color: 0x111111}));
    chairBase.position.set(0, 0.2, 0.7);
    const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.1), new THREE.MeshStandardMaterial({color: 0x111111}));
    chairBack.position.set(0, 0.7, 0.95);
    deskGroup.add(tableTop, chairBase, chairBack);

    // Desktop PC Tower (on floor)
    const pcMat = new THREE.MeshStandardMaterial({color: 0x0f172a, roughness: 0.3});
    const pcTower = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.55, 0.5), pcMat);
    pcTower.position.set(0.7, 0.275, 0.2);
    deskGroup.add(pcTower);

    // Dual Monitors
    const monitorGeo = new THREE.BoxGeometry(0.6, 0.35, 0.05);
    const monitorScreenMat = new THREE.MeshBasicMaterial({color: 0x0ea5e9}); // glowing blue screen
    const bezelMat = new THREE.MeshStandardMaterial({color: 0x000000});

    const m1 = new THREE.Mesh(monitorGeo, bezelMat);
    m1.position.set(-0.32, 0.95, -0.2);
    m1.rotation.y = Math.PI / 8; // angled inward
    const s1 = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.31), monitorScreenMat);
    s1.position.set(0, 0, 0.026);
    m1.add(s1);

    const m2 = new THREE.Mesh(monitorGeo, bezelMat);
    m2.position.set(0.32, 0.95, -0.2);
    m2.rotation.y = -Math.PI / 8; // angled inward
    const s2 = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.31), monitorScreenMat);
    s2.position.set(0, 0, 0.026);
    m2.add(s2);

    // Monitor Stands
    const standGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.15, 8);
    const stand1 = new THREE.Mesh(standGeo, legMat);
    stand1.position.set(-0.32, 0.85, -0.25);
    const stand2 = new THREE.Mesh(standGeo, legMat);
    stand2.position.set(0.32, 0.85, -0.25);

    // Keyboard & Mouse
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, 0.15), pcMat);
    kb.position.set(0, 0.785, 0.2);
    const mouse = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.1), pcMat);
    mouse.position.set(0.35, 0.785, 0.2);

    deskGroup.add(m1, m2, stand1, stand2, kb, mouse);
    scene.add(deskGroup);

    // Screens
    const screenGeo = new THREE.PlaneGeometry(0.4, 0.3);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9 });

    // --- PERFORATED VENTILATION TILES (for UPS) ---
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#94a3b8'; // Metallic grey frame
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#020617'; // Dark holes
    for(let x = 4; x < 128; x += 12) {
        for(let y = 4; y < 128; y += 12) {
            ctx.fillRect(x, y, 6, 6);
        }
    }
    const grateTex = new THREE.CanvasTexture(canvas);
    grateTex.wrapS = THREE.RepeatWrapping;
    grateTex.wrapT = THREE.RepeatWrapping;
    grateTex.repeat.set(1, 1);

    const grateMat = new THREE.MeshStandardMaterial({
        map: grateTex,
        roughness: 0.5,
        metalness: 0.7
    });

    const tileGeo = new THREE.PlaneGeometry(1.2, 0.8);
    tileGeo.rotateX(-Math.PI / 2);
    
    [ups1, ups2].forEach(ups => {
        const screen = new THREE.Mesh(screenGeo, screenMat);
        screen.position.set(0, 0.6, 0.51);
        ups.add(screen);

        const tile = new THREE.Mesh(tileGeo, grateMat);
        // Place tile at world Y = 0.355 (0.35 raised floor + 0.005 offset)
        // UPS world Y is 1.35 (powerGroup Y=0.35 + ups Y=1.0)
        // Tile local Y = 0.355 - 1.35 = -0.995
        tile.position.set(0, -0.995, 0.9);
        ups.add(tile);

        ups.userData = { specKey: "power" };
        interactableObjects.push(ups);
        powerGroup.add(ups);
    });

    [bat1, bat2].forEach(bat => {
        // Battery management indicators (rows of LEDs)
        const ledGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.02, 8);
        ledGeo.rotateX(Math.PI / 2);
        const ledMatGreen = new THREE.MeshBasicMaterial({ color: 0x10b981 });
        const ledMatRed = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 4; col++) {
                // Occasional red/amber led for realism, mostly green
                const isRed = Math.random() > 0.9;
                const led = new THREE.Mesh(ledGeo, isRed ? ledMatRed : ledMatGreen);
                led.position.set(-0.2 + (col * 0.13), 0.6 - (row * 0.15), 0.51);
                bat.add(led);
            }
        }
        bat.userData = { specKey: "power" };
        interactableObjects.push(bat);
        powerGroup.add(bat);
    });

    // Wall-mounted panel on Left Wall (Detailed Power Distribution Board)
    const dbGroup = new THREE.Group();
    dbGroup.position.set(0.15, 1.8, 4.5); 
    dbGroup.rotation.y = Math.PI / 2;

    const panelBacking = createStandardBox(1.2, 1.4, 0.15, 0x1f2937); // Dark gray box
    dbGroup.add(panelBacking);

    // Clear safety glass cover
    const glassCover = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.35, 0.05), new THREE.MeshStandardMaterial({ 
        color: 0x0ea5e9, transparent: true, opacity: 0.2, roughness: 0.1, metalness: 0.9 
    }));
    glassCover.position.set(0, 0, 0.09);
    dbGroup.add(glassCover);

    // Miniature Circuit Breakers (MCBs) - 3 rows
    const mcbGeo = new THREE.BoxGeometry(0.04, 0.1, 0.06);
    const mcbMat = new THREE.MeshStandardMaterial({ color: 0xf3f4f6 }); // white breakers
    const switchMat = new THREE.MeshStandardMaterial({ color: 0xef4444 }); // red switch
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 18; c++) {
            const mcb = new THREE.Mesh(mcbGeo, mcbMat);
            mcb.position.set(-0.4 + (c * 0.045), 0.3 - (r * 0.25), 0.08);
            
            const mcbSwitch = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.03, 0.03), switchMat);
            mcbSwitch.position.set(0, 0.02, 0.03);
            mcb.add(mcbSwitch);
            dbGroup.add(mcb);
        }
    }

    // Digital Meters (kWh)
    const meterGeo = new THREE.BoxGeometry(0.2, 0.15, 0.04);
    const meterMat = new THREE.MeshStandardMaterial({ color: 0x111827 });
    const screenGeoPower = new THREE.PlaneGeometry(0.16, 0.1);
    const screenMatPower = new THREE.MeshBasicMaterial({ color: 0x10b981 }); // bright green text display
    
    for (let m = 0; m < 3; m++) {
        const meter = new THREE.Mesh(meterGeo, meterMat);
        meter.position.set(-0.4 + (m * 0.25), 0.55, 0.08);
        
        const screen = new THREE.Mesh(screenGeoPower, screenMatPower);
        screen.position.set(0, 0, 0.021);
        meter.add(screen);
        dbGroup.add(meter);
    }

    // Prominent Red Emergency Power Off (EPO) push button
    const epoHousing = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.05), new THREE.MeshStandardMaterial({ color: 0xfacc15 })); // yellow housing
    epoHousing.position.set(0.45, 0.55, 0.08);
    const epoButton = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.04, 16), new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.2 }));
    epoButton.rotateX(Math.PI / 2);
    epoButton.position.set(0, 0, 0.03);
    epoHousing.add(epoButton);
    dbGroup.add(epoHousing);

    dbGroup.userData = { specKey: "power" };
    interactableObjects.push(panelBacking, glassCover);
    powerGroup.add(dbGroup);

    scene.add(powerGroup);
}

// Fire Suppression Systems placed in the top-left corner
function spawnFireAndEMS() {
    const fireGroup = new THREE.Group();

    // Red painted ceiling piping infrastructure
    const pipeMaterial = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.1 });
    
    // Generate a comprehensive pipe grid across the entire ceiling
    for (let z = 2; z <= 12; z += 3) {
        let minX = (z > 7.2) ? (z - 7.2) / 0.85 : 0;
        let maxX = (z > 4) ? 8 + (14 - z) / 1.25 : 16;
        let length = maxX - minX;
        let pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, length, 12), pipeMaterial);
        pipe.rotation.z = Math.PI / 2;
        pipe.position.set((maxX + minX) / 2, 3.3, z);
        fireGroup.add(pipe);
    }
    for (let x = 2; x <= 14; x += 3) {
        let maxZ = (x <= 8) ? 7.2 + 0.85 * x : 14 - 1.25 * (x - 8);
        let pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, maxZ, 12), pipeMaterial);
        pipe.rotation.x = Math.PI / 2;
        pipe.position.set(x, 3.3, maxZ / 2);
        fireGroup.add(pipe);
    }

    // Gas tanks OUTSIDE the room near the Left Wall
    const tankGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.5, 16);
    for (let i = 0; i < 4; i++) {
        const tank = new THREE.Mesh(tankGeo, pipeMaterial);
        // Placed outside Left Wall (X = -1.0)
        tank.position.set(-1.0, 1.05, 7.25 + i * 0.5);
        fireGroup.add(tank);
    }

    // Short pipes from each tank up to manifold
    const shortPipeGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.15, 8);
    for (let i = 0; i < 4; i++) {
        const shortPipe = new THREE.Mesh(shortPipeGeo, pipeMaterial);
        shortPipe.position.set(-1.0, 1.875, 7.25 + i * 0.5);
        fireGroup.add(shortPipe);
    }

    // Manifold pipe connecting tanks horizontally (along Z axis)
    const manifoldGeo = new THREE.CylinderGeometry(0.06, 0.06, 2.0, 12);
    const manifold = new THREE.Mesh(manifoldGeo, pipeMaterial);
    manifold.rotation.x = Math.PI / 2;
    manifold.position.set(-1.0, 1.95, 8.0);
    
    // Vertical pipe going up
    const vertPipeGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.35, 12);
    const vertPipe = new THREE.Mesh(vertPipeGeo, pipeMaterial);
    vertPipe.position.set(-1.0, 2.625, 8.0);
    
    // Horizontal pipe coming into the room (along X axis, through the wall)
    const entryPipeGeo = new THREE.CylinderGeometry(0.06, 0.06, 3.0, 12);
    const entryPipe = new THREE.Mesh(entryPipeGeo, pipeMaterial);
    entryPipe.rotation.z = Math.PI / 2;
    // Goes from X=-1.0 to X=2.0 to intersect the generated grid at Z=8.0
    entryPipe.position.set(0.5, 3.3, 8.0);

    fireGroup.add(manifold, vertPipe, entryPipe);

    // Brass 360-degree discharge nozzles
    const nozzleGeo = new THREE.CylinderGeometry(0.03, 0.05, 0.22, 8);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0xca8a04, metalness: 0.85, roughness: 0.15 });

    for (let x = 2; x <= 14; x += 3) {
        for (let z = 2; z <= 12; z += 3) {
            let minX = (z > 7.2) ? (z - 7.2) / 0.85 : 0;
            let maxX = (z > 4) ? 8 + (14 - z) / 1.25 : 16;
            let maxZ = (x <= 8) ? 7.2 + 0.85 * x : 14 - 1.25 * (x - 8);
            
            if (x >= minX && x <= maxX && z <= maxZ) {
                const nozzleC = new THREE.Mesh(nozzleGeo, nozzleMat);
                nozzleC.position.set(x, 3.15, z);
                fireGroup.add(nozzleC);
                
                const nozzleF = new THREE.Mesh(nozzleGeo, nozzleMat);
                nozzleF.rotation.x = Math.PI; // point up
                nozzleF.position.set(x, 0.11, z);
                fireGroup.add(nozzleF);
            }
        }
    }

    // VESDA Air-Sampling Pipes (Thin Red ABS) & Smoke Detectors
    const vesdaMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
    const vesdaGeo = new THREE.CylinderGeometry(0.02, 0.02, 10, 8);
    vesdaGeo.rotateX(Math.PI / 2);
    
    const vesdaPipe1 = new THREE.Mesh(vesdaGeo, vesdaMat);
    vesdaPipe1.position.set(3.5, 3.4, 5);
    const vesdaPipe2 = new THREE.Mesh(vesdaGeo, vesdaMat);
    vesdaPipe2.position.set(6.5, 3.4, 5);
    
    // Optical Smoke Detectors (White Domes)
    const detectorGeo = new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const detectorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    [[3.5, 2], [3.5, 5], [3.5, 8], [6.5, 2], [6.5, 5], [6.5, 8]].forEach(pos => {
        const det = new THREE.Mesh(detectorGeo, detectorMat);
        det.position.set(pos[0], 3.45, pos[1]);
        det.rotation.x = Math.PI; // Dome facing down
        
        // Small blinking LED
        const led = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0x10b981 }));
        led.position.set(0, -0.1, 0);
        det.add(led);
        
        fireGroup.add(det);
    });

    fireGroup.add(vesdaPipe1, vesdaPipe2);

    fireGroup.userData = { specKey: "fire" };
    interactableObjects.push(entryPipe);
    scene.add(fireGroup);
}

// Underfloor Plenum Structure & Piping (Visible via transparent cutaway)
function buildPlenumSubFloorInfrastructure() {
    const subGroup = new THREE.Group();
    // Align perfectly with the server racks!
    subGroup.position.set(5.0, 0, 6.8); 
    subGroup.rotation.y = -Math.atan2(-6.8, -8.0) + Math.PI; 

    // 1. Two separate segregated steel cable trays (Wireframe baskets)
    const trayMatA = new THREE.MeshStandardMaterial({ color: 0x94a3b8, wireframe: true });
    const trayMatB = new THREE.MeshStandardMaterial({ color: 0x475569, wireframe: true });
    const trayGeo = new THREE.BoxGeometry(4.0, 0.05, 0.4, 24, 1, 3);
    
    // Tray A under Row 0
    const trayA = new THREE.Mesh(trayGeo, trayMatA);
    trayA.position.set(0, 0.15, -1.3); // Positioned inside the plenum (floor is Y=0.35, subfloor is Y=0)
    
    // Power cables in Tray A (Red)
    const pwrMatA = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.6 });
    const pwrCableGeo = new THREE.CylinderGeometry(0.04, 0.04, 4.0, 8);
    pwrCableGeo.rotateZ(Math.PI / 2);
    const pwrCableA1 = new THREE.Mesh(pwrCableGeo, pwrMatA);
    pwrCableA1.position.set(0, 0.16, -1.35);
    const pwrCableA2 = new THREE.Mesh(pwrCableGeo, pwrMatA);
    pwrCableA2.position.set(0, 0.16, -1.25);

    // Tray B under Row 1
    const trayB = new THREE.Mesh(trayGeo, trayMatB);
    trayB.position.set(0, 0.15, 1.3);
    
    // Power cables in Tray B (Blue)
    const pwrMatB = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.6 });
    const pwrCableB1 = new THREE.Mesh(pwrCableGeo, pwrMatB);
    pwrCableB1.position.set(0, 0.16, 1.35);
    const pwrCableB2 = new THREE.Mesh(pwrCableGeo, pwrMatB);
    pwrCableB2.position.set(0, 0.16, 1.25);
    
    subGroup.add(trayA, trayB, pwrCableA1, pwrCableA2, pwrCableB1, pwrCableB2);

    // Cable drops directly from the trays up into the racks
    for (let i = 0; i < 4; i++) {
        const xPos = -1.2 + i * 0.8;
        
        // Row 0 Drop
        const dropA = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 8), pwrMatA);
        dropA.position.set(xPos, 0.27, -1.3);
        subGroup.add(dropA);

        // Row 1 Drop
        const dropB = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 8), pwrMatB);
        dropB.position.set(xPos, 0.27, 1.3);
        subGroup.add(dropB);
    }

    // 3. Winding water leak detection rope
    const leakRopeGeo = new THREE.BoxGeometry(0.04, 0.04, 4.0);
    const leakRopeMat = new THREE.MeshBasicMaterial({ color: 0xf97316 }); // Orange
    const leakRope = new THREE.Mesh(leakRopeGeo, leakRopeMat);
    leakRope.position.set(0, 0.02, 0); // Runs along the center
    subGroup.add(leakRope);

    // Copper Technical Ground Busbar
    const busbarGeo = new THREE.BoxGeometry(3.0, 0.02, 0.05);
    const busbarMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 1.0, roughness: 0.2 });
    const busbar = new THREE.Mesh(busbarGeo, busbarMat);
    busbar.position.set(0, 0.02, 1.8);
    
    // Heavy-duty Grounding Kits (Green/Yellow earth cables)
    const earthMat = new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.8 }); // Yellow-green
    const earthGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.6, 8);
    for(let g=0; g<4; g++) {
        const earthWire = new THREE.Mesh(earthGeo, earthMat);
        earthWire.position.set(-1.0 + (g*0.6), 0.02, 1.55);
        earthWire.rotation.x = Math.PI / 2;
        subGroup.add(earthWire);
    }
    subGroup.add(busbar);

    // 4. Under-Floor Pedestal Support Grid (Room-wide)
    const pedGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.35, 8);
    const pedMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7, metalness: 0.5 });
    
    // Helper function to check if a point is inside the room polygon
    function pointInPolygon(point, vs) {
        let x = point[0], y = point[1];
        let inside = false;
        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            let xi = vs[i].x, yi = vs[i].y;
            let xj = vs[j].x, yj = vs[j].y;
            let intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    // Create a uniform grid across the entire room bounding box
    const pedGroup = new THREE.Group();
    for (let x = 0.3; x <= 16; x += 0.6) {
        for (let z = 0.3; z <= 14; z += 0.6) {
            if (pointInPolygon([x, z], roomPts)) {
                const ped = new THREE.Mesh(pedGeo, pedMat);
                // Positioned from floor (0) to raised floor (0.35)
                ped.position.set(x, 0.175, z);
                pedGroup.add(ped);
            }
        }
    }
    scene.add(pedGroup);

    subGroup.userData = { specKey: "plenum" };
    trayA.userData = { specKey: "plenum" };
    trayB.userData = { specKey: "plenum" };
    leakRope.userData = { specKey: "plenum" };
    interactableObjects.push(trayA, trayB, leakRope);

    // --- COMPREHENSIVE UNDER-FLOOR POWER GRID ---
    // Helper function for drawing cable runs
    function createCableRun(points, material, radius = 0.03) {
        const group = new THREE.Group();
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = new THREE.Vector3(...points[i]);
            const p2 = new THREE.Vector3(...points[i+1]);
            const distance = p1.distanceTo(p2);
            if (distance < 0.001) continue;
            const cylinderGeo = new THREE.CylinderGeometry(radius, radius, distance, 8);
            const cylinder = new THREE.Mesh(cylinderGeo, material);
            cylinder.position.copy(p1).lerp(p2, 0.5);
            cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p2.clone().sub(p1).normalize());
            group.add(cylinder);
            
            const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 8), material);
            sphere.position.copy(p2);
            group.add(sphere);
        }
        return group;
    }

    const matRaw = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5 }); // Black (Raw)
    const matMech = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.5 }); // Orange (Mechanical)
    const matA = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 }); // Red (A-Feed)
    const matB = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.5 }); // Blue (B-Feed)

    // 1. Raw Power from DB Panel to UPS 1 and UPS 2
    const rawToUPS1 = createCableRun([
        [0.2, 1.4, 4.3], [0.2, 0.1, 4.3], [0.2, 0.1, 2.0], [3.0, 0.1, 2.0], [3.0, 0.1, 1.2], [3.0, 1.0, 1.2]
    ], matRaw, 0.04);
    const rawToUPS2 = createCableRun([
        [3.0, 0.1, 2.0], [8.0, 0.1, 2.0], [8.0, 0.1, 1.2], [8.0, 1.0, 1.2]
    ], matRaw, 0.04);
    
    // 2. Mechanical Power to PAC Units
    const mechToPAC2 = createCableRun([
        [0.2, 0.1, 4.3], [0.2, 0.1, 10.25], [11.0, 0.1, 10.25], [11.0, 1.0, 10.25]
    ], matMech, 0.04);
    const mechToPAC1 = createCableRun([
        [11.0, 0.1, 10.25], [14.1, 0.1, 10.25], [14.1, 0.1, 6.34], [14.1, 1.0, 6.34]
    ], matMech, 0.04);

    // 3. Conditioned Power A (Red) from UPS1 to Rack Tray A
    // Tray A ends around [2.64, 0.15, 7.1] in world space
    const feedA = createCableRun([
        [3.3, 1.0, 1.2], [3.3, 0.16, 1.2], [3.3, 0.16, 7.1], [2.64, 0.16, 7.1]
    ], matA, 0.035);

    // 4. Conditioned Power B (Blue) from UPS2 to Rack Tray B
    // Tray B ends around [7.36, 0.15, 6.5] in world space
    const feedB = createCableRun([
        [8.3, 1.0, 1.2], [8.3, 0.16, 1.2], [8.3, 0.16, 6.5], [7.36, 0.16, 6.5]
    ], matB, 0.035);

    const fullGridGroup = new THREE.Group();
    fullGridGroup.add(rawToUPS1, rawToUPS2, mechToPAC2, mechToPAC1, feedA, feedB);
    fullGridGroup.userData = { specKey: "plenum" };
    scene.add(fullGridGroup);

    scene.add(subGroup);
}

// --- Modern Cold Aisle Containment ---

let containmentGroup, leftDoor, rightDoor;
let airflowActive = false;

function buildAirflowContainment() {
    containmentGroup = new THREE.Group();
    // Position/Rotate identically to racksGroup
    containmentGroup.position.set(5.0, 0.35, 6.8);
    containmentGroup.rotation.y = -Math.atan2(-6.8, -8.0) + Math.PI - (Math.PI / 2);
    containmentGroup.visible = false;
    
    // Glass Material
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xbae6fd,
        transparent: true,
        opacity: 0.3,
        roughness: 0.05,
        metalness: 0.1,
        transmission: 0.9,
        ior: 1.5,
        side: THREE.DoubleSide
    });
    
    // Frame Material
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 });
    
    // Roof Panels
    const roofWidth = 3.2; 
    const roofDepth = 1.18;
    const roofGeo = new THREE.BoxGeometry(roofWidth, 0.02, roofDepth);
    const roof = new THREE.Mesh(roofGeo, glassMat);
    roof.position.set(0, 2.11, 0); 
    
    const roofFrameGeo = new THREE.BoxGeometry(roofWidth + 0.04, 0.04, roofDepth + 0.04);
    const roofFrameMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true }); 
    const roofFrame = new THREE.Mesh(roofFrameGeo, roofFrameMat);
    roofFrame.position.set(0, 2.11, 0);
    
    containmentGroup.add(roof, roofFrame);
    
    const doorWidth = 0.04;
    const doorHeight = 2.1;
    const doorDepth = 1.18;
    
    // Left Door Assembly
    leftDoor = new THREE.Group();
    const lGlass = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth), glassMat);
    const lFrame = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.01, doorHeight + 0.01, doorDepth + 0.01), frameMat);
    leftDoor.add(lGlass, lFrame);
    leftDoor.position.set(-1.62, 1.05, 1.18); // Start completely open (slid back)
    
    // Right Door Assembly
    rightDoor = new THREE.Group();
    const rGlass = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, doorDepth), glassMat);
    const rFrame = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.01, doorHeight + 0.01, doorDepth + 0.01), frameMat);
    rightDoor.add(rGlass, rFrame);
    rightDoor.position.set(1.62, 1.05, 1.18); // Start completely open
    
    containmentGroup.add(leftDoor, rightDoor);
    
    // Support posts at the ends of the aisle
    const postGeo = new THREE.BoxGeometry(0.05, 2.1, 0.05);
    const postLFront = new THREE.Mesh(postGeo, frameMat); postLFront.position.set(-1.62, 1.05, 0.59);
    const postLBack = new THREE.Mesh(postGeo, frameMat); postLBack.position.set(-1.62, 1.05, -0.59);
    const postRFront = new THREE.Mesh(postGeo, frameMat); postRFront.position.set(1.62, 1.05, 0.59);
    const postRBack = new THREE.Mesh(postGeo, frameMat); postRBack.position.set(1.62, 1.05, -0.59);
    containmentGroup.add(postLFront, postLBack, postRFront, postRBack);

    scene.add(containmentGroup);
}

let airflowParticleGroup;

function buildModernAirflowEngine() {
    airflowParticleGroup = new THREE.Group();
    airflowParticleGroup.position.set(5.0, 0.35, 6.8);
    airflowParticleGroup.rotation.y = -Math.atan2(-6.8, -8.0) + Math.PI - (Math.PI / 2);
    airflowParticleGroup.visible = false;
    scene.add(airflowParticleGroup);
    
    airflowParticleGroup.updateMatrixWorld();
    
    // World coordinates for targets
    const pac1World = { x: 13.8, z: 5.7 };
    const pac2World = { x: 11.5, z: 9.8 };
    
    // UPS 1 & 2 tile world centers, and exhaust back Z
    const ups1World = { x: 3.0, z: 2.1, backZ: 0.5 };
    const ups2World = { x: 8.0, z: 2.1, backZ: 0.5 };
    const upsTargets = [ups1World, ups2World];
    
    // Keep local coordinates for server rack paths
    const pac1Local = airflowParticleGroup.worldToLocal(new THREE.Vector3(pac1World.x, 0, pac1World.z));
    const pac2Local = airflowParticleGroup.worldToLocal(new THREE.Vector3(pac2World.x, 0, pac2World.z));
    
    const chevronGeo = new THREE.ConeGeometry(0.06, 0.2, 4);
    chevronGeo.rotateX(Math.PI / 2); 
    
    for (let i = 0; i < 400; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
        const mesh = new THREE.Mesh(chevronGeo, mat);
        
        const isUps = Math.random() > 0.75; // 25% of particles go to UPS
        
        const p = {
            mesh: mesh,
            state: Math.floor(Math.random() * 6),
            progress: Math.random(),
            speed: 0.6 + Math.random() * 0.4,
            isUps: isUps,
            pacTargetLocal: Math.random() > 0.5 ? pac1Local : pac2Local,
            pacTargetWorld: Math.random() > 0.5 ? pac1World : pac2World,
            upsTargetWorld: isUps ? upsTargets[Math.floor(Math.random() * upsTargets.length)] : null,
            row: Math.random() > 0.5 ? 1 : -1,
            zOffset: (Math.random() - 0.5) * 2.8, 
            xOffset: (Math.random() - 0.5) * 0.8 
        };
        
        updateParticlePosition(p, p.progress);
        airflowParticleGroup.add(mesh);
        airflowParticles.push(p);
    }
}

function resetModernParticle(p, state) {
    p.state = state;
    p.progress = 0;
}

function updateParticlePosition(p, t) {
    const m = p.mesh;
    let targetColor = 0x0ea5e9; 
    let start, end;
    
    if (p.isUps) {
        // UPS Routing calculated in WORLD coordinates to avoid skewing, then translated to local!
        const uTarget = p.upsTargetWorld;
        const pac = p.pacTargetWorld;
        
        let startW, endW;
        
        if (p.state === 0) { 
            startW = new THREE.Vector3(pac.x + p.xOffset, 2.0, pac.z + p.zOffset);
            endW = new THREE.Vector3(pac.x + p.xOffset, -0.2, pac.z + p.zOffset);
        } else if (p.state === 1) {
            startW = new THREE.Vector3(pac.x + p.xOffset, -0.2, pac.z + p.zOffset);
            endW = new THREE.Vector3(uTarget.x + p.xOffset * 0.5, -0.2, uTarget.z + p.xOffset * 0.5); 
        } else if (p.state === 2) {
            startW = new THREE.Vector3(uTarget.x + p.xOffset * 0.5, -0.2, uTarget.z + p.xOffset * 0.5);
            endW = new THREE.Vector3(uTarget.x + p.xOffset * 0.5, 0.4 + p.progress * 0.2, uTarget.z + p.xOffset * 0.5);
        } else if (p.state === 3) {
            const hY = 0.4 + p.progress * 0.2;
            startW = new THREE.Vector3(uTarget.x + p.xOffset * 0.5, hY, uTarget.z + p.xOffset * 0.5);
            endW = new THREE.Vector3(uTarget.x + p.xOffset * 0.5, hY, uTarget.backZ + p.xOffset * 0.5);
            
            const col = new THREE.Color(0x0ea5e9);
            if (t < 0.5) col.lerp(new THREE.Color(0x10b981), t * 2.0);
            else col.lerp(new THREE.Color(0xef4444), (t - 0.5) * 2.0);
            m.material.color.copy(col);
            targetColor = null; 
        } else if (p.state === 4) {
            const hY = 0.4 + p.progress * 0.2;
            startW = new THREE.Vector3(uTarget.x + p.xOffset * 0.5, hY, uTarget.backZ + p.xOffset * 0.5);
            endW = new THREE.Vector3(uTarget.x + p.xOffset * 0.5, 3.65, uTarget.backZ + p.xOffset * 0.5);
            targetColor = 0xef4444;
        } else if (p.state === 5) {
            startW = new THREE.Vector3(uTarget.x + p.xOffset * 0.5, 3.65, uTarget.backZ + p.xOffset * 0.5);
            endW = new THREE.Vector3(pac.x + p.xOffset, 3.65, pac.z + p.zOffset);
            targetColor = 0xef4444;
        }
        
        if (startW && endW) {
            const currentW = new THREE.Vector3().lerpVectors(startW, endW, t);
            m.position.copy(airflowParticleGroup.worldToLocal(currentW));
            
            const endL = airflowParticleGroup.worldToLocal(endW.clone());
            const startL = airflowParticleGroup.worldToLocal(startW.clone());
            const dir = new THREE.Vector3().subVectors(endL, startL).normalize();
            if (dir.lengthSq() > 0.001) {
                m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
            }
        }
    } else {
        // Server Racks Routing
        const pac = p.pacTargetLocal;
        const targetY = 0.2 + (Math.abs(p.zOffset) % 1.5); 
        
        if (p.state === 0) { 
            start = new THREE.Vector3(pac.x + p.xOffset, 2.0, pac.z + p.zOffset);
            end = new THREE.Vector3(pac.x + p.xOffset, -0.2, pac.z + p.zOffset);
        } else if (p.state === 1) {
            start = new THREE.Vector3(pac.x + p.xOffset, -0.2, pac.z + p.zOffset);
            end = new THREE.Vector3(p.xOffset * 0.5, -0.2, p.zOffset); 
        } else if (p.state === 2) {
            start = new THREE.Vector3(p.xOffset * 0.5, -0.2, p.zOffset);
            end = new THREE.Vector3(p.xOffset * 0.5, targetY, p.zOffset);
        } else if (p.state === 3) {
            const startX = p.row > 0 ? 0.3 : -0.3;
            const endX = p.row > 0 ? 1.5 : -1.5;
            start = new THREE.Vector3(startX, targetY, p.zOffset);
            end = new THREE.Vector3(endX, targetY, p.zOffset);
            
            const col = new THREE.Color(0x0ea5e9);
            if (t < 0.5) col.lerp(new THREE.Color(0x10b981), t * 2.0);
            else col.lerp(new THREE.Color(0xef4444), (t - 0.5) * 2.0);
            m.material.color.copy(col);
            targetColor = null; 
        } else if (p.state === 4) {
            const startX = p.row > 0 ? 1.5 + p.xOffset * 0.5 : -1.5 + p.xOffset * 0.5;
            start = new THREE.Vector3(startX, targetY, p.zOffset);
            end = new THREE.Vector3(startX + p.row * 0.5, 3.65, p.zOffset);
            targetColor = 0xef4444;
        } else if (p.state === 5) {
            const startX = p.row > 0 ? 2.0 + p.xOffset * 0.5 : -2.0 + p.xOffset * 0.5;
            start = new THREE.Vector3(startX, 3.65, p.zOffset);
            end = new THREE.Vector3(pac.x + p.xOffset, 3.65, pac.z + p.zOffset);
            targetColor = 0xef4444;
        }
    }
    
    if (start && end) {
        m.position.lerpVectors(start, end, t);
        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        if (dir.lengthSq() > 0.001) {
            m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
        }
    }
    if (targetColor) m.material.color.setHex(targetColor);
}

function updateModernAirflow(delta) {
    if (!airflowActive) return;
    
    airflowParticles.forEach(p => {
        p.progress += delta * p.speed * 0.5;
        if (p.progress >= 1.0) {
            let nextState = p.state + 1;
            if (nextState > 5) nextState = 0;
            resetModernParticle(p, nextState);
        }
        updateParticlePosition(p, p.progress);
    });
}

let thermalGroup;
let thermalUniforms = { uTime: { value: 0.0 } };

function spawnThermalAirflowSlices() {
    thermalGroup = new THREE.Group();
    thermalGroup.visible = false;
    thermalGroup.position.set(5.0, 0.35, 6.8);
    thermalGroup.rotation.y = -Math.atan2(-6.8, -8.0) + Math.PI - (Math.PI / 2);
    
    const sliceGeo = new THREE.PlaneGeometry(8.0, 4.0, 64, 32); 
    const count = sliceGeo.attributes.position.count;
    
    for (let s = -1.5; s <= 1.5; s += 0.5) {
        const geo = sliceGeo.clone();
        const colors = new Float32Array(count * 3);
        const tempColor = new THREE.Color();
        
        for(let i = 0; i < count; i++) {
            const lz = geo.attributes.position.getX(i); 
            const ly = geo.attributes.position.getY(i) + 2.0; 
            geo.attributes.position.setY(i, ly);
            
            let heat = 0.0;
            const absZ = Math.abs(lz);
            
            if (absZ < 0.6) {
                // Cold aisle
                heat = ly * 0.15; 
            } else if (absZ >= 0.6 && absZ <= 1.5) {
                // Racks
                const progress = (absZ - 0.6) / 0.9;
                heat = 0.15 + progress * 0.85;
            } else {
                // Hot aisle and return
                const distFromRack = absZ - 1.5;
                heat = 1.0 - (distFromRack * 0.1) - ((4.0 - ly) * 0.05);
            }
            if (ly < 0.35) heat = 0.0; // Sub-floor is ice cold
            
            heat = Math.max(0.0, Math.min(1.0, heat));
            
            const colorBlue = new THREE.Color(0x0284c7); 
            const colorCyan = new THREE.Color(0x06b6d4);
            const colorGreen = new THREE.Color(0x22c55e); 
            const colorYellow = new THREE.Color(0xeab308);
            const colorRed = new THREE.Color(0xef4444); 
            
            if (heat < 0.25) tempColor.lerpColors(colorBlue, colorCyan, heat / 0.25);
            else if (heat < 0.5) tempColor.lerpColors(colorCyan, colorGreen, (heat - 0.25) / 0.25);
            else if (heat < 0.75) tempColor.lerpColors(colorGreen, colorYellow, (heat - 0.5) / 0.25);
            else tempColor.lerpColors(colorYellow, colorRed, (heat - 0.75) / 0.25);
            
            colors[i*3] = tempColor.r;
            colors[i*3+1] = tempColor.g;
            colors[i*3+2] = tempColor.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const vertShader = `
            varying vec3 vColor;
            varying vec3 vLocalPos;
            void main() {
                vColor = color;
                vLocalPos = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;
        
        const fragShader = `
            uniform float uTime;
            varying vec3 vColor;
            varying vec3 vLocalPos;
            
            void main() {
                vec2 flowDir = vec2(0.0, 1.0); // Upwards by default (cold aisle)
                if (abs(vLocalPos.x) > 0.6) {
                    // Moving outwards through the racks and up into the hot aisle
                    flowDir = vec2(sign(vLocalPos.x) * 1.5, 0.8);
                }
                flowDir = normalize(flowDir);
                
                float dist = dot(vLocalPos.xy, flowDir);
                float wave = sin(dist * 15.0 - uTime * 6.0);
                wave = smoothstep(0.8, 1.0, wave); // Sharp energy pulses
                
                vec3 finalColor = vColor * 0.6 + (vColor * wave * 1.5);
                gl_FragColor = vec4(finalColor, 0.75);
            }
        `;
        
        const mat = new THREE.ShaderMaterial({
            vertexShader: vertShader,
            fragmentShader: fragShader,
            uniforms: thermalUniforms,
            vertexColors: true, 
            transparent: true, 
            side: THREE.DoubleSide, 
            depthWrite: false, 
            blending: THREE.AdditiveBlending
        });
        
        const slice = new THREE.Mesh(geo, mat);
        slice.rotation.y = Math.PI / 2;
        slice.position.set(s, 0, 0); 
        thermalGroup.add(slice);
    }
    
    // Horizontal ceiling return layer
    const topGeo = new THREE.PlaneGeometry(8.0, 4.0, 32, 16);
    const topColors = new Float32Array(topGeo.attributes.position.count * 3);
    for(let i=0; i<topGeo.attributes.position.count; i++) {
        topColors[i*3] = 0.93; // Red channel
        topColors[i*3+1] = 0.26; // Green channel
        topColors[i*3+2] = 0.26; // Blue channel
    }
    topGeo.setAttribute('color', new THREE.BufferAttribute(topColors, 3));
    
    const topFragShader = `
        uniform float uTime;
        varying vec3 vColor;
        varying vec3 vLocalPos;
        
        void main() {
            // Horizontal flow towards PAC units
            float wave = sin(vLocalPos.x * 4.0 - uTime * 5.0);
            wave = smoothstep(0.85, 1.0, wave);
            
            vec3 finalColor = vColor * 0.4 + (vec3(1.0, 0.5, 0.2) * wave * 1.2);
            gl_FragColor = vec4(finalColor, 0.5);
        }
    `;
    
    // Use same vertex shader from above loop (redefining it since block scoped)
    const topVertShader = `
        varying vec3 vColor;
        varying vec3 vLocalPos;
        void main() {
            vColor = color;
            vLocalPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `;
    
    const topMat = new THREE.ShaderMaterial({
        vertexShader: topVertShader,
        fragmentShader: topFragShader,
        uniforms: thermalUniforms,
        vertexColors: true, 
        transparent: true,  
        side: THREE.DoubleSide, 
        depthWrite: false, 
        blending: THREE.AdditiveBlending
    });
    
    const topSlice = new THREE.Mesh(topGeo, topMat);
    topSlice.rotation.x = Math.PI / 2;
    topSlice.position.set(0, 3.5, 0);
    thermalGroup.add(topSlice);

    scene.add(thermalGroup);
}

// --- Generate All Data Center Elements ---
buildStructuralEnclosure();
buildDoubleDoorSecurity();
spawnCoreITInfrastructure();
spawnPrecisionCooling();
spawnPowerSystems();
spawnFireAndEMS();
buildPlenumSubFloorInfrastructure();
buildAirflowContainment();
buildModernAirflowEngine();
spawnThermalAirflowSlices();

// --- Interactive Controller Logic ---

const ASSET_FOCUS = {
    room: new THREE.Vector3(5.5, 1.5, 7),
    security: new THREE.Vector3(6.44, 1.8, 12.75),
    racks: new THREE.Vector3(5.0, 1.8, 6.8),
    cooling: new THREE.Vector3(13.0, 1.8, 8.0),
    power: new THREE.Vector3(5.5, 1.8, 1.5),
    fire: new THREE.Vector3(0.5, 1.8, 8.0),
    plenum: new THREE.Vector3(8.0, 0.4, 8.5)
};

function hidePeek() {
    if (inspectPeek) inspectPeek.hidden = true;
}

function showPeek(spec) {
    if (!inspectPeek || !peekTitle || !peekDesc) return;
    peekTitle.textContent = spec.title;
    peekDesc.textContent = spec.desc;
    inspectPeek.hidden = false;
}

function showSpec(specKey, focusPos, { openPanel = false } = {}) {
    const spec = CONTRACT_SPECS[specKey];
    if (!spec) return;
    document.getElementById('spec-title').textContent = spec.title;
    document.getElementById('spec-desc').textContent = spec.desc;
    const assetSelect = document.getElementById('asset-select');
    if (assetSelect && assetSelect.value !== specKey) assetSelect.value = specKey;
    announce(`Selected: ${spec.title}`);

    if (!isFirstPerson && focusPos) {
        const raised = focusPos.clone ? focusPos.clone() : new THREE.Vector3(focusPos.x, focusPos.y, focusPos.z);
        raised.y = Math.max(raised.y, 1.6);
        gsap.to(controls.target, { x: raised.x, y: raised.y, z: raised.z, duration: 1.0, overwrite: true });
    }

    if (openPanel) {
        setPanelOpen(true);
        hidePeek();
    } else if (isMobileLayout()) {
        showPeek(spec);
    } else {
        setPanelOpen(true);
        hidePeek();
    }
}

let xrayActive = false;
const xrayBtn = document.getElementById('xray-btn');
xrayBtn.addEventListener('click', () => {
    xrayActive = !xrayActive;
    gsap.to(raisedFloorMesh.material, { opacity: xrayActive ? 0.12 : 0.95, duration: 0.8, overwrite: true });
    setPressed(xrayBtn, xrayActive);
    announce(xrayActive ? 'X-ray plenum view on.' : 'X-ray plenum view off.');
});

const labelToggleBtn = document.getElementById('label-toggle-btn');
setPressed(labelToggleBtn, showLabels);
labelToggleBtn.addEventListener('click', () => {
    showLabels = !showLabels;
    setPressed(labelToggleBtn, showLabels);
    announce(showLabels ? 'Labels shown.' : 'Labels hidden.');
});

const airBtn = document.getElementById('airflow-btn');
airBtn.addEventListener('click', () => {
    if (gsap.isTweening(leftDoor.position)) {
        announce('Airflow animation in progress…');
        return;
    }

    airflowActive = !airflowActive;

    if (airflowActive) {
        containmentGroup.visible = true;
        airflowParticleGroup.visible = true;
        setPressed(airBtn, true);
        gsap.to(leftDoor.position, { z: 0, duration: 1.2, ease: 'power2.out', overwrite: true });
        gsap.to(rightDoor.position, { z: 0, duration: 1.2, ease: 'power2.out', overwrite: true });
        announce('Airflow containment closed.');
    } else {
        setPressed(airBtn, false);
        gsap.to(leftDoor.position, { z: 1.18, duration: 1.2, ease: 'power2.inOut', overwrite: true });
        gsap.to(rightDoor.position, {
            z: 1.18,
            duration: 1.2,
            ease: 'power2.inOut',
            overwrite: true,
            onComplete: () => {
                containmentGroup.visible = false;
                airflowParticleGroup.visible = false;
            }
        });
        announce('Airflow containment opened.');
    }
});

let drillActive = false;
const fireBtn = document.getElementById('fire-btn');
const telemetryText = document.getElementById('telemetry-data');
const statusDot = document.getElementById('status-dot');

fireBtn.addEventListener('click', () => {
    drillActive = !drillActive;
    const alarm = document.getElementById('alarm-screen');
    alarm.classList.toggle('alarm-active', drillActive);
    alarm.setAttribute('aria-hidden', drillActive ? 'false' : 'true');
    setPressed(fireBtn, drillActive);
    if (drillBanner) drillBanner.hidden = !drillActive;
    if (drillActive) {
        telemetryText.textContent = 'VESDA: Smoke Detected · LOCKS RELEASED (demo)';
        statusDot.style.backgroundColor = '#ef4444';
        warningSignMat.color.setHex(0xb91c1c);
        gsap.to(alarmBeacon.material.color, { r: 1.0, g: 0, b: 0, duration: 0.1, overwrite: true });
        announce('Simulation: gas discharge drill active.');
    } else {
        telemetryText.textContent = 'Plenum Temp: 19.8°C · Aisle RH: 51%';
        statusDot.style.backgroundColor = '#10b981';
        warningSignMat.color.setHex(0x334155);
        alarmBeacon.material.color.setHex(0x7f1d1d);
        announce('Drill simulation stopped.');
    }
});

const THEME_KEY = 'dom-dc-theme';
let isLightMode = true; // default: light mode
let isThermalMode = false;
try {
    isLightMode = localStorage.getItem(THEME_KEY) !== 'night';
} catch (_) {}

const themeFab = document.getElementById('theme-fab');
const themeFabLabel = document.getElementById('theme-fab-label');

function syncThemeChrome() {
    if (!themeFab) return;
    const nextLabel = isLightMode ? 'Night' : 'Light';
    const nextTitle = isLightMode ? 'Switch to night mode' : 'Switch to light mode';
    themeFab.title = nextTitle;
    themeFab.setAttribute('aria-label', nextTitle);
    setPressed(themeFab, !isLightMode);
    if (themeFabLabel) themeFabLabel.textContent = nextLabel;
}

function applyTheme(light, { animate = true } = {}) {
    isLightMode = light;
    document.body.classList.toggle('light-theme', isLightMode);
    syncThemeChrome();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isLightMode ? '#e2e8f0' : '#05070f');

    const targetBg = isLightMode ? new THREE.Color(0xf1f5f9) : new THREE.Color(0x05070f);
    const targetSubFloor = isLightMode ? new THREE.Color(0x94a3b8) : new THREE.Color(0x1e293b);
    const targetWall = isLightMode ? new THREE.Color(0xe2e8f0) : new THREE.Color(0x0f172a);
    const targetHemiSky = isLightMode ? new THREE.Color(0xffffff) : new THREE.Color(0x0a192f);
    const targetHemiGround = isLightMode ? new THREE.Color(0xd1d5db) : new THREE.Color(0x020617);
    const targetHemiInt = isThermalMode ? 0.1 : (isLightMode ? 0.7 : 1.2);
    const targetKeyInt = isLightMode ? 1.4 : 0.2;
    darkThemeLightsGroup.visible = !isLightMode;
    const targetRaisedFloor = isLightMode ? new THREE.Color(0xcbd5e1) : new THREE.Color(0x334155);
    const targetRack = isLightMode ? new THREE.Color(0xf8fafc) : new THREE.Color(0x090d16);
    const duration = animate ? 1 : 0;

    gsap.to(scene.fog.color, { r: targetBg.r, g: targetBg.g, b: targetBg.b, duration, overwrite: true });
    gsap.to(scene.background, { r: targetBg.r, g: targetBg.g, b: targetBg.b, duration, overwrite: true });
    gsap.to(subFloorMat.color, { r: targetSubFloor.r, g: targetSubFloor.g, b: targetSubFloor.b, duration, overwrite: true });
    gsap.to(wallMat.color, { r: targetWall.r, g: targetWall.g, b: targetWall.b, duration, overwrite: true });
    gsap.to(raisedFloorMesh.material.color, { r: targetRaisedFloor.r, g: targetRaisedFloor.g, b: targetRaisedFloor.b, duration, overwrite: true });
    gsap.to(rackMat.color, { r: targetRack.r, g: targetRack.g, b: targetRack.b, duration, overwrite: true });
    gsap.to(scene.fog, { density: isLightMode ? 0.005 : 0.015, duration, overwrite: true });
    gsap.to(ambientLight.color, { r: targetHemiSky.r, g: targetHemiSky.g, b: targetHemiSky.b, duration, overwrite: true });
    gsap.to(ambientLight.groundColor, { r: targetHemiGround.r, g: targetHemiGround.g, b: targetHemiGround.b, duration, overwrite: true });
    gsap.to(ambientLight, { intensity: targetHemiInt, duration, overwrite: true });
    gsap.to(keyLight, { intensity: targetKeyInt, duration, overwrite: true });
}

themeFab?.addEventListener('click', () => {
    applyTheme(!isLightMode, { animate: true });
    try {
        localStorage.setItem(THEME_KEY, isLightMode ? 'light' : 'night');
    } catch (_) {}
    announce(isLightMode ? 'Light mode on.' : 'Night mode on.');
});

// Re-apply saved preference after scene materials exist (instant, no flash)
applyTheme(isLightMode, { animate: false });

const storedMaterials = new Map();
const thermalMats = {
    racks: new THREE.MeshBasicMaterial({ color: 0xff3300, wireframe: true, transparent: true, opacity: 0.8 }),
    cooling: new THREE.MeshBasicMaterial({ color: 0x0ea5e9, wireframe: true, transparent: true, opacity: 0.8 }),
    power: new THREE.MeshBasicMaterial({ color: 0xeab308, wireframe: true, transparent: true, opacity: 0.8 }),
    other: new THREE.MeshBasicMaterial({ color: 0x112233, wireframe: true, transparent: true, opacity: 0.1 })
};
const thermalBtn = document.getElementById('thermal-btn');
thermalBtn.addEventListener('click', () => {
    isThermalMode = !isThermalMode;
    thermalGroup.visible = isThermalMode;
    setPressed(thermalBtn, isThermalMode);

    if (isThermalMode) {
        gsap.to(ambientLight, { intensity: 0.1, duration: 1, overwrite: true });

        scene.traverse((child) => {
            if (child.isMesh && child.parent !== thermalGroup && child !== thermalGroup) {
                if (!storedMaterials.has(child.uuid)) {
                    storedMaterials.set(child.uuid, child.material);
                }

                let spec = null;
                if (child.userData.specKey) spec = child.userData.specKey;
                else if (child.parent && child.parent.userData.specKey) spec = child.parent.userData.specKey;
                else if (child.parent && child.parent.parent && child.parent.parent.userData.specKey) {
                    spec = child.parent.parent.userData.specKey;
                }

                if (spec === 'racks') child.material = thermalMats.racks;
                else if (spec === 'cooling') child.material = thermalMats.cooling;
                else if (spec === 'power') child.material = thermalMats.power;
                else child.material = thermalMats.other;
            }
        });
        announce('Illustrative thermal view on.');
    } else {
        gsap.to(ambientLight, { intensity: isLightMode ? 0.7 : 1.2, duration: 1, overwrite: true });

        scene.traverse((child) => {
            if (child.isMesh && storedMaterials.has(child.uuid)) {
                child.material = storedMaterials.get(child.uuid);
            }
        });
        announce('Thermal view off.');
    }
});

// HUD panel open / close
const toggleHudBtn = document.getElementById('toggle-hud-btn');
const closeHudBtn = document.getElementById('close-hud-btn');
const mainHudPanel = document.getElementById('main-hud-panel');
const hudBackdrop = document.getElementById('hud-backdrop');
const isMobileLayout = () => window.matchMedia('(max-width: 820px)').matches;

function setPanelOpen(open) {
    if (!mainHudPanel || !toggleHudBtn) return;
    mainHudPanel.classList.toggle('hidden', !open);
    if (open) mainHudPanel.removeAttribute('inert');
    else mainHudPanel.setAttribute('inert', '');
    toggleHudBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('panel-open', open && isMobileLayout());
    if (hudBackdrop) {
        hudBackdrop.hidden = !(open && isMobileLayout());
        hudBackdrop.classList.toggle('visible', open && isMobileLayout());
    }
    if (open) hidePeek();
}

function togglePanel() {
    const open = mainHudPanel.classList.contains('hidden');
    setPanelOpen(open);
}

if (toggleHudBtn && mainHudPanel) {
    setPanelOpen(!isMobileLayout());
    toggleHudBtn.addEventListener('click', togglePanel);
}
closeHudBtn?.addEventListener('click', () => setPanelOpen(false));
hudBackdrop?.addEventListener('click', () => setPanelOpen(false));

document.getElementById('peek-close')?.addEventListener('click', hidePeek);
document.getElementById('peek-more')?.addEventListener('click', () => {
    hidePeek();
    setPanelOpen(true);
});

document.getElementById('reset-view-btn')?.addEventListener('click', () => {
    if (isFirstPerson) exitWalkMode();
    gsap.killTweensOf(camera.position);
    gsap.killTweensOf(controls.target);
    gsap.to(camera.position, { x: DEFAULT_CAM.x, y: DEFAULT_CAM.y, z: DEFAULT_CAM.z, duration: 1.0, overwrite: true });
    gsap.to(controls.target, { x: DEFAULT_TARGET.x, y: DEFAULT_TARGET.y, z: DEFAULT_TARGET.z, duration: 1.0, overwrite: true });
    announce('Camera view reset.');
});

document.getElementById('asset-select')?.addEventListener('change', (e) => {
    const key = e.target.value;
    if (!key) return;
    if (key === 'plenum' && !xrayActive) xrayBtn.click();
    showSpec(key, ASSET_FOCUS[key], { openPanel: true });
});

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let pointerDownPos = null;
let pointerMoved = false;
const TAP_SLOP = 12;

function resolveSpecKey(obj) {
    let cur = obj;
    for (let i = 0; i < 4 && cur; i++) {
        if (cur.userData?.specKey) return { specKey: cur.userData.specKey, focusObj: cur };
        cur = cur.parent;
    }
    return { specKey: null, focusObj: obj };
}

function inspectAtClient(clientX, clientY) {
    if (isFirstPerson && (fpControls.isLocked || mobileWalkActive)) {
        mouse.x = 0;
        mouse.y = 0;
    } else {
        mouse.x = (clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(clientY / window.innerHeight) * 2 + 1;
    }
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(interactableObjects, true);
    for (const hit of intersects) {
        // When x-ray is on, skip opaque floor so plenum assets are selectable
        if (xrayActive && (hit.object === raisedFloorMesh || hit.object.parent === raisedFloorMesh)) {
            continue;
        }
        const { specKey, focusObj } = resolveSpecKey(hit.object);
        if (specKey && CONTRACT_SPECS[specKey]) {
            const focus = ASSET_FOCUS[specKey] || focusObj.getWorldPosition?.(new THREE.Vector3()) || focusObj.position;
            showSpec(specKey, focus);
            return true;
        }
    }
    return false;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pointerDownPos = { x: e.clientX, y: e.clientY };
    pointerMoved = false;
});

renderer.domElement.addEventListener('pointermove', (e) => {
    if (!pointerDownPos) return;
    if (Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y) > TAP_SLOP) {
        pointerMoved = true;
    }
});

renderer.domElement.addEventListener('pointerup', (e) => {
    if (!pointerDownPos) return;
    const wasTap = !pointerMoved;
    const x = pointerDownPos.x;
    const y = pointerDownPos.y;
    pointerDownPos = null;
    if (!wasTap) return;
    if (mobileWalkActive) return;
    if (fpControls.isLocked) return;
    if (e.target.closest?.('.hud-panel, .app-chrome, .mobile-walk-ui, button, select, a')) return;
    inspectAtClient(x, y);
});

function hideLoader() {
    const loader = document.getElementById('loader');
    if (!loader || loader.dataset.done) return;
    loader.dataset.done = '1';
    loader.style.opacity = '0';
    loader.setAttribute('aria-busy', 'false');
    loader.setAttribute('aria-hidden', 'true');
    setTimeout(() => {
        loader.style.display = 'none';
        loader.remove();
    }, 500);
    announce('Data center digital twin ready.');
    guidance.maybeStartTour();
    initAnalytics();
}

// Hide loader after first painted frame (more reliable than window.load alone)
requestAnimationFrame(() => {
    requestAnimationFrame(() => {
        hideLoader();
    });
});
window.addEventListener('load', hideLoader);
// Safety timeout if something blocks paint events
setTimeout(hideLoader, 8000);

function resizeRenderer() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, preferPerf ? 1.5 : 2));
}

window.addEventListener('resize', resizeRenderer);
window.visualViewport?.addEventListener('resize', resizeRenderer);

const tempV = new THREE.Vector3();
const placedLabelPts = [];

function updateLabelsEngine() {
    const tourOpen = document.getElementById('tour-overlay') && !document.getElementById('tour-overlay').hidden;
    const helpOpen = document.getElementById('help-modal') && !document.getElementById('help-modal').hidden;
    if (!showLabels || tourOpen || helpOpen || document.body.classList.contains('walk-active')) {
        labels.forEach((label) => { label.element.style.display = 'none'; });
        return;
    }

    const rect = renderer.domElement.getBoundingClientRect();
    const width = rect.width || window.innerWidth;
    const height = rect.height || window.innerHeight;
    const mobile = isCoarsePointer() || width < 820;
    const maxLabels = mobile ? 5 : 10;
    const minDist = mobile ? 58 : 44;
    const padTop = mobile ? 72 : 64;
    const padBottom = mobile ? 72 : 56;
    const padX = 12;

    const candidates = [];
    labels.forEach((label) => {
        if (label.xrayOnly && !xrayActive) {
            label.element.style.display = 'none';
            return;
        }
        // On phones, skip low-priority overhead clutter unless x-ray is on
        if (mobile && !xrayActive && label.priority < 7) {
            label.element.style.display = 'none';
            return;
        }

        tempV.copy(label.pos);
        tempV.project(camera);
        if (tempV.z > 1 || tempV.x < -1.15 || tempV.x > 1.15 || tempV.y < -1.15 || tempV.y > 1.15) {
            label.element.style.display = 'none';
            return;
        }

        let x = (tempV.x * 0.5 + 0.5) * width;
        let y = (tempV.y * -0.5 + 0.5) * height;
        x = THREE.MathUtils.clamp(x, padX, width - padX);
        y = THREE.MathUtils.clamp(y, padTop, height - padBottom);

        candidates.push({
            label,
            x,
            y,
            priority: label.priority || 1,
            depth: tempV.z
        });
    });

    candidates.sort((a, b) => b.priority - a.priority || a.depth - b.depth);
    placedLabelPts.length = 0;
    let shown = 0;

    candidates.forEach((c) => {
        const overlaps = placedLabelPts.some(
            (p) => Math.hypot(p.x - c.x, p.y - c.y) < minDist
        );
        if (overlaps || shown >= maxLabels) {
            c.label.element.style.display = 'none';
            return;
        }
        placedLabelPts.push({ x: c.x, y: c.y });
        shown += 1;
        c.label.element.style.display = 'block';
        c.label.element.style.transform = `translate(-50%, -110%) translate(${c.x}px,${c.y}px)`;
    });
}

function clampWalkPosition() {
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, 0.9, 15.1);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, 0.9, 13.4);
    camera.position.y = 1.7;
}

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = Math.min((time - prevTime) / 1000, 0.05);

    if (typeof thermalUniforms !== 'undefined') {
        thermalUniforms.uTime.value = time * 0.001;
    }

    if (isFirstPerson && (fpControls.isLocked || mobileWalkActive)) {
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        let forward = Number(moveForward) - Number(moveBackward);
        let strafe = Number(moveRight) - Number(moveLeft);
        if (mobileWalkActive) {
            forward += -joyInput.y;
            strafe += joyInput.x;
        }
        direction.z = forward;
        direction.x = strafe;
        if (direction.lengthSq() > 0) direction.normalize();

        const speed = mobileWalkActive ? 26.0 : 36.0;
        if (Math.abs(forward) > 0.01) velocity.z -= direction.z * speed * delta;
        if (Math.abs(strafe) > 0.01) velocity.x -= direction.x * speed * delta;

        if (fpControls.isLocked) {
            fpControls.moveRight(-velocity.x * delta);
            fpControls.moveForward(-velocity.z * delta);
            clampWalkPosition();
        } else if (mobileWalkActive) {
            camera.getWorldDirection(walkForward);
            walkForward.y = 0;
            if (walkForward.lengthSq() > 0) walkForward.normalize();
            walkRight.crossVectors(walkForward, worldUp).normalize();
            camera.position.addScaledVector(walkForward, -velocity.z * delta);
            camera.position.addScaledVector(walkRight, -velocity.x * delta);
            clampWalkPosition();
        }
    }
    prevTime = time;

    if (!isFirstPerson) {
        controls.update();
    }

    updateModernAirflow(delta);

    serverLEDs.forEach(led => {
        led.userData.progress += led.userData.blinkRate;
        const flicker = Math.sin(led.userData.progress);
        led.material.opacity = flicker > 0 ? led.userData.baseOpacity : 0.1;
    });

    updateLabelsEngine();
    renderer.render(scene, camera);
}
animate();
