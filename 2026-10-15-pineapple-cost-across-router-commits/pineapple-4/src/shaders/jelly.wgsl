// The jelly: bump from fibres and eyes, view-ray thickness from the back-face pass, per-tap
// Beer–Lambert absorption and milky in-scatter along the refracted ray (denser in core and fibres),
// refraction of the scene behind, back-lit glow at thin edges, Fresnel studio reflection, GGX.
//#include common
//#include zones

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> skinPos: array<vec4f>;
@group(0) @binding(2) var<storage, read> skinNrm: array<vec4f>;
@group(0) @binding(3) var<storage, read> restPos: array<vec4f>;
@group(0) @binding(4) var sceneTex: texture_2d<f32>;
@group(0) @binding(5) var backTex: texture_2d<f32>;
@group(0) @binding(6) var linSamp: sampler;

const FILL_DIR = vec3f(0.7071, 0.4243, 0.5657);
const FILL_COL = vec3f(1.6, 1.62, 1.7);
const TAPS = 6;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) rest: vec3f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var o: VOut;
  o.wp = skinPos[vi].xyz;
  o.pos = F.viewProj * vec4f(o.wp, 1.0);
  o.n = skinNrm[vi].xyz;
  o.rest = restPos[vi].xyz;
  return o;
}

@fragment
fn fs(v: VOut) -> @location(0) vec4f {
  let P = v.wp;
  let z0 = zones(v.rest);
  let hgt = surfaceHeight(z0);
  let dPx = dpdx(P);
  let dPy = dpdy(P);
  let dHx = dpdx(hgt);
  let dHy = dpdy(hgt);

  let V = normalize(F.camPos.xyz - P);
  var N = normalize(v.n);
  N = select(N, -N, dot(N, V) < 0.0);
  // surface-gradient bump mapping
  let r1 = cross(dPy, N);
  let r2 = cross(N, dPx);
  let det = dot(dPx, r1);
  let grad = sign(det) * (dHx * r1 + dHy * r2) * 0.003;
  N = normalize(abs(det) * N - grad + N * 1e-12);
  let NoV = clamp(dot(N, V), 1e-3, 1.0);

  // thickness along the view ray
  let backD = textureLoad(backTex, vec2i(v.pos.xy), 0).r;
  let frontD = length(P - F.camPos.xyz);
  var thick = select(0.03, backD - frontD, backD > 0.0 && backD > frontD);
  thick = clamp(thick, 0.008, 1.8);

  // march the refracted ray in rest space (the body's overall rotation maps directions back)
  let Lk = F.lightDir.xyz;
  let backLit = pow(clamp(dot(-V, Lk), 0.0, 1.0), 3.0);
  let Lin = vec3f(0.5, 0.49, 0.47) + F.keyColor.rgb * (0.1 + 0.55 * backLit);
  let Dr = refract(-V, N, 0.7246);
  let Rm = mat3x3f(F.bodyRot0.xyz, F.bodyRot1.xyz, F.bodyRot2.xyz);
  let Drest = transpose(Rm) * Dr;
  let ds = thick / f32(TAPS);
  var tau = vec3f(0.0);
  var scat = vec3f(0.0);
  for (var k = 0; k < TAPS; k++) {
    let zt = zones(v.rest + Drest * ((f32(k) + 0.5) * ds));
    let sigA = F.tintAbs.rgb * density(zt);
    let sigS = milkiness(zt) * 2.4;
    scat += exp(-tau) * (1.0 - exp(-sigS * ds)) * Lin;
    tau += sigA * ds + vec3f(sigS * 0.3 * ds);
  }
  scat *= F.tintScatter.rgb;

  // the scene behind, seen through the exit point
  let exitP = P + Dr * (thick + 0.25);
  let cp = F.viewProj * vec4f(exitP, 1.0);
  let uv = clamp(cp.xy / cp.w * vec2f(0.5, -0.5) + 0.5, vec2f(0.001), vec2f(0.999));
  let bg = textureSampleLevel(sceneTex, linSamp, uv, 0.0).rgb;
  var col = bg * exp(-tau) + scat;

  // thin edges glow when the key light is behind them
  let thin = exp(-thick * 6.0);
  col += F.tintScatter.rgb * F.keyColor.rgb * thin * (0.08 + 0.9 * backLit);

  let fres = 0.03 + 0.97 * pow(1.0 - NoV, 5.0);
  col = mix(col, envStudio(reflect(-V, N), Lk), fres);
  col += F.keyColor.rgb * ggx(N, V, Lk, 0.14) + FILL_COL * ggx(N, V, FILL_DIR, 0.2);
  return vec4f(col, 1.0);
}
