# Loader support matrix

Decide compression **from this table, not from memory.** Every row cites the
official doc that was fetched to establish it, with the date it was fetched.
Re-fetch before trusting anything version-sensitive.

Shorthand:

- **built in** — the loader handles the extension with no extra wiring
- **needs wiring** — the loader supports it but you must attach a decoder
- **plugin** — supported only via third-party registration

---

## Summary

| Extension | Three.js `GLTFLoader` | R3F / drei `useGLTF` | Babylon.js | `<model-viewer>` |
|---|---|---|---|---|
| `KHR_draco_mesh_compression` | needs wiring (`setDRACOLoader`) | **built in** (default on) | built in (decoder from CDN) | built in (decoder from CDN) |
| `EXT_meshopt_compression` | needs wiring (`setMeshoptDecoder`) | **built in** (default on) | built in (decoder from CDN) | **needs wiring** (`meshoptDecoderLocation`) |
| `KHR_texture_basisu` (KTX2) | needs wiring (`setKTX2Loader`) | needs wiring (`extendLoader`) | built in (transcoder from CDN) | built in (transcoder from CDN) |
| `KHR_mesh_quantization` | built in | built in | built in | built in |
| `EXT_mesh_gpu_instancing` | built in | built in | built in | built in |
| `EXT_texture_webp` | built in | built in | built in | built in |
| `EXT_texture_avif` | built in | built in | built in | not established (see below) |

The two rows that break shipped assets most often: **Three.js needs
`setMeshoptDecoder` explicitly**, and **`<model-viewer>` does not enable meshopt
by default**.

---

## Three.js `GLTFLoader`

Source: https://threejs.org/docs/pages/GLTFLoader.html — fetched 2026-09-11 (the
machine-readable form is the same page with `.md` appended).

Supported extensions, quoted from that page: `KHR_draco_mesh_compression`,
`KHR_lights_punctual`, `KHR_materials_anisotropy`, `KHR_materials_clearcoat`,
`KHR_materials_dispersion`, `KHR_materials_emissive_strength`,
`KHR_materials_ior`, `KHR_materials_specular`, `KHR_materials_transmission`,
`KHR_materials_iridescence`, `KHR_materials_unlit`, `KHR_materials_volume`,
`KHR_mesh_quantization`, `KHR_meshopt_compression`, `KHR_texture_basisu`,
`KHR_texture_transform`, `EXT_materials_bump`, `EXT_meshopt_compression`,
`EXT_mesh_gpu_instancing`, `EXT_texture_avif`, `EXT_texture_webp`.

Via separately registered plugins: `KHR_gaussian_splatting`,
`KHR_materials_variants`, `MSFT_texture_dds`, `KHR_animation_pointer`,
`NEEDLE_progressive`.

The three wiring methods, quoted:

- `.setDRACOLoader( dracoLoader )` — "Sets the given Draco loader to this loader. **Required** for decoding assets compressed with the `KHR_draco_mesh_compression` extension."
- `.setKTX2Loader( ktx2Loader )` — "Sets the given KTX2 loader to this loader. **Required** for loading KTX2 compressed textures."
- `.setMeshoptDecoder( meshoptDecoder )` — "Sets the given meshopt decoder. **Required** for decoding assets compressed with the `EXT_meshopt_compression` extension."

`KTX2Loader` additionally requires `detectSupport(renderer)` — "Detects hardware
support for available compressed texture formats, to determine the output format
for the transcoder. **Must be called before loading a texture.**"
(https://threejs.org/docs/pages/KTX2Loader.html, fetched 2026-09-11). Its
transcoder defaults to the `examples/jsm/libs/basis` directory;
`setTranscoderPath()` overrides it.

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const loader = new GLTFLoader();

// KHR_draco_mesh_compression
const draco = new DRACOLoader();
draco.setDecoderPath('/draco/');          // copy three/examples/jsm/libs/draco/
loader.setDRACOLoader(draco);

// KHR_texture_basisu
const ktx2 = new KTX2Loader();
ktx2.setTranscoderPath('/basis/');        // copy three/examples/jsm/libs/basis/
ktx2.detectSupport(renderer);             // required, needs a live renderer
loader.setKTX2Loader(ktx2);

// EXT_meshopt_compression
loader.setMeshoptDecoder(MeshoptDecoder);
```

Verified present in the `three@0.186.0` npm tarball (checked 2026-09-11):
`examples/jsm/loaders/GLTFLoader.js`, `examples/jsm/loaders/DRACOLoader.js`,
`examples/jsm/loaders/KTX2Loader.js`,
`examples/jsm/libs/meshopt_decoder.module.js`,
`examples/jsm/libs/draco/gltf/draco_decoder.js`,
`examples/jsm/libs/basis/basis_transcoder.js`. The `three/addons/*` specifier
maps to `three/examples/jsm/*`.

`gltfpack`'s README adds the version floor: "three.js supports it in r122+
(requires calling `GLTFLoader.setMeshoptDecoder`)"
(https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md, fetched
2026-09-11).

---

## React Three Fiber / drei `useGLTF`

Docs: https://drei.docs.pmnd.rs/loaders/gltf-use-gltf — fetched 2026-09-11.
Source of truth: https://github.com/pmndrs/drei/blob/master/src/core/Gltf.tsx —
read 2026-09-11.

```ts
useGLTF(path, useDraco?: boolean | string = true, useMeshopt?: boolean = true, extendLoader?)
```

From the source:

- **Draco is on by default.** The decoder path defaults to `https://www.gstatic.com/draco/versioned/decoders/1.5.5/`. Override per call — `useGLTF(url, '/draco-gltf/')` — or globally with `useGLTF.setDecoderPath(path)`.
- **meshopt is on by default.** `loader.setMeshoptDecoder(MeshoptDecoder)` is called unconditionally when `useMeshopt` is truthy, using `three-stdlib`'s bundled decoder. No CDN, no setup.
- **KTX2 is not wired.** There is no KTX2 branch. Use the fourth argument:

```tsx
const ktx2 = new KTX2Loader().setTranscoderPath('/basis/').detectSupport(gl);
useGLTF(url, true, true, (loader) => loader.setKTX2Loader(ktx2));
```

`<Gltf src=... useDraco useMeshOpt extendLoader />` forwards to the same hook.
Note the prop is spelled `useMeshOpt` (capital O) while the hook argument is
`useMeshopt`.

---

## Babylon.js

Docs: https://doc.babylonjs.com/features/featuresDeepDive/importers/glTF —
fetched 2026-09-11 (page is client-rendered; the markdown source at
https://github.com/BabylonJS/Documentation/blob/master/content/features/featuresDeepDive/importers/glTF.md
was read instead).

Quoted table:

| Feature | glTF extension | Babylon interface |
|---|---|---|
| Draco compression | KHR_mesh_draco_compression | DracoDecoder |
| Meshopt compression | EXT_meshopt_compression | MeshoptCompression |
| .ktx2, or Basis Universal Compression | KHR_texture_basisu | KhronosTextureContainer2 |

Also quoted: "Babylon performs extra work at load time to decompress the data
that uses these extensions. By default, it will: Download the required decoder
files from the Babylon CDN. Use web workers (if available) to execute the code."
So all three work with no wiring, but they fetch from a third-party CDN — the
docs flag this as a GDPR/CSP concern and recommend self-hosting. Note: "Meshopt
compression does not yet support injection."

The complete supported set is the extension directory
https://github.com/BabylonJS/Babylon.js/tree/master/packages/dev/loaders/src/glTF/2.0/Extensions
(listed 2026-09-11), which contains `EXT_mesh_gpu_instancing`,
`EXT_meshopt_compression`, `EXT_texture_avif`, `EXT_texture_webp`,
`KHR_draco_mesh_compression`, `KHR_mesh_quantization`, `KHR_texture_basisu`
among others. Register loaders via `registerBuiltInLoaders()` from
`@babylonjs/loaders`.

`gltfpack`'s README states the version floor: "Babylon.js supports it in 5.0+
without further setup" (for `EXT_meshopt_compression`).

---

## `<model-viewer>`

Docs: https://modelviewer.dev/docs/index.html, Loading → Static Properties —
fetched 2026-09-11. Source of truth:
https://github.com/google/model-viewer/blob/master/packages/modelviewer.dev/data/docs.json
— read 2026-09-11.

Quoted descriptions:

- `dracoDecoderLocation` — "This static, writable property sets `<model-viewer>`'s DRACO decoder location URL. **By default, the DRACO decoder will be loaded from a Google CDN.**"
- `ktx2TranscoderLocation` — "This static, writable property sets `<model-viewer>`'s KTX2 transcoder location URL. **By default, the KTX2 transcoder will be loaded from a Google CDN.**"
- `meshoptDecoderLocation` — "This static, writable property sets `<model-viewer>`'s Meshopt decoder location URL. **By default, the Meshopt decoder is not enabled.**"

So a meshopt-compressed GLB will fail in `<model-viewer>` unless you opt in:

```js
import { ModelViewerElement } from '@google/model-viewer';
ModelViewerElement.meshoptDecoderLocation = '/meshopt_decoder.js';
// optional, to avoid the Google CDN:
ModelViewerElement.dracoDecoderLocation = '/draco/';
ModelViewerElement.ktx2TranscoderLocation = '/basis/';
```

`EXT_texture_avif` is not documented either way on that page; treat it as
unestablished for `<model-viewer>` and prefer WebP or KTX2.

---

## Underlying spec references

- Coordinate system and units — "glTF uses a right-handed coordinate system." / "glTF defines +Y as up; the front side of a glTF asset faces +Z, the left side of a glTF asset faces +X." / "The units for all linear distances are meters." / "All angles are in radians." — glTF 2.0 Specification, section *Coordinate System and Units*, https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc, fetched 2026-09-11.
- Extension registry — https://github.com/KhronosGroup/glTF/blob/main/extensions/README.md, fetched 2026-09-11.
- `EXT_meshopt_compression` — https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_meshopt_compression/README.md
- `EXT_mesh_gpu_instancing` — https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Vendor/EXT_mesh_gpu_instancing/README.md
- `KHR_texture_basisu` — https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md

## How to check the app instead of guessing

```bash
# Three.js / R3F codebase
grep -rn "setMeshoptDecoder\|setDRACOLoader\|setKTX2Loader\|MeshoptDecoder\|KTX2Loader" src/
grep -rn "useGLTF\|<Gltf" src/

# model-viewer
grep -rn "meshoptDecoderLocation\|ktx2TranscoderLocation\|dracoDecoderLocation" src/

# what the asset actually demands
npx @gltf-transform/cli inspect model.glb   # read the extensionsRequired row
```

If the asset lists an extension the app never wires up, the load fails at
runtime — usually as an exception, sometimes as silently missing geometry or
black textures.
