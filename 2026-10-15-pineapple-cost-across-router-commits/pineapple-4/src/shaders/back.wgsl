// Jelly back faces: camera distance to the nearest exit surface, for view-ray thickness.
//#include common

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> skinPos: array<vec4f>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VOut {
  var o: VOut;
  o.wp = skinPos[vi].xyz;
  o.pos = F.viewProj * vec4f(o.wp, 1.0);
  return o;
}

@fragment
fn fs(v: VOut) -> @location(0) vec4f {
  return vec4f(length(v.wp - F.camPos.xyz), 0.0, 0.0, 1.0);
}
