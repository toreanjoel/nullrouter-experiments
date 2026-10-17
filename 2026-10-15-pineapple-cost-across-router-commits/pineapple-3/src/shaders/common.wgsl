// Shared by every pass: uniforms, ring shape, flesh zones (rest space), studio lights, BRDF.
struct Uniforms {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  lightViewProj: mat4x4f,
  heightViewProj: mat4x4f,
  bodyRot: mat4x4f,     // rest → world rotation (xyz columns), body centroid in [3]
  camPos: vec4f,
  lightDir: vec4f,      // xyz toward the key light, w = tan of its half-angle (PCSS)
  tint: vec4f,          // rgb transmission colour, w = tint index
  screen: vec4f,        // width, height, 1/width, 1/height
  params: vec4f,        // time, exposure, mesh overlay alpha, height-map half size
  lightParams: vec4f,   // light near, far, ortho half size, shadow texel
};
@group(0) @binding(0) var<uniform> U: Uniforms;

const PI: f32 = 3.14159265;
const TAU: f32 = 6.2831853;
const RING_OUT: f32 = 1.36;
const RING_IN: f32 = 0.5;
const SCALLOPS: f32 = 14.0;
const SCALLOP_DEPTH: f32 = 0.045;
const SCALLOP_SOFT: f32 = 0.18;
const KEY_DIR: vec3f = vec3f(-0.4524, 0.8226, 0.3455);
const RIM_DIR: vec3f = vec3f(0.1798, 0.4045, -0.8989);

var<private> POISSON: array<vec2f, 16> = array<vec2f, 16>(
  vec2f(-0.9420, -0.3991), vec2f(0.9456, -0.7689), vec2f(-0.0942, -0.9294), vec2f(0.3450, 0.2939),
  vec2f(-0.9159, 0.4577), vec2f(-0.8154, -0.8791), vec2f(-0.3828, 0.2768), vec2f(0.9748, 0.7565),
  vec2f(0.4432, -0.9751), vec2f(0.5374, -0.4737), vec2f(-0.2650, -0.4189), vec2f(0.7920, 0.1909),
  vec2f(-0.2419, 0.9971), vec2f(-0.8141, 0.9144), vec2f(0.1998, 0.7864), vec2f(0.1438, -0.1410)
);

fn rot2(p: vec2f, cs: vec2f) -> vec2f {
  return vec2f(p.x * cs.x - p.y * cs.y, p.x * cs.y + p.y * cs.x);
}

// Interleaved gradient noise, per pixel.
fn ign(p: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715))));
}

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

// Value noise, periodic every `period` cells along x (wraps around the ring).
fn noiseP(p: vec2f, period: f32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let x0 = i.x - period * floor(i.x / period);
  let x1 = (i.x + 1.0) - period * floor((i.x + 1.0) / period);
  let a = hash21(vec2f(x0, i.y));
  let b = hash21(vec2f(x1, i.y));
  let c = hash21(vec2f(x0, i.y + 1.0));
  let d = hash21(vec2f(x1, i.y + 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn outerRadius(theta: f32) -> f32 {
  let u = fract(theta / TAU * SCALLOPS);
  let s = sin(PI * u);
  let e = SCALLOP_SOFT;
  let b = (sqrt(s * s + e * e) - e) / (sqrt(1.0 + e * e) - e);
  return RING_OUT - SCALLOP_DEPTH * (1.0 - b);
}

// Ring coordinates of a rest-space point: (a = angle 0..1, s = 0 at hole .. 1 at rim, |y|).
fn ringCoords(rp: vec3f) -> vec3f {
  let r = length(rp.xz);
  let th = atan2(rp.z, rp.x);
  let s = clamp((r - RING_IN) / (outerRadius(th) - RING_IN), 0.0, 1.0);
  return vec3f(th / TAU + 0.5, s, abs(rp.y));
}

// Radial fibres: long streaks core → rim plus finer threads. Same on both faces (uses |y|).
fn fibreField(rc: vec3f) -> f32 {
  let warp = 0.35 * noiseP(vec2f(rc.x * 24.0, rc.y * 2.0), 24.0);
  let streak = noiseP(vec2f(rc.x * 96.0, rc.y * 1.6 + warp), 96.0);
  let fib = smoothstep(0.55, 0.85, streak) * smoothstep(0.06, 0.22, rc.y);
  let thread = smoothstep(0.62, 0.95, noiseP(vec2f(rc.x * 300.0, rc.y * 5.0 + rc.z * 3.0), 300.0));
  return max(fib, thread * 0.6);
}

struct Zone {
  absorb: f32,
  scatter: f32,
  fibre: f32,
  eyes: f32,
};

fn ringZone(rp: vec3f) -> Zone {
  let rc = ringCoords(rp);
  let s = rc.y;
  let core = 1.0 - smoothstep(0.12, 0.30, s);
  let rim = smoothstep(0.86, 0.99, s);
  let band = smoothstep(0.66, 0.76, s) * (1.0 - smoothstep(0.88, 0.95, s));
  let cell = noiseP(vec2f(rc.x * 140.0, s * 18.0 + rc.z * 6.0), 140.0);
  var z: Zone;
  z.fibre = fibreField(rc);
  z.eyes = band * (0.45 + 0.9 * smoothstep(0.35, 0.8, cell));
  z.absorb = 0.75 + 0.9 * core + 0.55 * rim + 0.7 * z.eyes + 0.6 * z.fibre;
  z.scatter = 0.12 + 1.5 * core + 0.25 * rim + 0.9 * z.eyes + 0.8 * z.fibre;
  return z;
}

fn softbox(dir: vec3f, c: vec3f, u: vec3f, v: vec3f, su: f32, sv: f32) -> f32 {
  let d = dot(dir, c);
  if (d <= 0.0) { return 0.0; }
  let p = dir / d - c;
  let m = max(abs(dot(p, u)) / su, abs(dot(p, v)) / sv);
  return 1.0 - smoothstep(0.8, 1.0, m);
}

fn boxBasis(c: vec3f) -> mat2x3f {
  let u = normalize(cross(vec3f(0.0, 1.0, 0.0), c));
  return mat2x3f(u, cross(c, u));
}

// Photo-studio surroundings seen in reflections: dim room, bright cyc floor, softboxes.
fn studioEnv(dir: vec3f) -> vec3f {
  var col = mix(vec3f(0.16, 0.155, 0.15), vec3f(0.045, 0.045, 0.05), smoothstep(-0.1, 0.6, dir.y));
  col += vec3f(0.55, 0.53, 0.5) * smoothstep(0.05, -0.25, dir.y);
  let kb = boxBasis(KEY_DIR);
  col += vec3f(9.0, 8.7, 8.2) * softbox(dir, KEY_DIR, kb[0], kb[1], 0.45, 0.32);
  col += vec3f(4.0) * softbox(dir, vec3f(0.0, 1.0, 0.0), vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, 1.0), 0.12, 0.6);
  let fc = normalize(vec3f(1.0, 0.35, 0.25));
  let fb = boxBasis(fc);
  col += vec3f(2.4, 2.5, 2.7) * softbox(dir, fc, fb[0], fb[1], 0.12, 0.55);
  let rb = boxBasis(RIM_DIR);
  col += vec3f(5.0, 4.8, 4.6) * softbox(dir, RIM_DIR, rb[0], rb[1], 0.5, 0.18);
  return col;
}

fn ggxSpec(N: vec3f, V: vec3f, L: vec3f, rough: f32) -> f32 {
  let H = normalize(V + L);
  let nh = max(dot(N, H), 0.0);
  let nl = max(dot(N, L), 0.0);
  let nv = max(dot(N, V), 1e-3);
  let a = rough * rough;
  let a2 = a * a;
  let d = nh * nh * (a2 - 1.0) + 1.0;
  let D = a2 / (PI * d * d);
  let k = a * 0.5;
  let G = (nl / (nl * (1.0 - k) + k)) * (nv / (nv * (1.0 - k) + k));
  return D * G / (4.0 * nv);
}

// Absorption coefficients per unit length, from the tint (its transmission colour).
fn jellyAbsorb() -> vec3f {
  return -log(clamp(U.tint.rgb, vec3f(0.03), vec3f(1.0))) * 1.6;
}

fn fullTri(vi: u32) -> vec2f {
  return vec2f(f32((vi << 1u) & 2u) * 2.0 - 1.0, f32(vi & 2u) * 2.0 - 1.0);
}

fn clipToUv(c: vec4f) -> vec2f {
  return vec2f(c.x / c.w * 0.5 + 0.5, 0.5 - c.y / c.w * 0.5);
}
