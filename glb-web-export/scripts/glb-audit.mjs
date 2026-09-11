#!/usr/bin/env node
/**
 * glb-audit — measure a .glb/.gltf so an optimization can be judged, not guessed.
 *
 * Reports the numbers a web target actually cares about: transfer size, texture
 * VRAM, draw calls, triangles, world-space bounds (in metres), named nodes, and
 * the extensions a loader must be able to decode. With two files it also prints
 * a before/after delta.
 *
 * Usage: node glb-audit.mjs <before.glb> [after.glb]
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import fs from 'node:fs';

const files = process.argv.slice(2);
if (files.length === 0 || files.length > 2) {
  console.error('Usage: node glb-audit.mjs <before.glb> [after.glb]');
  process.exit(1);
}
for (const f of files) {
  if (!fs.existsSync(f)) {
    console.error(`Error: file not found: ${f}`);
    process.exit(1);
  }
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
  'draco3d.decoder': await draco3d.createDecoderModule(),
  'draco3d.encoder': await draco3d.createEncoderModule(),
});

// --- minimal 4x4 column-major matrix helpers (avoids a three.js dependency) ---
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      for (let k = 0; k < 4; k++) out[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
  return out;
}

function fromTRS(t, r, s) {
  const [x, y, z, w] = r;
  return [
    (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
    2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

function transformPoint(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

// Bytes per texel once resident on the GPU. Uncompressed codecs (PNG/JPEG/WebP/
// AVIF) are fully decoded to RGBA8. KTX2 stays block-compressed: ETC1S/BC1-class
// is 4 bpp, UASTC/BC7-class is 8 bpp. Payload density tells the two apart.
function bytesPerTexel(texture, width, height) {
  if (texture.getMimeType() !== 'image/ktx2') return 4;
  const image = texture.getImage();
  if (!image) return 4;
  return image.byteLength / (width * height) > 0.75 ? 1 : 0.5;
}

function audit(path) {
  const bytes = fs.readFileSync(path);
  return io.read(path).then((doc) => {
    const root = doc.getRoot();
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let drawCalls = 0;
    let drawCallsWithoutInstancing = 0;
    let triangles = 0;

    const walk = (node, parentMatrix) => {
      const world = multiply(parentMatrix, fromTRS(node.getTranslation(), node.getRotation(), node.getScale()));
      const instancing = node.getExtension('EXT_mesh_gpu_instancing');
      let matrices = [world];
      if (instancing) {
        const ref = instancing.getAttribute('TRANSLATION') || instancing.getAttribute('SCALE') || instancing.getAttribute('ROTATION');
        if (ref) {
          matrices = [];
          for (let i = 0; i < ref.getCount(); i++) {
            const t = instancing.getAttribute('TRANSLATION')?.getElement(i, [0, 0, 0]) ?? [0, 0, 0];
            const r = instancing.getAttribute('ROTATION')?.getElement(i, [0, 0, 0, 1]) ?? [0, 0, 0, 1];
            const s = instancing.getAttribute('SCALE')?.getElement(i, [1, 1, 1]) ?? [1, 1, 1];
            matrices.push(multiply(world, fromTRS(t, r, s)));
          }
        }
      }

      const mesh = node.getMesh();
      if (mesh) {
        for (const prim of mesh.listPrimitives()) {
          drawCalls += 1;
          drawCallsWithoutInstancing += matrices.length;
          const indices = prim.getIndices();
          const position = prim.getAttribute('POSITION');
          if (!position) continue;
          triangles += ((indices ? indices.getCount() : position.getCount()) / 3) * matrices.length;
          for (const m of matrices) {
            for (let i = 0; i < position.getCount(); i++) {
              const p = transformPoint(m, position.getElement(i, [0, 0, 0]));
              for (let k = 0; k < 3; k++) {
                if (p[k] < min[k]) min[k] = p[k];
                if (p[k] > max[k]) max[k] = p[k];
              }
            }
          }
        }
      }
      for (const child of node.listChildren()) walk(child, world);
    };

    for (const scene of root.listScenes()) for (const node of scene.listChildren()) walk(node, IDENTITY);

    let vram = 0;
    const textures = root.listTextures().map((texture) => {
      const size = texture.getSize();
      const image = texture.getImage();
      if (size) vram += size[0] * size[1] * bytesPerTexel(texture, size[0], size[1]) * (4 / 3);
      return {
        name: texture.getName() || null,
        mimeType: texture.getMimeType(),
        resolution: size ? `${size[0]}x${size[1]}` : null,
        bytes: image ? image.byteLength : 0,
      };
    });

    const round = (v) => (Number.isFinite(v) ? Number(v.toFixed(4)) : null);
    const finite = Number.isFinite(min[0]);

    return {
      file: path,
      bytes: bytes.byteLength,
      gzipBytes: gzipSync(bytes, { level: 9 }).byteLength,
      // matches `brotli -q 11` on the command line; LGWIN 24 is required to
      // match, Node's default window is smaller and inflates the result.
      brotliBytes: brotliCompressSync(bytes, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 11,
          [constants.BROTLI_PARAM_LGWIN]: 24,
        },
      }).byteLength,
      worldBounds: {
        min: finite ? min.map(round) : null,
        max: finite ? max.map(round) : null,
        sizeMeters: finite ? max.map((v, i) => round(v - min[i])) : null,
      },
      drawCalls,
      drawCallsWithoutInstancing,
      triangles,
      textureVramMiB: Number((vram / 1048576).toFixed(2)),
      counts: {
        nodes: root.listNodes().length,
        meshes: root.listMeshes().length,
        materials: root.listMaterials().length,
        textures: root.listTextures().length,
        animations: root.listAnimations().length,
        skins: root.listSkins().length,
      },
      namedNodes: root.listNodes().map((n) => n.getName()).filter(Boolean),
      textures,
      extensionsUsed: root.listExtensionsUsed().map((e) => e.extensionName).sort(),
      extensionsRequired: root.listExtensionsRequired().map((e) => e.extensionName).sort(),
    };
  });
}

const results = [];
for (const path of files) results.push(await audit(path));

const output = { files: results };

if (results.length === 2) {
  const [before, after] = results;
  const pct = (a, b) => (a === 0 ? null : Number((((b - a) / a) * 100).toFixed(1)));
  const lostNodes = before.namedNodes.filter((n) => !after.namedNodes.includes(n));
  output.delta = {
    bytes: { before: before.bytes, after: after.bytes, changePercent: pct(before.bytes, after.bytes) },
    brotliBytes: { before: before.brotliBytes, after: after.brotliBytes, changePercent: pct(before.brotliBytes, after.brotliBytes) },
    textureVramMiB: { before: before.textureVramMiB, after: after.textureVramMiB, changePercent: pct(before.textureVramMiB, after.textureVramMiB) },
    drawCalls: { before: before.drawCalls, after: after.drawCalls },
    triangles: { before: before.triangles, after: after.triangles, changePercent: pct(before.triangles, after.triangles) },
    worldSizeMeters: { before: before.worldBounds.sizeMeters, after: after.worldBounds.sizeMeters },
    animations: { before: before.counts.animations, after: after.counts.animations },
    namedNodesLost: lostNodes,
    newExtensionsRequired: after.extensionsRequired.filter((e) => !before.extensionsRequired.includes(e)),
    regressions: [
      ...(JSON.stringify(before.worldBounds.sizeMeters) !== JSON.stringify(after.worldBounds.sizeMeters)
        ? ['world size changed — scale or units regressed']
        : []),
      ...(lostNodes.length ? [`${lostNodes.length} named node(s) removed or renamed`] : []),
      ...(after.counts.animations < before.counts.animations ? ['animations lost'] : []),
      ...(after.counts.skins < before.counts.skins ? ['skins lost'] : []),
      ...(after.bytes >= before.bytes ? ['output is not smaller than input'] : []),
    ],
  };
}

console.log(JSON.stringify(output, null, 2));
