// The jelly: refraction of the scene by view-ray thickness, per-tap Beer–Lambert absorption
// and milky in-scatter from the rest-space zones, thin-edge back-lit glow, Fresnel studio
// reflections and GGX highlights.
@group(1) @binding(0) var sceneTex: texture_2d<f32>;
@group(1) @binding(1) var backTex: texture_2d<f32>;
@group(1) @binding(2) var linSamp: sampler;

const IOR: f32 = 1.36;
const TAPS: i32 = 6;

struct VIn {
  @location(0) p: vec3f,
  @location(1) n: vec3f,
  @location(2) r: vec3f,
};

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) rp: vec3f,
};

@vertex fn vs(i: VIn) -> VOut {
  var o: VOut;
  o.pos = U.viewProj * vec4f(i.p, 1.0);
  o.wp = i.p;
  o.n = i.n;
  o.rp = i.r;
  return o;
}

@fragment fn fs(i: VOut) -> @location(0) vec4f {
  let R3 = mat3x3f(U.bodyRot[0].xyz, U.bodyRot[1].xyz, U.bodyRot[2].xyz);
  let V = normalize(U.camPos.xyz - i.wp);
  var N = normalize(i.n);
  N = normalize(N + V * max(0.0, 0.05 - dot(N, V)));

  // Fibre relief: tilt the normal across the streaks (gradient along the ring angle).
  let th = atan2(i.rp.z, i.rp.x);
  let tRest = vec3f(-sin(th), 0.0, cos(th));
  let e = 0.006;
  let fa = fibreField(ringCoords(i.rp + tRest * e));
  let fb = fibreField(ringCoords(i.rp - tRest * e));
  N = normalize(N - (R3 * tRest) * ((fa - fb) * 0.35));

  // View-ray thickness from the back-face distance.
  let back = textureLoad(backTex, vec2i(i.pos.xy), 0).r;
  let front = length(U.camPos.xyz - i.wp);
  var thick = back - front;
  if (back <= 0.0 || thick <= 0.0) { thick = 0.04; }
  thick = min(thick, 3.0);

  let Rd = refract(-V, N, 1.0 / IOR);
  let rd = transpose(R3) * Rd;

  // March the refracted ray through the flesh in rest space.
  let absorbK = jellyAbsorb();
  let milk = mix(U.tint.rgb, vec3f(1.0), 0.6);
  let dt = thick / f32(TAPS);
  let jitter = ign(i.pos.xy);
  var T = vec3f(1.0);
  var S = vec3f(0.0);
  for (var k = 0; k < TAPS; k++) {
    let q = i.rp + rd * ((f32(k) + jitter) * dt);
    let z = ringZone(q);
    let sigS = z.scatter * 1.1;
    let ext = absorbK * z.absorb + vec3f(sigS);
    let stepT = exp(-ext * dt);
    let Li = milk * (0.9 + 0.5 * z.scatter);
    S += T * (vec3f(1.0) - stepT) * (sigS / max(ext, vec3f(1e-4))) * Li;
    T *= stepT;
  }

  let exitP = i.wp + Rd * thick;
  let uv = clamp(clipToUv(U.viewProj * vec4f(exitP, 1.0)), vec2f(0.001), vec2f(0.999));
  let bg = textureSampleLevel(sceneTex, linSamp, uv, 0.0).rgb;
  let refr = bg * T + S;

  let nv = clamp(dot(N, V), 0.0, 1.0);
  let F = 0.035 + 0.965 * pow(1.0 - nv, 5.0);
  let refl = studioEnv(reflect(-V, N));
  let L = U.lightDir.xyz;
  let spec = vec3f(1.0, 0.97, 0.92) * 0.035 *
    (ggxSpec(N, V, L, 0.18) * 3.0 + ggxSpec(N, V, RIM_DIR, 0.22) * 1.5 + ggxSpec(N, V, vec3f(0.0, 1.0, 0.0), 0.25) * 1.0);

  // Back-lit glow where the flesh is thin (edges, bevels), strongest against the rim light.
  let thin = exp(-thick * 3.5);
  let backlit = pow(clamp(dot(-V, RIM_DIR) * 0.5 + 0.5, 0.0, 1.0), 1.5);
  let glowC = U.tint.rgb * mix(vec3f(1.0), U.tint.rgb, 0.5);
  let glow = glowC * thin * (0.25 + 1.4 * backlit) * (0.4 + 0.6 * pow(1.0 - nv, 1.5)) * 1.6;

  let col = mix(refr, refl, F) + spec + glow;
  return vec4f(col, 1.0);
}
