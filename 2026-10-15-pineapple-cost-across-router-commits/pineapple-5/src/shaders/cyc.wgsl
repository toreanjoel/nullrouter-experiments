// Studio cyclorama: floor, cove and wall, lit by the key (PCSS, jelly-tinted) and the softboxes, with contact AO.
struct VO { @builtin(position) pos: vec4f, @location(0) w: vec3f, @location(1) n: vec3f };

@vertex fn vs(@location(0) p: vec3f, @location(1) n: vec3f) -> VO {
  var o: VO;
  o.pos = F.viewProj * vec4f(p, 1.0);
  o.w = p; o.n = n;
  return o;
}

@fragment fn fs(i: VO) -> @location(0) vec4f {
  let n = normalize(i.n);
  let L = normalize(F.lightDir.xyz);
  let albedo = vec3f(0.80, 0.77, 0.73);
  // Pool of light from the overhead softbox, falling off toward the edges and up the wall.
  let pool = exp(-dot(i.w.xz, i.w.xz) / 40.0) * 0.8 + 0.25;
  let sky = mix(vec3f(0.30, 0.29, 0.28), vec3f(0.55, 0.54, 0.52), n.y * 0.5 + 0.5) * pool;
  var direct = vec3f(0.0);
  let ndl = max(dot(n, L), 0.0);
  if (ndl > 0.0) { direct = KEY * 0.32 * ndl * keyShadow(i.w + n * 0.004); }
  var ao = 1.0;
  if (n.y > 0.8) { ao = contactAO(i.w); }
  let side = env(normalize(vec3f(1.0, 0.25, 0.0))) * 0.04 * max(n.x, 0.0);
  let col = albedo * (sky * ao + direct * mix(1.0, ao, 0.4) + side);
  return vec4f(col, 1.0);
}
