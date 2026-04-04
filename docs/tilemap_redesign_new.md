  ## Open tabs:
  - islandGenerator.ts: src/game/maps/islandGenerator.ts
  - tilemap_redesign.md: docs/tilemap_redesign.md
  - DEV_SETUP.md: docs/DEV_SETUP.md
  - crispy-hopping-kite.md: docs/crispy-hopping-kite.md
  - rosy-wandering-zephyr.md: docs/rosy-wandering-zephyr.md

  ## My request for Codex:
  PLEASE IMPLEMENT THIS PLAN:
  # Overworld Terrain Generator Rewrite

  ## Summary
  - Replace the current island generator with a reusable terrain pipeline that generates a
  cleaned height map, converts only valid Tiny Swords guide patterns into tiles, and emits
  separate render data for water, foam, flat ground, shadows, elevated ground, stairs,
  walkability, and decoration zones.
  - Fix the four reported defects directly: shoreline foam mismatch, invalid inner-corner
  tiles that expose water color inside land, extra interior water leaks/notches, and
  artificial bush rows.
  - Ship the overworld as a fixed-seed `40x30` island with smooth outer coastline, two-height
  terrain, and clustered vegetation. Keep the core scene-agnostic so the same generator can
  later drive battle maps.

  ## Public APIs / Interfaces
  - Change `generateIslandMap` in [src/game/maps/islandGenerator.ts](/c:/Users/samso/
  OneDrive/Desktop/Vibe/Web/living-heros/src/game/maps/islandGenerator.ts) from positional
  args to an options object:
    - `generateIslandMap(options: OverworldTerrainOptions): GeneratedTerrainMap`
  - Add these generator types:
    - `OverworldTerrainOptions`: `cols`, `rows`, `tileSize`, `seed`, `nodeAnchors`, `profile`
    - `GeneratedTerrainMap`: `tileLayers`, `foamStamps`, `shadowStamps`, `heightMap`,
  `walkMask`, `clearZones`, `decorationZones`
    - `TerrainTileLayer`: `key`, `depth`, `tileData`
    - `OverlayStamp`: `kind`, `col`, `row`, `scale`, `depth`, `framePolicy`
  - Extend [src/game/maps/tiled.ts](/c:/Users/samso/OneDrive/Desktop/Vibe/Web/living-heros/
  src/game/maps/tiled.ts) with a helper that renders an ordered stack of procedural layers
  from `GeneratedTerrainMap.tileLayers` while leaving the existing Tiled-map helpers intact.

  ## Implementation Changes
  - Rewrite the generator in [src/game/maps/islandGenerator.ts](/c:/Users/samso/OneDrive/Desktop/Vibe/Web/living-heros/src/game/maps/islandGenerator.ts) as a staged pipeline:
    - Generate a base land mask from fixed-seed noise.
    - Run mask repair before any tile lookup: fill enclosed water holes, remove 1-tile inward
  notches, remove 1-tile peninsulas, prevent diagonal-only land connections, and keep one
  connected main island.
    - Generate height data with exactly two land heights in this pass: base ground and one
  raised plateau level. Use multiple plateau regions, but no stacked height-2 cliffs yet.
    - Reserve terrain around existing node anchors instead of moving nodes: keep the portal
  on a flat central clearing, keep hero spawn on flat west-central land, and fit the training
  grounds onto a raised terrace with stair access.
  - Replace the current edge-picker with explicit guide-driven autotile lookup tables:
    - Build separate lookup tables for flat-ground shoreline pieces, elevated top-surface
  pieces, cliff faces, isolated strip/endcap cases, and stair attachments.
    - Unsupported neighborhood shapes must be repaired out of the masks instead of falling
  back to concave tiles that reveal BG color.
    - Treat “water visible inside the main landmass” as invalid for overworld generation
  unless it is part of an intentional stair/cliff boundary.
  - Change shoreline overlays to follow the guide’s oversized-stamp model:
    - Foam is placed as `2x2` shoreline stamps, not per-side offset sprites.
    - Use the existing `192x192` foam frames at `0.5` scale so each stamp covers a `96x96`
  area, matching a `2x2` footprint on the `48x48` grid.
    - Emit foam only where ground or cliff directly touches water; randomize each stamp’s
  start frame.
    - Load and use the shadow asset the same way for elevated cliffs, shifted down by exactly
  one tile to create the guide’s height illusion.
  - Update [src/game/scenes/OverworldScene.ts](/c:/Users/samso/OneDrive/Desktop/Vibe/Web/
  living-heros/src/game/scenes/OverworldScene.ts) to consume `GeneratedTerrainMap` instead of
  hand-derived edge lists:
    - Render order: BG water, foam, flat ground, shadow, elevated ground, decorations, nodes,
  hero, HUD.
    - Walkability comes from `walkMask`; water, cliff faces, and overlay-only cells are not
  walkable; stair tiles and plateau tops are walkable.
    - Keep the current camera behavior, but reserve clear paths between spawn, portal,
  stairs, and training grounds.
  - Replace row-like decoration placement with terrain-aware clustering:
    - Bushes: choose `4-6` cluster centers on valid flat land and spawn `3-7` bushes per
  cluster with jittered offsets; reject placements that create straight rows, sit near
  shoreline, block stairs, or overlap node clearings.
    - Trees: place `3-4` groves instead of isolated evenly spaced singles.
    - Rocks: place a few shoreline accents and a few inland accents with spacing rules.
    - Keep explicit exclusion zones around nodes, stair landings, portal plaza, and the main
  travel corridor.

  ## Test Plan
  - Build validation:
    - `npm run build`
  - Deterministic generator checks:
    - Same seed returns the same `heightMap`, `tileLayers`, and overlay stamps.
    - Generated masks contain no enclosed water holes inside walkable land and no unsupported
  tile-neighborhood patterns.
  - Visual overworld checks:
    - No water-color rectangles or corner leaks appear inside grass areas.
    - Foam hugs the shoreline continuously and reads as shoreline contact, not detached side
  markers.
    - Elevated areas show proper shadow/cliff layering and stair attachment per the guide.
    - Bushes render in irregular clusters rather than rows or grids.
    - Portal, hero spawn, and training grounds are reachable on foot.
  - Regression checks:
    - Camera follow and HUD pinning still work.
    - BattleScene remains unchanged functionally.

  ## Assumptions
  - Fixed overworld seed remains `42`, and map size remains `40x30`.
  - “Smooth coast” means no 1-tile coves, notches, or internal water pockets in the main
  landmass.
  - “Multi-level island” in this pass means one raised land height with multiple plateau
  regions, not stacked multi-story terrain.
  - Existing node coordinates stay authoritative; terrain generation adapts around them
  rather than moving gameplay anchors.
  - Battle-map reuse is architectural only in this pass: shared generator types and layer
  helpers are reusable, but no battle generation behavior changes now.