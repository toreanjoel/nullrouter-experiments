// Juice cells (pale elongated sacs) and air bubbles, instanced ellipsoids inside the flesh.
struct VIn {
  @location(0) lp: vec3f,
  @location(1) c: vec3f,
  @location(2) ax: vec3f,
  @location(3) rad: f32,
  @location(4) kind: f32,
};

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) n: vec3f,
  @location(1) wp: vec3f,
  @location(2) kind: f32,
};

@vertex fn vs(i: VIn) -> VOut {
  let len = length(i.ax);
  var d = vec3f(0.0, 1.0, 0.0);
  if (len > 1e-5) { d = i.ax / len; }
  var t = cross(d, vec3f(0.0, 0.0, 1.0));
  if (length(t) < 0.1) { t = cross(d, vec3f(1.0, 0.0, 0.0)); }
  t = normalize(t);
  let b = cross(d, t);
  let sa = max(len, i.rad);
  let sr = i.rad;
  var o: VOut;
  o.wp = i.c + t * (i.lp.x * sr) + d * (i.lp.y * sa) + b * (i.lp.z * sr);
  o.n = normalize(t * (i.lp.x / sr) + d * (i.lp.y / sa) + b * (i.lp.z / sr));
  o.pos = U.viewProj * vec4f(o.wp, 1.0);
  o.kind = i.kind;
  return o;
}

@fragment fn fs(i: VOut) -> @location(0) vec4f {
  var N = normalize(i.n);
  let V = normalize(U.camPos.xyz - i.wp);
  if (dot(N, V) < 0.0) { N = -N; }
  let L = U.lightDir.xyz;
  let nv = clamp(dot(N, V), 0.0, 1.0);
  if (i.kind < 0.5) {
    let base = mix(vec3f(1.0, 0.97, 0.86), U.tint.rgb, 0.25);
    let wrap = clamp((dot(N, L) + 0.5) / 1.5, 0.0, 1.0);
    let col = base * (0.45 + 1.5 * wrap) + vec3f(ggxSpec(N, V, L, 0.3) * 0.06) + base * pow(1.0 - nv, 2.0) * 0.6;
    return vec4f(col, 1.0);
  }
  let rim = pow(1.0 - nv, 1.5);
  let col = vec3f(0.2, 0.19, 0.17) + vec3f(1.7) * rim + vec3f(ggxSpec(N, V, L, 0.1) * 0.08);
  return vec4f(col, 1.0);
}
