import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec2,
  vec3,
  vec4,
  color,
  uniform,
  attribute,
  varying,
  positionGeometry,
  positionLocal,
  positionWorld,
  positionView,
  positionViewDirection,
  normalLocal,
  normalWorld,
  normalWorldGeometry,
  normalGeometry,
  normalView,
  normalViewGeometry,
  modelNormalMatrix,
  frontFacing,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  screenSize,
  uv,
  time,
  sin,
  cos,
  abs,
  floor,
  fract,
  mod,
  min,
  max,
  clamp,
  mix,
  step,
  smoothstep,
  dot,
  length,
  normalize,
  reflect,
  pow,
  sign,
  fwidth,
  texture,
  rotateUV,
  mrt,
  If,
  sqrt,
  specularColor,
  specularColorBlended,
  specularF90
} from 'three/tsl';
const cityUniforms = {
  uSunColor: uniform(new THREE.Color(0xffca92)),
  uSkyTopColor: uniform(new THREE.Color(0x2c568c)),
  uSkyHorizonColor: uniform(new THREE.Color(0xebd1b5)),
  uSkySunDir: uniform(new THREE.Vector3(-0.66, 0.34, -0.67).normalize()),
  uInteriorGlow: uniform(0.78),
  uRoadWetness: uniform(0.38),
  uCanyonBounce: uniform(0.52)
};

// Fast deterministic 2D -> 1D hash in TSL
const hash2D = Fn(([p]) => {
  return fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
});

// Smooth 2D value noise in TSL
const noise2D = Fn(([p]) => {
  const pv = vec2(p).toVar();
  const i = floor(pv).toVar();
  const f = fract(pv).toVar();
  const u = f.mul(f).mul(float(3.0).sub(f.mul(2.0))).toVar();
  const a = hash2D(i);
  const b = hash2D(i.add(vec2(1.0, 0.0)));
  const c = hash2D(i.add(vec2(0.0, 1.0)));
  const d = hash2D(i.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

/**
 * Mikkelsen's Surface-Gradient Hardware Derivative Bump Mapping (ported from CityGeneratorUtils.js)
 * Wrapped in Fn() so `height` is evaluated once into a scalar parameter before dFdx/dFdy!
 */
const bumpNormal = Fn(([height]) => {
  const h = float(height).toVar();
  const dpdx = positionView.dFdx();
  const dpdy = positionView.dFdy();
  const r1 = dpdy.cross(normalView);
  const r2 = normalView.cross(dpdx);
  const det = dpdx.dot(r1);
  const grad = det.sign().mul(h.dFdx().mul(r1).add(h.dFdy().mul(r2)));
  return det.abs().mul(normalView).sub(grad).normalize();
});

/**
 * Filter-Width Anti-Aliased Filled Band (ported from CityGenerator.js)
 * Wrapped in Fn() so NodeBuilder emits a single WGSL function instead of inlining fwidth trees.
 */
const lineAA = Fn(([coord, halfWidth]) => {
  const c = float(coord).toVar();
  const hw = float(halfWidth).toVar();
  const aa = fwidth(c).max(0.0001).toVar();
  const effHw = max(hw, aa.mul(0.5)).toVar();
  const cov = smoothstep(effHw.add(aa), effHw.sub(aa), abs(c));
  return cov.mul(min(float(1.0), hw.div(effHw)));
});

/**
 * Filter-Width Anti-Aliased Repeating Grid Line (ported from CityGenerator.js & SidewalkGenerator.js)
 */
const gridLine = Fn(([coord, period, halfWidth]) => {
  const p = float(period).toVar();
  const g = float(coord).div(p).toVar();
  const d = float(0.5).sub(abs(fract(g).sub(0.5))).toVar();
  const aa = fwidth(g).max(0.0001).toVar();
  const hw = float(halfWidth).div(p).toVar();
  const effHw = max(hw, aa.mul(0.5)).toVar();
  const cov = smoothstep(effHw.add(aa), effHw.sub(aa), d);
  return cov.mul(min(float(1.0), hw.div(effHw)));
});

/**
 * Box-Filtered Periodic Pulse: fraction of a footprint `w` wide around `x` where fract() lies in [a, b].
 * Exact anti-aliasing that settles to the mean coverage (b - a) once a period shrinks below a pixel, so facade grids
 * don't shimmer or moiré at distance & grazing angles. Pass the in-cell coordinate (fract) for precision.
 */
const filteredPulse = Fn(([x, a, b, w]) => {
  const p = float(x).toVar();
  const lo = float(a).toVar();
  const hi = float(b).toVar();
  const hw = max(float(w), 0.0001).mul(0.5).toVar();
  const integral = (t) => floor(t).mul(hi.sub(lo)).add(clamp(fract(t), lo, hi).sub(lo));
  return integral(p.add(hw)).sub(integral(p.sub(hw))).div(hw.mul(2.0));
});

/**
 * Occlusion-Aware Urban Canyon Sky Visibility (aoNode)
 * Models how Manhattan street canyons occlude overhead sky irradiance near the street floor (y = 0..65m),
 * while opening up in Central Park and on upper tower shafts.
 */
const canyonSkyAONode = Fn(() => {
  const wp = positionWorld;
  const heightOpenness = smoothstep(0.0, 68.0, wp.y);
  const streetCrevice = smoothstep(0.0, 7.5, wp.y).mul(0.22).add(0.78);
  const canyonAO = mix(float(0.44), float(1.0), heightOpenness).mul(streetCrevice);
  return mix(canyonAO, float(1.0), 0.6);
});

// Material caches to prevent duplicate WebGPU WGSL shader compilation across blocks & landmarks
const _curtainWallCache = new Map();
const _preWarCache = new Map();

// Camera-independent facade frame: the view/world normal round trip can change the dominant axis on 45-degree
// walls. Resolve near-ties in the vertex shader and keep that choice flat across each face.
const facadeNormalVertex = normalize(modelNormalMatrix.mul(normalLocal));
const facadeWorldNormal = varying(facadeNormalVertex, 'vFacadeWorldNormal').normalize();
const facadeAlongZ = varying(
  step(abs(facadeNormalVertex.z).sub(0.0001), abs(facadeNormalVertex.x)),
  'vFacadeAlongZ'
).setInterpolation(THREE.InterpolationSamplingType.FLAT, THREE.InterpolationSamplingMode.EITHER);

/**
 * Lightweight, Fast-Compiling 3D Parallax Apartment Interior Mapping (Upper Floors Only)
 * Modelled directly after `interior()` in `three/addons/generators/city/SkyscraperGenerator.js`:
 * - Evaluates `origin`, `dir`, `boxMin`, and `boxMax` in true world meters (isotropic 1:1:1 scale)
 *   so 3D room perspective is accurate from all viewing angles.
 * - Each apartment room spans 2.5 window bays wide (~6.8m) × 1 story tall (~3.5m) × ~5.2m deep,
 *   set back behind the facade so neighbouring windows look into the same full-sized room.
 * - Includes left & right fabric drapes hung just inside the window frame (`winUV`) from a 6-swatch
 *   domestic palette that block interior glow (`emit = 0.20`) so drapes silhouette against lit rooms.
 * - Once windows shrink to a pixel or two (`fwNode`: pixel footprint in cells) rooms glow at the mean lit level (with
 *   a lit room's tint), drapes at their mean coverage & lamps fade out, so distant towers don't twinkle in motion.
 * - Returns `vec4(roomColor, litEmit)`.
 */
const evaluateApartmentInterior = Fn(([uCoord, vCoord, winUV, cellId, winWNode, floorHNode, seedNode, warmthNode, litProbNode, fwNode]) => {
  const u = float(uCoord).toVar();
  const v = float(vCoord).toVar();
  const wUV = vec2(winUV).toVar();
  const cid = vec2(cellId).toVar();
  const wW = float(winWNode).toVar();
  const fH = float(floorHNode).toVar();

  // Room module (SkyscraperGenerator.js lines 959-975):
  // Each room spans an INTEGER 2 or 3 window bays wide (~5.4m - 8.1m) and an INTEGER bay phase
  // offset per floor so partition walls ALWAYS land behind masonry piers/mullions, never mid-window!
  const floorIdx = floor(v.div(fH)).toVar();
  const fHash1 = fract(sin(floorIdx.mul(41.3).add(seedNode)).mul(43758.5453));
  const fHash2 = fract(sin(floorIdx.mul(73.7).add(seedNode.mul(1.7))).mul(43758.5453));
  const roomBays = mix(float(2.0), float(3.0), step(0.5, fHash1)).toVar();
  const roomPhase = floor(fHash2.mul(roomBays)).toVar();

  const gridU = u.div(wW);
  const roomU = gridU.add(roomPhase).div(roomBays).toVar();
  const roomIdx = floor(roomU).toVar();
  const roomId = vec2(roomIdx, floorIdx).toVar();

  const roomW = wW.mul(roomBays).toVar();
  const roomH = fH.mul(0.92).toVar();
  const setback = float(0.12);
  const depth = roomH.mul(1.55).toVar();

  // Pixel entry position `origin` in world meters relative to the multi-bay room center:
  // Window sill (wUV.y=0) sits ~0.75m above the room floor; window lintel (wUV.y=1) sits ~0.58m below the ceiling
  const originX = fract(roomU).sub(0.5).mul(roomW).toVar();
  const originY = wUV.y.sub(0.46).mul(roomH.mul(0.62)).toVar();

  // View ray `dir` in world meters in the room's (across, up, depth) frame. `across` runs along the wall's tangent
  // (+x on walls facing ±z, +z on walls facing ±x, turning with walls that follow a non-grid street)
  const rayWorld = normalize(positionWorld.sub(cameraPosition)).toVar();
  const tSign = mix(sign(facadeWorldNormal.z).negate(), sign(facadeWorldNormal.x), facadeAlongZ);
  const dirX = dot(rayWorld, vec3(facadeWorldNormal.z.negate(), 0.0, facadeWorldNormal.x).mul(tSign)).toVar();
  const dirY = rayWorld.y.toVar();
  const dirZ = max(abs(dot(rayWorld, facadeWorldNormal)), 0.05).toVar();

  // Slab intersection with the far planes of the room box:
  // [-halfW .. +halfW] x [-halfH .. +halfH] x [setback .. setback + depth]
  const halfW = roomW.mul(0.5).toVar();
  const halfH = roomH.mul(0.5).toVar();
  const tFarX = halfW.sub(originX.mul(sign(dirX))).div(max(abs(dirX), 0.0001)).toVar();
  const tFarY = halfH.sub(originY.mul(sign(dirY))).div(max(abs(dirY), 0.0001)).toVar();
  const tFarZ = setback.add(depth).div(dirZ).toVar();
  const t = min(min(tFarX, tFarY), tFarZ).toVar();
  const hit = vec3(originX.add(dirX.mul(t)), originY.add(dirY.mul(t)), dirZ.mul(t)).toVar();

  // Normalized 0..1 coordinates inside the room box (SkyscraperGenerator.js line 1150)
  const q = clamp(
    vec3(
      hit.x.div(roomW).add(0.5),
      hit.y.div(roomH).add(0.5),
      hit.z.sub(setback).div(depth)
    ),
    vec3(0.0),
    vec3(1.0)
  ).toVar();

  const onBack = step(tFarZ, tFarX).mul(step(tFarZ, tFarY)).toVar();
  const isYPlane = step(tFarY, tFarX).mul(step(tFarY, tFarZ)).toVar();
  const onCeil = isYPlane.mul(step(0.0, dirY)).toVar();
  const onFloor = isYPlane.mul(float(1.0).sub(step(0.0, dirY))).toVar();

  // Per-room hashes & bulb temperature (SkyscraperGenerator.js lines 1162-1171)
  const seed1 = hash2D(roomId.add(vec2(seedNode, 19.4))).toVar();
  const seed2 = hash2D(roomId.add(vec2(seedNode.mul(1.9), 83.1))).toVar();
  const seed3 = hash2D(roomId.add(vec2(63.2, seedNode.mul(0.7)))).toVar();
  const lod = smoothstep(0.3, 0.8, max(fwNode.x, fwNode.y)).toVar();
  const litRoom = step(float(1.0).sub(litProbNode), seed3).toVar();
  const lit = mix(litRoom, 1.0, lod).toVar();

  const warmLight = mix(color(0xffb845), color(0xffe49c), seed1);
  const coolLight = mix(color(0xdfe8ff), color(0x9fb6ff), seed2);
  const lightCol = mix(coolLight, warmLight, step(float(1.0).sub(warmthNode), seed2)).toVar();

  // Room shell: muted plaster walls with skirting board, wood floorboards + rug, ceiling lamp, back-wall door & art
  const wallBase = mix(mix(color(0x9a8b73), color(0x6f7a82), seed1), color(0xb9ad97), seed2.mul(0.6)).toVar();
  const wallCol = mix(wallBase, wallBase.mul(0.5), smoothstep(0.06, 0.04, q.y)).toVar();

  const seam = step(0.92, fract(q.x.mul(7.0)));
  const boards = mix(color(0x4a3320), color(0x6a4c30), seed1).mul(float(1.0).sub(seam.mul(0.3)));
  const rug = mix(color(0x7a3b32), color(0x3a5760), seed2);
  const inRug = step(abs(q.x.sub(0.5)), 0.28).mul(step(abs(q.z.sub(0.58)), 0.25));
  const floorCol = mix(boards, rug, inRug.mul(0.88)).toVar();

  const lamp = smoothstep(0.18, 0.11, length(vec2(q.x.sub(0.5), q.z.sub(0.5)))).mul(float(1.0).sub(lod));
  const ceilBase = mix(wallBase, color(0xe8e2d5), 0.28);
  const ceilCol = mix(ceilBase, lightCol.mul(mix(float(0.85), float(3.8), lit)), lamp).toVar();

  const doorX = mix(float(0.24), float(0.76), seed1);
  const doorCol = mix(color(0x5a4631), color(0x39383c), step(0.5, seed2));
  const inDoor = step(abs(q.x.sub(doorX)), 0.09).mul(step(abs(q.y.sub(0.34)), 0.34));
  const picX = mix(float(0.72), float(0.28), step(0.5, seed1));
  const inPicFrame = step(abs(q.x.sub(picX)), 0.085).mul(step(abs(q.y.sub(0.56)), 0.095));
  const inPicCanvas = step(abs(q.x.sub(picX)), 0.065).mul(step(abs(q.y.sub(0.56)), 0.075));
  const picCol = mix(color(0x2c3a4a), color(0x7a5a3a), fract(seed1.add(seed2)));
  const backWithDoor = mix(wallCol, doorCol, inDoor);
  const backWithFrame = mix(backWithDoor, color(0x141210), inPicFrame);
  const backCol = mix(backWithFrame, picCol, inPicCanvas).toVar();

  const shellCol = mix(mix(mix(wallCol, floorCol, onFloor), ceilCol, onCeil), backCol, onBack).toVar();

  // Soft 3D corner ambient occlusion & depth falloff (SkyscraperGenerator.js lines 1176 & 1213-1216)
  const aoX = smoothstep(0.0, 0.16, q.x).mul(smoothstep(0.0, 0.16, float(1.0).sub(q.x))).toVar();
  const aoY = smoothstep(0.0, 0.16, q.y).mul(smoothstep(0.0, 0.16, float(1.0).sub(q.y))).toVar();
  const aoZ = smoothstep(0.0, 0.16, q.z).mul(smoothstep(0.0, 0.16, float(1.0).sub(q.z))).toVar();
  const edgeAO = mix(mix(aoY.mul(aoZ), aoX.mul(aoZ), isYPlane), aoX.mul(aoY), onBack);
  const shellAO = mix(float(0.66), float(1.0), edgeAO);
  const falloff = mix(float(1.0), float(0.42), q.z);
  const shadedRoom = shellCol.mul(shellAO).mul(falloff).toVar();

  // Curtains hung just inside the glass of each window opening (SkyscraperGenerator.js lines 1274-1302)
  // Parallax shift onto the curtain plane behind the glass
  const cUVx = clamp(wUV.x.add(dirX.div(dirZ).mul(0.06)), 0.0, 1.0).toVar();
  const wSeed1 = hash2D(cid.add(vec2(seedNode.mul(0.8), 41.2))).toVar();
  const wSeed2 = hash2D(cid.add(vec2(17.9, seedNode.mul(1.3)))).toVar();

  const sL = smoothstep(0.18, 1.0, wSeed1);
  const sR = smoothstep(0.18, 1.0, wSeed2);
  const lw = sL.mul(sL).mul(0.48); // Left drape width (0..48% of window width)
  const rw = sR.mul(sR).mul(0.48); // Right drape width (0..48% of window width)
  // Drape edges widen to the pixel footprint & pleats fade to their mean shade once they'd shrink below a few pixels
  const cFw = fwidth(cUVx).toVar();
  const drapeAA = cFw.add(0.015).toVar();
  const inLeftDrape = smoothstep(lw.add(drapeAA), lw.sub(drapeAA), cUVx).mul(step(0.03, lw));
  const inRightDrape = smoothstep(float(1.0).sub(rw).sub(drapeAA), float(1.0).sub(rw).add(drapeAA), cUVx).mul(step(0.03, rw));
  const inDrape = mix(clamp(max(inLeftDrape, inRightDrape), 0.0, 1.0), 0.29, lod).toVar(); // 0.29: mean drape coverage

  // Domestic curtain fabric palette (cream, taupe, warm grey, dusty blue, sage green, faded terracotta)
  const pick = fract(seed1.mul(5.7)).mul(5.0);
  const sw0 = mix(color(0xcabfa6), color(0xd8cdb8), seed2);
  const sw1 = mix(color(0x8a7a64), color(0x9b8c72), seed2);
  const sw2 = mix(color(0x5f7079), color(0x6f818b), seed2);
  const sw3 = mix(color(0x6c7558), color(0x79835f), seed2);
  const sw4 = mix(color(0x8c5a44), color(0x9a6a52), seed2);
  const fabric = mix(
    mix(mix(mix(sw0, sw1, step(1.0, pick)), sw2, step(2.0, pick)), sw3, step(3.0, pick)),
    sw4,
    step(4.0, pick)
  );
  const pleatWave = sin(cUVx.mul(48.0).add(wSeed1.mul(6.28))).mul(float(1.0).sub(smoothstep(0.6, 1.6, cFw.mul(48.0))));
  const pleat = pleatWave.mul(0.205).add(0.945);
  const drapeCol = fabric.mul(pleat).mul(0.92).toVar();

  // A drape only transmits a little of the room's glow (0.20), never out-glowing the interior!
  const bestCol = mix(shadedRoom, drapeCol, inDrape);
  const bestEmit = mix(float(1.0), float(0.20), inDrape);
  const roomWarmth = mix(vec3(1.0), lightCol, lit.mul(0.85));
  const finalRoomCol = bestCol.mul(roomWarmth).mul(mix(float(0.85), float(1.35), lit));

  return vec4(finalRoomCol, mix(litRoom, litProbNode, lod).mul(bestEmit));
});

/**
 * Treatment of each wall of a box-local facade box (createFacadeBoxes `faces`, read by facadeCell). shop: street front
 * with storefronts on the ground floor; entry: residential street front, windows down to the ground floor and one
 * entrance door; rear: yard, court & air-shaft walls, plain common brick with windows on every floor; lotLine:
 * windowless lot-line (party) wall, common brick or grey parging; blankStone: windowless wall in the facade's stone.
 */
const WALL_KINDS = { shop: 0, entry: 1, rear: 2, lotLine: 3, blankStone: 4 };

/**
 * Facade cell coordinates shared by the curtain-wall & pre-war materials: wall UV (u runs along whichever horizontal
 * axis the wall faces, v is world height), window cell id/UV, bay width, pixel footprint in cells (`fw`, for
 * filtering) and roof/ground-floor masks.
 * World-space by default. With `boxLocal` the mesh must come from createFacadeBoxes: u then starts at each wall's
 * corner and every wall fits a whole number of bays, so no window straddles a corner. `cornerPier` (m, box-local only)
 * keeps a solid band of wall at both ends of every wall (masonry corners): the bays fill the width between the piers
 * and `solid` is 1 inside the piers above the ground floor, where callers suppress windows, sills & AC units.
 * Box-local walls also read their treatment from the per-instance `faces` attribute (see WALL_KINDS / createFacadeBoxes):
 * `isGroundFloor` is 1 only on storefront ground floors, `door` marks the entrance bay of residential fronts, `back`
 * the plain common-brick rear & lot-line walls (tinted by the building's `tone`) and `blank` the windowless ones
 * (folded into `solid`); `wallS`, `wallW`, `wallH`, `fromTop` & `boxSeed` place things on the wall (painted signs).
 * Plain JS (not Fn) so it inlines into each node graph exactly like hand-written code.
 */
function facadeCell(windowWidth, floorHeight, boxLocal, cornerPier = 0) {
  // Box-local walls are told apart by the box's own normals (createFacadeBoxes instances may be turned about +y to
  // follow a non-grid street); world-space walls by the world normal
  const nWall = boxLocal ? normalGeometry : facadeWorldNormal;
  const nW = abs(nWall);
  const isRoof = step(0.75, nW.y);
  const alongZ = boxLocal ? step(nW.z, nW.x) : facadeAlongZ;
  let uCoord = mix(positionWorld.x, positionWorld.z, alongZ);
  let bayWidth = float(windowWidth);
  let gridU = uCoord.div(bayWidth);
  let inPier = float(0.0);
  let kind = float(WALL_KINDS.shop);
  let tone = float(0.5);
  let bayIdx = float(0.0); // bay index along the wall (0 at its corner; -1 / bays inside the corner piers)
  let bays = float(1.0);
  // Box-local wall frame: metres along the wall (from its left end, seen facing it), its width & height, metres
  // below the box's top
  let wallS = float(0.0);
  let wallW = float(1.0);
  let wallH = float(1.0);
  let fromTop = float(0.0);
  let boxSeed = float(0.0);

  if (boxLocal) {
    const box = attribute('box', 'vec4'); // width, height, depth, seed (+ the building's tone in its fraction)
    const faces = attribute('faces', 'vec4'); // WALL_KINDS of the -x, +x, -z & +z walls
    const wallWidth = mix(box.x, box.z, alongZ);
    // The box-local normal's sign tells which wall this is
    kind = mix(
      mix(faces.z, faces.w, step(0.0, nWall.z)),
      mix(faces.x, faces.y, step(0.0, nWall.x)),
      alongZ
    );
    // The seed's fraction (0.1..0.9, never near an integer so floor() is stable on inexact varyings) is the tone
    tone = fract(box.w).sub(0.1).div(0.8);
    boxSeed = floor(box.w);
    // Whole-bay offset per wall so walls don't repeat each other's windows
    const wallSeed = floor(box.w.add(dot(nWall, vec3(17.0, 0.0, 37.0))));
    const along = mix(positionGeometry.x, positionGeometry.z, alongZ).add(0.5); // 0..1 from the wall's corner
    wallW = wallWidth;
    // Reading left to right for someone facing the wall
    const flip = mix(step(nWall.z, 0.0), step(0.0, nWall.x), alongZ);
    wallS = mix(along, float(1.0).sub(along), flip).mul(wallWidth);
    wallH = box.y;
    fromTop = float(0.5).sub(positionGeometry.y).mul(box.y);
    if (cornerPier > 0) {
      const pier = min(float(cornerPier), wallWidth.mul(0.2));
      const inner = wallWidth.sub(pier.mul(2.0));
      bays = max(floor(inner.div(windowWidth).add(0.5)), 1.0);
      const s = along.mul(wallWidth); // metres from the wall's corner
      bayWidth = inner.div(bays);
      bayIdx = floor(s.sub(pier).div(bayWidth));
      gridU = s.sub(pier).div(bayWidth).add(wallSeed);
      inPier = float(1.0).sub(step(pier, s).mul(step(s, wallWidth.sub(pier))));
    } else {
      bays = max(floor(wallWidth.div(windowWidth).add(0.5)), 1.0);
      bayWidth = wallWidth.div(bays);
      bayIdx = floor(along.mul(bays));
      gridU = along.mul(bays).add(wallSeed);
    }
    uCoord = gridU.mul(bayWidth);
  }

  const vCoord = positionWorld.y;
  const gridV = vCoord.div(floorHeight);
  const cellId = vec2(floor(gridU), floor(gridV));
  const cellUV = vec2(fract(gridU), fract(gridV));
  const fw = vec2(fwidth(gridU), fwidth(gridV));

  // Ground floor is strictly floor index 0 (gridV < 1.0) so floor 1 is never sliced in half!
  const floor0 = float(1.0).sub(step(1.0, gridV));
  const wall = float(1.0).sub(isRoof);
  const isGroundFloor = floor0.mul(float(1.0).sub(step(WALL_KINDS.shop + 0.5, kind)));
  const blank = step(WALL_KINDS.lotLine - 0.5, kind).mul(wall);
  const back = step(WALL_KINDS.rear - 0.5, kind).mul(float(1.0).sub(step(WALL_KINDS.blankStone - 0.5, kind))).mul(wall);
  // One entrance per residential front, in a bay picked by the building's tone
  const isEntry = step(WALL_KINDS.entry - 0.5, kind).mul(float(1.0).sub(step(WALL_KINDS.entry + 0.5, kind)));
  const door = floor0.mul(isEntry).mul(wall).mul(step(abs(bayIdx.sub(min(floor(tone.mul(bays)), bays.sub(1.0)))), 0.5));
  // A box that isn't a whole number of storeys (landmark tiers) ends in a solid parapet instead of slicing a row of
  // windows, and starts with one above the roof it stands on; every wall is capped by a coping at its top
  let partial = float(0.0);
  let coping = float(0.0);
  if (boxLocal) {
    const top = vCoord.add(fromTop);
    const floorBase = floor(gridV).mul(floorHeight);
    const whole = step(top.sub(wallH).sub(0.05), floorBase).mul(step(floorBase.add(floorHeight), top.add(0.05)));
    partial = float(1.0).sub(whole).mul(wall);
    coping = float(1.0).sub(step(0.32, fromTop)).mul(wall);
  }
  const solid = max(max(inPier.mul(float(1.0).sub(isGroundFloor)), blank), partial);
  return {
    isRoof, uCoord, vCoord, gridV, cellId, cellUV, fw, bayWidth, isGroundFloor, solid, floor0, back, blank, door, tone,
    wallS, wallW, wallH, fromTop, boxSeed, partial, coping
  };
}

/**
 * Curtain-Wall Glass Skyscraper TSL Material
 * Features:
 * - Mikkelsen `bumpNormal` 3D Mullion Relief & Per-Pane Thermal Glass Warble
 * - Fast 3D Apartment/Upper-Level Interior Mapping (2D Glazing on Ground-Floor Shops)
 * - Urban Canyon Global Illumination (`aoNode` + warm bounce)
 */
function createCurtainWallMaterial(opts = {}) {
  const {
    glassTint = 0x162c42,
    frameTint = 0x26323e,
    windowWidth = 2.8,
    floorHeight = 3.8,
    mullionThickness = 0.075,
    spandrelRatio = 0.20,
    litProbability = 0.36,
    warmth = 0.62,
    reflectivity = 0.92,
    seed = 1.0,
    boxLocal = false
  } = opts;

  const cacheKey = `${glassTint}_${frameTint}_${windowWidth}_${floorHeight}_${litProbability}_${warmth}_${reflectivity}_${seed}_${boxLocal}`;
  if (_curtainWallCache.has(cacheKey)) {
    return _curtainWallCache.get(cacheKey);
  }

  const mat = new THREE.MeshStandardNodeMaterial({
    metalness: 0.72,
    roughness: 0.12
  });

  // The style's parameters are uniforms (not baked-in constants), so every curtain-wall style compiles to one shader
  const cGlass = uniform(new THREE.Color(glassTint));
  const cFrame = uniform(new THREE.Color(frameTint));
  const uWindowWidth = uniform(windowWidth);
  const uFloorHeight = uniform(floorHeight);
  const uLitProbability = uniform(litProbability);
  const uWarmth = uniform(warmth);
  const uReflectivity = uniform(reflectivity);
  const uSeed = uniform(seed);
  const cWarmLight = color(0xffe1a6);
  const cCanyonBounce = color(0xe89c68);

  mat.aoNode = canyonSkyAONode();

  // The facade cell and the apartment behind each pane are built once and shared by every output below, so the
  // shader carries a single copy of them (and evaluates the interior mapping once per pixel)
  const facade = facadeCell(uWindowWidth, uFloorHeight, boxLocal);
  const { isRoof, uCoord, vCoord, gridV, cellId, cellUV, fw, bayWidth, isGroundFloor, blank, tone, partial, coping } = facade;
  // Pane UV inside the mullions & spandrel, the 3D apartment behind it and whether the ground-floor shop is lit
  const winUV = clamp(
    vec2(
      cellUV.x.sub(mullionThickness).div(max(0.01, 1.0 - 2.0 * mullionThickness)),
      cellUV.y.sub(spandrelRatio).div(max(0.01, 1.0 - spandrelRatio - mullionThickness))
    ),
    vec2(0.0),
    vec2(1.0)
  );
  const aptRoom = evaluateApartmentInterior(uCoord, vCoord, winUV, cellId, bayWidth, uFloorHeight, uSeed, uWarmth, uLitProbability.mul(0.65), fw);
  const shopLit = step(0.24, hash2D(cellId.add(vec2(uSeed, 19.4))));
  const floorIdx = floor(gridV);
  const isMechFloor = float(1.0).sub(step(1.0, mod(floorIdx.add(uSeed), 16.0))).mul(step(4.0, floorIdx));

  mat.colorNode = Fn(() => {
    // No glass in a storey the box cuts short (solid spandrel instead) nor behind the coping
    const isGlassPane = filteredPulse(cellUV.x, mullionThickness * 0.5, 1.0 - mullionThickness * 0.5, fw.x)
      .mul(filteredPulse(cellUV.y, spandrelRatio + 0.015, 1.0 - mullionThickness * 0.5, fw.y))
      .mul(float(1.0).sub(isRoof)).mul(float(1.0).sub(partial)).mul(float(1.0).sub(coping));

    const louverStripes = sin(vCoord.mul(22.0)).mul(0.5).add(0.5);

    // Per-Pane Thermal/Wind Glass Warble & Pillow Distortion
    const paneRandX = hash2D(cellId.add(vec2(uSeed, 3.7))).sub(0.5);
    const paneRandY = hash2D(cellId.add(vec2(11.3, uSeed))).sub(0.5);
    const pillowBowX = cellUV.x.sub(0.5).mul(0.11).add(paneRandX.mul(0.09));
    const pillowBowY = cellUV.y.sub(0.55).mul(0.11).add(paneRandY.mul(0.09));

    const sunDir = normalize(cityUniforms.uSkySunDir);
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const nPane = normalize(normalWorldGeometry.add(vec3(pillowBowX, pillowBowY, pillowBowX.negate())));
    const reflectDir = reflect(viewDir.negate(), nPane);

    const fresnel = pow(clamp(float(1.0).sub(abs(dot(viewDir, nPane))), 0.0, 1.0), 2.1);
    const reflectElev = clamp(reflectDir.y.mul(0.65).add(0.38), 0.0, 1.0);

    // Reflected neighboring Manhattan skyscrapers silhouette, its edge & window grid filtered by their screen footprint
    const refAzimuth = uCoord.mul(0.045).add(reflectDir.x.mul(3.8)).add(reflectDir.z.mul(3.8));
    const neighborTowerH = hash2D(vec2(floor(refAzimuth.mul(2.4)), uSeed)).mul(0.46).add(0.16);
    const elevAA = fwidth(reflectElev).add(0.004);
    const inReflectedTower = smoothstep(neighborTowerH.add(elevAA), neighborTowerH.sub(elevAA), reflectElev);
    const refCols = refAzimuth.mul(15.0);
    const refRows = reflectElev.mul(30.0);
    const refWinGrid = filteredPulse(fract(refCols), 0.32, 1.0, fwidth(refCols))
      .mul(filteredPulse(fract(refRows), 0.32, 1.0, fwidth(refRows)));
    const reflectedBuildingCol = mix(
      color(0x0c1420),
      color(0xffd494),
      refWinGrid.mul(0.42).mul(cityUniforms.uInteriorGlow)
    );

    const skyReflect = mix(cityUniforms.uSkyHorizonColor, cityUniforms.uSkyTopColor, clamp(reflectElev.mul(1.4), 0.0, 1.0));
    const envReflection = mix(skyReflect, reflectedBuildingCol, inReflectedTower.mul(0.62));
    const sunSpec = pow(max(dot(reflectDir, sunDir), 0.0), 48.0).mul(1.25);

    // Upper levels use 3D apartment interior mapping; ground-floor shops use 2D glass
    const pooledDirt = float(1.0).sub(smoothstep(spandrelRatio, spandrelRatio + 0.22, cellUV.y)).mul(0.32);
    const grime = float(0.56).add(pooledDirt).clamp(0.0, 0.92);
    const shopShelves = float(1.0).sub(step(0.78, fract(winUV.y.mul(3.0))).mul(0.35));
    const shopTransomGlow = step(0.76, winUV.y).mul(0.35).add(0.65);
    const shopInterior = cWarmLight.mul(shopShelves).mul(shopTransomGlow).mul(mix(float(0.28), float(0.88), shopLit));
    const shopBase = mix(cGlass, shopInterior, float(0.56).mul(float(1.0).sub(pooledDirt)));
    const upperGlazed = mix(aptRoom.xyz.mul(color(0xb6c6bf)), cGlass, grime);
    const glazedBase = mix(upperGlazed, shopBase, isGroundFloor);

    const glassColor = mix(glazedBase, envReflection, fresnel.mul(uReflectivity).add(0.18))
      .add(cityUniforms.uSunColor.mul(sunSpec));

    const spandrelDark = cFrame.mul(0.52);
    const frameBase = mix(cFrame, spandrelDark, filteredPulse(cellUV.y, 0.0, spandrelRatio, fw.y));

    const canyonBand = smoothstep(0.0, 14.0, vCoord).mul(float(1.0).sub(smoothstep(22.0, 75.0, vCoord)));
    const canyonGlow = cCanyonBounce.mul(canyonBand.mul(cityUniforms.uCanyonBounce).mul(0.16));

    const roofNoise = noise2D(positionWorld.xz.mul(0.35));
    const roofColor = mix(color(0x202429), color(0x3b4149), roofNoise);

    const facadeCol = mix(frameBase, glassColor, isGlassPane.mul(float(1.0).sub(isMechFloor))).add(canyonGlow);
    const mechCol = mix(cFrame.mul(0.36), cFrame.mul(0.76), louverStripes);
    const finalWall = mix(facadeCol, mechCol, isMechFloor.mul(float(1.0).sub(isRoof)));

    // Windowless lot-line walls: weathered precast concrete panels, a panel per bay & storey
    const panelJoint = max(filteredPulse(cellUV.x, 0.0, 0.025, fw.x), filteredPulse(cellUV.y, 0.0, 0.03, fw.y));
    const panelStain = noise2D(vec2(uCoord.mul(0.9), vCoord.mul(0.04))).mul(float(1.0).sub(smoothstep(0.4, 1.2, fwidth(uCoord))));
    const panelCol = mix(color(0x8a867e), color(0xaaa59b), tone).mul(panelStain.mul(0.16).add(0.9)).mul(float(1.0).sub(panelJoint.mul(0.3)));
    const withBlank = mix(finalWall, panelCol.add(canyonGlow), blank);
    // Brushed-aluminium coping capping every wall
    const withCap = mix(withBlank, mix(cFrame, color(0xc9ced3), 0.45), coping);

    return mix(withCap, roofColor, isRoof);
  })();

  mat.roughnessNode = Fn(() => {
    const isFrame = float(1.0).sub(
      filteredPulse(cellUV.x, mullionThickness, 1.0 - mullionThickness, fw.x).mul(filteredPulse(cellUV.y, spandrelRatio, 1.0, fw.y))
    );
    const sillDirt = float(1.0).sub(smoothstep(spandrelRatio, spandrelRatio + 0.18, cellUV.y)).mul(0.18);
    const glassOrFrame = mix(float(0.05).add(sillDirt), float(0.54), max(max(isFrame, isRoof), partial));
    return mix(mix(glassOrFrame, float(0.36), coping), float(0.88), blank);
  })();

  // Glass & metal, but the concrete lot-line walls aren't
  mat.metalnessNode = mix(float(0.72), float(0.0), blank);

  // Hardware derivative bumpNormal for raised curtain-wall mullions & spandrel channels (ramps >= 2px, see pre-war)
  mat.normalNode = Fn(() => {
    const camDist = length(positionWorld.sub(cameraPosition));
    const detailFade = float(1.0).sub(smoothstep(18.0, 140.0, camDist)).mul(float(1.0).sub(isRoof))
      .mul(float(1.0).sub(smoothstep(0.03, 0.1, max(fw.x, fw.y))));

    const ramp = fw.mul(2.0).max(0.02);
    const inPane = filteredPulse(cellUV.x, mullionThickness + 0.01, 0.99 - mullionThickness, ramp.x)
      .mul(filteredPulse(cellUV.y, spandrelRatio + 0.01, 0.99 - mullionThickness, ramp.y))
      .mul(float(1.0).sub(partial)).mul(float(1.0).sub(coping));
    const mullionRelief = float(1.0).sub(inPane).mul(0.014).mul(float(1.0).sub(blank)).add(coping.mul(0.01));

    return bumpNormal(mullionRelief.mul(detailFade));
  })();

  mat.emissiveNode = Fn(() => {
    const inPane = filteredPulse(cellUV.x, mullionThickness + 0.015, 1.0 - mullionThickness - 0.015, fw.x)
      .mul(filteredPulse(cellUV.y, spandrelRatio + 0.02, 1.0 - mullionThickness * 0.5, fw.y));
    const paneMask = inPane.mul(float(1.0).sub(isRoof)).mul(float(1.0).sub(isMechFloor)).mul(float(1.0).sub(blank))
      .mul(float(1.0).sub(partial)).mul(float(1.0).sub(coping));

    const shopShelves = float(1.0).sub(step(0.78, fract(winUV.y.mul(3.0))).mul(0.32));
    const shopEmit = cWarmLight.mul(shopLit).mul(shopShelves).mul(0.62);
    const emitCol = mix(aptRoom.xyz.mul(aptRoom.w), shopEmit, isGroundFloor);

    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const fresnel = pow(clamp(float(1.0).sub(abs(dot(viewDir, normalWorldGeometry))), 0.0, 1.0), 2.0);
    const transmission = float(1.0).sub(fresnel.mul(0.75));

    return emitCol
      .mul(transmission)
      .mul(paneMask)
      .mul(cityUniforms.uInteriorGlow)
      .mul(0.72);
  })();

  _curtainWallCache.set(cacheKey, mat);
  return mat;
}
class FoliageLightingModel extends THREE.PhysicalLightingModel {
  direct(lightData, builder) {
    const { lightDirection, lightColor, reflectedLight } = lightData;
    const translucency = builder.material.translucencyNode;
    if (translucency) {
      const scatter = normalize(lightDirection.add(normalView.mul(0.3)));
      const through = pow(clamp(dot(positionViewDirection, scatter.negate()), 0.0, 1.0), 3.0);
      reflectedLight.directDiffuse.addAssign(lightColor.mul(translucency).mul(through));
    }
    super.direct(lightData, builder);
  }
}

class TreeNodeMaterial extends THREE.MeshStandardNodeMaterial {
  static get type() {
    return 'TreeNodeMaterial';
  }

  constructor(parameters) {
    super(parameters);
    this.translucencyNode = null;
  }

  setupLightingModel() {
    return new FoliageLightingModel();
  }
}

// Prevailing wind (xz, blowing from the west-north-west across Manhattan)
const TREE_WIND = vec2(0.86, 0.51);

/**
 * Instanced street & park tree material (js/trees.js): bark tubes and alpha-tested leaf cards in ONE draw per mesh.
 * Geometry attributes:
 * - uv: leaf-atlas coordinates on the cards; on the bark (metres round the stem, metres along it)
 * - normal: on the cards, crown-shell normals (out from the crown centre, blended with the card face), so a crown
 *   shades as one leafy volume and both sides of a card light alike (the back faces keep them unflipped)
 * - aTree (vec4): x = 1 on leaf cards / 0 on bark, y = crown occlusion (0 deep inside .. 1 on the outer shell),
 *   z = sway weight (0 on the trunk .. 1 at the twig tips & cards), w = per-card random (leaf flutter phase)
 * - aTreeData (instanced vec4): rgb = per-tree linear foliage tint, w = species index + per-tree random fraction
 *   (species 0 London plane: flaking camouflage bark, 1 honey locust & 2 elm: dark furrowed bark)
 * Leaf atlas texels: r = leaf brightness, g = per-leaf hue jitter, b = twig / stalk mask, a = coverage (its mipmaps
 * keep the coverage, so distant crowns stay full).
 * Shading: per-tree tint with sun-yellowed & cooler leaves, deep leaves darker and occluded from the sky, sunlight
 * shining through the leaves toward the camera (FoliageLightingModel), alpha-to-coverage leaf edges on the MSAA scene
 * pass (alpha-tested in the shadow maps: dappled shadows). Wind: gusts rolling across the city sway the crowns
 * (shadows follow), branches bob and leaves flutter.
 */
function createTreeMaterial(leafAtlas) {
  // The alpha test is given as nodes (alphaTestNode on the scene pass, maskShadowNode in the shadow maps) rather than
  // `alphaTest`: the shadow passes copy each caster's `alphaTest` onto one shared shadow material, and every switch
  // between 0 and > 0 bumps its version, which made three.js re-hash the node graphs of all the casters' shadow render
  // objects every frame (~10 ms of CPU). The trees were the only alpha-tested casters.
  const mat = new TreeNodeMaterial({
    side: THREE.DoubleSide,
    alphaToCoverage: true,
    metalness: 0.0,
    roughness: 0.8
  });

  const aTree = attribute('aTree', 'vec4');
  const aData = attribute('aTreeData', 'vec4');
  const isLeaf = aTree.x;
  const crownAO = aTree.y;
  const rnd = fract(aData.w);
  const species = floor(aData.w);
  const leaf = texture(leafAtlas, uv());

  // Wind. positionLocal is already instanced (world space); positionGeometry is the tree's own frame (metres)
  mat.positionNode = Fn(() => {
    const p = positionLocal;
    const g = positionGeometry;
    const phase = rnd.mul(6.2832);
    // gusts rolling downwind across the city
    const gust = sin(time.mul(0.5).sub(dot(p.xz, TREE_WIND).mul(0.045))).mul(0.5).add(0.5);
    const strength = gust.mul(gust).mul(0.7).add(0.3);
    // the whole tree bends with height, leaning downwind and rocking across it
    const h = g.y.div(11.0);
    const bend = h.mul(h);
    const lean = sin(time.mul(0.85).add(phase)).mul(0.45).add(0.55).mul(strength).mul(0.2);
    const rock = sin(time.mul(0.67).add(phase.mul(1.7))).mul(0.06).mul(strength);
    const sway = vec3(TREE_WIND.x.mul(lean).sub(TREE_WIND.y.mul(rock)), 0.0, TREE_WIND.y.mul(lean).add(TREE_WIND.x.mul(rock))).mul(bend);
    // branches bob, the phase flowing smoothly through the crown so joints stay together
    const bob = sin(time.mul(2.1).add(g.x.mul(0.9)).add(g.z.mul(0.7)).add(phase)).mul(0.05).mul(aTree.z).mul(strength);
    // leaves flutter, every card on its own
    const flutter = sin(time.mul(8.0).add(aTree.w.mul(37.0)).add(g.y.mul(2.0))).mul(0.03).mul(isLeaf).mul(aTree.z).mul(strength.add(0.25));
    return p.add(sway).add(vec3(0.0, bob, 0.0)).add(normalLocal.mul(flutter));
  })();

  // Coverage: leaf cards from the atlas; bark is opaque from outside (its back faces are dropped)
  const alpha = mix(float(frontFacing), leaf.a, isLeaf);
  mat.alphaTestNode = float(0.5);
  mat.maskShadowNode = alpha.greaterThan(0.5);

  mat.colorNode = Fn(() => {
    // Leaves: per-tree tint x atlas brightness, a share of sun-yellowed and of cooler leaves, brown twigs & stalks,
    // darker deep in the crown
    const tint = aData.xyz;
    const base = tint.mul(leaf.r.mul(1.4));
    const warm = smoothstep(0.62, 1.0, leaf.g).mul(0.55);
    const cool = smoothstep(0.38, 0.0, leaf.g).mul(0.45);
    const leafCol = mix(mix(base, base.mul(vec3(1.25, 1.08, 0.5)), warm), base.mul(vec3(0.8, 0.92, 1.05)), cool);
    const foliage = mix(leafCol, color(0x4a3b2c), leaf.b).mul(crownAO.mul(0.45).add(0.55));

    // Bark (uv in metres): furrowed grey-brown ridges, or the London plane's olive bark flaking to cream & tan
    const bu = uv();
    const n1 = noise2D(vec2(bu.x.mul(5.0), bu.y.mul(1.1)).add(rnd.mul(17.0)));
    const n2 = noise2D(bu.mul(vec2(3.2, 1.9)).add(rnd.mul(31.0)));
    const ridge = float(1.0).sub(abs(n1.sub(0.5).mul(2.0)));
    const furrowed = mix(color(0x2e261f), color(0x5c5043), smoothstep(0.35, 0.9, ridge));
    const planeBark = mix(mix(color(0x645e4b), color(0x948c73), smoothstep(0.56, 0.66, n2)), color(0x4a3f31), smoothstep(0.3, 0.22, n2));
    const bark = mix(furrowed, planeBark, step(species, 0.5)).mul(crownAO.mul(0.4).add(0.6));

    return vec4(mix(bark, foliage, isLeaf), alpha);
  })();

  mat.roughnessNode = mix(float(0.93), float(0.72).sub(leaf.r.mul(0.1)), isLeaf);

  // Card normals are crown-shell normals on both faces: no back-face flip
  mat.normalNode = normalViewGeometry;

  // Sky light: street-canyon occlusion, deep inside the crown far less
  mat.aoNode = canyonSkyAONode().mul(crownAO.mul(0.75).add(0.25));

  // Light through the leaves: yellow-green, strongest out on the thin shell
  mat.translucencyNode = aData.xyz.mul(vec3(1.0, 1.2, 0.45)).mul(leaf.r.mul(1.5)).mul(crownAO.mul(0.8).add(0.2)).mul(isLeaf);

  return mat;
}


function createParkLawnMaterial(isMeadow = false) {
  const mat = new THREE.MeshStandardNodeMaterial({
    metalness: 0.0,
    roughness: 0.86
  });

  const cGrassDeep = color(isMeadow ? 0x2c5c28 : 0x224c20);
  const cGrassMid = color(isMeadow ? 0x457d36 : 0x36682c);
  const cGrassSun = color(0x6b9c3e);

  mat.colorNode = Fn(() => {
    const wp = positionWorld.xz;
    const macroPatch = noise2D(wp.mul(0.06));
    const midClover = noise2D(wp.mul(0.35));
    const microBlade = noise2D(wp.mul(3.8));
    const mowStripe = sin(wp.x.mul(0.55).add(wp.y.mul(0.25))).mul(0.5).add(0.5);

    const baseLawn = mix(
      cGrassDeep,
      cGrassMid,
      macroPatch.mul(0.45).add(midClover.mul(0.35)).add(mowStripe.mul(0.20))
    );
    return mix(baseLawn, cGrassSun, microBlade.mul(0.38));
  })();

  mat.normalNode = Fn(() => {
    const wp = positionWorld.xz;
    const camDist = length(positionWorld.sub(cameraPosition));
    const detail = smoothstep(85.0, 10.0, camDist);
    const turf = noise2D(wp.mul(7.5)).sub(0.5).mul(0.008);
    return bumpNormal(turf.mul(detail));
  })();

  // Grass is a canopy of blades that shadow each other, not a flat dielectric: at grazing angles a plain F0 = 0.04 /
  // F90 = 1 Fresnel mirrors the sky and turns lawns teal, so weaken the specular and cap its grazing rise
  mat.setupSpecular = function () {
    specularColor.assign(vec3(0.025));
    specularColorBlended.assign(vec3(0.025));
    specularF90.assign(0.3);
  };

  return mat;
}

export { cityUniforms, createCurtainWallMaterial, createTreeMaterial, createParkLawnMaterial };
