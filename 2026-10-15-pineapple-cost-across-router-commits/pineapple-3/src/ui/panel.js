// "The Specimen" panel: tint swatches, sliders, actions and toggles.
const UI = { paused: false, slow: false };

function initPanel(B) {
  const tints = document.getElementById('tints');
  TINTS.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.setAttribute('aria-pressed', String(i === FRAME.tint));
    b.innerHTML = ringIconSVG(t.swatch) + `<span>${t.name}</span>`;
    b.addEventListener('click', () => setTint(i));
    tints.appendChild(b);
  });

  const firm = document.getElementById('firm'), firmOut = document.getElementById('firmOut');
  const damp = document.getElementById('damp'), dampOut = document.getElementById('dampOut');
  const onFirm = () => { B.E = firmnessToE(+firm.value); firmOut.textContent = Math.round(firm.value * 100); };
  const onDamp = () => { B.damp = dampingToRate(+damp.value); dampOut.textContent = Math.round(damp.value * 100); };
  firm.addEventListener('input', onFirm);
  damp.addEventListener('input', onDamp);
  onFirm(); onDamp();

  document.getElementById('btnNudge').addEventListener('click', () => actNudge(B));
  document.getElementById('btnFlip').addEventListener('click', () => actTurnOver(B, CAM.right));
  document.getElementById('btnReset').addEventListener('click', () => actReset(B));
  document.getElementById('btnPause').addEventListener('click', togglePause);
  document.getElementById('optMesh').addEventListener('change', (e) => { FRAME.overlay = e.target.checked; });
  document.getElementById('optSlow').addEventListener('change', (e) => { UI.slow = e.target.checked; });
}

function setTint(i) {
  FRAME.tint = i;
  document.querySelectorAll('#tints .swatch').forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
}

function togglePause() {
  UI.paused = !UI.paused;
  document.getElementById('pauseLabel').textContent = UI.paused ? 'Resume' : 'Pause';
}
