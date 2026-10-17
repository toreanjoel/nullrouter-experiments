// Shared frame data, studio lighting and the pineapple flesh zones (prepended to the scene shaders).
struct Frame {
  viewProj: mat4x4f,
  lightVP: mat4x4f,
  heightVP: mat4x4f,
  camPos: vec4f,
  lightDir: vec4f,   // unit, toward the key light
  lightEye: vec4f,   // key-light camera position
  absorb: vec4f,     // rgb absorption per unit, w = density scale
  tint: vec4f,       // flesh / glow colour
  misc: vec4f,       // time, exposure, width, height
  misc2: vec4f,      // height-map eye y, map half extent, show mesh, 0
};
@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var shadowTex: texture_2d<f32>;
@group(0) @binding(2) var heightTex: texture_2d<f32>;
@group(0) @binding(3) var linSamp: sampler;

const PI = 3.14159265;
const KEY = vec3f(3.1, 2.95, 2.75);

fn hash21(p: vec2f) -> f32 {
  let q = fract(p * vec2f(123.34, 456.21));
  let r = q + dot(q, q + 45.32);
  return fract(r.x * r.y);
}
fn noise2(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1, 0)), u.x), mix(hash21(i + vec2f(0, 1)), hash21(i + vec2f(1, 1)), u.x), u.y);
}

// Soft rectangular softbox seen in direction d.
fn softbox(d: vec3f, n: vec3f, right: vec3f, hw: f32, hh: f32, power: f32) -> f32 {
  let t = dot(d, n);
  if (t <= 0.0) { return 0.0; }
  let p = d / t - n;
  let up = cross(n, right);
  let x = abs(dot(p, right)) / hw;
  let y = abs(dot(p, up)) / hh;
  let m = (1.0 - smoothstep(0.75, 1.0, x)) * (1.0 - smoothstep(0.75, 1.0, y));
  return m * power;
}

// Photo-studio environment: warm-grey cyclorama with three softboxes.
fn env(d: vec3f) -> vec3f {
  let h = d.y;
  var c = mix(vec3f(0.42, 0.40, 0.38), vec3f(0.62, 0.60, 0.57), smoothstep(-0.2, 0.6, h));
  c = mix(vec3f(0.30, 0.28, 0.26), c, smoothstep(-0.25, 0.02, h));
  let kn = normalize(F.lightDir.xyz);
  c += vec3f(1.0, 0.97, 0.92) * softbox(d, kn, normalize(cross(vec3f(0, 1, 0), kn)), 0.42, 0.3, 9.0);
  let sn = normalize(vec3f(0.95, 0.35, -0.15));
  c += vec3f(0.92, 0.95, 1.0) * softbox(d, sn, normalize(cross(vec3f(0, 1, 0), sn)), 0.12, 0.55, 5.0);
  let bn = normalize(vec3f(-0.2, 0.55, -1.0));
  c += vec3f(1.0, 0.95, 0.88) * softbox(d, bn, normalize(cross(vec3f(0, 1, 0), bn)), 0.6, 0.18, 3.5);
  return c;
}

fn outerR(th: f32) -> f32 {
  let c = cos(7.0 * th);
  let e = 0.02;
  let b = (sqrt(c * c + e) - sqrt(e)) / (sqrt(1.0 + e) - sqrt(e));
  return 1.36 - 0.05 * (1.0 - b);
}

// Thin streak pattern across x with per-streak random strength.
fn streaks(x: f32, w: f32) -> f32 {
  let id = floor(x);
  let s = hash21(vec2f(id, 7.1));
  let off = abs(fract(x) - 0.5 - (s - 0.5) * 0.5);
  return (1.0 - smoothstep(0.0, w, off)) * step(0.35, s) * (0.4 + 0.6 * s);
}

// Flesh zones from rest-space position: x = density, y = milkiness, z = core weight.
fn zones(P: vec3f) -> vec3f {
  let r = length(P.xz);
  let th = atan2(P.z, P.x);
  let R = outerR(th);
  let u = clamp((r - 0.5) / (R - 0.5), 0.0, 1.0);
  let core = 1.0 - smoothstep(0.1, 0.28, u);
  let rim = smoothstep(0.88, 0.99, u);
  let eyesBand = smoothstep(0.6, 0.7, u) * (1.0 - smoothstep(0.86, 0.94, u));
  let a = th / (2.0 * PI);
  let wob = noise2(vec2f(a * 40.0, u * 3.0)) - 0.5;
  let fib = streaks(a * 120.0 + wob * 0.8, 0.13) * (0.45 + 0.55 * noise2(vec2f(a * 120.0, u * 2.5 + 3.0)))
            * smoothstep(0.03, 0.18, u) * (1.0 - smoothstep(0.92, 1.0, u));
  let thread = streaks(a * 330.0 + wob * 1.6, 0.18) * noise2(vec2f(a * 330.0, u * 6.0)) * (1.0 - core);
  let eyes = eyesBand * smoothstep(0.35, 0.75, noise2(vec2f(a * 70.0, u * 14.0 + P.y * 6.0)) * 0.6 + noise2(vec2f(a * 190.0, u * 30.0)) * 0.5);
  let density = 1.0 + core * 1.5 + rim * 0.8 + fib * 1.0 + thread * 0.45 + eyes * 1.4;
  let milk = 0.12 + core * 1.5 + fib * 0.9 + thread * 0.35 + eyes * 0.9;
  return vec3f(density, milk, core);
}

fn quatRotate(q: vec4f, v: vec3f) -> vec3f {
  let t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}

// Soft PCSS key shadow tinted by the light that passes through the jelly.
fn keyShadow(p: vec3f) -> vec3f {
  let lc = F.lightVP * vec4f(p, 1.0);
  let uv = vec2f(lc.x * 0.5 + 0.5, 0.5 - lc.y * 0.5);
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return vec3f(1.0); }
  let dims = vec2f(textureDimensions(shadowTex));
  let dR = dot(p - F.lightEye.xyz, -F.lightDir.xyz);
  let rot = hash21(p.xz * 91.0) * 6.2831;
  let cr = cos(rot); let sr = sin(rot);
  var sum = 0.0; var cnt = 0.0;
  for (var i = 0; i < 12; i++) {
    let fi = f32(i);
    let a = fi * 2.39996; let rr = sqrt((fi + 0.5) / 12.0) * 0.03;
    let o = vec2f(cos(a), sin(a)) * rr;
    let s = textureLoad(shadowTex, vec2i(clamp(uv + vec2f(o.x * cr - o.y * sr, o.x * sr + o.y * cr), vec2f(0.0), vec2f(0.999)) * dims), 0);
    if (s.r < dR - 0.03) { sum += s.r; cnt += 1.0; }
  }
  if (cnt < 0.5) { return vec3f(1.0); }
  let dB = sum / cnt;
  let w = clamp((dR - dB) * 0.012, 0.0015, 0.04);
  var lit = vec3f(0.0);
  for (var i = 0; i < 20; i++) {
    let fi = f32(i);
    let a = fi * 2.39996; let rr = sqrt((fi + 0.5) / 20.0) * w;
    let o = vec2f(cos(a), sin(a)) * rr;
    let s = textureLoad(shadowTex, vec2i(clamp(uv + vec2f(o.x * cr - o.y * sr, o.x * sr + o.y * cr), vec2f(0.0), vec2f(0.999)) * dims), 0);
    if (s.r < dR - 0.03) {
      let thick = max(s.a - s.r, 0.0);
      lit += exp(-F.absorb.rgb * F.absorb.w * thick * 1.6) * 0.55 * F.tint.rgb;
    } else { lit += vec3f(1.0); }
  }
  return lit / 20.0;
}

// Contact AO on the floor from the top-down bottom-height map.
fn contactAO(p: vec3f) -> f32 {
  let ext = F.misc2.y;
  let dims = vec2f(textureDimensions(heightTex));
  var occ = 0.0;
  for (var i = 0; i < 14; i++) {
    let fi = f32(i);
    let a = fi * 2.39996; let rr = sqrt((fi + 0.5) / 14.0) * 0.55;
    let q = p.xz + vec2f(cos(a), sin(a)) * rr;
    let hc = F.heightVP * vec4f(q.x, 0.0, q.y, 1.0);
    let uv = vec2f(hc.x * 0.5 + 0.5, 0.5 - hc.y * 0.5);
    if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { continue; }
    let s = textureLoad(heightTex, vec2i(uv * dims), 0);
    let hb = F.misc2.x - s.a;
    let gap = max(hb - p.y, 0.0);
    occ += (1.0 - smoothstep(0.0, 0.7, gap)) * (1.0 - rr / 0.7);
  }
  return 1.0 - clamp(occ / 14.0 * 1.25, 0.0, 0.8);
}
