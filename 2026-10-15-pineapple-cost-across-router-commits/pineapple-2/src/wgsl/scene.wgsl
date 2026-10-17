@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var shadowTex: texture_depth_2d;
@group(0) @binding(2) var shadowCmp: sampler_comparison;
@group(0) @binding(3) var heightTex: texture_depth_2d;

struct VO {
  @builtin(position) pos: vec4f,
  @location(0) w: vec3f,
  @location(1) n: vec3f,
};

@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f) -> VO {
  var o: VO;
  o.pos = F.viewProj * vec4f(p, 1.0);
  o.w = p;
  o.n = n;
  return o;
}

// PCSS: blocker search, then a rotated Poisson PCF sized by the blocker distance.
fn shadowVis(w: vec3f, n: vec3f, px: vec2f) -> f32 {
  let lp = F.lightVP * vec4f(w + n * 0.01, 1.0);
  let uv = vec2f(lp.x * 0.5 + 0.5, 0.5 - lp.y * 0.5);
  let z = lp.z;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 || z > 1.0) { return 1.0; }
  let size = vec2f(textureDimensions(shadowTex));
  let a = hash21(px) * TAU;
  let rot = mat2x2f(cos(a), sin(a), -sin(a), cos(a));
  var sum = 0.0;
  var cnt = 0.0;
  for (var i = 0; i < 16; i++) {
    let s = clamp(uv + rot * POISSON[i] * 0.04, vec2f(0.0), vec2f(0.9999));
    let d = textureLoad(shadowTex, vec2i(s * size), 0);
    if (d < z - 0.002) { sum += d; cnt += 1.0; }
  }
  if (cnt < 0.5) { return 1.0; }
  let pen = clamp((z - sum / cnt) * F.lightDir.w, 0.0012, 0.045);
  var vis = 0.0;
  for (var i = 0; i < 16; i++) {
    vis += textureSampleCompareLevel(shadowTex, shadowCmp, uv + rot * POISSON[i] * pen, z - 0.002);
  }
  return vis / 16.0;
}

// Contact AO from the top-down min-height map of the jelly.
fn contactAO(w: vec3f, px: vec2f) -> f32 {
  let hp = F.heightVP * vec4f(w, 1.0);
  let uv = vec2f(hp.x * 0.5 + 0.5, 0.5 - hp.y * 0.5);
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { return 1.0; }
  let size = vec2f(textureDimensions(heightTex));
  let a = hash21(px + 3.7) * TAU;
  let rot = mat2x2f(cos(a), sin(a), -sin(a), cos(a));
  var occ = 0.0;
  for (var i = 0; i < 16; i++) {
    let r = select(0.012, 0.035, i >= 8);
    let s = clamp(uv + rot * POISSON[i] * r, vec2f(0.0), vec2f(0.9999));
    let d = textureLoad(heightTex, vec2i(s * size), 0);
    if (d < 0.9999) {
      let h = max(d * HEIGHT_RANGE + HEIGHT_MIN - w.y, 0.0);
      occ += 1.0 - smoothstep(0.0, 0.5, h);
    }
  }
  return 1.0 - 0.72 * occ / 16.0;
}

@fragment fn fs(in: VO) -> @location(0) vec4f {
  let n = normalize(in.n);
  let L = F.lightDir.xyz;
  var vis = 1.0;
  var ao = 1.0;
  if (in.w.y < 1.5) {
    vis = shadowVis(in.w, n, in.pos.xy);
    ao = contactAO(in.w, in.pos.xy);
  }
  let lit = mix(F.shadowTint.rgb, vec3f(1.0), vis);
  let ndl = max(dot(n, L), 0.0);
  let albedo = vec3f(0.80, 0.785, 0.76);
  let sky = mix(vec3f(0.17, 0.17, 0.175), vec3f(0.40, 0.395, 0.385), n.y * 0.5 + 0.5);
  var col = albedo * (F.keyColor.rgb * ndl * lit * mix(1.0, ao, 0.5) + sky * ao);
  let d = length(in.w.xz - vec2f(0.0, -1.5));
  col *= 1.0 - 0.38 * smoothstep(3.5, 13.0, d);
  col *= 1.0 + 0.12 * smoothstep(0.0, 6.0, in.w.y) * (1.0 - smoothstep(6.0, 13.0, in.w.y));
  return vec4f(col, 1.0);
}
