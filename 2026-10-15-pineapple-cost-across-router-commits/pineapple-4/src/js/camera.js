// Orbit camera around the specimen; frames the ring for the viewport aspect and builds pick rays.
const Camera = {
  yaw: 0, pitch: 0.62, zoom: 1, fovy: (30 * Math.PI) / 180, aspect: 1, dist: 8,
  target: new Float64Array([0, 0.2, 0]),
  eye: new Float64Array(3), fwd: new Float64Array(3), right: new Float64Array(3), up: new Float64Array(3),
  view: new Float32Array(16), proj: new Float32Array(16), viewProj: new Float32Array(16),
  worldUp: new Float64Array([0, 1, 0]),

  update(aspect) {
    this.aspect = aspect;
    const t = Math.tan(this.fovy / 2);
    this.dist = Math.max(1.95 / (t * aspect), 1.55 / t) * this.zoom;
    const cp = Math.cos(this.pitch), e = this.eye, c = this.target;
    e[0] = c[0] + this.dist * Math.sin(this.yaw) * cp;
    e[1] = c[1] + this.dist * Math.sin(this.pitch);
    e[2] = c[2] + this.dist * Math.cos(this.yaw) * cp;
    const f = this.fwd, r = this.right, u = this.up;
    f[0] = c[0] - e[0]; f[1] = c[1] - e[1]; f[2] = c[2] - e[2];
    let l = Math.hypot(f[0], f[1], f[2]); f[0] /= l; f[1] /= l; f[2] /= l;
    r[0] = -f[2]; r[1] = 0; r[2] = f[0]; // fwd × worldUp, always horizontal
    l = Math.hypot(r[0], r[2]); r[0] /= l; r[2] /= l;
    u[0] = r[1] * f[2] - r[2] * f[1]; u[1] = r[2] * f[0] - r[0] * f[2]; u[2] = r[0] * f[1] - r[1] * f[0];
    M4.lookAt(this.view, e, c, this.worldUp);
    M4.perspective(this.proj, this.fovy, aspect, 0.1, 80);
    M4.mul(this.viewProj, this.proj, this.view);
  },

  // World-space ray through normalised device coordinates (nx, ny).
  ray(nx, ny, o, d) {
    const t = Math.tan(this.fovy / 2), sx = nx * t * this.aspect, sy = ny * t;
    o[0] = this.eye[0]; o[1] = this.eye[1]; o[2] = this.eye[2];
    for (let k = 0; k < 3; k++) d[k] = this.fwd[k] + sx * this.right[k] + sy * this.up[k];
    const l = Math.hypot(d[0], d[1], d[2]);
    d[0] /= l; d[1] /= l; d[2] /= l;
  },
};
