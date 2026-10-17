// Procedural cyclorama (floor sweeping into a back wall), lit by the key softbox with a
// PCSS shadow tinted by the jelly and contact AO from the height map. Writes its own depth.
@group(1) @binding(0) var shThick: texture_2d<f32>;
@group(1) @binding(1) var shDepth: texture_2d<f32>;
@group(1) @binding(2) var heightTex: texture_2d<f32>;
@group(1) @binding(3) var linSamp: sampler;

const CYC_Z: f32 = 3.2;   // floor runs back to z = -CYC_Z
const CYC_R: f32 = 2.6;   // radius of the sweep

struct FullOut {
  @builtin(position) pos: vec4f,
  @location(0) ndc: vec2f,
};

@vertex fn vs(@builtin(vertex_index) vi: u32) -> FullOut {
  var o: FullOut;
  let p = fullTri(vi);
  o.pos = vec4f(p, 0.0, 1.0);
  o.ndc = p;
  return o;
}

fn pcssShadow(p: vec3f, frag: vec2f) -> vec3f {
  let lp = U.lightViewProj * vec4f(p, 1.0);
  let uv = vec2f(lp.x * 0.5 + 0.5, 0.5 - lp.y * 0.5);
  let d = lp.z;
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0))) { return vec3f(1.0); }
  let range = U.lightParams.y - U.lightParams.x;
  let toUv = 1.0 / (2.0 * U.lightParams.z);
  let ang = ign(frag) * TAU;
  let cs = vec2f(cos(ang), sin(ang));
  let searchR = 0.4 * toUv;
  let bias = 0.002;
  var bsum = 0.0;
  var bcnt = 0.0;
  for (var k = 0; k < 16; k++) {
    let bd = textureSampleLevel(shDepth, linSamp, uv + rot2(POISSON[k], cs) * searchR, 0.0).r;
    if (bd < d - bias) { bsum += bd; bcnt += 1.0; }
  }
  if (bcnt < 0.5) { return vec3f(1.0); }
  let avg = bsum / bcnt;
  let penumbra = (d - avg) * range * U.lightDir.w;
  let r = clamp(penumbra * toUv, 1.5 * U.lightParams.w, searchR);
  var occ = 0.0;
  var th = 0.0;
  for (var k = 0; k < 16; k++) {
    let q = uv + rot2(POISSON[k], cs) * r;
    let bd = textureSampleLevel(shDepth, linSamp, q, 0.0).r;
    if (bd < d - bias) {
      occ += 1.0;
      th += textureSampleLevel(shThick, linSamp, q, 0.0).r;
    }
  }
  let vis = 1.0 - occ / 16.0;
  let thick = max(th / max(occ, 1.0), 0.0);
  let trans = exp(-jellyAbsorb() * thick) * 0.42 + vec3f(0.03);
  return mix(trans, vec3f(1.0), vis);
}

fn contactAO(p: vec3f, frag: vec2f) -> f32 {
  let hp = U.heightViewProj * vec4f(p, 1.0);
  let uv = vec2f(hp.x * 0.5 + 0.5, 0.5 - hp.y * 0.5);
  let toUv = 1.0 / (2.0 * U.params.w);
  let ang = ign(frag + vec2f(17.0, 5.0)) * TAU;
  let cs = vec2f(cos(ang), sin(ang));
  let R = 0.6;
  var occ = 0.0;
  for (var k = 0; k < 16; k++) {
    let o = rot2(POISSON[k], cs);
    let h = textureSampleLevel(heightTex, linSamp, uv + o * (R * toUv), 0.0).r;
    let above = max(h - p.y, 0.0);
    occ += (1.0 - smoothstep(0.0, 0.55, above)) * (1.0 - 0.7 * length(o));
  }
  return clamp(1.0 - 0.85 * occ / 16.0, 0.0, 1.0);
}

struct SceneOut {
  @location(0) color: vec4f,
  @builtin(frag_depth) depth: f32,
};

@fragment fn fs(i: FullOut) -> SceneOut {
  let pn = U.invViewProj * vec4f(i.ndc, 0.0, 1.0);
  let pf = U.invViewProj * vec4f(i.ndc, 1.0, 1.0);
  let ro = U.camPos.xyz;
  let rd = normalize(pf.xyz / pf.w - pn.xyz / pn.w);
  var t = -1.0;
  var n = vec3f(0.0, 1.0, 0.0);
  if (rd.y < 0.0) {
    let tf = -ro.y / rd.y;
    if (ro.z + rd.z * tf >= -CYC_Z) { t = tf; }
  }
  if (t < 0.0) {
    let oc = vec2f(ro.y - CYC_R, ro.z + CYC_Z);
    let d2 = vec2f(rd.y, rd.z);
    let a = dot(d2, d2);
    let b = dot(oc, d2);
    let c = dot(oc, oc) - CYC_R * CYC_R;
    let disc = b * b - a * c;
    if (disc > 0.0 && a > 1e-6) {
      let tc = (-b + sqrt(disc)) / a;
      let q = ro + rd * tc;
      if (tc > 0.0 && q.z < -CYC_Z && q.y < CYC_R) {
        t = tc;
        n = normalize(vec3f(0.0, CYC_R - q.y, -CYC_Z - q.z));
      }
    }
  }
  if (t < 0.0 && rd.z < 0.0) {
    let tw = (-(CYC_Z + CYC_R) - ro.z) / rd.z;
    if (ro.y + rd.y * tw >= CYC_R) { t = tw; n = vec3f(0.0, 0.0, 1.0); }
  }
  var o: SceneOut;
  if (t < 0.0) {
    o.color = vec4f(studioEnv(rd) * 0.3, 1.0);
    o.depth = 1.0;
    return o;
  }
  let p = ro + rd * t;
  let L = U.lightDir.xyz;
  let ndl = max(dot(n, L), 0.0);
  var sh = vec3f(1.0);
  var ao = 1.0;
  if (p.y < 0.05) {
    sh = pcssShadow(p, i.pos.xy);
    ao = contactAO(p, i.pos.xy);
  }
  let albedo = vec3f(0.84, 0.82, 0.78);
  // Light pool under the key, darker toward the back and the sides.
  let pool = exp(-dot(p.xz - vec2f(-0.3, 0.2), p.xz - vec2f(-0.3, 0.2)) * 0.05);
  let falloff = 0.55 + 0.45 * pool;
  let key = vec3f(2.5, 2.42, 2.3) * ndl * sh;
  let amb = vec3f(0.5, 0.5, 0.52) * (0.65 + 0.35 * n.y) * ao;
  o.color = vec4f(albedo * (key + amb) * falloff, 1.0);
  let clip = U.viewProj * vec4f(p, 1.0);
  o.depth = clamp(clip.z / clip.w, 0.0, 1.0);
  return o;
}
