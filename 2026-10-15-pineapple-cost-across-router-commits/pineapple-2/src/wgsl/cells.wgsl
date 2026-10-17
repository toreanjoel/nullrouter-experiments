@group(0) @binding(0) var<uniform> F: Frame;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) w: vec3f,
  @location(1) n: vec3f,
  @location(2) @interpolate(flat) kind: f32,
};

@vertex fn vs(@location(0) p: vec3f, @location(1) c: vec4f, @location(2) ax: vec4f, @location(3) ay: vec4f, @location(4) az: vec4f) -> VO {
  var o: VO;
  let w = c.xyz + ax.xyz * p.x + ay.xyz * p.y + az.xyz * p.z;
  o.pos = F.viewProj * vec4f(w, 1.0);
  o.w = w;
  o.n = ax.xyz * (p.x / dot(ax.xyz, ax.xyz)) + ay.xyz * (p.y / dot(ay.xyz, ay.xyz)) + az.xyz * (p.z / dot(az.xyz, az.xyz));
  o.kind = c.w;
  return o;
}

@fragment fn fs(in: VO) -> @location(0) vec4f {
  let n = normalize(in.n);
  let v = normalize(F.camPos.xyz - in.w);
  let L = F.lightDir.xyz;
  let ndv = abs(dot(n, v));
  let h = normalize(L + v);
  if (in.kind < 0.5) {
    let wrap = dot(n, L) * 0.5 + 0.5;
    var col = vec3f(1.0, 0.95, 0.80) * (0.45 + 1.1 * wrap);
    col += vec3f(1.0, 0.96, 0.84) * pow(1.0 - ndv, 2.0) * 0.8;
    col += vec3f(1.0) * pow(max(dot(n, h), 0.0), 50.0) * 1.6;
    return vec4f(col, 1.0);
  }
  let f = pow(1.0 - ndv, 1.3);
  var col = mix(vec3f(1.9, 1.86, 1.75), vec3f(0.06, 0.055, 0.05), f);
  col += vec3f(1.0) * pow(max(dot(n, h), 0.0), 140.0) * 8.0;
  return vec4f(col, 1.0);
}
