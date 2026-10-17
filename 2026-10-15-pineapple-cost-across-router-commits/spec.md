PROMPT

Build "Pineapple Jelly" — a single self-contained HTML file (inline JS/CSS, no libraries): a real-time WebGPU soft-body gummy pineapple ring with a real hole. The user can grab its outer or inner edge, stretch it, flip it over and let it wobble.

Object
- A thick canned-pineapple ring: outer radius 1.36, hole radius 0.5, thickness 0.5.
- Every edge rounded (bevel 0.12); 14 shallow scallops around the outer edge.
- Zones from rest-space coordinates, so they deform with the body. Both faces carry the same detail.
- A paler, denser core ring around the hole and a slightly deeper rim.
- Radial fibres: long thin streaks from core to rim, plus finer threads.
- The fibrous "eyes" band just inside the rim, where the flesh is most textured.
- Embedded juice cells (elongated pale sacs lying along the radius) and a few air bubbles that ride with the flesh.
- Tints: Golden, Amber, Rosé. Only the colour changes; scattering, gloss and fibres stay the same.

Physics (XPBD tetrahedral soft body)
- Mesh: 2D Delaunay of the scalloped annulus (outline samples plus a hex lattice; holes skipped), extruded into prisms → tets.
- Co-rotational per-tet shape matching (warm-started quaternion), so inverted tets recover; tet volume constraints for near-incompressibility; hard edge strain limits.
- Relative-velocity damping along edges; floor contact with Coulomb friction.
- Grab:
  - a soft patch attachment with bounded reach that never crushes the held patch into the floor;
  - the ray-pick knows when it passes through the empty hole;
  - scroll or a second finger twists the held patch.
- "Turn it over" tosses the ring with a spin about the screen's horizontal axis, so it flips and lands on its other face.
- Fixed 60 Hz step, small substeps (1 iteration each), gentle settling.
- The frame loop reuses every array (no per-frame allocation).

Rendering (WebGPU / WGSL)
- Passes: key-light shadow map; top-down height map for contact AO; scene (floor, juice cells, bubbles; MSAA); jelly back-face depth; jelly (refraction and absorption; MSAA) plus an optional mesh overlay; tone map.
- Procedural photo-studio cyclorama with softboxes. Soft PCSS key shadow tinted by the jelly.
- Jelly:
  - refraction of the scene by view-ray thickness;
  - per-tap Beer–Lambert absorption, denser and milkier in the core and fibres;
  - back-lit glow at thin edges, Fresnel studio reflections and GGX highlights.
- Post: exposure, Khronos PBR Neutral tone mapping, sRGB, dither.

UI (editorial "Material Studies / No. 012", English)
- Italic serif title "Pineapple / Jelly." and hint "Grab either edge. Pull. Let go."
- Panel "The Specimen": Tint swatches (tiny pineapple-ring icons); Firmness and Internal damping sliders; Give it a nudge, Turn it over, Reset, Pause; Show mesh and ¼ speed.
- Keys: Space to pause, N to nudge, T to turn it over, R to reset.
- Readouts: Mass (g, 1 unit ≈ 3 cm at 1.3 g/cm³), Volume (% of rest), Kinetic.
- Fallback screen when WebGPU is missing. Responsive stacked layout on mobile with no horizontal scroll.
