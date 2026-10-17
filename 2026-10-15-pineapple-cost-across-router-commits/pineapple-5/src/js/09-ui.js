// Panel "The Specimen": tints, sliders, actions, toggles, keys and readouts.
const TINTS = [
  { name: 'Golden', swatch: '#e6ae38', absorb: [0.22, 0.85, 3.0], color: [1.0, 0.78, 0.3] },
  { name: 'Amber', swatch: '#c46e1c', absorb: [0.36, 1.65, 4.6], color: [1.0, 0.55, 0.16] },
  { name: 'Rosé', swatch: '#e597a0', absorb: [0.26, 1.75, 1.1], color: [1.0, 0.56, 0.6] },
];

function ringIcon(fill) {
  // Tiny scalloped pineapple ring.
  let d = '';
  for (let i = 0; i <= 56; i++) {
    const th = (i / 56) * Math.PI * 2, r = 10.5 * outerRadius(th) / SHAPE.outer;
    d += (i ? 'L' : 'M') + (12 + r * Math.cos(th)).toFixed(2) + ' ' + (12 + r * Math.sin(th)).toFixed(2);
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}Z M12 8.1a3.9 3.9 0 1 0 0.01 0Z" fill="${fill}" fill-rule="evenodd" stroke="rgba(38,33,27,.45)" stroke-width=".6"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1.6"/></svg>`;
}

function createUI(h) {
  const $ = (id) => document.getElementById(id);
  const state = { tint: TINTS[0], paused: false, slow: false, showMesh: false };

  const sw = $('swatches');
  TINTS.forEach((t, i) => {
    const b = document.createElement('button');
    b.className = 'swatch'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', i === 0 ? 'true' : 'false');
    b.innerHTML = ringIcon(t.swatch) + `<span>${t.name}</span>`;
    b.addEventListener('click', () => {
      state.tint = t;
      for (const c of sw.children) c.setAttribute('aria-checked', c === b ? 'true' : 'false');
    });
    sw.appendChild(b);
  });

  const slider = (id, fmt, set) => {
    const el = $(id), out = $(id + '-out');
    const upd = () => { const v = +el.value; out.textContent = fmt(v); set(v); };
    el.addEventListener('input', upd); upd();
  };
  slider('firm', (v) => (v < 0.25 ? 'Wobbly' : v < 0.6 ? 'Gummy' : v < 0.85 ? 'Firm' : 'Set') + ` · ${Math.round(v * 100)}`, h.setFirmness);
  slider('damp', (v) => `${Math.round(v * 100)}%`, h.setDamping);

  const pauseBtn = $('b-pause');
  const setPaused = (p) => {
    state.paused = p; pauseBtn.textContent = p ? 'Resume' : 'Pause'; pauseBtn.setAttribute('aria-pressed', String(p));
  };
  $('b-nudge').addEventListener('click', h.nudge);
  $('b-turn').addEventListener('click', h.turnOver);
  $('b-reset').addEventListener('click', h.reset);
  pauseBtn.addEventListener('click', () => setPaused(!state.paused));
  $('t-mesh').addEventListener('change', (e) => { state.showMesh = e.target.checked; });
  $('t-slow').addEventListener('change', (e) => { state.slow = e.target.checked; });

  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { e.preventDefault(); setPaused(!state.paused); }
    else if (k === 'n') h.nudge();
    else if (k === 't') h.turnOver();
    else if (k === 'r') h.reset();
  });

  const roMass = $('ro-mass'), roVol = $('ro-vol'), roKe = $('ro-ke'), status = $('status');
  let statusTimer = 0;
  state.readouts = (massG, volFrac, keMicroJ) => {
    roMass.textContent = `${massG.toFixed(0)} g`;
    roVol.textContent = `${(volFrac * 100).toFixed(1)}%`;
    roKe.textContent = keMicroJ < 1000 ? `${keMicroJ.toFixed(keMicroJ < 10 ? 2 : 0)} µJ` : `${(keMicroJ / 1000).toFixed(2)} mJ`;
  };
  state.say = (text, ms = 1800) => {
    status.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = ''; }, ms);
  };
  return state;
}

function showFallback(reason) {
  const fb = document.getElementById('fallback');
  document.getElementById('fallback-why').textContent = reason || '';
  fb.hidden = false;
}
