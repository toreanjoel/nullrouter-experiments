// Procedural photo studio: grey sweep with rectangular softboxes, used for reflections.
fn softbox(d: vec3f, c: vec3f, hw: f32, hh: f32) -> f32 {
  let cosA = dot(d, c);
  if (cosA <= 0.05) { return 0.0; }
  var right = cross(vec3f(0.0, 1.0, 0.0), c);
  if (dot(right, right) < 1e-4) { right = vec3f(1.0, 0.0, 0.0); }
  right = normalize(right);
  let up = cross(c, right);
  let p = d / cosA - c;
  let x = dot(p, right) / hw;
  let y = dot(p, up) / hh;
  let e = max(abs(x), abs(y));
  return (1.0 - smoothstep(0.8, 1.0, e)) * (0.82 + 0.18 * (1.0 - x * x));
}

fn env(d: vec3f, keyDir: vec3f) -> vec3f {
  let horizon = smoothstep(-0.3, 0.4, d.y);
  var col = mix(vec3f(0.26, 0.25, 0.235), vec3f(0.46, 0.45, 0.43), horizon);
  col *= 0.8 + 0.2 * smoothstep(-0.6, 0.6, -d.z);
  col += vec3f(1.0, 0.97, 0.92) * 11.0 * softbox(d, keyDir, 0.45, 0.32);
  col += vec3f(0.94, 0.97, 1.0) * 7.0 * softbox(d, normalize(vec3f(0.86, 0.32, -0.5)), 0.09, 0.62);
  col += vec3f(1.0, 0.99, 0.97) * 2.2 * softbox(d, normalize(vec3f(-0.92, 0.22, 0.3)), 0.32, 0.4);
  col += vec3f(1.0) * 3.0 * softbox(d, vec3f(0.0, 1.0, 0.0), 0.5, 0.5);
  return col;
}
