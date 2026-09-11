#!/usr/bin/env node
/**
 * Generates the synthetic fixture used by examples/textured-scene.md.
 *
 * Deliberately built with the defects a real export has: two byte-identical
 * 2048px PNG albedo maps, an unused texture and an unused material, a duplicate
 * material, non-indexed (unwelded) geometry, twelve repeated crate nodes sharing
 * two meshes, and a pair of empty helper nodes. The pixel content is procedural
 * noise over a checker, which compresses badly on purpose.
 *
 * Usage:
 *
 *   npm install --prefix <skill-path>/scripts
 *   node <skill-path>/scripts/make-fixture.mjs /tmp/before.glb
 *
 * Deterministic: on @gltf-transform/core@4.5.0 + pngjs@7.0.0 this writes
 * 29,297,696 bytes, the "before" file quoted throughout the skill.
 */
import { Document, NodeIO } from '@gltf-transform/core';
import { PNG } from 'pngjs';
import fs from 'node:fs';

const OUT = process.argv[2] || 'before.glb';

// Procedural noise over a checker: high entropy, so PNG cannot compress it and
// the fixture is texture-dominated the way a photogrammetry export is.
function makePng(size, seed) {
  const png = new PNG({ width: size, height: size });
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) << 2;
      const base = ((x >> 6) + (y >> 6)) % 2 ? 200 : 60;
      const n = (rnd() - 0.5) * 90;
      png.data[i] = Math.max(0, Math.min(255, base + n));
      png.data[i + 1] = Math.max(0, Math.min(255, base * 0.7 + n));
      png.data[i + 2] = Math.max(0, Math.min(255, base * 0.4 + n));
      png.data[i + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

// Non-indexed UV sphere, so `weld` has real work to do.
function sphere(segU, segV, r) {
  const pos = [];
  const nor = [];
  const uv = [];
  const P = (u, v) => {
    const th = u * Math.PI * 2;
    const ph = v * Math.PI;
    const x = Math.sin(ph) * Math.cos(th);
    const y = Math.cos(ph);
    const z = Math.sin(ph) * Math.sin(th);
    return [x * r, y * r, z * r, x, y, z, u, 1 - v];
  };
  for (let i = 0; i < segU; i++) {
    for (let j = 0; j < segV; j++) {
      const a = P(i / segU, j / segV);
      const b = P((i + 1) / segU, j / segV);
      const c = P((i + 1) / segU, (j + 1) / segV);
      const d = P(i / segU, (j + 1) / segV);
      for (const t of [[a, b, c], [a, c, d]]) {
        for (const p of t) {
          pos.push(p[0], p[1], p[2]);
          nor.push(p[3], p[4], p[5]);
          uv.push(p[6], p[7]);
        }
      }
    }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv) };
}

// Non-indexed box.
function box(s) {
  const h = s / 2;
  const faces = [
    [[-h, -h, h], [h, -h, h], [h, h, h], [-h, h, h], [0, 0, 1]],
    [[h, -h, -h], [-h, -h, -h], [-h, h, -h], [h, h, -h], [0, 0, -1]],
    [[-h, h, h], [h, h, h], [h, h, -h], [-h, h, -h], [0, 1, 0]],
    [[-h, -h, -h], [h, -h, -h], [h, -h, h], [-h, -h, h], [0, -1, 0]],
    [[h, -h, h], [h, -h, -h], [h, h, -h], [h, h, h], [1, 0, 0]],
    [[-h, -h, -h], [-h, -h, h], [-h, h, h], [-h, h, -h], [-1, 0, 0]],
  ];
  const quadUV = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const pos = [];
  const nor = [];
  const uv = [];
  for (const f of faces) {
    const n = f[4];
    for (const [i0, i1, i2] of [[0, 1, 2], [0, 2, 3]]) {
      for (const k of [i0, i1, i2]) {
        const p = f[k];
        pos.push(p[0], p[1], p[2]);
        nor.push(n[0], n[1], n[2]);
        uv.push(quadUV[k][0], quadUV[k][1]);
      }
    }
  }
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), uv: new Float32Array(uv) };
}

const doc = new Document();
const buf = doc.createBuffer();
const scene = doc.createScene('Scene');

// Two byte-identical 2048px textures: a `dedup` target.
const texBytes = makePng(2048, 12345);
const albedoA = doc.createTexture('albedo_A').setImage(texBytes).setMimeType('image/png').setURI('albedo_A.png');
const albedoB = doc.createTexture('albedo_B').setImage(texBytes).setMimeType('image/png').setURI('albedo_B.png');
// Unreferenced texture: a `prune` target.
doc.createTexture('unused_decal').setImage(makePng(1024, 999)).setMimeType('image/png').setURI('unused_decal.png');

const matSphere = doc.createMaterial('Shell').setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(albedoA).setMetallicFactor(0.1).setRoughnessFactor(0.6);
const matBox = doc.createMaterial('Crate').setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(albedoB).setMetallicFactor(0.1).setRoughnessFactor(0.6);
// Duplicate material: a `dedup` target.
const matBoxDup = doc.createMaterial('Crate_dup').setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(albedoB).setMetallicFactor(0.1).setRoughnessFactor(0.6);
// Unreferenced material: a `prune` target.
doc.createMaterial('Unused_Glass').setBaseColorFactor([0.2, 0.4, 1, 0.5]).setAlphaMode('BLEND');

function prim(g, mat) {
  const p = doc.createPrimitive().setMaterial(mat);
  p.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(g.pos).setBuffer(buf));
  p.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(g.nor).setBuffer(buf));
  p.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(g.uv).setBuffer(buf));
  return p;
}

const sphereMesh = doc.createMesh('Shell_mesh').addPrimitive(prim(sphere(72, 48, 0.5), matSphere));
const bx = box(0.8);
const boxMesh = doc.createMesh('Crate_mesh').addPrimitive(prim(bx, matBox));
const boxMeshDup = doc.createMesh('Crate_mesh_dup').addPrimitive(prim(bx, matBoxDup));

// Hierarchy the app "relies on": a named group with named children.
const group = doc.createNode('Assembly').setTranslation([0, 0, 0]);
scene.addChild(group);
group.addChild(doc.createNode('Shell').setMesh(sphereMesh).setTranslation([0, 0.5, 0]));
// Twelve nodes reusing two meshes: an `instance` target.
for (let i = 0; i < 12; i++) {
  group.addChild(
    doc
      .createNode(`Crate_${String(i).padStart(2, '0')}`)
      .setMesh(i % 2 ? boxMeshDup : boxMesh)
      .setTranslation([(i % 4) * 1.2 - 1.8, 0.4, Math.floor(i / 4) * 1.2 - 1.2]),
  );
}
// Empty leaf chain: a `prune` / `flatten` target.
const empty = doc.createNode('Helper_Empty').setTranslation([0, 3, 0]);
empty.addChild(doc.createNode('Helper_Empty_child'));
scene.addChild(empty);

await new NodeIO().write(OUT, doc);
console.log(`wrote ${OUT} — ${fs.statSync(OUT).size} bytes`);
