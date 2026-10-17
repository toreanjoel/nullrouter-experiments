@group(0) @binding(0) var<uniform> F: Frame;

@vertex fn vs(@location(0) p: vec3f) -> @builtin(position) vec4f {
  return F.lightVP * vec4f(p, 1.0);
}
