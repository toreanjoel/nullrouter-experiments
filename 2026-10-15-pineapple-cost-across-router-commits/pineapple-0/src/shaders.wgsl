struct U {
  viewProj: mat4x4f,
  lightVP: mat4x4f,
  heightVP: mat4x4f,
  cam: vec4f,        // xyz, time
  lightDir: vec4f,   // toward key light, intensity
  absorb: vec4f,     // Beer–Lambert sigma_a per unit (tint)
  glow: vec4f,       // tint glow colour
  screen: vec4f,     // w, h, 1/w, 1/h
  params: vec4f,     // exposure, frame, light depth range, dot(lightCenter, L)
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var sampCmp: sampler_comparison;
@group(1) @binding(0) var shadowDepth: texture_depth_2d;
@group(1) @binding(1) var shadowThick: texture_2d<f32>;
@group(1) @binding(2) var heightTex: texture_2d<f32>;
@group(1) @binding(3) var sceneTex: texture_2d<f32>;
@group(1) @binding(4) var backTex: texture_2d<f32>;
@group(1) @binding(5) var hdrTex: texture_2d<f32>;

const PI = 3.14159265;
const TAU = 6.2831853;
const R_OUT = 1.36;
const R_IN = 0.5;
const THICK = 0.5;
const BEVEL = 0.12;
const SHADOW_RES = 1024.0;
const KEY_COL = vec3f(1.0, 0.955, 0.89);
const IOR = 1.45;

var<private> POISSON: array<vec2f, 16> = array<vec2f, 16>(
  vec2f(-0.94201624, -0.39906216), vec2f(0.94558609, -0.76890725), vec2f(-0.09418410, -0.92938870), vec2f(0.34495938, 0.29387760),
  vec2f(-0.91588581, 0.45771432), vec2f(-0.81544232, -0.87912464), vec2f(-0.38277543, 0.27676845), vec2f(0.97484398, 0.75648379),
  vec2f(0.44323325, -0.97511554), vec2f(0.53742981, -0.47373420), vec2f(-0.26496911, -0.41893023), vec2f(0.79197514, 0.19090188),
  vec2f(-0.24188840, 0.99706507), vec2f(-0.81409955, 0.91437590), vec2f(0.19984126, 0.78641367), vec2f(0.14383161, -0.14100790));

// ---------- shared helpers
fn outerR(th: f32) -> f32 {
  let c = cos(7.0 * th);
  return R_OUT - 0.05 * (1.0 - sqrt(c * c + 0.02) / sqrt(1.02));
}
fn hash11(p: f32) -> f32 { var x = fract(p * 0.1031); x = x * (x + 33.33); x = x * (x + x); return fract(x); }
fn hash21(p: vec2f) -> f32 { var p3 = fract(vec3f(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }
fn wrapi(i: f32, period: f32) -> f32 { return i - period * floor(i / period); }
// value noise, periodic in x so the pattern closes around the ring
fn vnoiseP(p: vec2f, period: f32) -> f32 {
  let i = floor(p); let f = fract(p); let w = f * f * (3.0 - 2.0 * f);
  let x0 = wrapi(i.x, period); let x1 = wrapi(i.x + 1.0, period);
  let a = hash21(vec2f(x0, i.y)); let b = hash21(vec2f(x1, i.y));
  let c = hash21(vec2f(x0, i.y + 1.0)); let d = hash21(vec2f(x1, i.y + 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}
// thin streaks: one candidate line per cell along the angle
fn lines(a: f32, period: f32, seed: f32, width: f32, presence: f32) -> f32 {
  let i = wrapi(floor(a), period); let f = fract(a);
  let on = step(1.0 - presence, hash11(i * 7.13 + seed));
  let o = 0.2 + 0.6 * hash11(i * 3.71 + seed * 1.7);
  let w = width * (0.6 + 0.8 * hash11(i * 1.93 + seed * 2.3));
  return on * (1.0 - smoothstep(0.0, w, abs(f - o)));
}
fn sdRound(p: vec2f, b: vec2f, r: f32) -> f32 {
  let q = abs(p) - b + vec2f(r);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// zones in rest space: x core, y rim, z fibre, w eyes. Symmetric in y so both faces match.
fn zones(r: f32, th: f32, ro: f32, yy: f32) -> vec4f {
  let core = 1.0 - smoothstep(R_IN + 0.10, R_IN + 0.24, r);
  let rim = smoothstep(ro - 0.13, ro - 0.03, r);
  let warp = 0.012 * sin(r * 8.0 + th * 3.0) + 0.005 * sin(r * 21.0 - th * 9.0);
  let a = (th + warp) * (96.0 / TAU);
  let span = smoothstep(R_IN + 0.04, R_IN + 0.16, r) * (1.0 - smoothstep(ro - 0.10, ro - 0.02, r));
  let g1 = smoothstep(0.28, 0.62, vnoiseP(vec2f(a * 0.75, r * 1.8 + yy * 2.0), 72.0));
  var fib = lines(a, 96.0, 1.7, 0.075, 0.6) * g1;
  let g2 = smoothstep(0.4, 0.75, vnoiseP(vec2f(a * 2.0, r * 4.5 + yy * 5.0), 192.0));
  fib += 0.6 * lines(a * 3.0 + 0.41, 288.0, 4.3, 0.1, 0.5) * g2;
  fib = min(fib, 1.0) * span;
  let bc = ro - 0.23;
  let band = 1.0 - smoothstep(0.05, 0.12, abs(r - bc));
  let e1 = vnoiseP(vec2f(th * (88.0 / TAU), (r - bc) * 16.0 + yy * 4.0), 88.0);
  let e2 = vnoiseP(vec2f(th * (308.0 / TAU), r * 30.0), 308.0);
  let eyes = band * clamp(smoothstep(0.45, 0.8, e1) * 0.8 + e2 * 0.4, 0.0, 1.0);
  return vec4f(core, rim, fib, eyes);
}
// (absorption multiplier, scattering coefficient), zero outside the rounded section
fn medium(rest: vec3f) -> vec2f {
  let r = length(rest.xz);
  let th = atan2(rest.z, rest.x);
  let ro = outerR(th);
  let d = sdRound(vec2f(r - 0.5 * (R_IN + ro), rest.y - 0.5 * THICK), vec2f(0.5 * (ro - R_IN), 0.5 * THICK), BEVEL);
  let inside = 1.0 - smoothstep(-0.015, 0.01, d);
  let z = zones(r, th, ro, abs(rest.y - 0.5 * THICK));
  let aMul = (1.0 + 0.5 * z.y + 0.55 * z.z + 0.45 * z.w) * (1.0 - 0.3 * z.x);
  let scat = 0.25 + 3.0 * z.x + 2.6 * z.z + 1.8 * z.w + 0.3 * z.y;
  return vec2f(aMul, scat) * inside;
}
fn surfRelief(rest: vec3f) -> f32 {
  let r = length(rest.xz); let th = atan2(rest.z, rest.x); let ro = outerR(th);
  let z = zones(r, th, ro, abs(rest.y - 0.5 * THICK));
  return 0.0035 * z.z + 0.005 * z.w - 0.002 * z.x;
}

fn sbox(d: vec3f, c: vec3f, hs: vec2f) -> f32 {
  let dc = dot(d, c);
  let t = normalize(cross(c, vec3f(0.0, 1.0, 0.0)));
  let b = cross(t, c);
  let uv = vec2f(dot(d, t), dot(d, b)) / max(dc, 1e-3);
  let e = abs(uv) - hs;
  let q = uv / hs;
  return (1.0 - smoothstep(-0.03, 0.015, max(e.x, e.y))) * step(0.0, dc) * (1.0 - 0.18 * dot(q, q));
}
// procedural photo studio: grey cove, darker ceiling, three softboxes
fn env(d: vec3f) -> vec3f {
  var col = mix(vec3f(0.50, 0.49, 0.47), vec3f(0.13, 0.13, 0.14), smoothstep(0.05, 0.85, d.y));
  col = mix(col, vec3f(0.40, 0.385, 0.36), smoothstep(0.03, -0.10, d.y));
  let warm = vec3f(1.0, 0.96, 0.9);
  col += warm * 9.0 * sbox(d, u.lightDir.xyz, vec2f(0.55, 0.38));
  col += warm * 4.0 * sbox(d, normalize(vec3f(1.0, 0.32, 0.25)), vec2f(0.10, 0.55));
  col += vec3f(0.92, 0.95, 1.0) * 5.0 * sbox(d, normalize(vec3f(-0.2, 0.5, -1.0)), vec2f(0.6, 0.12));
  return col;
}
fn ggx(N: vec3f, V: vec3f, L: vec3f, rough: f32) -> f32 {
  let H = normalize(L + V);
  let NdL = max(dot(N, L), 0.0); let NdV = max(dot(N, V), 1e-3); let NdH = max(dot(N, H), 0.0); let VdH = max(dot(V, H), 0.0);
  let a = rough * rough; let a2 = a * a;
  let dd = NdH * NdH * (a2 - 1.0) + 1.0;
  let D = a2 / (PI * dd * dd);
  let k = a * 0.5;
  let G = (NdL / (NdL * (1.0 - k) + k)) * (NdV / (NdV * (1.0 - k) + k));
  let F = 0.035 + 0.965 * pow(1.0 - VdH, 5.0);
  return D * G * F / (4.0 * NdV);
}

// ---------- jelly geometry
struct JIn { @location(0) pos: vec3f, @location(1) nrm: vec3f, @location(2) rest: vec3f };
struct JOut { @builtin(position) pos: vec4f, @location(0) wpos: vec3f, @location(1) nrm: vec3f, @location(2) rest: vec3f };
@vertex fn vs_jelly(v: JIn) -> JOut {
  var o: JOut;
  o.pos = u.viewProj * vec4f(v.pos, 1.0); o.wpos = v.pos; o.nrm = v.nrm; o.rest = v.rest;
  return o;
}
@fragment fn fs_back(i: JOut) -> @location(0) vec4f { return vec4f(i.rest, length(i.wpos - u.cam.xyz)); }

// key-light shadow: depth, plus thickness along the light (front faces −, back faces +)
struct SOut { @builtin(position) pos: vec4f, @location(0) rel: f32 };
@vertex fn vs_shadow(v: JIn) -> SOut {
  var o: SOut;
  o.pos = u.lightVP * vec4f(v.pos, 1.0);
  o.rel = u.params.w - dot(v.pos, u.lightDir.xyz);
  return o;
}
@fragment fn fs_shadow(i: SOut, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  return vec4f(select(i.rel, -i.rel, ff), 0.0, 0.0, 0.0);
}
// top-down height map (lowest jelly height per xz) for contact AO
struct HOut { @builtin(position) pos: vec4f, @location(0) y: f32 };
@vertex fn vs_height(v: JIn) -> HOut { var o: HOut; o.pos = u.heightVP * vec4f(v.pos, 1.0); o.y = v.pos.y; return o; }
@fragment fn fs_height(i: HOut) -> @location(0) vec4f { return vec4f(i.y, 0.0, 0.0, 0.0); }

// ---------- studio cyclorama
fn shadowTint(P: vec3f, pix: vec2f) -> vec3f {
  let lc = u.lightVP * vec4f(P, 1.0);
  let uv = vec2f(lc.x * 0.5 + 0.5, 0.5 - lc.y * 0.5);
  if (any(uv < vec2f(0.002)) || any(uv > vec2f(0.998))) { return vec3f(1.0); }
  let z = min(lc.z, 0.9995) - 0.0015;
  let ang = ign(pix) * TAU;
  let cs = cos(ang); let sn = sin(ang);
  var bsum = 0.0; var bn = 0.0;
  for (var i = 0; i < 16; i++) {
    let p = POISSON[i];
    let o = vec2f(p.x * cs - p.y * sn, p.x * sn + p.y * cs) * 0.035;
    let d = textureLoad(shadowDepth, vec2i(clamp(uv + o, vec2f(0.0), vec2f(0.999)) * SHADOW_RES), 0);
    if (d < z) { bsum += d; bn += 1.0; }
  }
  if (bn < 0.5) { return vec3f(1.0); }
  let dist = (z - bsum / bn) * u.params.z;          // receiver − blocker, world units
  let rad = clamp(0.002 + dist * 0.045, 0.002, 0.035);  // penumbra grows with distance (PCSS)
  var vis = 0.0; var th = 0.0;
  for (var i = 0; i < 16; i++) {
    let p = POISSON[i];
    let o = vec2f(p.x * cs - p.y * sn, p.x * sn + p.y * cs) * rad;
    vis += textureSampleCompareLevel(shadowDepth, sampCmp, uv + o, z);
    th += textureSampleLevel(shadowThick, samp, uv + o, 0.0).r;
  }
  let occ = 16.0 - vis;
  vis /= 16.0;
  let thO = abs(th) / max(occ, 1.0);   // sign depends on the light view winding
  let trans = exp(-u.absorb.rgb * thO * 0.8 - vec3f(0.45 * thO)) * 0.6;   // light through the jelly, tinted
  return vec3f(vis) + (1.0 - vis) * trans;
}
fn contactAO(P: vec3f) -> f32 {
  let hc = u.heightVP * vec4f(P, 1.0);
  let uv = vec2f(hc.x * 0.5 + 0.5, 0.5 - hc.y * 0.5);
  var occ = 0.0;
  for (var i = 0; i < 16; i++) {
    let rw = 0.08 + 0.42 * f32(i) / 15.0;
    let h = textureSampleLevel(heightTex, samp, uv + POISSON[i] * (rw / 6.0), 0.0).r;
    occ += 1.0 - smoothstep(0.0, 0.3 + rw, max(h - P.y, 0.0));
  }
  return 1.0 - 0.85 * occ / 16.0;
}

struct COut { @builtin(position) pos: vec4f, @location(0) wpos: vec3f, @location(1) nrm: vec3f };
@vertex fn vs_cyc(@location(0) p: vec3f, @location(1) n: vec3f) -> COut {
  var o: COut; o.pos = u.viewProj * vec4f(p, 1.0); o.wpos = p; o.nrm = n; return o;
}
@fragment fn fs_cyc(i: COut) -> @location(0) vec4f {
  let P = i.wpos; let N = normalize(i.nrm); let L = u.lightDir.xyz;
  let alb = vec3f(0.80, 0.78, 0.745);
  let NdL = max(dot(N, L), 0.0);
  var sh = vec3f(1.0);
  if (P.y < 2.5 && NdL > 0.0) { sh = shadowTint(P, i.pos.xy); }
  let pool = mix(0.40, 1.0, exp(-dot(P.xz, P.xz) * 0.045 - P.y * 0.14));
  let hemi = mix(vec3f(0.20, 0.20, 0.205), vec3f(0.34, 0.335, 0.325), N.y * 0.5 + 0.5);
  let ao = mix(1.0, contactAO(P), 1.0 - smoothstep(0.1, 0.6, P.y));
  let direct = KEY_COL * u.lightDir.w * NdL * sh * pool;
  let col = alb * (hemi * mix(0.7, 1.0, pool) * ao + direct * mix(1.0, ao, 0.4));
  return vec4f(col, length(P - u.cam.xyz));
}

// ---------- juice cells & bubbles (instanced ellipsoids carried by their tet's F)
struct CellOut { @builtin(position) pos: vec4f, @location(0) wpos: vec3f, @location(1) nrm: vec3f, @location(2) @interpolate(flat) kind: f32 };
@vertex fn vs_cell(@location(0) p: vec3f, @location(1) c0: vec4f, @location(2) c1: vec4f, @location(3) c2: vec4f, @location(4) t: vec4f) -> CellOut {
  let M = mat3x3f(c0.xyz, c1.xyz, c2.xyz);
  let cof = mat3x3f(cross(M[1], M[2]), cross(M[2], M[0]), cross(M[0], M[1]));
  var o: CellOut;
  o.wpos = t.xyz + M * p;
  o.pos = u.viewProj * vec4f(o.wpos, 1.0);
  o.nrm = cof * p;
  o.kind = t.w;
  return o;
}
@fragment fn fs_cell(i: CellOut) -> @location(0) vec4f {
  let N = normalize(i.nrm); let V = normalize(u.cam.xyz - i.wpos); let L = u.lightDir.xyz;
  let NdV = abs(dot(N, V));
  let hl = pow(max(dot(reflect(-V, N), L), 0.0), 60.0);
  var col: vec3f;
  if (i.kind < 0.5) {
    let wrap = max(dot(N, L) * 0.5 + 0.5, 0.0);
    col = vec3f(0.97, 0.92, 0.76) * (0.35 + 0.75 * wrap) * (0.75 + 0.45 * pow(1.0 - NdV, 2.0)) + vec3f(0.8 * hl);
  } else {
    let rim = smoothstep(0.25, 0.85, 1.0 - NdV);
    col = mix(vec3f(1.6, 1.55, 1.45), vec3f(0.10, 0.09, 0.08), rim) + vec3f(4.0 * hl * hl);
  }
  return vec4f(col, length(i.wpos - u.cam.xyz));
}

// ---------- full-screen helpers
@vertex fn vs_full(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}
@fragment fn fs_bg(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return vec4f(textureLoad(sceneTex, vec2i(pos.xy), 0).rgb, 1.0);
}

// ---------- the jelly
@fragment fn fs_jelly(i: JOut) -> @location(0) vec4f {
  let P = i.wpos;
  let rest = i.rest;
  // fibre relief via screen-space bump (no tangents needed)
  let hgt = surfRelief(rest);
  let dpx = dpdx(P); let dpy = dpdy(P);
  let dhx = dpdx(hgt); let dhy = dpdy(hgt);
  var N = normalize(i.nrm);
  let r1 = cross(dpy, N); let r2 = cross(N, dpx);
  let det = dot(dpx, r1);
  let grad = (r1 * dhx + r2 * dhy) * sign(det);
  N = normalize(select(N, abs(det) * N - grad, abs(det) > 1e-14));
  let V = normalize(u.cam.xyz - P);
  let rd = -V;
  let nv = dot(N, V);
  if (nv < 0.03) { N = normalize(N + V * (0.03 - nv)); }

  let ip = vec2i(i.pos.xy);
  let back = textureLoad(backTex, ip, 0);
  let dF = length(P - u.cam.xyz);
  let dB = max(back.a, dF + 0.004);
  let restB = select(rest, back.xyz, back.a > dF);
  let fullThick = dB - dF;
  let dEnd = clamp(textureLoad(sceneTex, ip, 0).a, dF + 0.002, dB);   // stop at a juice cell or bubble
  let thick = dEnd - dF;

  // refraction of the scene by view-ray thickness
  let rr = refract(rd, N, 1.0 / IOR);
  let ex = P + rr * (fullThick * 0.85);
  let clip = u.viewProj * vec4f(ex, 1.0);
  let uvR = clamp(vec2f(clip.x / clip.w * 0.5 + 0.5, 0.5 - clip.y / clip.w * 0.5), vec2f(0.001), vec2f(0.999));
  let bg = textureSampleLevel(sceneTex, samp, uvR, 0.0).rgb;

  // march: Beer–Lambert per tap, single scattering lit through the key shadow map
  let L = u.lightDir.xyz;
  let cosT = dot(L, rd);
  let g = 0.3;
  let hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5);
  let amb = vec3f(0.42, 0.41, 0.40) * exp(-u.absorb.rgb * 0.2);
  let NT = 10;
  let ds = thick / f32(NT);
  let jit = ign(i.pos.xy + vec2f(u.params.y * 7.0, 0.0));
  var Tr = vec3f(1.0);
  var Ls = vec3f(0.0);
  for (var k = 0; k < NT; k++) {
    let t = (f32(k) + jit) * ds;
    let restT = mix(rest, restB, t / max(fullThick, 1e-4));
    let m = medium(restT);
    let wp = u.cam.xyz + rd * (dF + t);
    let lc = u.lightVP * vec4f(wp, 1.0);
    let luv = clamp(vec2f(lc.x * 0.5 + 0.5, 0.5 - lc.y * 0.5), vec2f(0.0), vec2f(0.999));
    let sd = textureLoad(shadowDepth, vec2i(luv * SHADOW_RES), 0);
    let into = max(lc.z - sd, 0.0) * u.params.z;
    let lightT = exp(-(u.absorb.rgb * 0.9 + vec3f(0.55)) * into);
    let Lin = KEY_COL * u.lightDir.w * lightT * hg + amb;
    let sigA = u.absorb.rgb * m.x;
    let sigS = m.y;
    let ext = sigA + vec3f(sigS);
    let stepT = exp(-ext * ds);
    Ls += Tr * sigS * Lin * (1.0 - stepT) / max(ext, vec3f(1e-4));
    Tr *= stepT;
  }

  // surface: Fresnel studio reflection, GGX key highlight, back-lit glow at thin edges
  let NdV = clamp(dot(N, V), 0.0, 1.0);
  let F = 0.035 + 0.965 * pow(1.0 - NdV, 5.0);
  let refl = env(reflect(rd, N));
  let spec = KEY_COL * u.lightDir.w * ggx(N, V, L, 0.2);
  let rimDir = normalize(vec3f(-0.2, 0.5, -1.0));
  let thin = smoothstep(0.7, 0.04, fullThick);
  let glow = u.glow.rgb * 2.2 * exp(-u.absorb.rgb * fullThick * 0.8) * thin * pow(1.0 - NdV, 1.2)
           * (0.35 + 0.65 * max(dot(rimDir, rd), 0.0) + 0.5 * max(dot(L, rd), 0.0));
  let col = (bg * Tr + Ls) * (1.0 - F) + refl * F + spec + glow;
  return vec4f(col, 1.0);
}

// ---------- mesh overlay
@vertex fn vs_line(@location(0) p: vec3f) -> @builtin(position) vec4f { return u.viewProj * vec4f(p, 1.0); }
@fragment fn fs_line() -> @location(0) vec4f { return vec4f(0.08, 0.06, 0.05, 0.45); }

// ---------- tone map: exposure, Khronos PBR Neutral, sRGB, dither
fn pbrNeutral(c0: vec3f) -> vec3f {
  let startC = 0.8 - 0.04;
  let desat = 0.15;
  let x = min(c0.r, min(c0.g, c0.b));
  let off = select(0.04, x - 6.25 * x * x, x < 0.08);
  var c = c0 - off;
  let peak = max(c.r, max(c.g, c.b));
  if (peak < startC) { return c; }
  let d = 1.0 - startC;
  let newPeak = 1.0 - d * d / (peak + d - startC);
  c *= newPeak / peak;
  let gg = 1.0 - 1.0 / (desat * (peak - newPeak) + 1.0);
  return mix(c, vec3f(newPeak), gg);
}
fn srgb(c: vec3f) -> vec3f {
  return select(1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3f(0.0031308));
}
@fragment fn fs_tone(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  var c = max(textureLoad(hdrTex, vec2i(pos.xy), 0).rgb * u.params.x, vec3f(0.0));
  c = pbrNeutral(c);
  let q = pos.xy * u.screen.zw - 0.5;
  c *= 1.0 - 0.16 * dot(q, q);
  let s = srgb(clamp(c, vec3f(0.0), vec3f(1.0))) + (ign(pos.xy) - 0.5) / 255.0;
  return vec4f(s, 1.0);
}
