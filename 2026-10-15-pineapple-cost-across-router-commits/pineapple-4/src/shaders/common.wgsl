// Shared declarations: the frame uniform (mirrors Renderer.frame), hashes and noise,
// the studio environment with its softboxes, and a GGX highlight.
const PI = 3.14159265;

struct Frame {
  viewProj: mat4x4f,
  lightViewProj: mat4x4f,
  heightViewProj: mat4x4f,
  camPos: vec4f,
  lightDir: vec4f,     // direction to the key light
  tintAbs: vec4f,      // absorption per unit length
  tintScatter: vec4f,  // rgb: scatter albedo, w: exposure
  bodyRot0: vec4f,     // world-from-rest rotation columns
  bodyRot1: vec4f,
  bodyRot2: vec4f,
  bodyCom: vec4f,
  restCom: vec4f,
  screen: vec4f,
  params: vec4f,       // x: show mesh, y: normal sign, z: grid columns, w: grid rows
  keyColor: vec4f,
};

fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn hash22(p: vec2f) -> vec2f {
  var p3 = fract(vec3f(p.x, p.y, p.x) * vec3f(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

fn hash13(q: vec3f) -> f32 {
  var p3 = fract(q * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

fn vnoise3(p: vec3f) -> f32 {
  let i = floor(p);
  let fr = fract(p);
  let u = fr * fr * (3.0 - 2.0 * fr);
  let n000 = hash13(i);
  let n100 = hash13(i + vec3f(1.0, 0.0, 0.0));
  let n010 = hash13(i + vec3f(0.0, 1.0, 0.0));
  let n110 = hash13(i + vec3f(1.0, 1.0, 0.0));
  let n001 = hash13(i + vec3f(0.0, 0.0, 1.0));
  let n101 = hash13(i + vec3f(1.0, 0.0, 1.0));
  let n011 = hash13(i + vec3f(0.0, 1.0, 1.0));
  let n111 = hash13(i + vec3f(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

// Interleaved gradient noise, for rotating sample kernels and dithering.
fn ign(px: vec2f) -> f32 {
  return fract(52.9829189 * fract(dot(px, vec2f(0.06711056, 0.00583715))));
}

// A rectangular softbox seen in direction d, centred on c with angular half-size `size`.
fn softbox(d: vec3f, c: vec3f, size: vec2f) -> f32 {
  let t = dot(d, c);
  let ux = normalize(cross(vec3f(0.0, 1.0, 0.0), c));
  let uy = cross(c, ux);
  let p = d / max(t, 1e-3);
  let q = abs(vec2f(dot(p, ux), dot(p, uy))) / size;
  let m = (1.0 - smoothstep(0.8, 1.0, q.x)) * (1.0 - smoothstep(0.8, 1.0, q.y));
  return select(0.0, m, t > 0.05);
}

// Photo-studio cyclorama: warm floor bounce, pale sweep, dim ceiling, key/fill/strip softboxes.
fn envStudio(d: vec3f, L: vec3f) -> vec3f {
  var c = mix(vec3f(0.26, 0.25, 0.235), vec3f(0.60, 0.59, 0.565), smoothstep(-0.3, 0.3, d.y));
  c = mix(c, vec3f(0.40, 0.39, 0.37), smoothstep(0.55, 1.0, d.y));
  c += vec3f(7.0, 6.8, 6.4) * softbox(d, L, vec2f(0.5, 0.36));
  c += vec3f(2.6, 2.65, 2.8) * softbox(d, vec3f(0.7071, 0.4243, 0.5657), vec2f(0.22, 0.55));
  c += vec3f(3.0, 2.95, 2.85) * softbox(d, vec3f(-0.2075, 0.5707, 0.7944), vec2f(0.65, 0.1));
  return c;
}

fn ggx(N: vec3f, V: vec3f, L: vec3f, rough: f32) -> f32 {
  let H = normalize(V + L);
  let NoL = max(dot(N, L), 0.0);
  let NoV = max(dot(N, V), 1e-3);
  let NoH = max(dot(N, H), 0.0);
  let a = rough * rough;
  let a2 = a * a;
  let dd = NoH * NoH * (a2 - 1.0) + 1.0;
  let D = a2 / (PI * dd * dd);
  let k = a * 0.5;
  let G = (NoL / (NoL * (1.0 - k) + k)) * (NoV / (NoV * (1.0 - k) + k));
  let Fr = 0.03 + 0.97 * pow(1.0 - max(dot(V, H), 0.0), 5.0);
  return D * G * Fr / (4.0 * NoV);
}
