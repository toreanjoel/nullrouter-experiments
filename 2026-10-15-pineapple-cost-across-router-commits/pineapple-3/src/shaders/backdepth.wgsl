// Jelly back faces: distance from the camera to the nearest exit surface, per pixel.
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
};

@vertex fn vs(@location(0) p: vec3f) -> VOut {
  var o: VOut;
  o.pos = U.viewProj * vec4f(p, 1.0);
  o.wp = p;
  return o;
}

@fragment fn fs(i: VOut) -> @location(0) f32 {
  return length(i.wp - U.camPos.xyz);
}
