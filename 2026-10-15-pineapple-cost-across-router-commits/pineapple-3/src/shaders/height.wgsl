// Top-down height map: lowest jelly height over each floor texel (min blend), for contact AO.
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) y: f32,
};

@vertex fn vs(@location(0) p: vec3f) -> VOut {
  var o: VOut;
  o.pos = U.heightViewProj * vec4f(p, 1.0);
  o.y = p.y;
  return o;
}

@fragment fn fs(i: VOut) -> @location(0) f32 {
  return i.y;
}
