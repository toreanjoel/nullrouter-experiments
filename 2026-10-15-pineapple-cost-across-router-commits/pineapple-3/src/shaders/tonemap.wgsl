// Post: exposure, Khronos PBR Neutral tone mapping, light vignette, sRGB encode, dither.
@group(1) @binding(0) var hdrTex: texture_2d<f32>;

@vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  return vec4f(fullTri(vi), 0.0, 1.0);
}

fn pbrNeutral(c: vec3f) -> vec3f {
  let startCompression = 0.8 - 0.04;
  let desaturation = 0.15;
  let x = min(c.r, min(c.g, c.b));
  let offset = select(0.04, x - 6.25 * x * x, x < 0.08);
  var col = c - offset;
  let peak = max(col.r, max(col.g, col.b));
  if (peak < startCompression) { return col; }
  let d = 1.0 - startCompression;
  let newPeak = 1.0 - d * d / (peak + d - startCompression);
  col *= newPeak / peak;
  let g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(col, vec3f(newPeak), g);
}

fn toSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  var c = textureLoad(hdrTex, vec2i(fc.xy), 0).rgb * U.params.y;
  let uv = fc.xy * U.screen.zw;
  c *= 1.0 - 0.22 * pow(clamp(length(uv - 0.5) * 1.3, 0.0, 1.0), 2.4);
  let m = clamp(pbrNeutral(max(c, vec3f(0.0))), vec3f(0.0), vec3f(1.0));
  let n = (hash21(fc.xy) + hash21(fc.xy + vec2f(0.37, 0.71)) - 1.0) / 255.0;
  return vec4f(toSrgb(m) + vec3f(n), 1.0);
}
