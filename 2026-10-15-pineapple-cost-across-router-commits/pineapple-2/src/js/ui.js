// Panel controls, keys, pointer grab/twist, readouts and the fallback screen.
const STATE = { paused: false, slow: false, mesh: false, tint: 0, hoverX: -1, hoverY: -1, hoverDirty: false };
const TINTS = [
  { absorb: [0.18, 0.55, 2.4], scatter: [1.0, 0.82, 0.42] },
  { absorb: [0.3, 1.25, 3.7], scatter: [1.0, 0.6, 0.25] },
  { absorb: [0.22, 1.4, 0.95], scatter: [1.0, 0.63, 0.6] },
];
const $ = id => document.getElementById(id);
let hintTimer = 0, hintDefault = '';

function showFallback(why) {
  $('fallback').hidden = false;
  $('fallbackWhy').textContent = why || '';
}

function setHint(text, ms) {
  const el = $('hint');
  el.textContent = text;
  clearTimeout(hintTimer);
  if (ms) hintTimer = setTimeout(() => { el.textContent = hintDefault; }, ms);
}

function setPaused(p) {
  STATE.paused = p;
  $('pause').textContent = p ? 'Resume' : 'Pause';
  $('pause').setAttribute('aria-pressed', String(p));
}

function setTint(i) {
  STATE.tint = i;
  document.querySelectorAll('.swatch').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.tint === i)));
}

function uiInit() {
  hintDefault = $('hint').textContent;
  document.querySelectorAll('.swatch').forEach(b => b.addEventListener('click', () => setTint(+b.dataset.tint)));
  const slider = (id, out, f) => {
    const el = $(id), o = $(out), upd = () => { o.textContent = el.value; f(el.value / 100); };
    el.addEventListener('input', upd); upd();
  };
  slider('firm', 'firmOut', v => { SIM.firm = v; });
  slider('damp', 'dampOut', v => { SIM.damp = v; });
  $('nudge').addEventListener('click', () => actionNudge());
  $('flip').addEventListener('click', () => actionTurnOver());
  $('reset').addEventListener('click', () => actionReset());
  $('pause').addEventListener('click', () => setPaused(!STATE.paused));
  $('mesh').addEventListener('change', e => { STATE.mesh = e.target.checked; });
  $('slow').addEventListener('change', e => { STATE.slow = e.target.checked; });

  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space') { e.preventDefault(); setPaused(!STATE.paused); }
    else if (e.code === 'KeyN') actionNudge();
    else if (e.code === 'KeyT') actionTurnOver();
    else if (e.code === 'KeyR') actionReset();
  });
}

function pointerInit(canvas) {
  const pts = new Map();
  let grabId = -1, twistAngle = null;
  const pairAngle = () => {
    const a = pts.get(grabId);
    for (const [id, b] of pts) if (id !== grabId) return Math.atan2(b.y - a.y, b.x - a.x);
    return null;
  };
  canvas.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (GRAB.active && grabId !== -1) { twistAngle = pairAngle(); return; }
    cameraRay(e.offsetX, e.offsetY, canvas.clientWidth, canvas.clientHeight);
    const r = grabStart(RAY[0], RAY[1], RAY[2], RAY[3], RAY[4], RAY[5]);
    if (r === 'grab') {
      grabId = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('grabbing');
      e.preventDefault();
    } else if (r === 'hole') setHint('That’s the hole — nothing to hold there.', 1800);
  });
  canvas.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (p) { p.x = e.offsetX; p.y = e.offsetY; }
    if (e.pointerId === grabId) {
      cameraRay(e.offsetX, e.offsetY, canvas.clientWidth, canvas.clientHeight);
      grabMove(RAY[0], RAY[1], RAY[2], RAY[3], RAY[4], RAY[5]);
    }
    if (GRAB.active && pts.size > 1 && twistAngle !== null) {
      const a = pairAngle();
      if (a !== null) {
        let d = a - twistAngle;
        if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
        GRAB.twist -= d; twistAngle = a;
      }
    }
    if (!GRAB.active && e.pointerType === 'mouse') { STATE.hoverX = e.offsetX; STATE.hoverY = e.offsetY; STATE.hoverDirty = true; }
  });
  const up = e => {
    pts.delete(e.pointerId);
    if (e.pointerId === grabId) {
      grabEnd(); grabId = -1; twistAngle = null;
      canvas.classList.remove('grabbing');
    } else if (pts.size < 2) twistAngle = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') canvas.classList.remove('can-grab'); });
  canvas.addEventListener('wheel', e => {
    if (!GRAB.active) return;
    e.preventDefault();
    GRAB.twist += Math.max(-0.25, Math.min(0.25, e.deltaY * 0.004));
  }, { passive: false });
}

// Mouse hover: grab cursor over flesh, a note when over the hole. Runs once per frame at most.
function hoverUpdate(canvas) {
  if (!STATE.hoverDirty || GRAB.active) return;
  STATE.hoverDirty = false;
  cameraRay(STATE.hoverX, STATE.hoverY, canvas.clientWidth, canvas.clientHeight);
  const hit = isFinite(pickSurface(RAY[0], RAY[1], RAY[2], RAY[3], RAY[4], RAY[5]));
  canvas.classList.toggle('can-grab', hit);
}

let massText = '';
function readouts() {
  if (!massText) { massText = (restVolume * GRAMS_PER_UNIT3).toFixed(1) + ' g'; $('rMass').textContent = massText; }
  $('rVol').textContent = (simVolume() * 100).toFixed(1) + '%';
  const k = simKinetic() * 1e6;
  $('rKin').textContent = k < 1000 ? k.toFixed(k < 10 ? 2 : 1) + ' µJ' : (k / 1000).toFixed(2) + ' mJ';
}
