@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var sceneTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var backTex: texture_2d<f32>;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) w: vec3f,
  @location(1) n: vec3f,
  @location(2) rest: vec3f,
};

@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) rest: vec3f) -> VO {
  var o: VO;
  o.pos = F.viewProj * vec4f(p, 1.0);
  o.w = p;
  o.n = n;
  o.rest = rest;
  return o;
}

const IOR = 1.38;
const RIM_DIR = vec3f(0.80, 0.30, -0.52);

fn ggx(ndh: f32, a: f32) -> f32 {
  let a2 = a * a;
  let d = ndh * ndh * (a2 - 1.0) + 1.0;
  return a2 / (PI * d * d);
}

fn smithVis(ndv: f32, ndl: f32, a: f32) -> f32 {
  let k = a * 0.5;
  return 0.25 / ((ndv * (1.0 - k) + k) * (ndl * (1.0 - k) + k));
}

fn specular(N: vec3f, V: vec3f, L: vec3f, a: f32) -> f32 {
  let H = normalize(L + V);
  let ndl = max(dot(N, L), 0.0);
  let ndv = max(dot(N, V), 1e-3);
  let fh = 0.035 + 0.965 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
  return ggx(max(dot(N, H), 0.0), a) * smithVis(ndv, ndl, a) * fh * ndl;
}

@fragment fn fs(in: VO) -> @location(0) vec4f {
  var N = normalize(in.n);
  let V = normalize(F.camPos.xyz - in.w);

  // Fibre and eyes relief from rest-space detail, as a derivative bump so it follows the deformed surface.
  let z0 = zones(in.rest, true);
  let hgt = z0.y * 0.006 + z0.z * 0.012;
  let dpx = dpdx(in.w);
  let dpy = dpdy(in.w);
  let dhx = dpdx(hgt);
  let dhy = dpdy(hgt);
  let r1 = cross(dpy, N);
  let r2 = cross(N, dpx);
  let det = dot(dpx, r1);
  let bumped = abs(det) * N - sign(det) * (dhx * r1 + dhy * r2);
  if (abs(det) > 1e-14 && dot(bumped, bumped) > 1e-24) { N = normalize(bumped); }
  if (dot(N, V) < 0.02) { N = normalize(N + V * (0.02 - dot(N, V))); }
  let ndv = max(dot(N, V), 1e-3);

  // Thickness along the view ray from the back-face pass.
  let back = textureLoad(backTex, vec2i(in.pos.xy), 0);
  let dF = length(F.camPos.xyz - in.w);
  let hasBack = back.w > 0.0;
  let thick = select(0.04, clamp(back.w - dF, 0.0, 3.0), hasBack);
  let restB = select(in.rest, back.xyz, hasBack);

  // Refraction of the scene behind.
  let rd = refract(-V, N, 1.0 / IOR);
  let exitP = in.w + rd * (thick + 0.18);
  let cp = F.viewProj * vec4f(exitP, 1.0);
  let uv = clamp(cp.xy / cp.w * vec2f(0.5, -0.5) + 0.5, vec2f(0.001), vec2f(0.999));
  let bg = textureSampleLevel(sceneTex, samp, uv, 0.0).rgb;

  // Per-tap Beer–Lambert with milky in-scatter, denser in the core and fibres.
  let L = F.lightDir.xyz;
  let wrapL = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
  let Lin = F.scatter.rgb * F.keyColor.rgb * (0.16 + 0.42 * wrapL);
  let sigBase = F.absorb.rgb * F.absorb.w;
  let ds = thick / 8.0;
  var Tr = vec3f(1.0);
  var ins = vec3f(0.0);
  for (var i = 0; i < 8; i++) {
    let t = (f32(i) + 0.5) / 8.0;
    let z = zones(mix(in.rest, restB, t), false);
    let dens = 1.0 + 1.3 * z.x + 0.9 * z.y + 0.6 * z.z + 0.45 * z.w;
    let milk = F.scatter.w * (0.16 + 1.8 * z.x + 1.2 * z.y + 0.7 * z.z + 0.2 * z.w);
    let ext = sigBase * dens + vec3f(milk);
    let stepT = exp(-ext * ds);
    ins += Tr * (milk / ext) * (1.0 - stepT) * Lin;
    Tr *= stepT;
  }

  // Back-lit glow where the flesh is thin.
  let thin = exp(-thick * 4.0);
  let rimL = normalize(RIM_DIR);
  let behind = pow(clamp(dot(-V, rimL) * 0.5 + 0.5, 0.0, 1.0), 3.0) + 0.35 * pow(clamp(dot(-V, L) * 0.5 + 0.5, 0.0, 1.0), 2.0);
  let edge = pow(1.0 - ndv, 2.5);
  let glow = F.scatter.rgb * exp(-sigBase * 0.2) * F.keyColor.rgb * thin * (0.12 + 0.9 * behind + 0.6 * edge);

  // Fresnel studio reflection and GGX highlights.
  let fr = 0.035 + 0.965 * pow(1.0 - ndv, 5.0);
  let refl = env(reflect(-V, N), L);
  let spec = F.keyColor.rgb * (specular(N, V, L, 0.07) + 0.25 * specular(N, V, L, 0.22))
           + vec3f(0.9, 0.95, 1.0) * 1.6 * specular(N, V, rimL, 0.1);

  let col = (bg * Tr + ins + glow) * (1.0 - fr) + refl * fr + spec;
  return vec4f(col, 1.0);
}
