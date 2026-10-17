// Juice cells (pale elongated sacs) and air bubbles, instanced ellipsoids whose axes come from
// points embedded in the flesh. Drawn into the scene so the jelly refracts and absorbs them.
//#include common

struct Inst { ax: vec4f, ay: vec4f, az: vec4f, c: vec4f }; // c.w: 0 cell, 1 bubble

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> inst: array<Inst>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
  @location(2) @interpolate(flat) kind: f32,
};

@vertex
fn vs(@location(0) p: vec3f, @builtin(instance_index) ii: u32) -> VOut {
  let I = inst[ii];
  let wp = I.c.xyz + I.ax.xyz * p.x + I.ay.xyz * p.y + I.az.xyz * p.z;
  let n = I.ax.xyz * (p.x / max(dot(I.ax.xyz, I.ax.xyz), 1e-8))
        + I.ay.xyz * (p.y / max(dot(I.ay.xyz, I.ay.xyz), 1e-8))
        + I.az.xyz * (p.z / max(dot(I.az.xyz, I.az.xyz), 1e-8));
  var o: VOut;
  o.pos = F.viewProj * vec4f(wp, 1.0);
  o.wp = wp;
  o.n = n;
  o.kind = I.c.w;
  return o;
}

@fragment
fn fs(v: VOut) -> @location(0) vec4f {
  let N = normalize(v.n);
  let V = normalize(F.camPos.xyz - v.wp);
  let NoV = abs(dot(N, V));
  let L = F.lightDir.xyz;
  if (v.kind < 0.5) {
    let wr = dot(N, L) * 0.5 + 0.5;
    let c = vec3f(1.0, 0.95, 0.78) * (0.55 + 0.35 * wr + 0.5 * pow(1.0 - NoV, 2.0));
    return vec4f(c * 1.15, 1.0);
  }
  // bubble: bright lens, dark meniscus, sharp highlight
  let rim = pow(1.0 - NoV, 1.6);
  var c = mix(vec3f(1.25, 1.2, 1.05), vec3f(0.18, 0.15, 0.1), rim);
  c += envStudio(reflect(-V, N), L) * (0.04 + 0.6 * rim) + vec3f(6.0) * ggx(N, V, L, 0.06);
  return vec4f(c, 1.0);
}
