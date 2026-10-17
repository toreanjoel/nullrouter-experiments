struct Frame {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  lightVP: mat4x4f,
  heightVP: mat4x4f,
  camPos: vec4f,      // w: time
  lightDir: vec4f,    // toward the key light; w: penumbra scale
  keyColor: vec4f,
  absorb: vec4f,      // sigma_a per unit; w: density
  scatter: vec4f,     // milk colour; w: milk amount
  shadowTint: vec4f,
  params: vec4f,      // width, height, exposure, frame
  ringC: vec4f,
  ringN: vec4f,
};

const PI = 3.14159265;
const TAU = 6.2831853;
const HEIGHT_MIN = -1.0;
const HEIGHT_RANGE = 4.0;

const POISSON = array<vec2f, 16>(
  vec2f(-0.94201624, -0.39906216), vec2f(0.94558609, -0.76890725), vec2f(-0.09418410, -0.92938870), vec2f(0.34495938, 0.29387760),
  vec2f(-0.91588581, 0.45771432), vec2f(-0.81544232, -0.87912464), vec2f(-0.38277543, 0.27676845), vec2f(0.97484398, 0.75648379),
  vec2f(0.44323325, -0.97511554), vec2f(0.53742981, -0.47373420), vec2f(-0.26496911, -0.41893023), vec2f(0.79197514, 0.19090188),
  vec2f(-0.24188840, 0.99706507), vec2f(-0.81409955, 0.91437590), vec2f(0.19984126, 0.78641367), vec2f(0.14383161, -0.14100790)
);

fn hash21(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

// Value noise, periodic in x with period px.
fn pnoise(p: vec2f, px: f32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let x0 = i.x - px * floor(i.x / px);
  let x1 = (i.x + 1.0) - px * floor((i.x + 1.0) / px);
  let a = hash21(vec2f(x0, i.y));
  let b = hash21(vec2f(x1, i.y));
  let c = hash21(vec2f(x0, i.y + 1.0));
  let d = hash21(vec2f(x1, i.y + 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Worley F1, periodic in x with period px.
fn worley(p: vec2f, px: f32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  var md = 2.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let o = vec2f(f32(x), f32(y));
      var c = i + o;
      c.x = c.x - px * floor(c.x / px);
      let h = vec2f(hash21(c), hash21(c + 17.31));
      md = min(md, length(o + h * 0.8 + 0.1 - f));
    }
  }
  return md;
}

// Rest-space flesh zones: x core, y fibres, z eyes band, w rim. Independent of height, so both faces match.
fn zones(rp: vec3f, detail: bool) -> vec4f {
  let r = length(rp.xz);
  let u = atan2(rp.z, rp.x) / TAU + 0.5;
  let core = 1.0 - smoothstep(0.6, 0.78, r);
  let rim = smoothstep(1.17, 1.32, r);
  let band = smoothstep(0.95, 1.04, r) * (1.0 - smoothstep(1.17, 1.26, r));
  let warp = pnoise(vec2f(u * 24.0, r * 2.0), 24.0) * 0.9;
  let streak = smoothstep(0.56, 0.93, pnoise(vec2f(u * 150.0 + warp, r * 1.4), 150.0));
  var fib = streak * 0.8;
  var eyes = band * 0.5;
  if (detail) {
    let thread = smoothstep(0.64, 0.96, pnoise(vec2f(u * 430.0 + warp * 2.0, r * 3.5), 430.0));
    fib += thread * 0.4;
    eyes = band * (1.0 - smoothstep(0.1, 0.36, worley(vec2f(u * 66.0, r * 9.0), 66.0)));
  }
  fib *= 0.55 + 0.45 * smoothstep(0.55, 0.9, r);
  return vec4f(core, fib, eyes, rim);
}
