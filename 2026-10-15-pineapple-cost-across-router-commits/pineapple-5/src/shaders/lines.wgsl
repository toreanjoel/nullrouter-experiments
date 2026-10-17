// Optional tet-mesh overlay: physics edges drawn over the jelly.
@vertex fn vs(@location(0) p: vec4f) -> @builtin(position) vec4f {
  return F.viewProj * vec4f(p.xyz, 1.0);
}

@fragment fn fs() -> @location(0) vec4f {
  return vec4f(0.16, 0.10, 0.04, 0.35);
}
