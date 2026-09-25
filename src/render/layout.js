// Board geometry. Tile i sits on one of four sides; its local frame has +Z
// pointing outward (toward the pawn path and the camera), X along the side.
import * as THREE from "three";

export const TILE_W = 2.0;
export const CORNER = 3.2;
export const HALF = CORNER + 4.5 * TILE_W; // 12.2
export const DEPTH = CORNER;
export const ROAD_IN = HALF - CORNER;        // 9.0 inner edge of tiles
export const ROAD_MID = ROAD_IN - 0.55;      // inner ring road centre line
export const PARK = ROAD_IN - 1.1;           // park interior half-size

// Local-frame bands inside a regular tile (z from -1.6 inner to +1.6 outer)
export const BAND = {
  plotZ: -0.74, plotDepth: 1.6, plotW: 1.78,
  stripeZ: 0.2,
  pawnZ: 0.72,
  labelZ: 1.3,
};

export function tileSide(i) { return Math.floor(i / 10) % 4; }
export function isCorner(i) { return i % 10 === 0; }

const SIDE_ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
const SIDE_NORMAL = [new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0)];

export function tileRot(i) { return SIDE_ROT[tileSide(i)]; }
export function tileNormal(i) { return SIDE_NORMAL[tileSide(i)].clone(); }

/** Centre of tile i on the board plane. */
export function tileCenter(i, out = new THREE.Vector3()) {
  const side = tileSide(i);
  const k = i % 10;
  const c = HALF - CORNER / 2;
  if (k === 0) {
    const pts = [[c, c], [-c, c], [-c, -c], [c, -c]];
    return out.set(pts[side][0], 0, pts[side][1]);
  }
  const s = HALF - CORNER - (k - 0.5) * TILE_W;
  switch (side) {
    case 0: return out.set(s, 0, c);
    case 1: return out.set(-c, 0, s);
    case 2: return out.set(-s, 0, -c);
    default: return out.set(c, 0, -s);
  }
}

/** Convert a local offset (x along side, z outward) of tile i to world. */
export function tileLocal(i, lx, ly, lz, out = new THREE.Vector3()) {
  tileCenter(i, out);
  const r = tileRot(i);
  const cos = Math.cos(r), sin = Math.sin(r);
  out.x += lx * cos + lz * sin;
  out.z += -lx * sin + lz * cos;
  out.y = ly;
  return out;
}

// Pawn slots so up to 6 pawns can share a tile without overlapping.
const SLOTS = [[0, 0], [-0.46, 0.18], [0.46, 0.18], [-0.46, -0.3], [0.46, -0.3], [0, 0.45]];
export function pawnSpot(i, slot = 0, out = new THREE.Vector3()) {
  const [sx, sz] = SLOTS[slot % SLOTS.length];
  if (isCorner(i)) {
    // Corners: stand on the outer diagonal area of the corner square.
    const c = tileCenter(i, new THREE.Vector3());
    const n = c.clone().setY(0).normalize();
    const r = tileRot(i);
    const ox = sx * Math.cos(r) + sz * Math.sin(r);
    const oz = -sx * Math.sin(r) + sz * Math.cos(r);
    return out.set(c.x + n.x * 0.55 + ox, 0, c.z + n.z * 0.55 + oz);
  }
  return tileLocal(i, sx, 0, BAND.pawnZ + sz * 0.6, out);
}

/** Direction of travel at tile i (unit vector along the path). */
export function travelDir(i) {
  const side = tileSide(i);
  return [new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)][side];
}

/** Yaw (radians) for a camera placed outside side `side` looking in. */
export function sideYaw(side) {
  return [0, -Math.PI / 2, Math.PI, Math.PI / 2][side];
}
