@group(0) @binding(0) var<uniform> F: Frame;

@vertex fn vs(@location(0) p: vec3f) -> @builtin(position) vec4f {
  return F.viewProj * vec4f(p, 1.0);
}

@fragment fn fs() -> @location(0) vec4f {
  return vec4f(0.08, 0.07, 0.05, 0.42);
}
