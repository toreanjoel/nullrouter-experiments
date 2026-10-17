// Readouts: Mass (g), Volume (% of rest), Kinetic (mJ). 1 unit ≈ 3 cm at 1.3 g/cm³.
// Throttled, and the DOM is touched only when a shown value changes.
const READ = { el: null, next: 0, vol: -1, kin: -1 };
const GRAMS_PER_UNIT3 = UNIT_CM * UNIT_CM * UNIT_CM * DENSITY_G_CM3;

function initReadouts(B) {
  READ.el = { mass: document.getElementById('rMass'), vol: document.getElementById('rVol'), kin: document.getElementById('rKin') };
  READ.el.mass.textContent = Math.round(B.restVolume * GRAMS_PER_UNIT3) + ' g';
}

function updateReadouts(B, now) {
  if (now < READ.next) return;
  READ.next = now + 150;
  const vol = Math.round((bodyVolume(B) / B.restVolume) * 1000);
  if (vol !== READ.vol) { READ.vol = vol; READ.el.vol.textContent = (vol / 10).toFixed(1) + ' %'; }
  // model mass → kg, model speed → m/s, J → mJ
  const mj = bodyKinetic(B) * (GRAMS_PER_UNIT3 / 1000) * (UNIT_CM / 100) * (UNIT_CM / 100) * 1000;
  const kin = Math.round(mj * 100);
  if (kin !== READ.kin) { READ.kin = kin; READ.el.kin.textContent = (kin / 100).toFixed(2) + ' mJ'; }
}
