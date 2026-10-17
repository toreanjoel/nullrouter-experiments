// Studio cyclorama: key light with a PCSS soft shadow tinted by the jelly, contact AO from the
// height map, ambient from the sweep and a soft background wash.
//#include common

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var shadowTex: texture_depth_2d;
@group(0) @binding(2) var shadowCmp: sampler_comparison;
@group(0) @binding(3) var heightTex: texture_depth_2d;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) wp: vec3f,
  @location(1) n: vec3f,
};

@vertex
fn vs(@location(0) p: vec3f, @location(1) n: vec3f) -> VOut {
  var o: VOut;
  o.pos = F.viewProj * vec4f(p, 1.0);
  o.wp = p;
  o.n = n;
  return o;
}

// Percentage-closer soft shadows: blocker search, penumbra from blocker distance, rotated Vogel-disk PCF.
fn shadowPCSS(wp: vec3f, px: vec2f) -> f32 {
  let lp = F.lightViewProj * vec4f(wp, 1.0);
  let uv = lp.xy * vec2f(0.5, -0.5) + 0.5;
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0)) || lp.z > 1.0) { return 1.0; }
  let dim = vec2f(textureDimensions(shadowTex));
  let z = lp.z;
  let rot = ign(px) * 6.2831853;
  var sum = 0.0;
  var cnt = 0.0;
  for (var i = 0; i < 12; i++) {
    let fi = f32(i);
    let a = fi * 2.39996 + rot;
    let q = clamp(uv + vec2f(cos(a), sin(a)) * sqrt((fi + 0.5) / 12.0) * 0.035, vec2f(0.0), vec2f(0.9999));
    let dd = textureLoad(shadowTex, vec2i(q * dim), 0);
    if (dd < z - 0.002) { sum += dd; cnt += 1.0; }
  }
  if (cnt < 0.5) { return 1.0; }
  let blocker = sum / cnt;
  // light-space depth spans 15 units; ~0.09 rad of light size; the map spans 6.4 units
  let pen = clamp((z - blocker) * 15.0 * 0.09 / 6.4, 0.0008, 0.03);
  var vis = 0.0;
  for (var i = 0; i < 16; i++) {
    let fi = f32(i);
    let a = fi * 2.39996 + rot;
    let o = vec2f(cos(a), sin(a)) * sqrt((fi + 0.5) / 16.0) * pen;
    vis += textureSampleCompareLevel(shadowTex, shadowCmp, uv + o, z - 0.0015);
  }
  return vis / 16.0;
}

// Occlusion from nearby jelly close to the floor, read from the underside height map.
fn contactAO(wp: vec3f) -> f32 {
  if (wp.y > 0.05) { return 1.0; }
  let dim = vec2f(textureDimensions(heightTex));
  var occ = 0.0;
  for (var i = 0; i < 12; i++) {
    let fi = f32(i);
    let r = 0.05 + 0.5 * (fi + 0.5) / 12.0;
    let a = fi * 2.39996;
    let q = wp.xz + vec2f(cos(a), sin(a)) * r;
    let hp = F.heightViewProj * vec4f(q.x, 0.0, q.y, 1.0);
    let uv = hp.xy * vec2f(0.5, -0.5) + 0.5;
    if (any(uv < vec2f(0.0)) || any(uv >= vec2f(1.0))) { continue; }
    let h = textureLoad(heightTex, vec2i(uv * dim), 0) * 4.0 - 0.05;
    occ += (1.0 - smoothstep(0.0, 0.35 + r, h)) * (1.0 - r / 0.6);
  }
  return 1.0 - clamp(occ / 5.0, 0.0, 0.85);
}

@fragment
fn fs(v: VOut) -> @location(0) vec4f {
  let n = normalize(v.n);
  let L = F.lightDir.xyz;
  let vis = shadowPCSS(v.wp, v.pos.xy);
  // light that passes through the jelly keeps its colour, so the shadow is tinted, not grey
  let trans = exp(-F.tintAbs.rgb * 0.8);
  let lit = vec3f(vis) + (1.0 - vis) * trans * 0.6;
  let ndl = max(dot(n, L), 0.0);
  let ao = contactAO(v.wp);
  let albedo = vec3f(0.83, 0.81, 0.78);
  let sky = mix(vec3f(0.36, 0.35, 0.34), vec3f(0.56, 0.55, 0.53), n.y * 0.5 + 0.5);
  let wq = v.wp.xz * vec2f(0.09, 0.07);
  let wash = exp(-dot(wq, wq));
  var col = albedo * (F.keyColor.rgb * ndl * lit * mix(1.0, ao, 0.35) + sky * ao * (0.7 + 0.5 * wash));
  let gx = v.wp.x * 0.16;
  let wallGlow = smoothstep(0.0, 4.0, v.wp.y) * exp(-gx * gx) * 0.6;
  col += albedo * vec3f(1.0, 0.98, 0.95) * wallGlow;
  col *= mix(1.0, 0.6, smoothstep(5.0, 13.0, length(v.wp.xz)));
  return vec4f(col, 1.0);
}
