# Commands cheat sheet

Every flag below was taken from the CLI's own `--help`/`-h` output and exercised
on a generated fixture. Nothing here is from memory.

**Verified against, on 2026-09-11 (macOS 15, arm64, Node v26.7.0, npm 11.19.0):**

| Tool | Version | How it was obtained |
|---|---|---|
| `@gltf-transform/cli` | `4.5.0` | `npm view @gltf-transform/cli version`; `gltf-transform --version` |
| `gltf-validator` (bundled by the above) | `2.0.0-dev.3.10` | dependency of `@gltf-transform/cli@4.5.0` |
| `gltfpack` (npm) | `1.2.0` | `npm view gltfpack version`; `gltfpack -h` → `gltfpack 1.2` |
| `gltfpack` (native, macOS arm64) | `1.2` | `zeux/meshoptimizer` release `v1.2` (published 2026-06-30); `gltfpack -v` → `gltfpack 1.2` |
| KTX-Software | `4.4.2` | release `v4.4.2` (published 2025-10-04); `ktx --version` → `ktx version: v4.4.2` |

Re-check before relying on any version-sensitive detail:

```bash
npm view @gltf-transform/cli version
npm view gltfpack version
npx @gltf-transform/cli --version
gltfpack -v
ktx --version
```

---

## Package names — read this first

- `@gltf-transform/cli` is the CLI. Run it via `npx @gltf-transform/cli <command>`, or install it (`npm install --global @gltf-transform/cli`, per https://gltf-transform.dev/cli, fetched 2026-09-11). The installed binary is named `gltf-transform`.
- **`gltf-validator` on npm has no `bin`.** `npx gltf-validator --help` fails with `npm error could not determine executable to run`. Use `gltf-transform validate`, which wraps the same library.
- `gltfpack` on npm works for geometry only. Per its own README (https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md, fetched 2026-09-11): "Native binaries are recommended over npm since they can work with larger files, run faster, and support texture compression." Confirmed empirically — see the errors at the bottom of this file.
- `gltf-pipeline` (`4.3.1`) is the Cesium tool. It also does Draco, but is not covered here.

---

## `@gltf-transform/cli@4.5.0`

Global options (apply to every command): `-v/--verbose`, `--allow-net`,
`--vertex-layout <interleaved|separate>` (default `interleaved`), `--config <path>`.

### Inspect and validate

```bash
gltf-transform inspect  model.glb          # overview, scenes, meshes, materials, textures, animations
gltf-transform validate model.glb          # Khronos validator: ERROR / WARNING / INFO / HINT tables
```

`validate` reports `UNSUPPORTED_EXTENSION` (severity 2, informational) for
`EXT_meshopt_compression` — the validator does not know that extension. That is
not a failure.

### Lossless cleanup

```bash
gltf-transform dedup model.glb out.glb
#   --accessors --materials --meshes --skins --textures   (all boolean, default true)

gltf-transform prune model.glb out.glb
#   --keep-attributes   keep unused vertex attributes
#   --keep-indices      keep unused mesh indices
#   --keep-leaves       keep empty leaf nodes   <-- use when the app looks up helper/empty nodes by name
#   --keep-solid-textures   keep single-colour textures instead of folding into material factors

gltf-transform weld model.glb out.glb        # no options; merges bitwise-identical vertices, adds indices
gltf-transform unweld model.glb out.glb      # inverse
```

### Quantization (no extra decoder needed beyond `KHR_mesh_quantization`)

```bash
gltf-transform quantize model.glb out.glb
#   --pattern <glob>                 attributes to quantize (default "*")
#   --quantization-volume mesh|scene (default mesh)
#   --quantize-position <bits>       default 14
#   --quantize-normal <bits>         default 10   (NORMAL and TANGENT)
#   --quantize-texcoord <bits>       default 12
#   --quantize-color <bits>          default 8
#   --quantize-weight <bits>         default 8
#   --quantize-generic <bits>        default 12   (custom _* attributes)
```

### Geometry compression — pick one

```bash
gltf-transform meshopt model.glb out.glb --level high
#   --level medium|high             default high
#   plus all the --quantize-* / --quantization-volume flags above
#   → EXT_meshopt_compression + KHR_mesh_quantization; compresses geometry, morph targets, animation

gltf-transform draco model.glb out.glb
#   --method edgebreaker|sequential default edgebreaker
#   --encode-speed <0-10>           default 5
#   --decode-speed <0-10>           default 5
#   plus the same --quantize-* flags
#   → KHR_draco_mesh_compression; geometry only (triangle meshes only)
```

### Scene graph — these change structure, opt in

```bash
gltf-transform instance model.glb out.glb --min 5
#   --min <count>   minimum meshes in a batch (default 5)
#   → EXT_mesh_gpu_instancing. Collapses the reusing nodes into one node: PER-NODE NAMES ARE LOST.

gltf-transform flatten model.glb out.glb     # no options; meshes/cameras become direct scene children
gltf-transform join    model.glb out.glb
#   --keepMeshes    prevents joining distinct meshes and nodes
#   --keepNamed     prevents joining named meshes and nodes
#   implicitly runs dedup + flatten first
```

`join`'s own help warns: "In a Scene that heavily reuses the same Mesh data,
joining may increase vertex count." Measured on the fixture: 12,882,440 B in →
12,890,228 B out. `--keepNamed` left the fixture byte-identical in size
(12,882,440 B) because every node was named.

### Textures

```bash
gltf-transform resize model.glb out.glb --width 1024 --height 1024
#   --width / --height <px>   maximum dimensions, aspect ratio preserved, never upscaled
#   --filter lanczos3|lanczos2   default lanczos3
#   --power-of-two nearest|ceil|floor   overrides --width/--height
#   --pattern <glob>          match textures by name or URI

gltf-transform webp model.glb out.glb --quality 85
#   --quality 1-100 | --lossless | --near-lossless | --effort 0-100
#   --formats jpeg|png|webp|avif|*   (default *)  --slots <glob>  --pattern <glob>
#   → EXT_texture_webp

gltf-transform avif model.glb out.glb --quality 60   # → EXT_texture_avif
gltf-transform png  model.glb out.glb                # recompress, no new extension
gltf-transform jpeg model.glb out.glb --formats png --quality 80
```

**`--formats` defaults differ per command** and this silently no-ops:
`webp` and `avif` default to `*`, but `png` defaults to `png` and `jpeg` defaults
to `jpeg`. On a PNG-textured fixture, `gltf-transform jpeg in.glb out.glb` left
the file unchanged (1,923,641 B of image data in and out); adding
`--formats png` produced 413,156 B. Pass `--formats` explicitly whenever you are
changing format, and remember JPEG has no alpha channel — never convert a texture
with a meaningful alpha channel to JPEG.

```bash

gltf-transform etc1s model.glb out.glb --quality 128
#   --quality 1-255      default 128 (lower = smaller/faster/worse)
#   --compression 0-5    default 1 (encoder speed vs quality)
#   --rdo (default true) --rdo-threshold <n> (default 1.25, overrides --quality)
#   --max-endpoints / --max-selectors 1-16128 (default 0 = derive from --quality)
#   --mipmaps <bool>     default true
#   --filter <box|tent|bell|b-spline|mitchell|lanczos3|lanczos4|...>  default lanczos4
#   --filter-scale <n>   default 1
#   --jobs <n>           default 20
#   → KHR_texture_basisu (ETC1S bitstream: smaller, lower quality)

gltf-transform uastc model.glb out.glb --level 2 --rdo
#   --level 0-4          default 2 (0 fastest/43.45dB … 4 very slow/48.24dB)
#   --rdo, --rdo-block-scale, --mipmaps, --filter, --filter-scale, --jobs, --pattern, --slots
#   → KHR_texture_basisu (UASTC bitstream: larger, higher quality — use for normal maps)
```

**`etc1s` and `uastc` require KTX-Software.** Their help text says
"Dependencies: KTX-Software". `4.5.0` probes for the **`ktx`** binary, not the
older `toktx`; without it the command fails with:

```
error: Command failed: command -v ktx 2>/dev/null && { echo >&1 ktx; exit 0; }
```

Install KTX-Software (https://github.com/KhronosGroup/KTX-Software/releases) and
put `ktx` on `PATH`.

### One-liner

```bash
gltf-transform optimize model.glb out.glb --compress meshopt --texture-compress ktx2 --texture-size 1024
#   --compress draco|meshopt|quantize|false   default meshopt
#   --texture-compress ktx2|webp|avif|auto|false   default auto
#   --texture-size <px>       default 2048
#   --flatten / --instance / --join / --palette / --prune / --simplify / --weld / --resample / --sparse
#                             all boolean, all default true
#   --instance-min <n>        default 5
#   --meshopt-level medium|high   default high
#   --join-meshes / --join-named  default true
#   --palette-min <n>         default 5
#   --simplify-error <n>      default 0.0001   --simplify-ratio <0-1> default 0
#   --prune-attributes / --prune-solid-textures   default true
```

Because `--simplify`, `--flatten`, `--join` and `--palette` all default to true,
`optimize` changes structure. On the fixture it dropped 15 of 16 named nodes and
reduced triangles 7,056 → 6,740. Disable what you cannot afford to lose:

```bash
gltf-transform optimize model.glb out.glb \
  --compress meshopt --texture-compress ktx2 --texture-size 1024 \
  --simplify false --join false --flatten false --instance false --palette false
```

Measured on the fixture, that invocation gave 274,352 B (vs 276,288 B for bare
`optimize`), kept all 14 app-visible node names, kept 13 draw calls, and kept
the triangle count at 7,056 — only the two empty helper leaves were pruned. The
hand-rolled pipeline in `SKILL.md` was smaller still (186,528 B) because it
resizes before encoding and uses `etc1s --quality 128`.

---

## `gltfpack 1.2`

```bash
gltfpack -i model.glb -o out.glb -cc -tc -tl 1024 -kn -km -v
```

| Flag | Meaning |
|---|---|
| `-i file` / `-o file` | input (`.obj`/`.gltf`/`.glb`) / output (`.gltf`/`.glb`) |
| `-c` | compressed output (meshopt). `-cc` / `-cz` = higher ratio |
| `-cf` | compressed output **with a fallback buffer** for loaders that can't decode meshopt |
| `-ce ext\|khr` | emit `EXT_meshopt_compression` (default) or the `KHR_` name |
| `-tc` | textures → KTX2 + BasisU ETC1S (requires `KHR_texture_basisu`) |
| `-tu` | textures → UASTC (much higher quality, much larger) |
| `-tw` | textures → WebP (requires `EXT_texture_webp`) |
| `-tq N` | texture encode quality, 1–10, default 8 |
| `-tl N` | limit texture dimensions to N px (default 0 = no limit) |
| `-ts R` | scale texture dimensions by ratio R |
| `-tp` | resize to nearest power of two (WebGL 1 compatibility) |
| `-si R` | simplify to triangle-count ratio R. `-se E` error limit (default 0.01) |
| `-vp/-vt/-vn/-vc N` | quantization bits for positions (14) / texcoords (12) / normals (8) / colors (8) |
| `-noq` | disable quantization entirely |
| `-kn` | **keep named nodes** and meshes attached to named nodes |
| `-km` | keep named materials, disable named-material merging |
| `-ke` | keep `extras` data |
| `-mm` | merge instances of the same mesh where possible |
| `-mi` | emit `EXT_mesh_gpu_instancing` for repeated instances |
| `-af N` | resample animations at N Hz (default 30, `0` disables) |
| `-v` | verbose stats. `-r file.json` writes a JSON report |

`-v` prints the numbers you want for a report:

```
input:  16 nodes, 3 meshes (3 primitives), 4 materials, 0 skins, 0 animations, 3 images
input:  3 mesh primitives (6936 triangles, 20808 vertices); 13 draw calls (13 instances, 7056 triangles)
output: 3 mesh primitives (6936 triangles, 3625 vertices); 13 draw calls (13 instances, 7056 triangles)
output: 29 nodes, 3 meshes (3 primitives), 4 materials
output: JSON 6128 bytes, buffers 634040 bytes
output: buffers: vertex 20301 bytes, index 7148 bytes, skin 0 bytes, ... image 606581 bytes
```

`-o /dev/null` is rejected: `Error: unsupported output extension '' (expected
.gltf or .glb)`. Write to a real path.

### npm build limitations (measured)

```
$ npx gltfpack -i model.glb -o out.glb -cc -tw -tl 1024
Error: gltfpack was built without WebP support, texture compression is not available
Note: node.js builds do not support WebP due to lack of platform features;
      download a native build from https://github.com/zeux/meshoptimizer/releases

$ npx gltfpack -i model.glb -o out.glb -cc -tc -tl 1024
Error: gltfpack was built without BasisU support, texture compression is not available
```

And without a texture-compression flag the resize flags are refused:

```
$ gltfpack -i model.glb -o out.glb -cc -tl 1024
Texture processing is only supported when texture compression is enabled via -tc/-tu/-tw
```

The macOS arm64 native binary from release `v1.2` handles `-tc`, `-tu` and `-tw`
correctly. On macOS it arrives quarantined; clear the attribute before running:

```bash
xattr -d com.apple.quarantine ./gltfpack
```

---

## Measuring transfer size

Serve `.glb` with compression on and measure the compressed size, not the raw one.

```bash
gzip -9 -c model.glb | wc -c
brotli -q 11 -c model.glb | wc -c
```

`scripts/glb-audit.mjs` reproduces `brotli -q 11` exactly using Node's zlib —
this needs `BROTLI_PARAM_LGWIN: 24`; with Node's default window the same file
measured 18,164,403 B instead of the CLI's 10,104,870 B.

Meshopt output is designed to be re-compressed: on the fixture, meshopt was
375,252 B raw → 348,653 B brotli, while Draco was *smaller raw* (358,564 B) but
*larger* after brotli (354,917 B). Always compare post-compression.
