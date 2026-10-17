// Key-light shadow map and top-down height map: blended min (RGB) / max (A) distance along the pass direction.
// R = nearest jelly surface, A = farthest, so A - R is the jelly thickness along the ray.
struct Pass { vp: mat4x4f, eye: vec4f, dir: vec4f };
@group(0) @binding(0) var<uniform> P: Pass;

struct VO { @builtin(position) pos: vec4f, @location(0) d: f32 };

@vertex fn vs(@location(0) p: vec4f) -> VO {
  var o: VO;
  o.pos = P.vp * vec4f(p.xyz, 1.0);
  o.d = dot(p.xyz - P.eye.xyz, P.dir.xyz);
  return o;
}

@fragment fn fs(i: VO) -> @location(0) vec4f {
  return vec4f(i.d);
}
