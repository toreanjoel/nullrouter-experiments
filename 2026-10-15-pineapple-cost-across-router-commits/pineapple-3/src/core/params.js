// Shape, mesh, simulation and look constants shared by every module.
const RING = { R: 1.36, hole: 0.5, H: 0.5, bevel: 0.12, scallops: 14, scallopDepth: 0.045, scallopSoft: 0.18 };
const MESH = { lattice: 0.2, outerSamples: 70, innerSamples: 22, levels: 3 };
const SURF = { perScallop: 14, top: 14, wall: 3, bevel: 6 };
const SIM = {
  hz: 60, substeps: 10, gravity: 30, floorY: 0,
  muS: 0.9, muK: 0.55,
  strainMin: 0.45, strainMax: 1.9,
  volCompliance: 1e-9, airDamp: 0.12, maxSpeed: 40, rotIters: 3,
};
const TINTS = [
  { name: 'Golden', rgb: [1.0, 0.80, 0.30], swatch: '#e8b33a' },
  { name: 'Amber', rgb: [1.0, 0.56, 0.14], swatch: '#d6841c' },
  { name: 'Rosé', rgb: [1.0, 0.60, 0.56], swatch: '#e39a8e' },
];
const UNIT_CM = 3;
const DENSITY_G_CM3 = 1.3;
const LIGHT_DIR = [-0.55, 1.0, 0.42];
const EXPOSURE = 0.8;
const HEIGHT_HALF = 4.0;

// Slider (0..1) → shape stiffness E and edge damping rate (1/s).
function firmnessToE(f) { return 5e4 * Math.pow(100, f); }
function dampingToRate(d) { return 1 + 120 * d * d; }
