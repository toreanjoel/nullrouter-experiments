@group(0) @binding(0) var<uniform> F: Frame;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) w: vec3f,
  @location(1) rest: vec3f,
};

@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f, @location(2) rest: vec3f) -> VO {
  var o: VO;
  o.pos = F.viewProj * vec4f(p, 1.0);
  o.w = p;
  o.rest = rest;
  return o;
}

// Exit surface: rest-space position and view distance, for thickness and per-tap zone lookups.
@fragment fn fs(in: VO) -> @location(0) vec4f {
  return vec4f(in.rest, length(F.camPos.xyz - in.w));
}
