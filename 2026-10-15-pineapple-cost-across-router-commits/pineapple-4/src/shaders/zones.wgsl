// Pineapple anatomy from rest-space position (so it deforms with the body; y is ignored, so both
// faces match): paler denser core, deeper rim, radial fibres and fine threads, the "eyes" band.
struct Zones {
  u: f32,      // 0 at the hole wall, 1 at the rim
  core: f32,
  rim: f32,
  eyes: f32,
  walls: f32,  // fibrous walls between eye pockets
  fib: f32,
  fine: f32,
};

fn outerR(th: f32) -> f32 {
  let s = abs(sin(7.0 * th));
  let e = 0.03;
  let se = sqrt(e);
  let hump = (sqrt(s * s + e) - se) / (sqrt(1.0 + e) - se);
  return 1.36 - 0.05 * (1.0 - hump);
}

// `count` radial streaks around the ring (periodic in a), each with its own width, length and strength.
fn streaks(a: f32, count: f32, warp: f32, u: f32, width: f32, seed: f32) -> f32 {
  let fa = a * count + warp;
  let sid = floor(fa);
  let idw = sid - count * floor(sid / count);
  let h1 = hash12(vec2f(idw, seed));
  let h2 = hash12(vec2f(idw, seed + 17.0));
  let dist = abs(fract(fa) - 0.5 - (h1 - 0.5) * 0.4);
  let w = width * (0.5 + h2);
  let ln = exp(-(dist * dist) / (w * w));
  let u0 = 0.12 + 0.25 * h2;
  let u1 = 0.78 + 0.22 * h1;
  let along = smoothstep(u0, u0 + 0.1, u) * (1.0 - smoothstep(u1 - 0.1, u1, u));
  return ln * along * (0.35 + 0.65 * h1);
}

// Worley F1/F2 with x periodic over `period` cells.
fn worleyP(q: vec2f, period: f32) -> vec2f {
  let i = floor(q);
  let fr = fract(q);
  var d1 = 8.0;
  var d2 = 8.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let g = vec2f(f32(x), f32(y));
      var c = i + g;
      c.x = c.x - period * floor(c.x / period);
      let o = hash22(c) * 0.8 + 0.1;
      let dd = length(g + o - fr);
      if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) { d2 = dd; }
    }
  }
  return vec2f(d1, d2);
}

fn zones(p: vec3f) -> Zones {
  var z: Zones;
  let r = length(p.xz);
  let th = atan2(p.z, p.x);
  let cs = vec2f(cos(th), sin(th));
  z.u = clamp((r - 0.5) / (outerR(th) - 0.5), 0.0, 1.0);
  let n1 = vnoise3(vec3f(cs * 3.0, r * 2.0));
  let n2 = vnoise3(vec3f(cs * 11.0, r * 5.0 + 3.1));
  let a = th * 0.15915494 + 0.5;
  z.core = 1.0 - smoothstep(0.08, 0.26, z.u + (n1 - 0.5) * 0.08);
  z.rim = smoothstep(0.86, 0.99, z.u);
  z.fib = streaks(a, 96.0, (n1 - 0.5) * 1.2, z.u, 0.11, 1.0);
  z.fine = streaks(a, 288.0, (n2 - 0.5) * 2.0, z.u, 0.14, 7.0) * (0.6 + 0.4 * n2);
  z.eyes = smoothstep(0.64, 0.72, z.u) * (1.0 - smoothstep(0.88, 0.94, z.u));
  let wl = worleyP(vec2f(a * 72.0, r / 0.085), 72.0);
  z.walls = 1.0 - smoothstep(0.02, 0.2, wl.y - wl.x);
  return z;
}

fn density(z: Zones) -> f32 {
  return 1.0 + 1.5 * z.core + 0.5 * z.rim + 0.9 * z.fib + 0.5 * z.fine + z.eyes * (0.3 + 1.1 * z.walls);
}

fn milkiness(z: Zones) -> f32 {
  return max(0.10 + 1.1 * z.core + 0.8 * z.fib + 0.35 * z.fine + z.eyes * (0.25 + 0.9 * z.walls) - 0.06 * z.rim, 0.0);
}

fn surfaceHeight(z: Zones) -> f32 {
  return 0.8 * z.fib + 0.4 * z.fine + z.eyes * (z.walls - 0.3);
}
