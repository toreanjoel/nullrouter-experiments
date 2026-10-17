// Key-light shadow map: target 0 accumulates signed light-depth (back − front = thickness),
// target 1 keeps the nearest blocker depth (min blend). No culling, no depth buffer.
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) d: f32,
};

@vertex fn vs(@location(0) p: vec3f) -> VOut {
  var o: VOut;
  let c = U.lightViewProj * vec4f(p, 1.0);
  o.pos = c;
  o.d = c.z / c.w;
  return o;
}

struct FOut {
  @location(0) thick: f32,
  @location(1) depth: f32,
};

@fragment fn fs(i: VOut, @builtin(front_facing) ff: bool) -> FOut {
  var o: FOut;
  let wd = i.d * (U.lightParams.y - U.lightParams.x) - 8.0;
  o.thick = select(wd, -wd, ff);
  o.depth = i.d;
  return o;
}
