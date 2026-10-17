// Juice cells (pale elongated sacs) and air bubbles, instanced ellipsoids that ride with the flesh.
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f, @location(2) kind: f32 };

@vertex fn vs(@location(0) sp: vec3f, @location(1) ct: vec4f, @location(2) ar: vec4f) -> VO {
  let L = max(length(ar.xyz), 1e-4);
  let a = ar.xyz / L;
  var helper = vec3f(0.0, 1.0, 0.0);
  if (abs(a.y) > 0.9) { helper = vec3f(1.0, 0.0, 0.0); }
  let u = normalize(cross(a, helper));
  let v = cross(a, u);
  let r = ar.w;
  var o: VO;
  o.w = ct.xyz + a * (sp.x * L) + u * (sp.y * r) + v * (sp.z * r);
  o.n = a * (sp.x / L) + u * (sp.y / r) + v * (sp.z / r);
  o.pos = F.viewProj * vec4f(o.w, 1.0);
  o.kind = ct.w;
  return o;
}

@fragment fn fs(i: VO) -> @location(0) vec4f {
  let n = normalize(i.n);
  let V = normalize(F.camPos.xyz - i.w);
  let L = normalize(F.lightDir.xyz);
  let nv = max(dot(n, V), 0.0);
  let H = normalize(L + V);
  let spec = pow(max(dot(n, H), 0.0), 120.0) * 2.5;
  if (i.kind > 0.5) {
    // Bubble: dark core, bright rim, sharp catch-light.
    let rim = pow(1.0 - nv, 2.0);
    return vec4f(vec3f(0.35, 0.33, 0.30) * (0.4 + nv * 0.3) + vec3f(1.6) * rim + spec * 2.0, 1.0);
  }
  let wrap = max(dot(n, L) * 0.5 + 0.5, 0.0);
  let juice = mix(F.tint.rgb, vec3f(1.0, 0.97, 0.86), 0.65);
  return vec4f(juice * (0.55 + 1.1 * wrap) + spec, 1.0);
}
