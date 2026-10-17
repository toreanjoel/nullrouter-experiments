// Smooth normals of the skinned surface from central differences on its periodic (angle × profile) grid.
//#include common

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> skinPos: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> skinNrm: array<vec4f>;

@compute @workgroup_size(64)
fn normals(@builtin(global_invocation_id) id: vec3u) {
  let nT = u32(F.params.z);
  let nP = u32(F.params.w);
  let i = id.x;
  if (i >= nT * nP) { return; }
  let a = i / nP;
  let b = i % nP;
  let ap = (a + 1u) % nT;
  let am = (a + nT - 1u) % nT;
  let bp = (b + 1u) % nP;
  let bm = (b + nP - 1u) % nP;
  let dI = skinPos[ap * nP + b].xyz - skinPos[am * nP + b].xyz;
  let dJ = skinPos[a * nP + bp].xyz - skinPos[a * nP + bm].xyz;
  skinNrm[i] = vec4f(normalize(cross(dI, dJ) + vec3f(0.0, 1e-9, 0.0)) * F.params.y, 0.0);
}
