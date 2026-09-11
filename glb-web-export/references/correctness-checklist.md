# Correctness checklist

Run this against every output before reporting a win. Anything you cannot check,
say you did not check — do not assume it survived.

`bash scripts/glb-audit.sh before.glb after.glb` covers items 1, 2, 4, 5, 6 and 9
automatically and prints a `regressions` array. The rest need eyes or the app.

---

## 1. Units and scale

glTF's linear unit is the metre and +Y is up — "The units for all linear
distances are meters", "glTF defines +Y as up; the front side of a glTF asset
faces +Z, the left side of a glTF asset faces +X", "glTF uses a right-handed
coordinate system" (glTF 2.0 Specification, *Coordinate System and Units*,
https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc,
fetched 2026-09-11).

- [ ] `worldBounds.sizeMeters` identical before and after
- [ ] The dimensions match reality: a door ≈ 2.0 m tall, a chair ≈ 0.45 m seat height. A 1000× or 0.01× value means the source exporter used centimetres or inches
- [ ] Up axis unchanged. A Z-up source (most CAD, some Blender setups) must be rotated at export, not "fixed" in the optimizer

**Trap:** do not read `gltf-transform inspect`'s `bboxMin`/`bboxMax` columns to
check this. After `quantize`, `meshopt` or `draco`, positions are stored as
normalized integers with the factor pushed onto the node transform, so `inspect`
reports accessor-local bounds. Measured on the fixture: `inspect` went from
`-2.2, 0, -1.6 → 2.2, 1, 1.6` to `-1, -1, -1 → 1, 1, 1`, while the true
world-space size stayed `4.4 × 1 × 3.2 m`. The audit script applies the node
transforms, so its numbers are the ones to trust.

## 2. Node names and hierarchy

- [ ] `namedNodesLost` is empty, **or** every lost name is one the app provably never resolves
- [ ] Names the app looks up by string (`scene.getObjectByName(...)`, drei `nodes.Foo`, a click-target map, an animation target) are all still present
- [ ] Parent/child relationships the app relies on are intact if it walks the graph

Measured effects on the fixture (16 named nodes in):

| Pass | Named nodes out |
|---|---|
| `dedup` + `prune` + `weld` + `resize` + `etc1s` + `meshopt` | 14 (only the two empty helper leaves gone) |
| `prune --keep-leaves` | 16 |
| `+ instance --min 5` | 2 — `Crate_00…Crate_11` collapse into one unnamed instancing node |
| `optimize` (defaults) | 1 |
| `gltfpack -cc -tc -kn -km` | 16 |
| `gltfpack -cc -tc -mi` (no `-kn`) | 0 |

`prune` drops empty leaf nodes by default. Use `--keep-leaves` if the app looks
up empty helpers (attachment points, sockets, camera targets).

## 3. Animations

- [ ] Animation count unchanged
- [ ] Each clip still targets a node that exists — `prune` removes animations that target nothing in a scene
- [ ] Clip names unchanged if the app plays them by name
- [ ] Play every clip once in the app and watch for drift or popping. `meshopt` and `gltfpack` quantize animation tracks (`-at`/`-ar`/`-as`) and `gltfpack -af` resamples to 30 Hz by default
- [ ] Skinned meshes: skin count unchanged, no exploded vertices. `instance` cannot be applied to animated meshes at all

## 4. Draw calls and triangles

- [ ] Triangle count unchanged, unless you deliberately ran `simplify`/`-si` and said so in the report
- [ ] Draw calls did not increase

**Trap:** Draco changes the triangle count slightly even without simplification —
its quantization collapses degenerate triangles. Measured: 7,056 → 6,987 on the
fixture. Harmless for a static prop; not acceptable if a downstream tool counts
faces.

**Trap:** `join` can make a reused-mesh scene *bigger* by duplicating shared
vertices. Measured: 12,882,440 B → 12,890,228 B.

## 5. Materials and PBR fidelity

- [ ] Same number of *visually distinct* materials. Fewer is fine when `dedup` merged genuinely identical ones — the fixture legitimately went 4 → 1 because two textures were byte-identical and the PBR factors matched
- [ ] `alphaMode` preserved per material (`OPAQUE` / `MASK` / `BLEND`), and `alphaCutoff` with it. A `BLEND` material silently turned `OPAQUE` looks like a rendering bug
- [ ] `doubleSided` preserved
- [ ] `KHR_materials_*` extensions still listed in `extensionsUsed` (clearcoat, transmission, volume, ior, specular, emissive_strength, unlit…)
- [ ] Normal maps: if you used KTX2, they went through `uastc`, not `etc1s`. ETC1S wrecks normal maps
- [ ] Occlusion/roughness/metallic packed maps kept their channel layout — never convert an ORM texture to a lossy format at low quality
- [ ] Emissive strength and factors unchanged

## 6. Textures

- [ ] Resolution reduction is intentional and stated in the report
- [ ] No texture with a meaningful alpha channel was converted to JPEG (JPEG has no alpha)
- [ ] sRGB vs linear unchanged — base color and emissive are sRGB; normal, occlusion, metallic-roughness are linear. A codec swap must not move a texture between them
- [ ] `KHR_texture_transform` still applied where it was
- [ ] Visual spot check at the resolution the asset is actually viewed at, not zoomed to 800%

## 7. Vertex colors and custom attributes

- [ ] `COLOR_0` still present where it was. `prune --keep-attributes` preserves unused attributes if a custom shader reads them
- [ ] Custom `_*` attributes preserved (`quantize --quantize-generic` defaults to 12 bits, `prune` drops them if nothing references them)
- [ ] `TANGENT` present if a normal map needs it and the app does not generate tangents
- [ ] `TEXCOORD_1` (lightmap/AO UVs) preserved

## 8. Extras and app metadata

- [ ] `extras` payloads the app reads are intact. `gltfpack` drops them unless you pass `-ke`
- [ ] Cameras and lights (`KHR_lights_punctual`) still present if the app uses them from the file

## 9. The loader can actually decode it

- [ ] Every entry in `extensionsRequired` is supported by the target loader **and** its decoder is wired up (see `loader-support.md`)
- [ ] `gltf-transform validate` reports no ERROR entries. Two known false positives from `gltf-validator@2.0.0-dev.3.10`: `UNSUPPORTED_EXTENSION` (severity 2) for `EXT_meshopt_compression` and `KHR_texture_basisu`, which it simply does not know; and, on KTX2 output only, `IMAGE_UNRECOGNIZED_FORMAT` (severity 1, WARNING) plus `UNUSED_OBJECT` on the same image, because it cannot parse the KTX2 payload. Verified 2026-09-11 by running the identical pipeline with `webp` instead of `etc1s`, which validates with no warnings at all
- [ ] The file was opened in the real target app, not just in a viewer that happens to support everything

## 10. Report honesty

- [ ] Before numbers were measured, not estimated
- [ ] Sizes compared post-compression (brotli/gzip), since that is what the browser downloads
- [ ] Load time reported as "not measured" unless a browser actually measured it
- [ ] Every correctness loss appears in the same table as the size win
- [ ] The original file still exists
