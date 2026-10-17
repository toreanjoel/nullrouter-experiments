// The jelly: refraction by view-ray thickness, per-tap Beer–Lambert absorption through the rest-space flesh zones,
// milky in-scatter, back-lit glow at thin edges, Fresnel studio reflections and GGX highlights.
@group(1) @binding(0) var sceneTex: texture_2d<f32>;
@group(1) @binding(1) var backTex: texture_2d<f32>;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) w: vec3f,
  @location(1) n: vec3f,
  @location(2) q: vec4f,
  @location(3) rest: vec3f,
};

@vertex fn vs(@location(0) p: vec4f, @location(1) n: vec4f, @location(2) q: vec4f, @location(3) rest: vec4f) -> VO {
  var o: VO;
  o.pos = F.viewProj * vec4f(p.xyz, 1.0);
  o.w = p.xyz; o.n = n.xyz; o.q = q; o.rest = rest.xyz;
  return o;
}

fn ggx(n: vec3f, v: vec3f, l: vec3f, a: f32) -> f32 {
  let h = normalize(v + l);
  let nh = max(dot(n, h), 0.0); let nl = max(dot(n, l), 0.0); let nv = max(dot(n, v), 1e-3);
  let a2 = a * a;
  let d = a2 / (PI * pow(nh * nh * (a2 - 1.0) + 1.0, 2.0));
  let k = a * 0.5;
  let g = (nv / (nv * (1.0 - k) + k)) * (nl / (nl * (1.0 - k) + k));
  return d * g / (4.0 * nv) ;
}

@fragment fn fs(i: VO) -> @location(0) vec4f {
  let N = normalize(i.n);
  let V = normalize(F.camPos.xyz - i.w);
  let L = normalize(F.lightDir.xyz);
  let nv = clamp(dot(N, V), 0.0, 1.0);

  // View-ray thickness from the back-face pass.
  let front = length(F.camPos.xyz - i.w);
  let back = textureLoad(backTex, vec2i(i.pos.xy), 0).r;
  var thick = back - front;
  if (back <= 0.0 || thick <= 0.0) { thick = 0.12; }
  thick = clamp(thick, 0.02, 2.5);

  // Refracted ray, carried into rest space with the local tet rotation.
  let rd = refract(-V, N, 1.0 / 1.45);
  let q = normalize(i.q);
  let qi = vec4f(-q.xyz, q.w);
  let rdRest = quatRotate(qi, rd);

  // Light reaching the inside (wrapped, so the flesh glows on its shadow side too).
  let wrap = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
  let inLight = KEY * (0.18 + 0.32 * wrap) + vec3f(0.35, 0.34, 0.33);

  var T = vec3f(1.0);
  var scat = vec3f(0.0);
  let steps = 10;
  let ds = thick / f32(steps);
  let sigmaBase = F.absorb.rgb * F.absorb.w;
  for (var k = 0; k < steps; k++) {
    let s = (f32(k) + 0.5) * ds;
    let z = zones(i.rest + rdRest * s);
    let att = exp(-sigmaBase * z.x * ds);
    let milkCol = mix(F.tint.rgb, vec3f(1.0, 0.97, 0.9), 0.35 + 0.45 * z.z);
    scat += T * (1.0 - att) / max(sigmaBase * z.x, vec3f(1e-3)) * z.y * 0.55 * milkCol * inLight;
    T *= att;
  }

  // Refract the scene: project the exit point back to the screen.
  let exitW = i.w + rd * thick;
  let clip = F.viewProj * vec4f(exitW, 1.0);
  var uv = vec2f(clip.x / clip.w * 0.5 + 0.5, 0.5 - clip.y / clip.w * 0.5);
  uv = clamp(uv, vec2f(0.001), vec2f(0.999));
  let behind = textureSampleLevel(sceneTex, linSamp, uv, 0.0).rgb;

  // Back-lit glow where the jelly is thin, strongest looking toward the light.
  let thin = exp(-thick * 4.0);
  let toward = pow(clamp(dot(-V, L), 0.0, 1.0), 4.0);
  let glow = F.tint.rgb * KEY * thin * (0.12 + 1.2 * toward) * (0.4 + 0.6 * pow(1.0 - nv, 1.5));

  // Studio reflections and highlights.
  let F0 = 0.034;
  let fres = F0 + (1.0 - F0) * pow(1.0 - nv, 5.0);
  let refl = env(reflect(-V, N)) * fres;
  let spec = KEY * ggx(N, V, L, 0.06) * max(dot(N, L), 0.0) * fres / F0 * 0.04;

  let col = (behind * T + scat + glow) * (1.0 - fres) + refl + spec;
  return vec4f(col, 1.0);
}
