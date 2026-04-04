# Overworld Island Redesign + Scrollable Camera

## Context

The overworld is currently a flat 22x16 grid of identical grass tiles (all tile ID 14) on a fixed 1024x768 canvas with no scrolling. The user wants to redesign it as a **lush island surrounded by water** using the existing Tiny Swords tileset artwork, and make the camera **follow the hero** so the map can be larger and scrollable.

This is the foundation for future procedural map generation — building the island programmatically in code rather than relying on a hand-edited Tiled JSON file.

---

## Tileset Tile ID Map (Tilemap_color1.png)

The tileset is 12 columns x 8 rows = 96 tiles at 48x48px. The flat ground section (left half, columns 0-5) uses a **4x4 tile block** for a complete terrain piece:

| Tile ID | Position | Purpose |
|---------|----------|---------|
| 1 | r0,c0 | Top-left corner |
| 2, 3 | r0,c1-2 | Top edge (pair) |
| 4 | r0,c3 | Top-right corner |
| 5 | r0,c4 | Concave inner top-left |
| 6 | r0,c5 | Concave inner top-right |
| 13 | r1,c0 | Left edge (upper) |
| **14, 15** | r1,c1-2 | **Center fill (pair)** — currently used |
| 16 | r1,c3 | Right edge (upper) |
| 25 | r2,c0 | Left edge (lower) |
| 26, 27 | r2,c1-2 | Center fill (pair) |
| 28 | r2,c3 | Right edge (lower) |
| 37 | r3,c0 | Bottom-left corner |
| 38, 39 | r3,c1-2 | Bottom edge (pair) |
| 40 | r3,c3 | Bottom-right corner |
| 49 | r4,c0 | Concave inner bottom-left |
| 50 | r4,c5 | Concave inner bottom-right |

Elevated terrain + cliff faces occupy the right half (columns 6-11) — not used in this iteration.

---

## Plan

### 1. Create island map generator — `src/game/maps/islandGenerator.ts` (NEW)

**Map size: 40 columns x 30 rows** (1920x1440 pixels) — roughly 2x current area with 4-5 tile water border.

Algorithm:
1. Define island shape as an ellipse (~30x22 tiles) centered on the map, with simple noise perturbation on the boundary for organic coastline
2. For each cell, classify: **water** (tile 0 / empty), **edge**, or **interior**
3. For edge tiles, check 8 neighbors to determine correct corner/edge tile ID from the table above
4. For interior tiles, use tile IDs 14/15/26/27 in a 2x2 repeating pattern
5. Return: `{ groundData: number[][], islandMask: boolean[][], edgeTiles: {col, row, waterSide}[] }`

The `edgeTiles` output is used later for foam placement. The `islandMask` is used for hero walkability.

### 2. Load new assets — `src/game/scenes/Boot.ts` (MODIFY)

Add these loads in `preload()`:
- `water-bg` — `assets/Terrain/Tileset/Water Background color.png` (image)
- `water-foam` — `assets/Terrain/Tileset/Water Foam.png` (spritesheet, ~64x64 frames)
- `tree-1` through `tree-4` — `assets/Terrain/Resources/Wood/Trees/Tree1-4.png` (spritesheets)
- `water-rock-1` through `water-rock-3` — `assets/Terrain/Decorations/Rocks in the Water/Water Rocks_01-03.png` (spritesheets)

Add foam animation in `create()`:
```
key: 'water-foam-anim', ~14 frames, frameRate: 6, repeat: -1
```

### 3. Add procedural tilemap helper — `src/game/maps/tiled.ts` (MODIFY)

Add new function alongside existing ones (don't touch `createGroundTilemapLayer`):
```ts
export function createProceduralTilemap(
  scene: Phaser.Scene,
  tileData: number[][],
  tilesetTextureKey: string,
  layerDepth: number
): { map: Phaser.Tilemaps.Tilemap; layer: Phaser.Tilemaps.TilemapLayer }
```

Uses `scene.make.tilemap({ data: tileData, tileWidth: 48, tileHeight: 48 })` — Phaser supports creating tilemaps from 2D arrays directly.

### 4. Redesign OverworldScene — `src/game/scenes/OverworldScene.ts` (MODIFY)

**a) Replace static map loading:**
- Call `generateIslandMap(40, 30)` instead of loading `overworld-map` JSON
- Use `createProceduralTilemap()` to build the ground layer
- Store `islandMask` on the scene for walkability checks

**b) Add water background:**
- `this.add.tileSprite(WORLD_WIDTH/2, WORLD_HEIGHT/2, WORLD_WIDTH, WORLD_HEIGHT, 'water-bg').setDepth(-100)`
- Set camera background to match water color: `#5b9a8b`

**c) Add water foam sprites:**
- For each edge tile, place a foam sprite on the water-facing side
- Each starts at a random animation frame for visual variety
- Depth: -50 (above water, below ground)

**d) Camera follow:**
```ts
this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
this.cameras.main.startFollow(this.heroSprite, true, 0.08, 0.08);
this.cameras.main.setDeadzone(100, 75);
```

**e) Fix UI scroll factors:**
- `promptText.setScrollFactor(0)` — stays on screen
- Ribbon label objects need `setScrollFactor(0)` — modify `addRibbonLabel` to accept and apply `scrollFactor` option
- Hero name text: keeps default scrollFactor (moves with world)

**f) Movement clamping → island mask check:**
Replace simple bounds clamp with: before applying movement delta, check if the destination tile is land in `islandMask`. If not, don't move.

**g) Update world constants:**
```ts
const MAP_COLS = 40;
const MAP_ROWS = 30;
const TILE_SIZE = 48;
const WORLD_WIDTH = MAP_COLS * TILE_SIZE;  // 1920
const WORLD_HEIGHT = MAP_ROWS * TILE_SIZE; // 1440
```

### 5. Update node positions — `src/game/data/terrain.ts` (MODIFY)

Reposition nodes relative to island center (960, 720):
- Hero spawn: island center-west (~660, 780)
- Training Grounds: island northwest (~680, 520)
- Abyss Portal: island center (~960, 720)

### 6. Add scrollFactor to RibbonLabel — `src/game/ui/RibbonLabel.ts` (MODIFY)

Add optional `scrollFactor?: number` to `RibbonLabelOptions`. Apply `.setScrollFactor(value)` to all 4 created objects (leftCap, center, rightCap, labelText). Default to 1 for backward compat with BattleScene.

### 7. Place decorations in OverworldScene

After building the island:
- 8-12 trees on interior tiles (avoiding nodes), scaled ~0.4
- 4-6 bushes scattered on island
- 3-5 rocks on island edges
- 3-4 water rocks in the water near shore
- Clouds with `setScrollFactor(0.3)` for parallax effect

---

## Files Changed

| File | Action | What |
|------|--------|------|
| `src/game/maps/islandGenerator.ts` | NEW | Island generation algorithm |
| `src/game/scenes/OverworldScene.ts` | MODIFY | Procedural map, camera follow, water layers, decorations, walkability |
| `src/game/maps/tiled.ts` | MODIFY | Add `createProceduralTilemap()` |
| `src/game/scenes/Boot.ts` | MODIFY | Load water/tree/foam assets, create foam animation |
| `src/game/data/terrain.ts` | MODIFY | Update node positions |
| `src/game/ui/RibbonLabel.ts` | MODIFY | Add scrollFactor option |

## Verification

1. `bun run tauri:dev` — game loads without errors
2. Overworld shows island with grass terrain surrounded by teal water
3. Water foam animates around island edges
4. Camera smoothly follows hero as they walk around
5. Hero cannot walk into water (stopped at island edges)
6. "OVERWORLD" ribbon and prompt text stay fixed on screen
7. Training Grounds and Abyss Portal are accessible and functional
8. Entering battle/portal transitions still work — BattleScene unaffected
9. Trees, rocks, and other decorations render correctly on the island
