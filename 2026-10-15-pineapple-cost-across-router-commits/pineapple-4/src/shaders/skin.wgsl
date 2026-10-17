// Skins each render-surface vertex onto its tet: barycentric blend of the four physics positions.
struct Embed { tet: u32, b1: f32, b2: f32, b3: f32 };

@group(0) @binding(0) var<storage, read> phys: array<vec4f>;
@group(0) @binding(1) var<storage, read> tets: array<vec4u>;
@group(0) @binding(2) var<storage, read> embeds: array<Embed>;
@group(0) @binding(3) var<storage, read_write> skinPos: array<vec4f>;

@compute @workgroup_size(64)
fn skin(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x;
  if (i >= arrayLength(&embeds)) { return; }
  let e = embeds[i];
  let t = tets[e.tet];
  let b0 = 1.0 - e.b1 - e.b2 - e.b3;
  let p = phys[t.x].xyz * b0 + phys[t.y].xyz * e.b1 + phys[t.z].xyz * e.b2 + phys[t.w].xyz * e.b3;
  skinPos[i] = vec4f(p, 1.0);
}
