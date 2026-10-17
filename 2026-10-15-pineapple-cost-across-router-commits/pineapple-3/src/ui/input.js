// Pointer input: grab on a surface hit (not through the hole), drag the hand target,
// twist the held patch with the scroll wheel or a second finger.
const INPUT = {
  canvas: null, primary: -1, second: -1,
  px: 0, py: 0, sx: 0, sy: 0, lastAngle: 0,
  hoverDirty: false, hoverState: 0, rayDirty: false,
};
const HINT_DEFAULT = 'Grab either edge. Pull. Let go.';
const HINT_HOLE = 'That’s the hole. Grab the inner edge.';

function initInput(canvas, B, S) {
  INPUT.canvas = canvas;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (GRAB.on && INPUT.second < 0 && e.pointerId !== INPUT.primary) {
      INPUT.second = e.pointerId; INPUT.sx = e.offsetX; INPUT.sy = e.offsetY;
      INPUT.lastAngle = Math.atan2(INPUT.sy - INPUT.py, INPUT.sx - INPUT.px);
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (GRAB.on) return;
    const r = screenRay(e.offsetX, e.offsetY, canvas.clientWidth, canvas.clientHeight);
    const hit = pickSurface(B, S, r[0], r[1], r[2], r[3], r[4], r[5]);
    if (!hit.hit) { setHoverState(hit.through ? 2 : 0); return; }
    grabBegin(B, hit.x, hit.y, hit.z, CAM.fwd);
    INPUT.primary = e.pointerId; INPUT.px = e.offsetX; INPUT.py = e.offsetY;
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('grabbing');
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId === INPUT.primary) {
      INPUT.px = e.offsetX; INPUT.py = e.offsetY; INPUT.rayDirty = true;
      if (INPUT.second >= 0) twistByFingers();
    } else if (e.pointerId === INPUT.second) {
      INPUT.sx = e.offsetX; INPUT.sy = e.offsetY;
      twistByFingers();
    } else if (!GRAB.on) {
      INPUT.px = e.offsetX; INPUT.py = e.offsetY; INPUT.hoverDirty = true;
    }
  });
  const up = (e) => {
    if (e.pointerId === INPUT.second) { INPUT.second = -1; return; }
    if (e.pointerId !== INPUT.primary) return;
    INPUT.primary = -1; INPUT.second = -1;
    grabEnd();
    canvas.classList.remove('grabbing');
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => { if (!GRAB.on) setHoverState(0); });
  canvas.addEventListener('wheel', (e) => {
    if (!GRAB.on) return;
    e.preventDefault();
    GRAB.twist += e.deltaY * 0.004;
  }, { passive: false });
}

function twistByFingers() {
  const a = Math.atan2(INPUT.sy - INPUT.py, INPUT.sx - INPUT.px);
  let d = a - INPUT.lastAngle;
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  INPUT.lastAngle = a;
  GRAB.twist -= d;
}

// 0 = nothing, 1 = over the flesh, 2 = over the hole.
function setHoverState(s) {
  if (s === INPUT.hoverState) return;
  INPUT.hoverState = s;
  INPUT.canvas.classList.toggle('can-grab', s === 1);
  document.getElementById('hint').textContent = s === 2 ? HINT_HOLE : HINT_DEFAULT;
}

// Called once per frame before stepping.
function inputFrame(B, S) {
  const c = INPUT.canvas;
  if (GRAB.on && INPUT.rayDirty) {
    const r = screenRay(INPUT.px, INPUT.py, c.clientWidth, c.clientHeight);
    grabSetRay(r[0], r[1], r[2], r[3], r[4], r[5]);
    INPUT.rayDirty = false;
  } else if (!GRAB.on && INPUT.hoverDirty) {
    const r = screenRay(INPUT.px, INPUT.py, c.clientWidth, c.clientHeight);
    const hit = pickSurface(B, S, r[0], r[1], r[2], r[3], r[4], r[5]);
    setHoverState(hit.hit ? 1 : hit.through ? 2 : 0);
    INPUT.hoverDirty = false;
  }
}
