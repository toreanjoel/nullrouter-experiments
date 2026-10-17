// Post: exposure, Khronos PBR Neutral tone mapping, sRGB encode, dither.
struct Post { exposure: f32, time: f32, pad0: f32, pad1: f32 };
@group(0) @binding(0) var<uniform> U: Post;
@group(0) @binding(1) var hdrTex: texture_2d<f32>;

@vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn pbrNeutral(c0: vec3f) -> vec3f {
  let start = 0.8 - 0.04;
  let desat = 0.15;
  let x = min(c0.r, min(c0.g, c0.b));
  var offset = 0.04;
  if (x < 0.08) { offset = x - 6.25 * x * x; }
  var c = c0 - offset;
  let peak = max(c.r, max(c.g, c.b));
  if (peak < start) { return c; }
  let d = 1.0 - start;
  let newPeak = 1.0 - d * d / (peak + d - start);
  c *= newPeak / peak;
  let g = 1.0 - 1.0 / (desat * (peak - newPeak) + 1.0);
  return mix(c, vec3f(newPeak), g);
}

fn toSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let hdr = textureLoad(hdrTex, vec2i(fc.xy), 0).rgb * U.exposure;
  let mapped = clamp(pbrNeutral(max(hdr, vec3f(0.0))), vec3f(0.0), vec3f(1.0));
  var s = toSrgb(mapped);
  let n = fract(sin(dot(fc.xy + U.time, vec2f(12.9898, 78.233))) * 43758.5453);
  s += (n - 0.5) / 255.0;
  return vec4f(s, 1.0);
}
