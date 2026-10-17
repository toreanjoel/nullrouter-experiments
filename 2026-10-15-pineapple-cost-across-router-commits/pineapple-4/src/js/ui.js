// Panel "The Specimen": tints, sliders, actions, toggles, keyboard shortcuts and readouts.
// Tints change only the absorption colour; scattering strength, gloss and fibres are shared.
const TINTS = {
  golden: { abs: [0.10, 0.42, 2.2] },
  amber: { abs: [0.18, 0.95, 3.4] },
  rose: { abs: [0.12, 1.05, 0.75] },
};
const GRAMS_PER_UNIT3 = 27 * 1.3; // 1 unit ≈ 3 cm, at 1.3 g/cm³
const MJ_PER_SIM_KE = (GRAMS_PER_UNIT3 / 1000) * 0.03 * 0.03 * 1000; // ½mv² → mJ (kg, m/s)

const View = { paused: false, slow: false, showMesh: false, tint: TINTS.golden, scatter: new Float32Array(3), exposure: 0.9 };
const ui = {};

function setTint(name) {
  View.tint = TINTS[name];
  for (let k = 0; k < 3; k++) View.scatter[k] = 0.3 + 0.7 * Math.exp(-View.tint.abs[k] * 0.35);
  document.querySelectorAll('.swatch').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tint === name)));
}

function setupUI(body) {
  const $ = id => document.getElementById(id);
  Object.assign(ui, { mass: $('ro-mass'), volume: $('ro-volume'), kinetic: $('ro-kinetic'), pause: $('btn-pause'), pauseLabel: $('pause-label'), pausedTag: $('paused-tag') });

  const actions = {
    nudge: () => body.nudge(),
    turn: () => body.toss(Camera.right[0], Camera.right[1], Camera.right[2]),
    reset: () => body.reset(),
    pause: () => {
      View.paused = !View.paused;
      ui.pauseLabel.textContent = View.paused ? 'Resume' : 'Pause';
      ui.pause.setAttribute('aria-pressed', String(View.paused));
      ui.pausedTag.hidden = !View.paused;
    },
  };

  document.querySelectorAll('.swatch').forEach(b => b.addEventListener('click', () => setTint(b.dataset.tint)));
  setTint('golden');

  const slider = (id, outId, apply) => {
    const el = $(id), out = $(outId);
    const upd = () => { const v = el.value / 100; apply(v); out.textContent = Math.round(v * 100); };
    el.addEventListener('input', upd); upd();
  };
  slider('sl-firmness', 'val-firmness', v => { body.firmness = v; });
  slider('sl-damping', 'val-damping', v => { body.damping = v; });

  for (const [id, fn] of [['btn-nudge', actions.nudge], ['btn-turn', actions.turn], ['btn-reset', actions.reset], ['btn-pause', actions.pause]]) {
    $(id).addEventListener('click', e => { fn(); e.currentTarget.blur(); });
  }
  $('tg-mesh').addEventListener('change', e => { View.showMesh = e.target.checked; });
  $('tg-slow').addEventListener('change', e => { View.slow = e.target.checked; });

  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const fn = { Space: actions.pause, KeyN: actions.nudge, KeyT: actions.turn, KeyR: actions.reset }[e.code];
    if (!fn) return;
    e.preventDefault();
    fn();
  });

  ui.mass.textContent = `${(body.restVolume * GRAMS_PER_UNIT3).toFixed(1)} g`;
}

function updateReadouts(body) {
  ui.volume.textContent = `${(body.volumeRatio * 100).toFixed(1)} %`;
  ui.kinetic.textContent = `${(body.kinetic * MJ_PER_SIM_KE).toFixed(2)} mJ`;
}

function showFallback() {
  document.getElementById('fallback').hidden = false;
  document.body.classList.add('no-webgpu');
}
