// Jelly back faces: distance from the camera to the nearest back face, for view-ray thickness.
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f };

@vertex fn vs(@location(0) p: vec4f) -> VO {
  var o: VO;
  o.pos = F.viewProj * vec4f(p.xyz, 1.0);
  o.w = p.xyz;
  return o;
}

@fragment fn fs(i: VO) -> @location(0) vec4f {
  return vec4f(length(i.w - F.camPos.xyz), 0.0, 0.0, 1.0);
}
