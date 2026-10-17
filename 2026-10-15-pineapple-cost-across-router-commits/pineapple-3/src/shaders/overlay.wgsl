// Tet-mesh overlay: physics edges as faint lines over the jelly.
@vertex fn vs(@location(0) p: vec3f) -> @builtin(position) vec4f {
  return U.viewProj * vec4f(p, 1.0);
}

@fragment fn fs() -> @location(0) vec4f {
  let a = U.params.z;
  return vec4f(vec3f(1.0, 0.98, 0.92) * a, a);
}
