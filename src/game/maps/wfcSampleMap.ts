import {
  AtlasKey,
  getAuthoredTileRules,
  getTerrainAtlasMapping,
  MappingWorkspace,
  TERRAIN_COLOR_ATLAS_KEYS,
} from './tileMapping';
import { buildTerrainGrammar, TerrainGrammarTile } from './terrainGrammar';
import type { ConstraintFailureDiagnostics } from './islandGenerator';

const EMPTY = '__empty__';
const CARDINALS: Array<{ direction: 'north' | 'east' | 'south' | 'west'; dr: number; dc: number }> = [
  { direction: 'north', dr: -1, dc: 0 },
  { direction: 'east', dr: 0, dc: 1 },
  { direction: 'south', dr: 1, dc: 0 },
  { direction: 'west', dr: 0, dc: -1 },
];

export interface WfcSampleTile {
  row: number;
  col: number;
  tileId: number;
  atlasKey: AtlasKey;
  terrainLevel: number;
}

export interface WfcSampleOverlay {
  kind: 'foam' | 'shadow';
  row: number;
  col: number;
  scale: number;
  terrainLevel: number;
}

export interface WfcSampleConflict {
  row: number;
  col: number;
}

export interface WfcSampleDecoration {
  kind: 'bush' | 'rock' | 'tree' | 'water-rock';
  layer: 'land' | 'water';
  row: number;
  col: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  src: string;
  textureKey?: string;
  animationKey?: string;
  frameCount: number;
  frameIndex: number;
  animated: boolean;
  animationDurationMs?: number;
  animationDelayMs?: number;
}

export interface WfcSampleMap {
  cols: number;
  rows: number;
  seed: number;
  randomness: number;
  flatTiles: WfcSampleTile[];
  elevatedTiles: WfcSampleTile[];
  foamStamps: WfcSampleOverlay[];
  shadowStamps: WfcSampleOverlay[];
  decorations: WfcSampleDecoration[];
  conflictCells: WfcSampleConflict[];
  flatConflictCells: WfcSampleConflict[];
  elevatedConflictCells: WfcSampleConflict[];
  stats: {
    landTiles: number;
    plateauTiles: number;
    ruleConflicts: number;
    maxTerrainLevel: number;
  };
  failureReason?: string;
  failureDiagnostics?: ConstraintFailureDiagnostics | null;
}

export interface WfcSampleOptions {
  seed?: number;
  cols?: number;
  rows?: number;
  randomness?: number;
}

interface WfcLayerOptions {
  width: number;
  height: number;
  candidates: TerrainGrammarTile[];
  rng: () => number;
  randomness: number;
  isAllowedCell: (row: number, col: number) => boolean;
  isForcedFilledCell?: (row: number, col: number) => boolean;
  validate?: (grid: Array<Array<TerrainGrammarTile | null>>) => boolean;
}

interface GrowthLayerOptions {
  width: number;
  height: number;
  candidates: TerrainGrammarTile[];
  rng: () => number;
  randomness: number;
  targetMask: boolean[][];
}

interface FixedMaskRuleSolveOptions extends GrowthLayerOptions {
  preferredTileIds?: Array<Array<number | null>>;
  maxSearchSteps?: number;
}

type TileOption = TerrainGrammarTile | null;
type ExpandingGridCell = TerrainGrammarTile | null | undefined;

interface StairPreviewSpec {
  col: number;
  topRow: number;
  variant: 'left' | 'right';
}

type StairPreviewList = StairPreviewSpec[];

interface ExpandingLayerOptions {
  width: number;
  height: number;
  candidates: TerrainGrammarTile[];
  rng: () => number;
  randomness: number;
  minTiles: number;
  maxTiles: number;
  allowedMask: boolean[][];
  seedCell: { row: number; col: number };
  shapeField?: number[][];
  extraCheck?: (grid: Array<Array<TerrainGrammarTile | null>>) => boolean;
}

interface SampleDecorationAsset {
  kind: WfcSampleDecoration['kind'];
  src: string;
  textureKey?: string;
  animationKey?: string;
  frameCount: number;
  animated: boolean;
  width: number;
  height: number;
  animationDurationMs?: number;
}

interface GeneratedPlateauLayer {
  terrainLevel: number;
  atlasKey: AtlasKey;
  supportMask: boolean[][];
  plateauMask: boolean[][];
  stairs: StairPreviewList;
  cliffBands: {
    land: boolean[][];
    water: boolean[][];
    mask: boolean[][];
  };
  topGrid: Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>>;
  renderedGrid: Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>>;
}

const SAMPLE_TREE_ASSETS: SampleDecorationAsset[] = [
  {
    kind: 'tree',
    src: '/assets/Terrain/Resources/Wood/Trees/Tree1.png',
    textureKey: 'tree-1',
    animationKey: 'tree-1-anim',
    frameCount: 8,
    animated: true,
    width: 1.85,
    height: 2.45,
    animationDurationMs: 1333,
  },
  {
    kind: 'tree',
    src: '/assets/Terrain/Resources/Wood/Trees/Tree2.png',
    textureKey: 'tree-2',
    animationKey: 'tree-2-anim',
    frameCount: 8,
    animated: true,
    width: 1.85,
    height: 2.45,
    animationDurationMs: 1333,
  },
  {
    kind: 'tree',
    src: '/assets/Terrain/Resources/Wood/Trees/Tree3.png',
    textureKey: 'tree-3',
    animationKey: 'tree-3-anim',
    frameCount: 8,
    animated: true,
    width: 1.55,
    height: 1.55,
    animationDurationMs: 1333,
  },
  {
    kind: 'tree',
    src: '/assets/Terrain/Resources/Wood/Trees/Tree4.png',
    textureKey: 'tree-4',
    animationKey: 'tree-4-anim',
    frameCount: 8,
    animated: true,
    width: 1.55,
    height: 1.55,
    animationDurationMs: 1333,
  },
];

const SAMPLE_BUSH_ASSETS: SampleDecorationAsset[] = [
  {
    kind: 'bush',
    src: '/assets/Terrain/Decorations/Bushes/Bushe1.png',
    textureKey: 'terrain-bush-1-sheet',
    animationKey: 'terrain-bush-1-anim',
    frameCount: 8,
    animated: true,
    width: 0.78,
    height: 0.78,
    animationDurationMs: 1333,
  },
  {
    kind: 'bush',
    src: '/assets/Terrain/Decorations/Bushes/Bushe2.png',
    textureKey: 'terrain-bush-2-sheet',
    animationKey: 'terrain-bush-2-anim',
    frameCount: 8,
    animated: true,
    width: 0.78,
    height: 0.78,
    animationDurationMs: 1333,
  },
  {
    kind: 'bush',
    src: '/assets/Terrain/Decorations/Bushes/Bushe3.png',
    textureKey: 'terrain-bush-3-sheet',
    animationKey: 'terrain-bush-3-anim',
    frameCount: 8,
    animated: true,
    width: 0.78,
    height: 0.78,
    animationDurationMs: 1333,
  },
  {
    kind: 'bush',
    src: '/assets/Terrain/Decorations/Bushes/Bushe4.png',
    textureKey: 'terrain-bush-4-sheet',
    animationKey: 'terrain-bush-4-anim',
    frameCount: 8,
    animated: true,
    width: 0.78,
    height: 0.78,
    animationDurationMs: 1333,
  },
];

const SAMPLE_ROCK_ASSETS: SampleDecorationAsset[] = [
  { kind: 'rock', src: '/assets/Terrain/Decorations/Rocks/Rock1.png', textureKey: 'terrain-rock-1', frameCount: 1, animated: false, width: 0.62, height: 0.62 },
  { kind: 'rock', src: '/assets/Terrain/Decorations/Rocks/Rock2.png', textureKey: 'terrain-rock-2', frameCount: 1, animated: false, width: 0.62, height: 0.62 },
  { kind: 'rock', src: '/assets/Terrain/Decorations/Rocks/Rock3.png', textureKey: 'terrain-rock-3', frameCount: 1, animated: false, width: 0.62, height: 0.62 },
  { kind: 'rock', src: '/assets/Terrain/Decorations/Rocks/Rock4.png', textureKey: 'terrain-rock-4', frameCount: 1, animated: false, width: 0.62, height: 0.62 },
];

const SAMPLE_WATER_ROCK_ASSETS: SampleDecorationAsset[] = [
  {
    kind: 'water-rock',
    src: '/assets/Terrain/Decorations/Rocks in the Water/Water Rocks_01.png',
    textureKey: 'water-rock-1',
    animationKey: 'water-rock-1-anim',
    frameCount: 16,
    animated: true,
    width: 0.7,
    height: 0.7,
    animationDurationMs: 2666,
  },
  {
    kind: 'water-rock',
    src: '/assets/Terrain/Decorations/Rocks in the Water/Water Rocks_02.png',
    textureKey: 'water-rock-2',
    animationKey: 'water-rock-2-anim',
    frameCount: 16,
    animated: true,
    width: 0.7,
    height: 0.7,
    animationDurationMs: 2666,
  },
  {
    kind: 'water-rock',
    src: '/assets/Terrain/Decorations/Rocks in the Water/Water Rocks_03.png',
    textureKey: 'water-rock-3',
    animationKey: 'water-rock-3-anim',
    frameCount: 16,
    animated: true,
    width: 0.7,
    height: 0.7,
    animationDurationMs: 2666,
  },
];

export function generateWfcSampleMap(
  workspace: MappingWorkspace,
  options: WfcSampleOptions = {},
): WfcSampleMap {
  const seed = options.seed ?? Date.now();
  const cols = Math.max(10, Math.floor(options.cols ?? 18));
  const rows = Math.max(8, Math.floor(options.rows ?? 12));
  const randomness = clamp01(options.randomness ?? 0.35);
  const rng = mulberry32(seed);
  const flatAtlasKey = pickRandomAtlasKey(rng);
  const usedAtlasKeys = new Set<AtlasKey>([flatAtlasKey]);
  const elevatedAtlasKey = pickRandomAtlasKeyAvoiding(rng, usedAtlasKeys);
  usedAtlasKeys.add(elevatedAtlasKey);
  const grammar = buildTerrainGrammar(workspace);
  const mapping = getTerrainAtlasMapping(workspace);
  const flatCandidates = grammar.tiles.filter(
    (tile) => tile.templateKey === 'flat-guide' && tile.selfSocket === 'flat',
  );
  const flatMask = buildNoiseIslandMask(cols, rows, seed + 41, randomness);
  if (countTrue(flatMask) === 0) {
    return buildFailedSampleMap(
      cols,
      rows,
      seed,
      randomness,
      'The occupancy generator could not build a valid island footprint from the current settings.',
    );
  }
  const { grid: baseFlatGrid, failureReason: baseFlatFailureReason } = solveFlatMaskPlacement(
    flatMask,
    flatCandidates,
    seed + 211,
    randomness,
    mapping,
    flatAtlasKey,
    cols,
    rows,
  );

  const plateauAllowance = (() => {
    const interior = buildInteriorMask(flatMask);
    return countTrue(interior) > 0 ? interior : buildPlateauAllowance(flatMask);
  })();
  const basePlateauMask = buildNoisePlateauMask(flatMask, plateauAllowance, seed + 97, randomness);
  if (countTrue(basePlateauMask) === 0) {
    return buildFlatOnlyPlacedSampleMap(
      workspace,
      cols,
      rows,
      seed,
      randomness,
      baseFlatGrid,
      flatMask,
      flatAtlasKey,
      baseFlatFailureReason ??
        'The occupancy generator could not find a supported elevated area inside the island.',
    );
  }

  const plateauAttempts = buildPlateauMaskAttempts(
    flatMask,
    plateauAllowance,
    basePlateauMask,
    seed + 197,
    randomness,
    rng,
  );
  const elevatedTopCandidates = grammar.tiles.filter(
    (tile) => tile.layerLevel === 2 && tile.selfSocket === 'elevated',
  );

  let chosenFlatMask = flatMask;
  let chosenFlatGrid = baseFlatGrid;
  let chosenFlatFailureReason = baseFlatFailureReason;
  let chosenLevel2: GeneratedPlateauLayer | null = null;

  for (let attemptIndex = 0; attemptIndex < plateauAttempts.length; attemptIndex++) {
    const plateauResult = ensurePlateauEntry(
      flatMask,
      plateauAttempts[attemptIndex],
      elevatedTopCandidates,
      mulberry32(seed + 1337 + attemptIndex * 37),
      randomness,
    );
    const plateauMask = plateauResult.mask;
    const stairs = plateauResult.stairs;
    if (countTrue(plateauMask) === 0) {
      continue;
    }

    const attemptFlatMask = stairs.length > 0 ? widenFlatMaskForStairs(flatMask, stairs) : flatMask;
    const { grid: attemptFlatGrid, failureReason: attemptFlatFailureReason } = areMasksEqual(
      attemptFlatMask,
      flatMask,
    )
      ? { grid: baseFlatGrid, failureReason: baseFlatFailureReason }
      : solveFlatMaskPlacement(
          attemptFlatMask,
          flatCandidates,
          seed + 211 + attemptIndex * 13,
          randomness,
          mapping,
          flatAtlasKey,
          cols,
          rows,
        );

    const cliffBands = buildSampleCliffBands(attemptFlatMask, plateauMask, stairs, 2);
    const deterministicElevatedTopGrid = buildElevatedTopPreferenceGrid(
      plateauMask,
      mapping,
      elevatedAtlasKey,
      stairs,
    );
    const elevatedTopRuleGrid = solveFixedMaskRuleLayer({
      width: cols,
      height: rows,
      candidates: elevatedTopCandidates,
      rng: mulberry32(seed + 503 + attemptIndex * 19),
      randomness,
      targetMask: plateauMask,
      preferredTileIds: extractTileIdGrid(deterministicElevatedTopGrid),
      maxSearchSteps: Math.max(5000, cols * rows * 220),
    });

    if (!elevatedTopRuleGrid) {
      chosenFlatMask = attemptFlatMask;
      chosenFlatGrid = attemptFlatGrid;
      chosenFlatFailureReason = attemptFlatFailureReason;
      continue;
    }

    chosenFlatMask = attemptFlatMask;
    chosenFlatGrid = attemptFlatGrid;
    chosenFlatFailureReason = attemptFlatFailureReason;
    const topGrid = retintPlacedGrid(projectPlacedRuleGrid(elevatedTopRuleGrid), elevatedAtlasKey);
    chosenLevel2 = {
      terrainLevel: 2,
      atlasKey: elevatedAtlasKey,
      supportMask: chosenFlatMask,
      plateauMask,
      stairs,
      cliffBands,
      topGrid,
      renderedGrid: buildElevatedGrid(
        elevatedTopRuleGrid,
        plateauMask,
        cliffBands,
        stairs,
        mapping,
        elevatedAtlasKey,
      ),
    };
    break;
  }

  if (!chosenLevel2) {
    return buildFlatOnlyPlacedSampleMap(
      workspace,
      cols,
      rows,
      seed,
      randomness,
      chosenFlatGrid,
      chosenFlatMask,
      flatAtlasKey,
      [
        chosenFlatFailureReason,
        'Layer 2 occupancy was generated, but explicit elevated/cliff/stair rules could not satisfy it. No deterministic layer 2 fallback was used.',
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  const generatedPlateauLayers: GeneratedPlateauLayer[] = [chosenLevel2];
  let currentSupportTopMask = chosenLevel2.plateauMask;
  let currentSupportSurfaceMask = buildOccupiedMaskFromRenderedGrid(chosenLevel2.renderedGrid);
  let previousAtlasKey = chosenLevel2.atlasKey;

  for (let terrainLevel = 3; terrainLevel <= 4; terrainLevel++) {
    const nextAllowance = (() => {
      const interior = buildInteriorMask(currentSupportTopMask);
      return countTrue(interior) > 0 ? interior : buildPlateauAllowance(currentSupportTopMask);
    })();
    if (countTrue(nextAllowance) < 4) {
      break;
    }

    const sizeMultiplier = Math.max(0.62, 1.02 - (terrainLevel - 2) * 0.14 + rng() * 0.26);
    const baseMask = buildNoisePlateauMask(
      currentSupportTopMask,
      nextAllowance,
      seed + terrainLevel * 97,
      randomness,
      sizeMultiplier,
    );
    if (countTrue(baseMask) === 0) {
      break;
    }

    const attempts = buildPlateauMaskAttempts(
      currentSupportTopMask,
      nextAllowance,
      baseMask,
      seed + terrainLevel * 197,
      randomness,
      mulberry32(seed + terrainLevel * 613),
    );

    let chosenUpperLevel: GeneratedPlateauLayer | null = null;
    const levelAtlasKey = pickRandomAtlasKeyAvoiding(rng, usedAtlasKeys);
    for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex++) {
      const plateauResult = ensurePlateauEntry(
        currentSupportTopMask,
        attempts[attemptIndex],
        elevatedTopCandidates,
        mulberry32(seed + terrainLevel * 1337 + attemptIndex * 37),
        randomness,
      );
      const plateauMask = plateauResult.mask;
      const stairs = plateauResult.stairs;
      if (countTrue(plateauMask) === 0) {
        continue;
      }

      const cliffBands = buildSampleCliffBands(currentSupportSurfaceMask, plateauMask, stairs, terrainLevel);
      const deterministicElevatedTopGrid = buildElevatedTopPreferenceGrid(
        plateauMask,
        mapping,
        levelAtlasKey,
        stairs,
      );
      const elevatedTopRuleGrid = solveFixedMaskRuleLayer({
        width: cols,
        height: rows,
        candidates: elevatedTopCandidates,
        rng: mulberry32(seed + terrainLevel * 503 + attemptIndex * 19),
        randomness,
        targetMask: plateauMask,
        preferredTileIds: extractTileIdGrid(deterministicElevatedTopGrid),
        maxSearchSteps: Math.max(5000, cols * rows * 220),
      });

      if (!elevatedTopRuleGrid) {
        continue;
      }

      const topGrid = retintPlacedGrid(projectPlacedRuleGrid(elevatedTopRuleGrid), levelAtlasKey);
      chosenUpperLevel = {
        terrainLevel,
        atlasKey: levelAtlasKey,
        supportMask: currentSupportTopMask,
        plateauMask,
        stairs,
        cliffBands,
        topGrid,
        renderedGrid: buildElevatedGrid(
          elevatedTopRuleGrid,
          plateauMask,
          cliffBands,
          stairs,
          mapping,
          levelAtlasKey,
        ),
      };
      break;
    }

    if (!chosenUpperLevel) {
      break;
    }

    const supportLayer = generatedPlateauLayers[generatedPlateauLayers.length - 1];
    tryExpandSupportLayerForUpperStairs(
      supportLayer,
      chosenUpperLevel.stairs,
      elevatedTopCandidates,
      mapping,
      seed + terrainLevel * 761,
      randomness,
      cols,
      rows,
    );

    generatedPlateauLayers.push(chosenUpperLevel);
    currentSupportTopMask = chosenUpperLevel.plateauMask;
    currentSupportSurfaceMask = buildOccupiedMaskFromRenderedGrid(chosenUpperLevel.renderedGrid);
    previousAtlasKey = chosenUpperLevel.atlasKey;
    usedAtlasKeys.add(chosenUpperLevel.atlasKey);
  }

  const flatTiles = flattenPlacedTileIds(chosenFlatGrid, flatAtlasKey, 1);
  const elevatedTiles = generatedPlateauLayers.flatMap((layer) =>
    flattenPlacedTileIds(layer.renderedGrid, layer.atlasKey, layer.terrainLevel),
  );
  const totalCliffMask = createBoolGrid(rows, cols, false);
  const totalPlateauMask = createBoolGrid(rows, cols, false);
  const allStairs = generatedPlateauLayers.flatMap((layer) => layer.stairs);
  const shadowStamps = generatedPlateauLayers.flatMap((layer) =>
    buildSampleShadowStamps(
      layer.plateauMask,
      layer.supportMask,
      layer.stairs,
      layer.terrainLevel,
    ),
  );
  for (const layer of generatedPlateauLayers) {
    applyMask(totalCliffMask, layer.cliffBands.mask, true);
    applyMask(totalPlateauMask, layer.plateauMask, true);
  }
  const foamStamps = buildSampleFoamStamps(chosenFlatMask, totalCliffMask);
  const decorations = buildSampleDecorations(
    chosenFlatMask,
    totalPlateauMask,
    totalCliffMask,
    allStairs,
    seed,
  );
  const conflictAudit = buildConflictAudit(workspace, chosenFlatGrid, generatedPlateauLayers);
  return {
    cols,
    rows,
    seed,
    randomness,
    flatTiles,
    elevatedTiles,
    foamStamps,
    shadowStamps,
    decorations,
    conflictCells: conflictAudit.cells,
    flatConflictCells: conflictAudit.flatCells,
    elevatedConflictCells: conflictAudit.elevatedCells,
    stats: {
      landTiles: flatTiles.length,
      plateauTiles: elevatedTiles.length,
      ruleConflicts: conflictAudit.count,
      maxTerrainLevel: Math.max(1, ...generatedPlateauLayers.map((layer) => layer.terrainLevel)),
    },
    failureReason: chosenFlatFailureReason ?? undefined,
    failureDiagnostics: null,
  };
}

function buildFailedSampleMap(
  cols: number,
  rows: number,
  seed: number,
  randomness: number,
  failureReason: string,
): WfcSampleMap {
  return {
    cols,
    rows,
    seed,
    randomness,
    flatTiles: [],
    elevatedTiles: [],
    foamStamps: [],
    shadowStamps: [],
    decorations: [],
    conflictCells: [],
    flatConflictCells: [],
    elevatedConflictCells: [],
    stats: {
      landTiles: 0,
      plateauTiles: 0,
      ruleConflicts: 0,
      maxTerrainLevel: 1,
    },
    failureReason,
    failureDiagnostics: null,
  };
}

function buildFlatOnlyPlacedSampleMap(
  workspace: MappingWorkspace,
  cols: number,
  rows: number,
  seed: number,
  randomness: number,
  flatGrid: Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>>,
  flatMask: boolean[][],
  _flatAtlasKey: AtlasKey,
  failureReason: string,
): WfcSampleMap {
  const elevatedGrid = createTileGrid<{ tileId: number; atlasKey: AtlasKey } | null>(rows, cols, null);
  const conflictAudit = buildConflictAudit(workspace, flatGrid, []);
  const flatTiles = flattenPlacedTileIds(flatGrid, 'terrain-tileset', 1);

  return {
    cols,
    rows,
    seed,
    randomness,
    flatTiles,
    elevatedTiles: [],
    foamStamps: buildSampleFoamStamps(flatMask, createBoolGrid(rows, cols, false)),
    shadowStamps: [],
    decorations: buildSampleDecorations(
      flatMask,
      createBoolGrid(rows, cols, false),
      createBoolGrid(rows, cols, false),
      [],
      seed,
    ),
    conflictCells: conflictAudit.cells,
    flatConflictCells: conflictAudit.flatCells,
    elevatedConflictCells: conflictAudit.elevatedCells,
    stats: {
      landTiles: flatTiles.length,
      plateauTiles: 0,
      ruleConflicts: conflictAudit.count,
      maxTerrainLevel: 1,
    },
    failureReason,
    failureDiagnostics: null,
  };
}

function solveFlatMaskPlacement(
  flatMask: boolean[][],
  flatCandidates: TerrainGrammarTile[],
  seed: number,
  randomness: number,
  mapping: ReturnType<typeof getTerrainAtlasMapping>,
  flatAtlasKey: AtlasKey,
  cols: number,
  rows: number,
): {
  grid: Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>>;
  failureReason: string | null;
} {
  const emptyMask = createBoolGrid(rows, cols, false);
  const deterministicFlatGrid = buildFlatGrid(
    flatMask,
    emptyMask,
    emptyMask,
    mapping,
    flatAtlasKey,
  );
  const flatRuleGrid = solveFixedMaskRuleLayer({
    width: cols,
    height: rows,
    candidates: flatCandidates,
    rng: mulberry32(seed),
    randomness,
    targetMask: flatMask,
    preferredTileIds: extractTileIdGrid(deterministicFlatGrid),
    maxSearchSteps: Math.max(4000, cols * rows * 160),
  });

  return {
    grid: flatRuleGrid
      ? retintPlacedGrid(projectPlacedRuleGrid(flatRuleGrid), flatAtlasKey)
      : deterministicFlatGrid,
    failureReason: flatRuleGrid
      ? null
      : 'Flat occupancy was generated, but explicit flat tile rules could not fully repair the flat layer. Using deterministic flat autotiling fallback.',
  };
}

function collapseWfcLayer(
  options: WfcLayerOptions,
  attempts: number,
): Array<Array<TerrainGrammarTile | null>> | null {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = tryCollapseWfcLayer(options);
    if (result && (!options.validate || options.validate(result))) {
      return result;
    }
  }

  return null;
}

function tryCollapseWfcLayer(options: WfcLayerOptions): Array<Array<TerrainGrammarTile | null>> | null {
  const allStates = [EMPTY, ...options.candidates.map((tile) => tile.key)];
  const tileByKey = new Map(options.candidates.map((tile) => [tile.key, tile]));
  const stateGrid = Array.from({ length: options.height }, (_, row) =>
    Array.from({ length: options.width }, (_, col) => {
      if (!options.isAllowedCell(row, col)) {
        return new Set<string>([EMPTY]);
      }
      if (options.isForcedFilledCell?.(row, col)) {
        return new Set<string>(options.candidates.map((tile) => tile.key));
      }
      return new Set<string>(allStates);
    }),
  );

  if (!propagateStateGrid(stateGrid, tileByKey)) {
    return null;
  }

  while (true) {
    const target = pickLowestEntropyCell(stateGrid, options.rng);
    if (!target) {
      return stateGrid.map((row) => row.map((cell) => resolveSingleState(cell, tileByKey)));
    }

    const choices = [...stateGrid[target.row][target.col]];
    const picked = weightedPick(
      choices,
      options.rng,
      (state) =>
        getStateWeight(
          state,
          target.row,
          target.col,
          options.width,
          options.height,
          tileByKey,
          options.randomness,
        ),
    );
    stateGrid[target.row][target.col] = new Set([picked]);

    if (!propagateStateGrid(stateGrid, tileByKey, [{ row: target.row, col: target.col }])) {
      return null;
    }
  }
}

function propagateStateGrid(
  stateGrid: Set<string>[][],
  tileByKey: Map<string, TerrainGrammarTile>,
  seeds: Array<{ row: number; col: number }> = [],
): boolean {
  const height = stateGrid.length;
  const width = stateGrid[0]?.length ?? 0;
  const queue = seeds.length > 0 ? [...seeds] : buildCellQueue(height, width);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentStates = stateGrid[current.row][current.col];

    for (const { direction, dr, dc } of CARDINALS) {
      const nextRow = current.row + dr;
      const nextCol = current.col + dc;
      if (nextRow < 0 || nextCol < 0 || nextRow >= height || nextCol >= width) {
        continue;
      }

      const neighborStates = stateGrid[nextRow][nextCol];
      const nextStates = new Set(
        [...neighborStates].filter((neighborState) =>
          [...currentStates].some((currentState) =>
            areStatesCompatible(currentState, neighborState, direction, tileByKey),
          ),
        ),
      );

      if (nextStates.size === 0) {
        return false;
      }

      if (nextStates.size !== neighborStates.size) {
        stateGrid[nextRow][nextCol] = nextStates;
        queue.push({ row: nextRow, col: nextCol });
      }
    }
  }

  return true;
}

function areStatesCompatible(
  sourceState: string,
  candidateState: string,
  direction: 'north' | 'east' | 'south' | 'west',
  tileByKey: Map<string, TerrainGrammarTile>,
): boolean {
  const source = sourceState === EMPTY ? null : tileByKey.get(sourceState) ?? null;
  const candidate = candidateState === EMPTY ? null : tileByKey.get(candidateState) ?? null;
  const opposite = oppositeDirection(direction);

  if (!source && !candidate) {
    return true;
  }
  if (!source && candidate) {
    return candidate.adjacencyRules[opposite].length === 0;
  }
  if (source && !candidate) {
    return source.adjacencyRules[direction].length === 0;
  }
  if (!source || !candidate) {
    return false;
  }

  return (
    source.adjacencyRules[direction].includes(candidate.tileId) &&
    candidate.adjacencyRules[opposite].includes(source.tileId)
  );
}

function pickLowestEntropyCell(stateGrid: Set<string>[][], rng: () => number): { row: number; col: number } | null {
  let best: Array<{ row: number; col: number }> = [];
  let bestEntropy = Number.POSITIVE_INFINITY;

  for (let row = 0; row < stateGrid.length; row++) {
    for (let col = 0; col < stateGrid[row].length; col++) {
      const entropy = stateGrid[row][col].size;
      if (entropy <= 1) {
        continue;
      }
      if (entropy < bestEntropy) {
        bestEntropy = entropy;
        best = [{ row, col }];
      } else if (entropy === bestEntropy) {
        best.push({ row, col });
      }
    }
  }

  if (best.length === 0) {
    return null;
  }

  return best[Math.floor(rng() * best.length)];
}

function resolveSingleState(
  states: Set<string>,
  tileByKey: Map<string, TerrainGrammarTile>,
): TerrainGrammarTile | null {
  const value = [...states][0];
  if (!value || value === EMPTY) {
    return null;
  }
  return tileByKey.get(value) ?? null;
}

function getStateWeight(
  state: string,
  row: number,
  col: number,
  width: number,
  height: number,
  tileByKey: Map<string, TerrainGrammarTile>,
  randomness: number,
): number {
  const dx = Math.abs(col + 0.5 - width / 2) / Math.max(1, width / 2);
  const dy = Math.abs(row + 0.5 - height / 2) / Math.max(1, height / 2);
  const centerBias = 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy));
  const flattenedCenterBias = 1 + centerBias * (1.9 - randomness * 1.35);

  if (state === EMPTY) {
    return 0.45 + (1 - centerBias) * (1.6 + randomness * 2.8);
  }

  const tile = tileByKey.get(state);
  if (!tile) {
    return 1;
  }

  let baseWeight = 1.5 + centerBias;
  if (tile.tags.includes('center')) baseWeight = 4.5 + centerBias * 2;
  else if (tile.tags.includes('edge') || tile.tags.includes('lip')) baseWeight = 2.5 + centerBias;
  else if (tile.tags.includes('corner')) baseWeight = 1.8 + centerBias * 0.4;
  else if (tile.tags.includes('single')) baseWeight = 0.8 + centerBias * 0.2;

  return 1 + (baseWeight - 1) * (1 - randomness * 0.72) * flattenedCenterBias;
}

function weightedPick<T>(items: T[], rng: () => number, getWeight: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + Math.max(0.01, getWeight(item)), 0);
  let cursor = rng() * total;

  for (const item of items) {
    cursor -= Math.max(0.01, getWeight(item));
    if (cursor <= 0) {
      return item;
    }
  }

  return items[items.length - 1];
}

function buildCellQueue(height: number, width: number): Array<{ row: number; col: number }> {
  const queue: Array<{ row: number; col: number }> = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      queue.push({ row, col });
    }
  }
  return queue;
}

function countFilled(grid: Array<Array<TileOption>>): number {
  return grid.reduce(
    (sum, row) => sum + row.reduce((rowSum, tile) => rowSum + (tile ? 1 : 0), 0),
    0,
  );
}

function solveExpandingLayer(
  options: ExpandingLayerOptions,
): Array<Array<TerrainGrammarTile | null>> | null {
  const regionTileIds = new Set(options.candidates.map((tile) => tile.tileId));
  const seedCandidates = pickSeedCandidates(options.candidates, regionTileIds);
  if (
    seedCandidates.length === 0 ||
    !options.allowedMask[options.seedCell.row]?.[options.seedCell.col]
  ) {
    return null;
  }

  const attempts = Math.max(96, options.width * options.height);

  for (let attempt = 0; attempt < attempts; attempt++) {
    const grid = createExpandingGrid(options.height, options.width);
    const required = new Set<string>();
    initializeBlockedCells(grid, options.allowedMask);

    const orderedSeeds = orderExpandingCandidates(
      seedCandidates,
      options.seedCell.row,
      options.seedCell.col,
      grid,
      options.allowedMask,
      options.shapeField,
      regionTileIds,
      options.width,
      options.height,
      options.randomness,
      options.rng,
      1,
    );

    for (const seedTile of orderedSeeds) {
      const nextGrid = cloneExpandingGrid(grid);
      const nextRequired = new Set(required);
      if (
        !placeExpandingTile(
          nextGrid,
          nextRequired,
          options.allowedMask,
          regionTileIds,
          options.seedCell.row,
          options.seedCell.col,
          seedTile,
        )
      ) {
        continue;
      }

      const solved = searchExpandingLayer(
        nextGrid,
        nextRequired,
        options,
        regionTileIds,
        1,
      );
      if (solved) {
        return solved;
      }
    }
  }

  return null;
}

function searchExpandingLayer(
  grid: ExpandingGridCell[][],
  required: Set<string>,
  options: ExpandingLayerOptions,
  regionTileIds: Set<number>,
  placedCount: number,
): Array<Array<TerrainGrammarTile | null>> | null {
  if (placedCount > options.maxTiles) {
    return null;
  }

  if (required.size === 0) {
    const finalized = finalizeExpandingGrid(grid);
    if (countFilled(finalized) < options.minTiles) {
      return null;
    }
    return options.extraCheck && !options.extraCheck(finalized) ? null : finalized;
  }

  const next = pickNextRequiredCell(grid, required, options, regionTileIds);
  if (!next || next.candidates.length === 0) {
    return null;
  }

  const orderedCandidates = orderExpandingCandidates(
    next.candidates,
    next.row,
    next.col,
    grid,
    options.allowedMask,
    options.shapeField,
    regionTileIds,
    options.width,
    options.height,
    options.randomness,
    options.rng,
    placedCount,
  );

  for (const candidate of orderedCandidates) {
    const nextGrid = cloneExpandingGrid(grid);
    const nextRequired = new Set(required);
    if (
      !placeExpandingTile(
        nextGrid,
        nextRequired,
        options.allowedMask,
        regionTileIds,
        next.row,
        next.col,
        candidate,
      )
    ) {
      continue;
    }

    const solved = searchExpandingLayer(
      nextGrid,
      nextRequired,
      options,
      regionTileIds,
      placedCount + 1,
    );
    if (solved) {
      return solved;
    }
  }

  return null;
}

function createExpandingGrid(height: number, width: number): ExpandingGridCell[][] {
  return Array.from({ length: height }, () => Array<ExpandingGridCell>(width).fill(undefined));
}

function initializeBlockedCells(
  grid: ExpandingGridCell[][],
  allowedMask: boolean[][],
): void {
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      if (!allowedMask[row][col]) {
        grid[row][col] = null;
      }
    }
  }
}

function cloneExpandingGrid(grid: ExpandingGridCell[][]): ExpandingGridCell[][] {
  return grid.map((row) => [...row]);
}

function finalizeExpandingGrid(
  grid: ExpandingGridCell[][],
): Array<Array<TerrainGrammarTile | null>> {
  return grid.map((row) => row.map((cell) => (cell ?? null)));
}

function pickSeedCandidates(
  candidates: TerrainGrammarTile[],
  regionTileIds: Set<number>,
): TerrainGrammarTile[] {
  const fourOpen = candidates.filter((tile) =>
    CARDINALS.every(({ direction }) => hasRegionalOpening(tile, direction, regionTileIds)),
  );
  if (fourOpen.length > 0) {
    return fourOpen;
  }

  let bestOpenCount = -1;
  for (const tile of candidates) {
    const openCount = countRegionalOpenSides(tile, regionTileIds);
    bestOpenCount = Math.max(bestOpenCount, openCount);
  }

  return candidates.filter(
    (tile) => countRegionalOpenSides(tile, regionTileIds) === bestOpenCount,
  );
}

function countRegionalOpenSides(
  tile: TerrainGrammarTile,
  regionTileIds: Set<number>,
): number {
  return CARDINALS.reduce(
    (sum, { direction }) =>
      sum + (hasRegionalOpening(tile, direction, regionTileIds) ? 1 : 0),
    0,
  );
}

function hasRegionalOpening(
  tile: TerrainGrammarTile,
  direction: 'north' | 'east' | 'south' | 'west',
  regionTileIds: Set<number>,
): boolean {
  return tile.adjacencyRules[direction].some((tileId) => regionTileIds.has(tileId));
}

function pickNextRequiredCell(
  grid: ExpandingGridCell[][],
  required: Set<string>,
  options: ExpandingLayerOptions,
  regionTileIds: Set<number>,
): { row: number; col: number; candidates: TerrainGrammarTile[] } | null {
  let best:
    | {
        row: number;
        col: number;
        candidates: TerrainGrammarTile[];
        score: number;
      }
    | null = null;

  for (const key of required) {
    const [row, col] = key.split(',').map((value) => Number(value));
    const candidates = getExpandingCandidates(
      row,
      col,
      grid,
      options.allowedMask,
      options.candidates,
      regionTileIds,
    );
    if (candidates.length === 0) {
      return null;
    }

    const distance =
      Math.abs(row + 0.5 - options.height / 2) +
      Math.abs(col + 0.5 - options.width / 2);
    const shapeBias = getShapeValue(options.shapeField, row, col);
    const score = candidates.length * 100 + distance - shapeBias * 35;

    if (!best || score < best.score) {
      best = { row, col, candidates, score };
    }
  }

  return best
    ? { row: best.row, col: best.col, candidates: best.candidates }
    : null;
}

function getExpandingCandidates(
  row: number,
  col: number,
  grid: ExpandingGridCell[][],
  allowedMask: boolean[][],
  candidates: TerrainGrammarTile[],
  regionTileIds: Set<number>,
): TerrainGrammarTile[] {
  if (!allowedMask[row]?.[col]) {
    return [];
  }

  const existing = grid[row][col];
  if (existing === null) {
    return [];
  }
  if (existing) {
    return [existing];
  }

  return candidates.filter((candidate) => {
    for (const { direction, dr, dc } of CARDINALS) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      const isOpen = hasRegionalOpening(candidate, direction, regionTileIds);

      if (
        !hasInBounds(nextRow, nextCol, grid.length, grid[0]?.length ?? 0) ||
        !allowedMask[nextRow][nextCol]
      ) {
        if (isOpen) {
          return false;
        }
        continue;
      }

      const neighbor = grid[nextRow][nextCol];
      if (neighbor === null) {
        if (isOpen) {
          return false;
        }
        continue;
      }

      if (!neighbor) {
        continue;
      }

      if (
        !candidate.adjacencyRules[direction].includes(neighbor.tileId) ||
        !neighbor.adjacencyRules[oppositeDirection(direction)].includes(candidate.tileId)
      ) {
        return false;
      }
    }

    return true;
  });
}

function placeExpandingTile(
  grid: ExpandingGridCell[][],
  required: Set<string>,
  allowedMask: boolean[][],
  regionTileIds: Set<number>,
  row: number,
  col: number,
  tile: TerrainGrammarTile,
): boolean {
  const existing = grid[row][col];
  if (existing === null) {
    return false;
  }
  if (existing && existing.key !== tile.key) {
    return false;
  }

  grid[row][col] = tile;
  required.delete(`${row},${col}`);

  for (const { direction, dr, dc } of CARDINALS) {
    const nextRow = row + dr;
    const nextCol = col + dc;
    const nextKey = `${nextRow},${nextCol}`;
    const isOpen = hasRegionalOpening(tile, direction, regionTileIds);

    if (
      !hasInBounds(nextRow, nextCol, grid.length, grid[0]?.length ?? 0) ||
      !allowedMask[nextRow][nextCol]
    ) {
      if (isOpen) {
        return false;
      }
      continue;
    }

    const neighbor = grid[nextRow][nextCol];
    if (isOpen) {
      if (neighbor === null) {
        return false;
      }
      if (neighbor) {
        if (
          !tile.adjacencyRules[direction].includes(neighbor.tileId) ||
          !neighbor.adjacencyRules[oppositeDirection(direction)].includes(tile.tileId)
        ) {
          return false;
        }
      } else {
        required.add(nextKey);
      }
      continue;
    }

    if (neighbor) {
      return false;
    }
    if (required.has(nextKey)) {
      return false;
    }
    grid[nextRow][nextCol] = null;
  }

  return true;
}

function orderExpandingCandidates(
  candidates: TerrainGrammarTile[],
  row: number,
  col: number,
  grid: ExpandingGridCell[][],
  allowedMask: boolean[][],
  shapeField: number[][] | undefined,
  regionTileIds: Set<number>,
  width: number,
  height: number,
  randomness: number,
  rng: () => number,
  placedCount: number,
): TerrainGrammarTile[] {
  const ranked = candidates.map((candidate) => ({
    candidate,
    score: scoreExpandingCandidate(
      candidate,
      row,
      col,
      grid,
      allowedMask,
      shapeField,
      regionTileIds,
      width,
      height,
      randomness,
      placedCount,
    ),
    tie: rng(),
  }));

  ranked.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    return left.tie - right.tie;
  });

  return ranked.map((entry) => entry.candidate);
}

function scoreExpandingCandidate(
  candidate: TerrainGrammarTile,
  row: number,
  col: number,
  grid: ExpandingGridCell[][],
  allowedMask: boolean[][],
  shapeField: number[][] | undefined,
  regionTileIds: Set<number>,
  width: number,
  height: number,
  randomness: number,
  placedCount: number,
): number {
  const openSides = countRegionalOpenSides(candidate, regionTileIds);
  const placedNeighbors = CARDINALS.reduce((sum, { dr, dc }) => {
    const nextRow = row + dr;
    const nextCol = col + dc;
    return sum + (hasInBounds(nextRow, nextCol, grid.length, grid[0]?.length ?? 0) && !!grid[nextRow][nextCol] ? 1 : 0);
  }, 0);
  const centerDistance =
    Math.abs(row + 0.5 - height / 2) / Math.max(1, height / 2) +
    Math.abs(col + 0.5 - width / 2) / Math.max(1, width / 2);
  const normalizedDistance = Math.min(1, centerDistance / 2);
  const shapeValue = getShapeValue(shapeField, row, col) || (1 - normalizedDistance);
  const desiredOpenSides =
    placedCount < 3
      ? 4
      : shapeValue > 0.72
        ? 4
        : shapeValue > 0.48
          ? 3
          : shapeValue > 0.24
            ? 2
            : 1;
  const opennessScore = 6 - Math.abs(openSides - desiredOpenSides) * 2.25;
  const borderScore = CARDINALS.reduce((sum, { direction, dr, dc }) => {
    const nextRow = row + dr;
    const nextCol = col + dc;
    const outside =
      !hasInBounds(nextRow, nextCol, grid.length, grid[0]?.length ?? 0) ||
      !allowedMask[nextRow][nextCol];
    if (!outside) {
      return sum;
    }
    return sum + (hasRegionalOpening(candidate, direction, regionTileIds) ? -4 : 1.4);
  }, 0);
  const stabilityScore = placedNeighbors * 1.8;
  const directionalBias = CARDINALS.reduce((sum, { direction, dr, dc }) => {
    const nextRow = row + dr;
    const nextCol = col + dc;
    if (
      !hasInBounds(nextRow, nextCol, grid.length, grid[0]?.length ?? 0) ||
      !allowedMask[nextRow][nextCol]
    ) {
      return sum;
    }
    const nextShape = getShapeValue(shapeField, nextRow, nextCol);
    const delta = nextShape - shapeValue;
    if (hasRegionalOpening(candidate, direction, regionTileIds)) {
      return sum + delta * 3.2;
    }
    return sum - Math.max(0, delta) * 1.9;
  }, 0);
  const shapeBias = shapeValue * (3.2 - randomness * 0.9);

  return opennessScore + borderScore + stabilityScore + shapeBias + directionalBias;
}

function validateConnectedRegion(
  grid: Array<Array<TerrainGrammarTile | null>>,
  options: {
    minTiles: number;
    maxTiles: number;
    requiredCells?: Array<{ row: number; col: number }>;
    extraCheck?: (grid: Array<Array<TerrainGrammarTile | null>>) => boolean;
  },
): boolean {
  const filled = countFilled(grid);
  if (filled < options.minTiles || filled > options.maxTiles) {
    return false;
  }

  if (
    options.requiredCells?.some(
      ({ row, col }) => !hasPlacedTile(grid, row, col),
    )
  ) {
    return false;
  }

  if (!isSingleConnectedRegion(grid)) {
    return false;
  }

  return options.extraCheck ? options.extraCheck(grid) : true;
}

function isSingleConnectedRegion(grid: Array<Array<TerrainGrammarTile | null>>): boolean {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  let start: { row: number; col: number } | null = null;
  let totalFilled = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!grid[row][col]) {
        continue;
      }
      totalFilled += 1;
      if (!start) {
        start = { row, col };
      }
    }
  }

  if (!start) {
    return false;
  }

  const seen = createBoolGrid(rows, cols, false);
  const queue = [start];
  seen[start.row][start.col] = true;
  let visited = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    visited += 1;

    for (const { dr, dc } of CARDINALS) {
      const nextRow = current.row + dr;
      const nextCol = current.col + dc;
      if (
        !hasInBounds(nextRow, nextCol, rows, cols) ||
        seen[nextRow][nextCol] ||
        !grid[nextRow][nextCol]
      ) {
        continue;
      }
      seen[nextRow][nextCol] = true;
      queue.push({ row: nextRow, col: nextCol });
    }
  }

  return visited === totalFilled;
}

function createMaskFromPlacedGrid(
  grid: Array<Array<TerrainGrammarTile | null>>,
): boolean[][] {
  return grid.map((row) => row.map((tile) => tile !== null));
}

function getShapeValue(
  shapeField: number[][] | undefined,
  row: number,
  col: number,
): number {
  return shapeField?.[row]?.[col] ?? 0;
}

function buildOrganicShapeField(
  cols: number,
  rows: number,
  seed: number,
  randomness: number,
  origin: { row: number; col: number },
): number[][] {
  const noise = createPerlinNoise2D(seed ^ 0x45d9f3b);
  const centerCol = origin.col + sampleOffset(seed + 17) * Math.max(1, cols * 0.05);
  const centerRow = origin.row + sampleOffset(seed + 29) * Math.max(1, rows * 0.04);
  const radiusX = cols * (0.24 + randomness * 0.12);
  const radiusY = rows * (0.2 + randomness * 0.1);
  const scaleX = 0.17 + randomness * 0.05;
  const scaleY = 0.19 + randomness * 0.05;
  const field = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!isInteriorCell(row, col, rows, cols)) {
        field[row][col] = 0;
        continue;
      }

      const dx = (col + 0.5 - centerCol) / Math.max(2, radiusX);
      const dy = (row + 0.5 - centerRow) / Math.max(2, radiusY);
      const radial = Math.sqrt(dx * dx + dy * dy);
      const lowNoise = noise(col * scaleX + 8.4, row * scaleY + 13.1);
      const hiNoise = noise(col * (scaleX * 2.35) + 91.7, row * (scaleY * 2.1) + 47.6) * 0.45;
      const warped = lowNoise * 0.75 + hiNoise;
      const value = 1.08 - radial + warped * (0.23 + randomness * 0.16);
      field[row][col] = clamp01(value);
    }
  }

  field[origin.row][origin.col] = 1;
  return field;
}

function buildPreferredGrowthMask(
  shapeField: number[][],
  seed: { row: number; col: number },
  targetCount: number,
): boolean[][] {
  const rows = shapeField.length;
  const cols = shapeField[0]?.length ?? 0;
  const mask = createBoolGrid(rows, cols, false);
  const queued = createBoolGrid(rows, cols, false);
  const frontier: Array<{ row: number; col: number; score: number }> = [];
  let filled = 0;

  frontier.push({
    row: seed.row,
    col: seed.col,
    score: getShapeValue(shapeField, seed.row, seed.col),
  });
  queued[seed.row][seed.col] = true;

  while (frontier.length > 0 && filled < targetCount) {
    frontier.sort((left, right) => right.score - left.score);
    const current = frontier.shift()!;
    if (mask[current.row][current.col]) {
      continue;
    }

    mask[current.row][current.col] = true;
    filled += 1;

    for (const { dr, dc } of CARDINALS) {
      const nextRow = current.row + dr;
      const nextCol = current.col + dc;
      if (
        !isInteriorCell(nextRow, nextCol, rows, cols) ||
        queued[nextRow][nextCol] ||
        getShapeValue(shapeField, nextRow, nextCol) <= 0
      ) {
        continue;
      }
      queued[nextRow][nextCol] = true;
      frontier.push({
        row: nextRow,
        col: nextCol,
        score: getShapeValue(shapeField, nextRow, nextCol),
      });
    }
  }

  mask[seed.row][seed.col] = true;
  return mask;
}

function createInteriorMask(rows: number, cols: number): boolean[][] {
  const mask = createBoolGrid(rows, cols, false);
  for (let row = 1; row < rows - 1; row++) {
    for (let col = 1; col < cols - 1; col++) {
      mask[row][col] = true;
    }
  }
  return mask;
}

function clearRenderCells(
  grid: Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>>,
  mask: boolean[][],
): void {
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      if (mask[row][col]) {
        grid[row][col] = null;
      }
    }
  }
}

function extractTileIdGrid(
  grid: Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>>,
): Array<Array<number | null>> {
  return grid.map((row) => row.map((cell) => cell?.tileId ?? null));
}

function buildLayer2OccupancyMask(
  rows: number,
  cols: number,
  plateauMask: boolean[][],
  cliffMask: boolean[][],
  stair: StairPreviewSpec | null,
): boolean[][] {
  const mask = createBoolGrid(rows, cols, false);
  applyMask(mask, plateauMask, true);
  applyMask(mask, cliffMask, true);

  if (stair) {
    if (hasInBounds(stair.topRow, stair.col, rows, cols)) {
      mask[stair.topRow][stair.col] = true;
    }
    if (hasInBounds(stair.topRow + 1, stair.col, rows, cols)) {
      mask[stair.topRow + 1][stair.col] = true;
    }
  }

  return mask;
}

function pickSeedCell(cols: number, rows: number): { row: number; col: number } {
  return {
    row: clamp(Math.round(rows * 0.52), 2, rows - 3),
    col: clamp(Math.round(cols * 0.5), 2, cols - 3),
  };
}

function pickMaskSeed(
  mask: boolean[][],
  cols: number,
  rows: number,
): { row: number; col: number } | null {
  const preferred = pickSeedCell(cols, rows);
  if (mask[preferred.row]?.[preferred.col]) {
    return preferred;
  }
  return pickGrowthSeed(mask, cols, rows);
}

function isInteriorCell(row: number, col: number, rows: number, cols: number): boolean {
  return row > 0 && col > 0 && row < rows - 1 && col < cols - 1;
}

function solveMaskedTopologyLayer(
  options: GrowthLayerOptions,
): Array<Array<TerrainGrammarTile | null>> | null {
  const attempts = Math.max(48, options.width * options.height);
  const tileByKey = new Map(options.candidates.map((tile) => [tile.key, tile]));

  for (let attempt = 0; attempt < attempts; attempt++) {
    const stateGrid = Array.from({ length: options.height }, (_, row) =>
      Array.from({ length: options.width }, (_, col) => {
        if (!options.targetMask[row][col]) {
          return new Set<string>([EMPTY]);
        }

        const domain = options.candidates
          .filter((candidate) => candidateMatchesTargetTopology(candidate, row, col, options.targetMask))
          .map((candidate) => candidate.key);

        return new Set<string>(domain);
      }),
    );

    if (stateGrid.some((row) => row.some((cell) => cell.size === 0))) {
      return null;
    }

    if (!propagateStateGrid(stateGrid, tileByKey)) {
      continue;
    }

    let failed = false;
    while (true) {
      const target = pickLowestEntropyCell(stateGrid, options.rng);
      if (!target) {
        return stateGrid.map((row) => row.map((cell) => resolveSingleState(cell, tileByKey)));
      }

      const choices = [...stateGrid[target.row][target.col]];
      const picked = weightedPick(
        choices,
        options.rng,
        (state) =>
          getStateWeight(
            state,
            target.row,
            target.col,
            options.width,
            options.height,
            tileByKey,
            options.randomness,
          ),
      );
      stateGrid[target.row][target.col] = new Set([picked]);

      if (!propagateStateGrid(stateGrid, tileByKey, [{ row: target.row, col: target.col }])) {
        failed = true;
        break;
      }
    }

    if (!failed) {
      break;
    }
  }

  return null;
}

function solveFixedMaskRuleLayer(
  options: FixedMaskRuleSolveOptions,
): Array<Array<TerrainGrammarTile | null>> | null {
  const tileByKey = new Map(options.candidates.map((tile) => [tile.key, tile]));
  const stateGrid = Array.from({ length: options.height }, (_, row) =>
    Array.from({ length: options.width }, (_, col) => {
      if (!options.targetMask[row][col]) {
        return new Set<string>([EMPTY]);
      }

      const domain = options.candidates
        .filter((candidate) => candidateMatchesTargetTopology(candidate, row, col, options.targetMask))
        .map((candidate) => candidate.key);

      return new Set<string>(domain);
    }),
  );

  if (stateGrid.some((row) => row.some((cell) => cell.size === 0))) {
    return null;
  }

  if (!propagateStateGrid(stateGrid, tileByKey)) {
    return null;
  }

  const budget = {
    remaining: options.maxSearchSteps ?? Math.max(4000, options.width * options.height * 160),
  };

  return searchFixedMaskStateGrid(
    stateGrid,
    tileByKey,
    options.rng,
    options.randomness,
    options.width,
    options.height,
    options.preferredTileIds,
    budget,
  );
}

function candidateMatchesTargetTopology(
  candidate: TerrainGrammarTile,
  row: number,
  col: number,
  targetMask: boolean[][],
): boolean {
  for (const { direction, dr, dc } of CARDINALS) {
    const hasNeighbor = hasLandMask(targetMask, row + dr, col + dc);
    const allowsNeighbor = candidate.adjacencyRules[direction].length > 0;

    if (hasNeighbor !== allowsNeighbor) {
      return false;
    }
  }

  return true;
}

function searchFixedMaskStateGrid(
  stateGrid: Set<string>[][],
  tileByKey: Map<string, TerrainGrammarTile>,
  rng: () => number,
  randomness: number,
  width: number,
  height: number,
  preferredTileIds: Array<Array<number | null>> | undefined,
  budget: { remaining: number },
): Array<Array<TerrainGrammarTile | null>> | null {
  if (budget.remaining <= 0) {
    return null;
  }
  budget.remaining -= 1;

  const target = pickLowestEntropyCell(stateGrid, rng);
  if (!target) {
    return stateGrid.map((row) => row.map((cell) => resolveSingleState(cell, tileByKey)));
  }

  const orderedChoices = orderFixedMaskChoices(
    [...stateGrid[target.row][target.col]],
    target.row,
    target.col,
    tileByKey,
    rng,
    randomness,
    width,
    height,
    preferredTileIds,
  );

  for (const choice of orderedChoices) {
    const nextGrid = cloneStateGrid(stateGrid);
    nextGrid[target.row][target.col] = new Set([choice]);

    if (!propagateStateGrid(nextGrid, tileByKey, [{ row: target.row, col: target.col }])) {
      continue;
    }

    const result = searchFixedMaskStateGrid(
      nextGrid,
      tileByKey,
      rng,
      randomness,
      width,
      height,
      preferredTileIds,
      budget,
    );
    if (result) {
      return result;
    }
  }

  return null;
}

function orderFixedMaskChoices(
  states: string[],
  row: number,
  col: number,
  tileByKey: Map<string, TerrainGrammarTile>,
  rng: () => number,
  randomness: number,
  width: number,
  height: number,
  preferredTileIds: Array<Array<number | null>> | undefined,
): string[] {
  const preferredTileId = preferredTileIds?.[row]?.[col] ?? null;
  const entries = states.map((state) => {
    const tile = state === EMPTY ? null : tileByKey.get(state) ?? null;
    const preferredBias = tile && preferredTileId !== null && tile.tileId === preferredTileId ? 8 : 0;
    const weight =
      getStateWeight(state, row, col, width, height, tileByKey, randomness) + preferredBias;

    return {
      state,
      weight,
      tie: rng(),
    };
  });

  entries.sort((left, right) => {
    if (right.weight !== left.weight) {
      return right.weight - left.weight;
    }
    return left.tie - right.tie;
  });

  return entries.map((entry) => entry.state);
}

function cloneStateGrid(stateGrid: Set<string>[][]): Set<string>[][] {
  return stateGrid.map((row) => row.map((cell) => new Set(cell)));
}

function growRuleRespectingLayer(
  options: GrowthLayerOptions,
): Array<Array<TerrainGrammarTile | null>> {
  const grid = createTileGrid<TerrainGrammarTile | null>(options.height, options.width, null);
  const seed = pickGrowthSeed(options.targetMask, options.width, options.height);
  if (!seed) {
    return grid;
  }

  const seedCandidates = getGrowthCandidates(
    seed.row,
    seed.col,
    grid,
    options.targetMask,
    options.candidates,
  );
  if (seedCandidates.length === 0) {
    return grid;
  }

  grid[seed.row][seed.col] = weightedPick(
    seedCandidates,
    options.rng,
    (candidate) =>
      scoreGrowthCandidate(
        candidate,
        seed.row,
        seed.col,
        grid,
        options.targetMask,
        options.randomness,
      ),
  );

  const frontier: Array<{ row: number; col: number }> = [{ row: seed.row, col: seed.col }];
  while (frontier.length > 0) {
    const currentIndex = Math.floor(options.rng() * frontier.length);
    const current = frontier.splice(currentIndex, 1)[0];
    const directions = shuffleDirections(options.rng);

    for (const { dr, dc } of directions) {
      const nextRow = current.row + dr;
      const nextCol = current.col + dc;
      if (
        !hasInBounds(nextRow, nextCol, options.height, options.width) ||
        !options.targetMask[nextRow][nextCol] ||
        grid[nextRow][nextCol]
      ) {
        continue;
      }

      const candidates = getGrowthCandidates(
        nextRow,
        nextCol,
        grid,
        options.targetMask,
        options.candidates,
      );
      if (candidates.length === 0) {
        continue;
      }

      grid[nextRow][nextCol] = weightedPick(
        candidates,
        options.rng,
        (candidate) =>
          scoreGrowthCandidate(
            candidate,
            nextRow,
            nextCol,
            grid,
            options.targetMask,
            options.randomness,
          ),
      );
      frontier.push({ row: nextRow, col: nextCol });
    }
  }

  let progress = true;
  let passes = 0;
  while (progress && passes < options.width * options.height) {
    progress = false;
    passes += 1;

    for (let row = 0; row < options.height; row++) {
      for (let col = 0; col < options.width; col++) {
        if (!options.targetMask[row][col] || grid[row][col]) {
          continue;
        }

        const candidates = getGrowthCandidates(row, col, grid, options.targetMask, options.candidates);
        if (candidates.length === 0) {
          continue;
        }

        grid[row][col] = weightedPick(
          candidates,
          options.rng,
          (candidate) =>
            scoreGrowthCandidate(
              candidate,
              row,
              col,
              grid,
              options.targetMask,
              options.randomness,
            ),
        );
        progress = true;
      }
    }
  }

  return grid;
}

function pickGrowthSeed(
  targetMask: boolean[][],
  width: number,
  height: number,
): { row: number; col: number } | null {
  let best: { row: number; col: number; score: number } | null = null;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      if (!targetMask[row][col]) {
        continue;
      }

      const centerDistance =
        Math.abs(row + 0.5 - height / 2) + Math.abs(col + 0.5 - width / 2);
      const openNeighbors = CARDINALS.reduce(
        (sum, { dr, dc }) => sum + (hasLandMask(targetMask, row + dr, col + dc) ? 1 : 0),
        0,
      );
      const score = openNeighbors * 10 - centerDistance;

      if (!best || score > best.score) {
        best = { row, col, score };
      }
    }
  }

  return best ? { row: best.row, col: best.col } : null;
}

function getGrowthCandidates(
  row: number,
  col: number,
  grid: Array<Array<TerrainGrammarTile | null>>,
  targetMask: boolean[][],
  candidates: TerrainGrammarTile[],
): TerrainGrammarTile[] {
  const placedNeighborCount = CARDINALS.reduce(
    (sum, { dr, dc }) => sum + (hasPlacedTile(grid, row + dr, col + dc) ? 1 : 0),
    0,
  );

  return candidates.filter((candidate) => {
    if (placedNeighborCount === 0) {
      const openSides = CARDINALS.reduce(
        (sum, { direction, dr, dc }) =>
          sum +
          (hasLandMask(targetMask, row + dr, col + dc) && candidate.adjacencyRules[direction].length > 0
            ? 1
            : 0),
        0,
      );
      return openSides >= 2;
    }

    for (const { direction, dr, dc } of CARDINALS) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      const targetHasCell = hasLandMask(targetMask, nextRow, nextCol);
      const neighbor = hasPlacedTile(grid, nextRow, nextCol) ? grid[nextRow][nextCol] : null;

      if (neighbor) {
        if (
          !candidate.adjacencyRules[direction].includes(neighbor.tileId) ||
          !neighbor.adjacencyRules[oppositeDirection(direction)].includes(candidate.tileId)
        ) {
          return false;
        }
        continue;
      }

      if (!targetHasCell && candidate.adjacencyRules[direction].length > 0) {
        return false;
      }
    }

    return true;
  });
}

function scoreGrowthCandidate(
  candidate: TerrainGrammarTile,
  row: number,
  col: number,
  grid: Array<Array<TerrainGrammarTile | null>>,
  targetMask: boolean[][],
  randomness: number,
): number {
  const targetNeighborCount = CARDINALS.reduce(
    (sum, { dr, dc }) => sum + (hasLandMask(targetMask, row + dr, col + dc) ? 1 : 0),
    0,
  );
  const placedNeighborCount = CARDINALS.reduce(
    (sum, { dr, dc }) => sum + (hasPlacedTile(grid, row + dr, col + dc) ? 1 : 0),
    0,
  );

  let tagBias = 1;
  if (targetNeighborCount >= 4) {
    if (candidate.tags.includes('center')) tagBias = 4.8;
    else if (candidate.tags.includes('edge') || candidate.tags.includes('lip')) tagBias = 2.1;
  } else if (targetNeighborCount === 3) {
    if (candidate.tags.includes('edge') || candidate.tags.includes('lip')) tagBias = 4.2;
    else if (candidate.tags.includes('center')) tagBias = 2.8;
  } else if (targetNeighborCount === 2) {
    if (candidate.tags.includes('corner') || candidate.tags.includes('single')) tagBias = 3.8;
    else if (candidate.tags.includes('edge')) tagBias = 2.3;
  } else {
    if (candidate.tags.includes('single')) tagBias = 4;
  }

  const opennessBias = CARDINALS.reduce(
    (sum, { direction, dr, dc }) =>
      sum +
      (hasLandMask(targetMask, row + dr, col + dc)
        ? candidate.adjacencyRules[direction].length > 0
          ? 1
          : -1
        : candidate.adjacencyRules[direction].length === 0
          ? 0.8
          : -2),
    0,
  );

  const stabilityBias = 1 + placedNeighborCount * 0.8;
  return Math.max(0.01, tagBias * stabilityBias + opennessBias * (1 - randomness * 0.35));
}

function shuffleDirections(
  rng: () => number,
): Array<{ direction: 'north' | 'east' | 'south' | 'west'; dr: number; dc: number }> {
  const values = [...CARDINALS];
  for (let index = values.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function indexTilesByTag(candidates: TerrainGrammarTile[]): {
  corner: TerrainGrammarTile[];
  edge: TerrainGrammarTile[];
  center: TerrainGrammarTile[];
  single: TerrainGrammarTile[];
  lip: TerrainGrammarTile[];
} {
  return {
    corner: candidates.filter((tile) => tile.tags.includes('corner')),
    edge: candidates.filter((tile) => tile.tags.includes('edge')),
    center: candidates.filter((tile) => tile.tags.includes('center')),
    single: candidates.filter((tile) => tile.tags.includes('single')),
    lip: candidates.filter((tile) => tile.tags.includes('lip')),
  };
}

function pickTaggedFallbackTile(
  row: number,
  col: number,
  top: number,
  bottom: number,
  left: number,
  right: number,
  byTag: ReturnType<typeof indexTilesByTag>,
): TerrainGrammarTile | null {
  const atTop = row === top;
  const atBottom = row === bottom;
  const atLeft = col === left;
  const atRight = col === right;

  if (left === right && top === bottom) {
    return byTag.single[0] ?? byTag.center[0] ?? null;
  }

  if ((atTop || atBottom) && (atLeft || atRight)) {
    return pickCornerVariant(atTop, atBottom, atLeft, atRight, byTag.corner);
  }
  if (atTop || atLeft || atRight) {
    return pickEdgeVariant(atLeft, atRight, byTag.edge);
  }
  if (atBottom) {
    return pickLipVariant(atLeft, atRight, byTag.lip, byTag.edge);
  }
  return byTag.center[0] ?? byTag.edge[0] ?? null;
}

function pickCornerVariant(
  atTop: boolean,
  atBottom: boolean,
  atLeft: boolean,
  atRight: boolean,
  corners: TerrainGrammarTile[],
): TerrainGrammarTile | null {
  return (
    corners.find(
      (tile) =>
        (tile.adjacencyRules.north.length === 0) === (atTop || false) &&
        (tile.adjacencyRules.south.length === 0) === (atBottom || false) &&
        (tile.adjacencyRules.west.length === 0) === (atLeft || false) &&
        (tile.adjacencyRules.east.length === 0) === (atRight || false),
    ) ?? corners[0] ?? null
  );
}

function pickEdgeVariant(
  atLeft: boolean,
  atRight: boolean,
  edges: TerrainGrammarTile[],
): TerrainGrammarTile | null {
  return (
    edges.find(
      (tile) =>
        (tile.adjacencyRules.west.length === 0) === atLeft &&
        (tile.adjacencyRules.east.length === 0) === atRight,
    ) ?? edges[0] ?? null
  );
}

function pickLipVariant(
  atLeft: boolean,
  atRight: boolean,
  lips: TerrainGrammarTile[],
  edges: TerrainGrammarTile[],
): TerrainGrammarTile | null {
  return (
    lips.find(
      (tile) =>
        (tile.adjacencyRules.west.length === 0) === atLeft &&
        (tile.adjacencyRules.east.length === 0) === atRight,
    ) ??
    edges[0] ??
    lips[0] ??
    null
  );
}

function buildNoiseIslandMask(
  cols: number,
  rows: number,
  seed: number,
  randomness: number,
): boolean[][] {
  const noise = createPerlinNoise2D(seed ^ 0x51ed270b);
  const mask = createBoolGrid(rows, cols, false);
  const centerCol = cols * (0.5 + sampleOffset(seed + 11) * 0.09);
  const centerRow = rows * (0.56 + sampleOffset(seed + 23) * 0.07);
  const radiusX = cols * (0.295 + randomness * 0.17 + sampleOffset(seed + 31) * 0.04);
  const radiusY = rows * (0.245 + randomness * 0.16 + sampleOffset(seed + 43) * 0.035);
  const scaleX = 0.17 + randomness * 0.06;
  const scaleY = 0.19 + randomness * 0.05;

  for (let row = 1; row < rows - 1; row++) {
    for (let col = 1; col < cols - 1; col++) {
      const dx = (col + 0.5 - centerCol) / Math.max(2, radiusX);
      const dy = (row + 0.5 - centerRow) / Math.max(2, radiusY);
      const radial = Math.sqrt(dx * dx + dy * dy);
      const lowNoise = noise(col * scaleX + 7.1, row * scaleY + 13.4);
      const hiNoise = noise(col * (scaleX * 2.3) + 101.2, row * (scaleY * 2.1) + 59.8) * 0.45;
      const warpedNoise = lowNoise * 0.75 + hiNoise;
      const threshold = 0.905 + warpedNoise * (0.23 + randomness * 0.2);
      mask[row][col] = radial <= threshold;
    }
  }

  const smoothed = smoothMask(mask, 2);
  const connected = keepLargestComponentNear(
    smoothed,
    Math.round(centerRow),
    Math.round(centerCol),
  );

  const baseMask =
    countTrue(connected) >= 12 ? connected : createFallbackIslandMask(cols, rows);
  return carveInteriorPonds(baseMask, seed + 67, randomness);
}

function carveInteriorPonds(
  landMask: boolean[][],
  seed: number,
  randomness: number,
): boolean[][] {
  const landTiles = countTrue(landMask);
  if (landTiles < 90) {
    return landMask;
  }

  const rows = landMask.length;
  const cols = landMask[0]?.length ?? 0;
  const rng = mulberry32(seed ^ 0x4f1bbcdc);
  const result = cloneBoolGrid(landMask);
  const centers: Array<{ row: number; col: number }> = [];
  const pondTarget = Math.min(
    18,
    Math.max(
      1,
      Math.floor(landTiles / 520) + Math.floor(rng() * (1 + randomness * 5.5)),
    ),
  );
  const maxAttempts = pondTarget * 7;
  const minCenterDistance = Math.max(4, Math.floor(Math.sqrt(landTiles) / 8));
  let carved = 0;

  for (let attempt = 0; attempt < maxAttempts && carved < pondTarget; attempt++) {
    const allowance = buildPondAllowance(result);
    const allowanceCells = collectMaskCells(allowance);
    if (allowanceCells.length === 0) {
      break;
    }
    shuffleCellsInPlace(allowanceCells, rng);

    const center =
      allowanceCells.find((cell) =>
        centers.every(
          (existing) =>
            Math.abs(existing.row - cell.row) + Math.abs(existing.col - cell.col) >= minCenterDistance,
        ),
      ) ?? allowanceCells[0];
    if (!center) {
      break;
    }

    const pondMask = buildNoisePondMask(
      result,
      allowance,
      center.row,
      center.col,
      seed + attempt * 131,
      randomness,
      landTiles,
    );
    if (countTrue(pondMask) < 4) {
      continue;
    }

    const carvedMask = cloneBoolGrid(result);
    applyMask(carvedMask, pondMask, false);
    if (!isSingleLandComponent(carvedMask)) {
      continue;
    }

    applyMask(result, pondMask, false);
    centers.push(center);
    carved += 1;
  }

  return result;
}

function buildPondAllowance(landMask: boolean[][]): boolean[][] {
  const strictAllowance = buildPondAllowanceWithMargin(landMask, 2);
  return countTrue(strictAllowance) > 0
    ? strictAllowance
    : buildPondAllowanceWithMargin(landMask, 1);
}

function buildPondAllowanceWithMargin(
  landMask: boolean[][],
  margin: number,
): boolean[][] {
  const rows = landMask.length;
  const cols = landMask[0]?.length ?? 0;
  const allowance = createBoolGrid(rows, cols, false);

  for (let row = margin; row < rows - margin; row++) {
    for (let col = margin; col < cols - margin; col++) {
      if (!landMask[row][col]) {
        continue;
      }

      let supported = true;
      for (let dr = -margin; dr <= margin && supported; dr++) {
        for (let dc = -margin; dc <= margin; dc++) {
          if (!hasLandMask(landMask, row + dr, col + dc)) {
            supported = false;
            break;
          }
        }
      }

      allowance[row][col] = supported;
    }
  }

  return allowance;
}

function buildNoisePondMask(
  landMask: boolean[][],
  allowance: boolean[][],
  centerRow: number,
  centerCol: number,
  seed: number,
  randomness: number,
  landTiles: number,
): boolean[][] {
  const rows = landMask.length;
  const cols = landMask[0]?.length ?? 0;
  const noise = createPerlinNoise2D(seed ^ 0x1d872b41);
  const rng = mulberry32(seed ^ 0x83d2e74f);
  const areaScale = Math.sqrt(Math.max(1, landTiles / 180));
  const radiusX = Math.max(1.2, 1.1 + areaScale * (0.75 + rng() * 0.9) + randomness * 0.8);
  const radiusY = Math.max(1.1, 1.0 + areaScale * (0.7 + rng() * 0.85) + randomness * 0.75);
  const mask = createBoolGrid(rows, cols, false);
  const rowStart = Math.max(0, Math.floor(centerRow - radiusY * 2.4));
  const rowEnd = Math.min(rows - 1, Math.ceil(centerRow + radiusY * 2.4));
  const colStart = Math.max(0, Math.floor(centerCol - radiusX * 2.5));
  const colEnd = Math.min(cols - 1, Math.ceil(centerCol + radiusX * 2.5));
  const scaleX = 0.42 + rng() * 0.2;
  const scaleY = 0.44 + rng() * 0.18;

  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      if (!allowance[row][col]) {
        continue;
      }

      const dx = (col + 0.5 - centerCol) / radiusX;
      const dy = (row + 0.5 - centerRow) / radiusY;
      const radial = Math.sqrt(dx * dx + dy * dy);
      const lowNoise = noise(col * scaleX + 31.8, row * scaleY + 9.6);
      const hiNoise =
        noise(col * (scaleX * 1.9) + 111.4, row * (scaleY * 2.1) + 64.3) * 0.33;
      const threshold = 0.88 + (lowNoise * 0.7 + hiNoise) * (0.18 + randomness * 0.16);
      mask[row][col] = radial <= threshold || radial <= 0.28;
    }
  }

  const smoothed = smoothMask(mask, 1, allowance);
  return keepLargestComponentNear(smoothed, centerRow, centerCol);
}

function buildNoisePlateauMask(
  landMask: boolean[][],
  allowance: boolean[][],
  seed: number,
  randomness: number,
  sizeMultiplier = 1,
): boolean[][] {
  const rows = landMask.length;
  const cols = landMask[0]?.length ?? 0;
  const bounds = getBounds(allowance);
  if (!bounds) {
    return createBoolGrid(rows, cols, false);
  }

  const noise = createPerlinNoise2D(seed ^ 0x9e3779b9);
  const mask = createBoolGrid(rows, cols, false);
  const width = bounds.maxCol - bounds.minCol + 1;
  const height = bounds.maxRow - bounds.minRow + 1;
  const sizeRollX = mulberry32(seed ^ 0x45d9f3b)();
  const sizeRollY = mulberry32(seed ^ 0x632be59)();
  const densityRoll = mulberry32(seed ^ 0x94d049bb)();
  const sizeScaleX = 0.7 + sizeRollX * 1.0;
  const sizeScaleY = 0.7 + sizeRollY * 0.95;
  const centerCol =
    bounds.minCol +
    width * (0.48 + sampleOffset(seed + 17) * 0.18);
  const centerRow =
    bounds.minRow +
    height * (0.38 + sampleOffset(seed + 29) * 0.12);
  const radiusX = Math.max(2, width * (0.14 + randomness * 0.09) * sizeScaleX * sizeMultiplier);
  const radiusY = Math.max(2, height * (0.11 + randomness * 0.07) * sizeScaleY * sizeMultiplier);
  const scaleX = 0.24 + randomness * 0.08;
  const scaleY = 0.26 + randomness * 0.07;
  const densityBias = 0.66 + densityRoll * 0.18;

  for (let row = bounds.minRow; row <= bounds.maxRow; row++) {
    for (let col = bounds.minCol; col <= bounds.maxCol; col++) {
      if (!allowance[row][col]) {
        continue;
      }

      const dx = (col + 0.5 - centerCol) / radiusX;
      const dy = (row + 0.5 - centerRow) / radiusY;
      const radial = Math.sqrt(dx * dx + dy * dy);
      const lowNoise = noise(col * scaleX + 19.7, row * scaleY + 3.8);
      const hiNoise = noise(col * (scaleX * 2.2) + 77.6, row * (scaleY * 2.4) + 41.1) * 0.35;
      const threshold = densityBias + (lowNoise * 0.75 + hiNoise) * (0.18 + randomness * 0.14);
      mask[row][col] = radial <= threshold;
    }
  }

  const smoothed = smoothMask(mask, 1, allowance);
  const connected = keepLargestComponentNear(
    smoothed,
    Math.round(centerRow),
    Math.round(centerCol),
  );

  if (countTrue(connected) >= 4) {
    return connected;
  }

  const fallback = createBoolGrid(rows, cols, false);
  const fallbackCenterRow = Math.max(bounds.minRow, Math.min(bounds.maxRow, Math.round(centerRow)));
  const fallbackCenterCol = Math.max(bounds.minCol, Math.min(bounds.maxCol, Math.round(centerCol)));
  for (let row = fallbackCenterRow - 1; row <= fallbackCenterRow + 1; row++) {
    for (let col = fallbackCenterCol - 2; col <= fallbackCenterCol + 2; col++) {
      if (row < 0 || col < 0 || row >= rows || col >= cols || !allowance[row][col]) {
        continue;
      }
      fallback[row][col] = true;
    }
  }
  return fallback;
}

function buildPlateauMaskAttempts(
  flatMask: boolean[][],
  allowance: boolean[][],
  primaryMask: boolean[][],
  seed: number,
  randomness: number,
  rng: () => number,
): boolean[][][] {
  const attempts: boolean[][][] = [];
  const optionalMasks = buildOptionalPlateauMasks(
    flatMask,
    allowance,
    primaryMask,
    seed,
    randomness,
    rng,
  );

  let combinedMask = cloneBoolGrid(primaryMask);
  const combinedAttempts: boolean[][][] = [];
  for (const optionalMask of optionalMasks) {
    combinedMask = unionMasks(combinedMask, optionalMask);
    combinedAttempts.push(cloneBoolGrid(combinedMask));
  }

  for (let index = combinedAttempts.length - 1; index >= 0; index--) {
    attempts.push(combinedAttempts[index]);
  }
  attempts.push(primaryMask);

  return attempts;
}

function buildOptionalPlateauMasks(
  flatMask: boolean[][],
  allowance: boolean[][],
  primaryMask: boolean[][],
  seed: number,
  randomness: number,
  rng: () => number,
): boolean[][][] {
  const landTiles = countTrue(flatMask);
  const allowanceTiles = countTrue(allowance);
  if (landTiles < 65 || allowanceTiles < 24) {
    return [];
  }

  const maxExtraChunks = Math.max(
    0,
    Math.min(4, Math.floor((landTiles - 50) / 90) + (randomness >= 0.55 ? 1 : 0)),
  );
  if (maxExtraChunks <= 0) {
    return [];
  }

  const chunkChance = Math.min(0.9, 0.32 + randomness * 0.4 + (landTiles - 65) / 260);
  const optionalMasks: boolean[][][] = [];
  let combinedMask = cloneBoolGrid(primaryMask);

  for (let chunkIndex = 0; chunkIndex < maxExtraChunks; chunkIndex++) {
    if (rng() >= chunkChance) {
      continue;
    }

    const nextAllowance = buildSecondaryPlateauAllowance(allowance, combinedMask, 2);
    if (countTrue(nextAllowance) < 8) {
      break;
    }

    const sizeMultiplier = 0.4 + rng() * 0.9;
    const optionalMask = buildNoisePlateauMask(
      flatMask,
      nextAllowance,
      seed + chunkIndex * 131,
      randomness,
      sizeMultiplier,
    );

    if (countTrue(optionalMask) < 4) {
      continue;
    }

    optionalMasks.push(optionalMask);
    combinedMask = unionMasks(combinedMask, optionalMask);
  }

  return optionalMasks;
}

function buildSecondaryPlateauAllowance(
  allowance: boolean[][],
  primaryMask: boolean[][],
  padding: number,
): boolean[][] {
  const rows = allowance.length;
  const cols = allowance[0]?.length ?? 0;
  const result = createBoolGrid(rows, cols, false);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!allowance[row][col]) {
        continue;
      }

      let tooClose = false;
      for (let dr = -padding; dr <= padding && !tooClose; dr++) {
        for (let dc = -padding; dc <= padding; dc++) {
          if (hasLandMask(primaryMask, row + dr, col + dc)) {
            tooClose = true;
            break;
          }
        }
      }

      if (!tooClose) {
        result[row][col] = true;
      }
    }
  }

  return result;
}

function unionMasks(left: boolean[][], right: boolean[][]): boolean[][] {
  const rows = left.length;
  const cols = left[0]?.length ?? 0;
  const result = createBoolGrid(rows, cols, false);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      result[row][col] = left[row][col] || right[row][col];
    }
  }

  return result;
}

function createFallbackIslandMask(cols: number, rows: number): boolean[][] {
  const mask = createBoolGrid(rows, cols, false);
  const left = Math.max(1, Math.floor(cols * 0.18));
  const right = Math.min(cols - 2, Math.ceil(cols * 0.82));
  const top = Math.max(1, Math.floor(rows * 0.18));
  const bottom = Math.min(rows - 2, Math.ceil(rows * 0.84));

  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) {
      mask[row][col] = true;
    }
  }

  return mask;
}

function buildInteriorMask(mask: boolean[][]): boolean[][] {
  const rows = mask.length;
  const cols = mask[0]?.length ?? 0;
  const interior = createBoolGrid(rows, cols, false);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      interior[row][col] =
        mask[row][col] &&
        CARDINALS.every(({ dr, dc }) => hasLandMask(mask, row + dr, col + dc));
    }
  }

  return interior;
}

function cloneBoolGrid(mask: boolean[][]): boolean[][] {
  return mask.map((row) => [...row]);
}

function smoothMask(mask: boolean[][], passes: number, limitMask?: boolean[][]): boolean[][] {
  let current = cloneBoolGrid(mask);

  for (let pass = 0; pass < passes; pass++) {
    const next = cloneBoolGrid(current);
    for (let row = 0; row < current.length; row++) {
      for (let col = 0; col < current[row].length; col++) {
        if (limitMask && !limitMask[row][col]) {
          next[row][col] = false;
          continue;
        }

        const neighbors = countNeighborLand(current, row, col);
        if (current[row][col]) {
          next[row][col] = neighbors >= 3;
        } else {
          next[row][col] = neighbors >= 5;
        }
      }
    }
    current = next;
  }

  return current;
}

function countNeighborLand(mask: boolean[][], row: number, col: number): number {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) {
        continue;
      }
      if (hasLandMask(mask, row + dr, col + dc)) {
        count += 1;
      }
    }
  }
  return count;
}

function keepLargestComponentNear(mask: boolean[][], targetRow: number, targetCol: number): boolean[][] {
  const rows = mask.length;
  const cols = mask[0]?.length ?? 0;
  const visited = createBoolGrid(rows, cols, false);
  const components: Array<{ cells: Array<{ row: number; col: number }>; score: number }> = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!mask[row][col] || visited[row][col]) {
        continue;
      }

      const queue = [{ row, col }];
      const cells: Array<{ row: number; col: number }> = [];
      visited[row][col] = true;
      let bestDistance = Number.POSITIVE_INFINITY;

      while (queue.length > 0) {
        const current = queue.shift()!;
        cells.push(current);
        bestDistance = Math.min(
          bestDistance,
          Math.abs(current.row - targetRow) + Math.abs(current.col - targetCol),
        );

        for (const { dr, dc } of CARDINALS) {
          const nextRow = current.row + dr;
          const nextCol = current.col + dc;
          if (
            nextRow < 0 ||
            nextCol < 0 ||
            nextRow >= rows ||
            nextCol >= cols ||
            visited[nextRow][nextCol] ||
            !mask[nextRow][nextCol]
          ) {
            continue;
          }
          visited[nextRow][nextCol] = true;
          queue.push({ row: nextRow, col: nextCol });
        }
      }

      components.push({
        cells,
        score: cells.length * 100 - bestDistance * 7,
      });
    }
  }

  if (components.length === 0) {
    return createBoolGrid(rows, cols, false);
  }

  const best = components.sort((left, right) => right.score - left.score)[0];
  const result = createBoolGrid(rows, cols, false);
  for (const cell of best.cells) {
    result[cell.row][cell.col] = true;
  }
  return result;
}

function countTrue(mask: boolean[][]): number {
  return mask.reduce(
    (sum, row) => sum + row.reduce((rowSum, cell) => rowSum + (cell ? 1 : 0), 0),
    0,
  );
}

function getBounds(mask: boolean[][]): {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
} | null {
  let minRow = Number.POSITIVE_INFINITY;
  let maxRow = Number.NEGATIVE_INFINITY;
  let minCol = Number.POSITIVE_INFINITY;
  let maxCol = Number.NEGATIVE_INFINITY;

  for (let row = 0; row < mask.length; row++) {
    for (let col = 0; col < mask[row].length; col++) {
      if (!mask[row][col]) {
        continue;
      }
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row);
      minCol = Math.min(minCol, col);
      maxCol = Math.max(maxCol, col);
    }
  }

  if (!Number.isFinite(minRow)) {
    return null;
  }

  return { minRow, maxRow, minCol, maxCol };
}

function pickRandomAtlasKey(rng: () => number, exclude?: AtlasKey): AtlasKey {
  const options = TERRAIN_COLOR_ATLAS_KEYS.filter((atlasKey) => atlasKey !== exclude);
  const pool = options.length > 0 ? options : TERRAIN_COLOR_ATLAS_KEYS;
  return pool[Math.floor(rng() * pool.length)];
}

function pickRandomAtlasKeyAvoiding(
  rng: () => number,
  used: ReadonlySet<AtlasKey>,
): AtlasKey {
  const pool = TERRAIN_COLOR_ATLAS_KEYS.filter((atlasKey) => !used.has(atlasKey));
  const candidates = pool.length > 0 ? pool : TERRAIN_COLOR_ATLAS_KEYS;
  return candidates[Math.floor(rng() * candidates.length)];
}

function sampleOffset(seed: number): number {
  return mulberry32(seed)() * 2 - 1;
}

function createPerlinNoise2D(seed: number): (x: number, y: number) => number {
  const rng = mulberry32(seed);
  const permutation = Array.from({ length: 256 }, (_, index) => index);
  for (let index = permutation.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [permutation[index], permutation[swapIndex]] = [permutation[swapIndex], permutation[index]];
  }

  const p = [...permutation, ...permutation];

  return (x: number, y: number) => {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const aa = p[p[xi] + yi];
    const ab = p[p[xi] + yi + 1];
    const ba = p[p[xi + 1] + yi];
    const bb = p[p[xi + 1] + yi + 1];

    const u = fade(xf);
    const v = fade(yf);
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  };
}

function fade(value: number): number {
  return value * value * value * (value * (value * 6 - 15) + 10);
}

function lerp(start: number, end: number, amount: number): number {
  return start + amount * (end - start);
}

function grad(hash: number, x: number, y: number): number {
  switch (hash & 3) {
    case 0:
      return x + y;
    case 1:
      return -x + y;
    case 2:
      return x - y;
    default:
      return -x - y;
  }
}

function buildPlateauAllowance(landMask: boolean[][]): boolean[][] {
  const rows = landMask.length;
  const cols = landMask[0]?.length ?? 0;
  const allowance = createBoolGrid(rows, cols, false);

  for (let row = 1; row < rows - 3; row++) {
    for (let col = 1; col < cols - 1; col++) {
      if (
        landMask[row][col] &&
        landMask[row + 1][col] &&
        landMask[row][col - 1] &&
        landMask[row][col + 1]
      ) {
        allowance[row][col] = true;
      }
    }
  }

  return allowance;
}

function collectMaskCells(mask: boolean[][]): Array<{ row: number; col: number }> {
  const cells: Array<{ row: number; col: number }> = [];
  for (let row = 0; row < mask.length; row++) {
    for (let col = 0; col < mask[row].length; col++) {
      if (mask[row][col]) {
        cells.push({ row, col });
      }
    }
  }
  return cells;
}

function shuffleCellsInPlace<T>(cells: T[], rng: () => number): void {
  for (let index = cells.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const current = cells[index];
    cells[index] = cells[swapIndex];
    cells[swapIndex] = current;
  }
}

function isSingleLandComponent(mask: boolean[][]): boolean {
  const total = countTrue(mask);
  if (total <= 0) {
    return false;
  }

  for (let row = 0; row < mask.length; row++) {
    for (let col = 0; col < mask[row].length; col++) {
      if (!mask[row][col]) {
        continue;
      }
      return countTrue(keepLargestComponentNear(mask, row, col)) === total;
    }
  }

  return false;
}

function intersectMasks(left: boolean[][], right: boolean[][]): boolean[][] {
  const rows = left.length;
  const cols = left[0]?.length ?? 0;
  const result = createBoolGrid(rows, cols, false);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      result[row][col] = left[row][col] && right[row][col];
    }
  }

  return result;
}

function ensurePlateauEntry(
  landMask: boolean[][],
  plateauMask: boolean[][],
  elevatedTopCandidates: TerrainGrammarTile[],
  rng: () => number,
  randomness: number,
): { mask: boolean[][]; stairs: StairPreviewList } {
  const regularizedMask = regularizeMaskToSupportedTopologies(
    plateauMask,
    elevatedTopCandidates,
  );

  return {
    mask: regularizedMask,
    stairs: pickStairCandidatesFromMask(landMask, regularizedMask, rng, randomness),
  };
}

function regularizeMaskToSupportedTopologies(
  mask: boolean[][],
  candidates: TerrainGrammarTile[],
): boolean[][] {
  const rows = mask.length;
  const cols = mask[0]?.length ?? 0;
  const regularized = mask.map((row) => [...row]);
  const supportedTopologies = new Set<number>();

  for (const candidate of candidates) {
    let topology = 0;
    if (candidate.adjacencyRules.north.length > 0) {
      topology |= 1;
    }
    if (candidate.adjacencyRules.east.length > 0) {
      topology |= 2;
    }
    if (candidate.adjacencyRules.south.length > 0) {
      topology |= 4;
    }
    if (candidate.adjacencyRules.west.length > 0) {
      topology |= 8;
    }
    supportedTopologies.add(topology);
  }

  let changed = true;
  let passes = 0;
  while (changed && passes < rows * cols) {
    changed = false;
    passes += 1;
    const removals: Array<{ row: number; col: number }> = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!regularized[row][col]) {
          continue;
        }

        let topology = 0;
        if (hasLandMask(regularized, row - 1, col)) {
          topology |= 1;
        }
        if (hasLandMask(regularized, row, col + 1)) {
          topology |= 2;
        }
        if (hasLandMask(regularized, row + 1, col)) {
          topology |= 4;
        }
        if (hasLandMask(regularized, row, col - 1)) {
          topology |= 8;
        }

        if (!supportedTopologies.has(topology)) {
          removals.push({ row, col });
        }
      }
    }

    if (removals.length === 0) {
      break;
    }

    changed = true;
    for (const removal of removals) {
      regularized[removal.row][removal.col] = false;
    }
  }

  return regularized;
}

function pickStairCandidatesFromMask(
  landMask: boolean[][],
  plateauMask: boolean[][],
  rng: () => number,
  randomness: number,
): StairPreviewList {
  const candidates: StairPreviewSpec[] = [];
  const rows = plateauMask.length;
  const cols = plateauMask[0]?.length ?? 0;

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols; col++) {
      if (!plateauMask[row][col]) {
        continue;
      }

      if (
        !plateauMask[row][col - 1] &&
        col - 1 >= 0 &&
        landMask[row][col - 1] &&
        row + 1 < rows &&
        landMask[row + 1][col - 1] &&
        !plateauMask[row + 1][col] &&
        hasClearStairApproach(plateauMask, row, col - 1, 'left')
      ) {
        candidates.push({ col: col - 1, topRow: row, variant: 'left' });
      }

      if (
        !plateauMask[row][col + 1] &&
        col + 1 < cols &&
        landMask[row][col + 1] &&
        row + 1 < rows &&
        landMask[row + 1][col + 1] &&
        !plateauMask[row + 1][col] &&
        hasClearStairApproach(plateauMask, row, col + 1, 'right')
      ) {
        candidates.push({ col: col + 1, topRow: row, variant: 'right' });
      }
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  const plateauTiles = countTrue(plateauMask);
  const stairChance = Math.min(0.995, 0.9 + randomness * 0.08);
  const extraStairChance = Math.min(0.82, 0.28 + randomness * 0.32 + plateauTiles / 220);
  const perSideCap = Math.max(1, Math.min(3, 1 + Math.floor(Math.max(0, plateauTiles - 12) / 22)));
  const left = pickMultipleOutermostStairCandidates(
    candidates.filter((candidate) => candidate.variant === 'left'),
    cols,
    perSideCap,
    3,
  );
  const right = pickMultipleOutermostStairCandidates(
    candidates.filter((candidate) => candidate.variant === 'right'),
    cols,
    perSideCap,
    3,
  );

  const selected: StairPreviewSpec[] = [];
  for (let index = 0; index < left.length; index++) {
    const chance = index === 0 ? stairChance : extraStairChance;
    if (rng() < chance) {
      selected.push(left[index]);
    }
  }
  for (let index = 0; index < right.length; index++) {
    const chance = index === 0 ? stairChance : extraStairChance;
    if (
      rng() < chance &&
      !selected.some(
        (candidate) =>
          candidate.col === right[index].col && candidate.topRow === right[index].topRow,
      )
    ) {
      selected.push(right[index]);
    }
  }

  return selected;
}

function widenFlatMaskForStairs(
  flatMask: boolean[][],
  stairs: StairPreviewList,
): boolean[][] {
  const widened = flatMask.map((row) => [...row]);
  const rows = widened.length;
  const cols = widened[0]?.length ?? 0;

  for (const stair of stairs) {
    const lowerRow = stair.topRow + 1;
    const outwardSign = stair.variant === 'left' ? -1 : 1;

    // Build a broader lower landing around the stair instead of a single thin spur.
    for (const [rowOffset, colOffset] of [
      [0, -1],
      [0, 0],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, outwardSign * 2],
      [1, outwardSign * 2],
      [2, 0],
      [2, outwardSign],
    ] as const) {
      const row = lowerRow + rowOffset;
      const col = stair.col + colOffset;
      if (hasInBounds(row, col, rows, cols)) {
        widened[row][col] = true;
      }
    }
  }

  return widened;
}

function widenElevatedSupportMaskForStairs(
  supportMask: boolean[][],
  stairs: StairPreviewList,
): boolean[][] {
  const widened = supportMask.map((row) => [...row]);
  const rows = widened.length;
  const cols = widened[0]?.length ?? 0;

  for (const stair of stairs) {
    const lowerRow = stair.topRow + 1;
    const outwardSign = stair.variant === 'left' ? -1 : 1;

    for (const [rowOffset, colOffset] of [
      [0, -1],
      [0, 0],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
      [-1, 0],
      [0, outwardSign * 2],
      [1, outwardSign],
    ] as const) {
      const row = lowerRow + rowOffset;
      const col = stair.col + colOffset;
      if (hasInBounds(row, col, rows, cols)) {
        widened[row][col] = true;
      }
    }
  }

  return widened;
}

function tryExpandSupportLayerForUpperStairs(
  supportLayer: GeneratedPlateauLayer,
  upperStairs: StairPreviewList,
  elevatedTopCandidates: TerrainGrammarTile[],
  mapping: TerrainAtlasMapping,
  seed: number,
  randomness: number,
  cols: number,
  rows: number,
): void {
  if (upperStairs.length === 0) {
    return;
  }

  const widenedMask = regularizeMaskToSupportedTopologies(
    widenElevatedSupportMaskForStairs(supportLayer.plateauMask, upperStairs),
    elevatedTopCandidates,
  );
  if (areMasksEqual(widenedMask, supportLayer.plateauMask)) {
    return;
  }

  const deterministicTopGrid = buildElevatedTopPreferenceGrid(
    widenedMask,
    mapping,
    supportLayer.atlasKey,
    supportLayer.stairs,
  );
  const solvedTopGrid = solveFixedMaskRuleLayer({
    width: cols,
    height: rows,
    candidates: elevatedTopCandidates,
    rng: mulberry32(seed),
    randomness,
    targetMask: widenedMask,
    preferredTileIds: extractTileIdGrid(deterministicTopGrid),
    maxSearchSteps: Math.max(5000, cols * rows * 220),
  });

  if (!solvedTopGrid) {
    return;
  }

  supportLayer.plateauMask = widenedMask;
  supportLayer.cliffBands = buildSampleCliffBands(
    supportLayer.supportMask,
    widenedMask,
    supportLayer.stairs,
    supportLayer.terrainLevel,
  );
  supportLayer.topGrid = retintPlacedGrid(
    projectPlacedRuleGrid(solvedTopGrid),
    supportLayer.atlasKey,
  );
  supportLayer.renderedGrid = buildElevatedGrid(
    solvedTopGrid,
    widenedMask,
    supportLayer.cliffBands,
    supportLayer.stairs,
    mapping,
    supportLayer.atlasKey,
  );
}

function areMasksEqual(left: boolean[][], right: boolean[][]): boolean {
  if (left.length !== right.length || left[0]?.length !== right[0]?.length) {
    return false;
  }

  for (let row = 0; row < left.length; row++) {
    for (let col = 0; col < left[row].length; col++) {
      if (left[row][col] !== right[row][col]) {
        return false;
      }
    }
  }

  return true;
}

function hasClearStairApproach(
  plateauMask: boolean[][],
  topRow: number,
  stairCol: number,
  variant: 'left' | 'right',
): boolean {
  const attachCol = variant === 'left' ? stairCol + 1 : stairCol - 1;
  return (
    !hasLandMask(plateauMask, topRow - 1, stairCol) &&
    !hasLandMask(plateauMask, topRow - 1, attachCol)
  );
}

function pickMultipleOutermostStairCandidates(
  candidates: StairPreviewSpec[],
  cols: number,
  maxCount: number,
  minRowGap: number,
): StairPreviewSpec[] {
  if (candidates.length === 0) {
    return [];
  }

  const sorted = [...candidates].sort((left, right) => {
    const leftDistance = left.variant === 'left' ? left.col : cols - 1 - left.col;
    const rightDistance = right.variant === 'left' ? right.col : cols - 1 - right.col;
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }
    if (right.topRow !== left.topRow) {
      return right.topRow - left.topRow;
    }
    return right.col - left.col;
  });

  const picks: StairPreviewSpec[] = [];
  const center = (cols - 1) / 2;
  for (const candidate of sorted) {
    if (
      picks.some(
        (picked) =>
          Math.abs(picked.topRow - candidate.topRow) < minRowGap ||
          Math.abs(picked.col - candidate.col) + Math.abs(picked.topRow - candidate.topRow) < 3,
      )
    ) {
      continue;
    }

    picks.push(candidate);
    if (picks.length >= maxCount) {
      break;
    }
  }

  return picks.sort((left, right) => {
    const leftDistance = Math.abs(left.col - center);
    const rightDistance = Math.abs(right.col - center);
    if (rightDistance !== leftDistance) {
      return rightDistance - leftDistance;
    }
    return right.topRow - left.topRow;
  });
}

function buildSampleCliffBands(
  landMask: boolean[][],
  plateauMask: boolean[][],
  stairs: StairPreviewList,
  terrainLevel: number,
): {
  land: boolean[][];
  water: boolean[][];
  mask: boolean[][];
} {
  const rows = landMask.length;
  const cols = landMask[0]?.length ?? 0;
  const cliffCandidates = createBoolGrid(rows, cols, false);
  const land = createBoolGrid(rows, cols, false);
  const water = createBoolGrid(rows, cols, false);

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols; col++) {
      if (!plateauMask[row][col] || plateauMask[row + 1][col]) {
        continue;
      }
      cliffCandidates[row + 1][col] = true;
    }
  }

  const solidMask = createBoolGrid(rows, cols, false);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      solidMask[row][col] = landMask[row][col] || plateauMask[row][col] || cliffCandidates[row][col];
    }
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!cliffCandidates[row][col]) {
        continue;
      }
      if (terrainLevel === 2 && !hasLandMask(solidMask, row + 1, col)) {
        water[row][col] = true;
      } else {
        land[row][col] = true;
      }
    }
  }

  for (const stair of stairs) {
    const lowerRow = stair.topRow + 1;

    if (hasInBounds(lowerRow, stair.col, rows, cols)) {
      land[lowerRow][stair.col] = false;
      water[lowerRow][stair.col] = false;
    }
  }

  const mask = createBoolGrid(rows, cols, false);
  applyMask(mask, land, true);
  applyMask(mask, water, true);
  return { land, water, mask };
}

function buildFlatGrid(
  landMask: boolean[][],
  plateauMask: boolean[][],
  cliffMask: boolean[][],
  mapping: ReturnType<typeof getTerrainAtlasMapping>,
  atlasKey: AtlasKey,
): Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>> {
  const rows = landMask.length;
  const cols = landMask[0]?.length ?? 0;
  const grid = createTileGrid<{ tileId: number; atlasKey: AtlasKey } | null>(rows, cols, null);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!landMask[row][col]) {
        continue;
      }
      grid[row][col] = {
        tileId: pickFlatTile(landMask, row, col, mapping),
        atlasKey,
      };
    }
  }

  return grid;
}

function buildElevatedGrid(
  plateauGrid: Array<Array<TerrainGrammarTile | null>>,
  plateauMask: boolean[][],
  cliffBands: {
    land: boolean[][];
    water: boolean[][];
  },
  stairs: StairPreviewList,
  mapping: ReturnType<typeof getTerrainAtlasMapping>,
  atlasKey: AtlasKey,
): Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>> {
  const rows = plateauMask.length;
  const cols = plateauMask[0]?.length ?? 0;
  const grid = createTileGrid<{ tileId: number; atlasKey: AtlasKey } | null>(rows, cols, null);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const topTile = plateauGrid[row][col];
      if (topTile) {
        grid[row][col] = {
          tileId: topTile.tileId,
          atlasKey,
        };
      } else if (plateauMask[row][col]) {
        grid[row][col] = {
          tileId: pickElevatedTopTile(plateauMask, row, col, mapping, stairs),
          atlasKey,
        };
      }
    }
  }

  applyStairTopAttachmentSwap(grid, stairs, mapping);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (cliffBands.land[row][col]) {
        grid[row][col] = {
          tileId: pickStripTile(cliffBands.land, row, col, mapping.cliffs.land, stairs),
          atlasKey,
        };
      } else if (cliffBands.water[row][col]) {
        grid[row][col] = {
          tileId: pickStripTile(cliffBands.water, row, col, mapping.cliffs.water, stairs),
          atlasKey,
        };
      }
    }
  }

  for (const stair of stairs) {
    const stairTiles = stair.variant === 'left' ? mapping.stairs.left : mapping.stairs.right;
    if (stairTiles.upper > 0) {
      grid[stair.topRow][stair.col] = { tileId: stairTiles.upper, atlasKey };
    }
    if (stairTiles.lower > 0 && stair.topRow + 1 < rows) {
      grid[stair.topRow + 1][stair.col] = { tileId: stairTiles.lower, atlasKey };
    }
  }

  normalizeDerivedCliffTiles(grid, cliffBands, mapping, atlasKey);

  return grid;
}

function applyStairTopAttachmentSwap(
  grid: Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>>,
  stairs: StairPreviewList,
  mapping: ReturnType<typeof getTerrainAtlasMapping>,
): void {
  for (const stair of stairs) {
    const targetRow = stair.topRow;
    const targetCol = stair.variant === 'left' ? stair.col + 1 : stair.col - 1;
    if (!hasInBounds(targetRow, targetCol, grid.length, grid[0]?.length ?? 0)) {
      continue;
    }

    const cell = grid[targetRow][targetCol];
    if (!cell) {
      continue;
    }

    cell.tileId = swapElevatedTopTileForStairAttachment(cell.tileId, stair.variant, mapping);
  }
}

function swapElevatedTopTileForStairAttachment(
  tileId: number,
  variant: 'left' | 'right',
  mapping: ReturnType<typeof getTerrainAtlasMapping>,
): number {
  const top = mapping.elevatedTop;

  if (variant === 'left') {
    if (tileId === top.topLeft) return top.topCenter;
    if (tileId === top.upperRow.left) return top.upperRow.center;
    if (tileId === top.middleRow.left) return top.middleRow.center;
    if (tileId === top.bottomLeft) return top.bottomCenter;
    if (tileId === top.topSingle) return top.topRight;
    if (tileId === top.upperRow.single) return top.upperRow.right;
    if (tileId === top.middleRow.single) return top.middleRow.right;
    if (tileId === top.bottomSingle) return top.bottomRight;
    return tileId;
  }

  if (tileId === top.topRight) return top.topCenter;
  if (tileId === top.upperRow.right) return top.upperRow.center;
  if (tileId === top.middleRow.right) return top.middleRow.center;
  if (tileId === top.bottomRight) return top.bottomCenter;
  if (tileId === top.topSingle) return top.topLeft;
  if (tileId === top.upperRow.single) return top.upperRow.left;
  if (tileId === top.middleRow.single) return top.middleRow.left;
  if (tileId === top.bottomSingle) return top.bottomLeft;
  return tileId;
}

function buildElevatedTopPreferenceGrid(
  plateauMask: boolean[][],
  mapping: ReturnType<typeof getTerrainAtlasMapping>,
  atlasKey: AtlasKey,
  stairs: StairPreviewList,
): Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>> {
  const rows = plateauMask.length;
  const cols = plateauMask[0]?.length ?? 0;
  const grid = createTileGrid<{ tileId: number; atlasKey: AtlasKey } | null>(rows, cols, null);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!plateauMask[row][col]) {
        continue;
      }
      grid[row][col] = {
        tileId: pickElevatedTopTile(plateauMask, row, col, mapping, stairs),
        atlasKey,
      };
    }
  }

  return grid;
}

function buildOccupiedMaskFromRenderedGrid(
  grid: Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>>,
): boolean[][] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const mask = createBoolGrid(rows, cols, false);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      mask[row][col] = grid[row][col] !== null;
    }
  }

  return mask;
}

function normalizeDerivedCliffTiles(
  grid: Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>>,
  cliffBands: {
    land: boolean[][];
    water: boolean[][];
  },
  mapping: ReturnType<typeof getTerrainAtlasMapping>,
  atlasKey: AtlasKey,
): void {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const isLandCliff = cliffBands.land[row]?.[col];
      const isWaterCliff = cliffBands.water[row]?.[col];
      if (!isLandCliff && !isWaterCliff) {
        continue;
      }

      const cell = grid[row][col];
      if (!cell) {
        continue;
      }

      const westOccupied = hasRenderableLayer2Neighbor(grid, row, col - 1);
      const eastOccupied = hasRenderableLayer2Neighbor(grid, row, col + 1);
      const strip = isWaterCliff ? mapping.cliffs.water : mapping.cliffs.land;

      cell.tileId = pickClosedStripTile(strip, westOccupied, eastOccupied);
      cell.atlasKey = atlasKey;
    }
  }
}

function hasRenderableLayer2Neighbor(
  grid: Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>>,
  row: number,
  col: number,
): boolean {
  return hasInBounds(row, col, grid.length, grid[0]?.length ?? 0) && grid[row][col] !== null;
}

function pickClosedStripTile(
  strip: { left: number; center: number; right: number; single: number },
  westOccupied: boolean,
  eastOccupied: boolean,
): number {
  if (westOccupied && eastOccupied) {
    return strip.center;
  }
  if (westOccupied) {
    return strip.right;
  }
  if (eastOccupied) {
    return strip.left;
  }
  return strip.single;
}

function buildSampleShadowStamps(
  plateauMask: boolean[][],
  landMask: boolean[][],
  stairs: StairPreviewList,
  terrainLevel: number,
): WfcSampleOverlay[] {
  const rows = plateauMask.length;
  const cols = plateauMask[0]?.length ?? 0;
  const stamps = new Map<string, WfcSampleOverlay>();

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols; col++) {
      if (!plateauMask[row][col] || plateauMask[row + 1][col]) {
        continue;
      }
      if (
        stairs.some((stair) => row === stair.topRow && col === stair.col) ||
        !hasLandMask(landMask, row + 1, col)
      ) {
        continue;
      }

      stamps.set(`${col},${row + 1}`, {
        kind: 'shadow',
        row: row + 1,
        col,
        scale: 1,
        terrainLevel,
      });
    }
  }

  return [...stamps.values()];
}

function buildSampleFoamStamps(
  landMask: boolean[][],
  cliffMask: boolean[][],
): WfcSampleOverlay[] {
  const rows = landMask.length;
  const cols = landMask[0]?.length ?? 0;
  const solidMask = createBoolGrid(rows, cols, false);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      solidMask[row][col] = landMask[row][col] || cliffMask[row][col];
    }
  }

  const stamps = new Map<string, WfcSampleOverlay>();
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!solidMask[row][col]) {
        continue;
      }
      if (cardinalWaterCount(solidMask, row, col) > 0) {
        stamps.set(`${col},${row}`, {
          kind: 'foam',
          row,
          col,
          scale: 1,
          terrainLevel: 1,
        });
      }
    }
  }

  return [...stamps.values()];
}

function buildSampleDecorations(
  flatMask: boolean[][],
  plateauMask: boolean[][],
  cliffMask: boolean[][],
  stairs: StairPreviewList,
  seed: number,
): WfcSampleDecoration[] {
  const rows = flatMask.length;
  const cols = flatMask[0]?.length ?? 0;
  const rng = mulberry32(seed + 809);
  const visibleGroundMask = createBoolGrid(rows, cols, false);
  const blockedGroundMask = createBoolGrid(rows, cols, false);
  const decorations: WfcSampleDecoration[] = [];
  type DecorationSlot = 'nw' | 'ne' | 'sw' | 'se';
  const occupied: Array<{
    x: number;
    y: number;
    radius: number;
    row: number;
    col: number;
    kind: WfcSampleDecoration['kind'];
    layer: WfcSampleDecoration['layer'];
    slot: DecorationSlot;
  }> = [];
  const occupantsByCell = new Map<
    string,
    Array<{
      kind: WfcSampleDecoration['kind'];
      layer: WfcSampleDecoration['layer'];
      slot: DecorationSlot;
    }>
  >();
  const slotOffsets: Record<'land' | 'water', Record<DecorationSlot, { x: number; y: number }>> = {
    land: {
      nw: { x: -0.31, y: 0.68 },
      ne: { x: 0.31, y: 0.68 },
      sw: { x: -0.28, y: 0.95 },
      se: { x: 0.28, y: 0.95 },
    },
    water: {
      nw: { x: -0.3, y: 0.63 },
      ne: { x: 0.3, y: 0.63 },
      sw: { x: -0.24, y: 0.86 },
      se: { x: 0.24, y: 0.86 },
    },
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const visibleFlat = flatMask[row][col] && !plateauMask[row][col] && !cliffMask[row][col];
      visibleGroundMask[row][col] = plateauMask[row][col] || visibleFlat;
      blockedGroundMask[row][col] = cliffMask[row][col];
    }
  }

  for (const stair of stairs) {
    const attachCol = stair.variant === 'left' ? stair.col + 1 : stair.col - 1;
    for (const [row, col] of [
      [stair.topRow, stair.col],
      [stair.topRow + 1, stair.col],
      [stair.topRow, attachCol],
      [stair.topRow + 1, attachCol],
    ]) {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nextRow = row + dr;
          const nextCol = col + dc;
          if (hasInBounds(nextRow, nextCol, rows, cols)) {
            blockedGroundMask[nextRow][nextCol] = true;
          }
        }
      }
    }
  }

  const canShareCell = (
    row: number,
    col: number,
    kind: WfcSampleDecoration['kind'],
    layer: WfcSampleDecoration['layer'],
    slot: DecorationSlot,
  ): boolean => {
    const key = `${row},${col}`;
    const existing = occupantsByCell.get(key) ?? [];
    if (existing.length === 0) {
      return true;
    }
    if (existing.some((entry) => entry.slot === slot)) {
      return false;
    }
    if (kind === 'tree') {
      return false;
    }
    if (layer === 'water') {
      return (
        kind === 'water-rock' &&
        existing.length < 3 &&
        existing.every((entry) => entry.layer === 'water' && entry.kind === 'water-rock')
      );
    }
    if (existing.some((entry) => entry.kind === 'tree' || entry.layer !== layer)) {
      return false;
    }
    if (kind === 'bush') {
      const rockCount = existing.filter((entry) => entry.kind === 'rock').length;
      const bushCount = existing.filter((entry) => entry.kind === 'bush').length;
      return rockCount <= 1 && bushCount < 3 && existing.length < 4;
    }
    if (kind === 'rock') {
      const rockCount = existing.filter((entry) => entry.kind === 'rock').length;
      const bushCount = existing.filter((entry) => entry.kind === 'bush').length;
      return (
        rockCount < 2 &&
        bushCount <= 3 &&
        existing.length < 4 &&
        existing.every((entry) => entry.kind === 'bush' || entry.kind === 'rock')
      );
    }
    return false;
  };

  const canReserve = (
    row: number,
    col: number,
    kind: WfcSampleDecoration['kind'],
    layer: WfcSampleDecoration['layer'],
    slot: DecorationSlot,
    x: number,
    y: number,
    radius: number,
  ): boolean =>
    canShareCell(row, col, kind, layer, slot) &&
    occupied.every((entry) => {
      const dx = entry.x - x;
      const dy = entry.y - y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (entry.row === row && entry.col === col) {
        const minDistance =
          entry.layer === layer && entry.kind !== 'tree' && kind !== 'tree'
            ? Math.max(0.06, entry.radius * 0.18 + radius * 0.18)
            : entry.radius + radius;
        return distance >= minDistance;
      }
      return distance >= entry.radius + radius;
    });

  const reserve = (
    row: number,
    col: number,
    kind: WfcSampleDecoration['kind'],
    layer: WfcSampleDecoration['layer'],
    slot: DecorationSlot,
    x: number,
    y: number,
    radius: number,
  ) => {
    occupied.push({ x, y, radius, row, col, kind, layer, slot });
    const key = `${row},${col}`;
    const entries = occupantsByCell.get(key) ?? [];
    entries.push({ kind, layer, slot });
    occupantsByCell.set(key, entries);
  };

  const pickSlot = (
    row: number,
    col: number,
    kind: WfcSampleDecoration['kind'],
    layer: WfcSampleDecoration['layer'],
    preferredSlots?: DecorationSlot[],
  ): DecorationSlot | null => {
    const key = `${row},${col}`;
    const existing = occupantsByCell.get(key) ?? [];
    const allSlots: DecorationSlot[] = preferredSlots
      ? [...preferredSlots]
      : ['nw', 'ne', 'sw', 'se'];
    const ordered = shuffleCells(
      allSlots.map((slot, index) => ({ row: index, col: 0, slot })),
    ).map((entry) => entry.slot);
    for (const slot of ordered) {
      if (canShareCell(row, col, kind, layer, slot)) {
        if (kind === 'tree' && existing.length > 0) {
          continue;
        }
        return slot;
      }
    }
    return null;
  };

  const buildDecoration = (
    asset: SampleDecorationAsset,
    layer: WfcSampleDecoration['layer'],
    row: number,
    col: number,
    radius: number,
    options: {
      offsetX: number;
      offsetY: number;
      frameIndex?: number;
      preferredSlots?: DecorationSlot[];
    },
  ): WfcSampleDecoration | null => {
    const slot = pickSlot(row, col, asset.kind, layer, options.preferredSlots);
    if (!slot) {
      return null;
    }
    const slotBase = slotOffsets[layer][slot];
    const totalOffsetX = slotBase.x + options.offsetX;
    const totalOffsetY = slotBase.y + options.offsetY;
    const x = col + 0.5 + totalOffsetX;
    const y = row + totalOffsetY;
    if (!canReserve(row, col, asset.kind, layer, slot, x, y, radius)) {
      return null;
    }
    reserve(row, col, asset.kind, layer, slot, x, y, radius);
    return {
      kind: asset.kind,
      layer,
      row,
      col,
      offsetX: totalOffsetX,
      offsetY: totalOffsetY,
      width: asset.width,
      height: asset.height,
      src: asset.src,
      textureKey: asset.textureKey,
      animationKey: asset.animationKey,
      frameCount: asset.frameCount,
      frameIndex: options.frameIndex ?? 0,
      animated: asset.animated,
      animationDurationMs: asset.animationDurationMs,
      animationDelayMs: asset.animated ? Math.floor(rng() * (asset.animationDurationMs ?? 1000)) : 0,
    };
  };

  const shuffleCells = (cells: Array<{ row: number; col: number }>) => {
    for (let index = cells.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(rng() * (index + 1));
      const current = cells[index];
      cells[index] = cells[swapIndex];
      cells[swapIndex] = current;
    }
    return cells;
  };

  const surfaceNeighborCount = (row: number, col: number) =>
    CARDINALS.reduce(
      (sum, { dr, dc }) => sum + (hasLandMask(visibleGroundMask, row + dr, col + dc) ? 1 : 0),
      0,
    );

  const adjacencyCount = (mask: boolean[][], row: number, col: number) =>
    CARDINALS.reduce(
      (sum, { dr, dc }) => sum + (hasLandMask(mask, row + dr, col + dc) ? 1 : 0),
      0,
    );

  const radiusMaskCount = (mask: boolean[][], row: number, col: number, radius: number) => {
    let count = 0;
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (dr === 0 && dc === 0) {
          continue;
        }
        if (hasLandMask(mask, row + dr, col + dc)) {
          count += 1;
        }
      }
    }
    return count;
  };

  const getPreferredLandEdgeSlots = (row: number, col: number): DecorationSlot[] => {
    const slotScores: Record<DecorationSlot, number> = { nw: 0, ne: 0, sw: 0, se: 0 };
    const northOpen = !hasLandMask(visibleGroundMask, row - 1, col);
    const southOpen = !hasLandMask(visibleGroundMask, row + 1, col);
    const westOpen = !hasLandMask(visibleGroundMask, row, col - 1);
    const eastOpen = !hasLandMask(visibleGroundMask, row, col + 1);

    if (northOpen) {
      slotScores.nw += 2;
      slotScores.ne += 2;
    }
    if (southOpen) {
      slotScores.sw += 2;
      slotScores.se += 2;
    }
    if (westOpen) {
      slotScores.nw += 2;
      slotScores.sw += 2;
    }
    if (eastOpen) {
      slotScores.ne += 2;
      slotScores.se += 2;
    }

    const cliffNorth = hasLandMask(cliffMask, row - 1, col);
    const cliffSouth = hasLandMask(cliffMask, row + 1, col);
    const cliffWest = hasLandMask(cliffMask, row, col - 1);
    const cliffEast = hasLandMask(cliffMask, row, col + 1);

    if (cliffNorth) {
      slotScores.nw += 1.2;
      slotScores.ne += 1.2;
    }
    if (cliffSouth) {
      slotScores.sw += 1.2;
      slotScores.se += 1.2;
    }
    if (cliffWest) {
      slotScores.nw += 1.2;
      slotScores.sw += 1.2;
    }
    if (cliffEast) {
      slotScores.ne += 1.2;
      slotScores.se += 1.2;
    }

    return (['nw', 'ne', 'sw', 'se'] as DecorationSlot[]).sort((left, right) => {
      const delta = slotScores[right] - slotScores[left];
      return Math.abs(delta) > 0.001 ? delta : rng() - 0.5;
    });
  };

  const getPreferredWaterEdgeSlots = (row: number, col: number): DecorationSlot[] => {
    const slotScores: Record<DecorationSlot, number> = { nw: 0, ne: 0, sw: 0, se: 0 };
    const northLand = hasLandMask(flatMask, row - 1, col) || hasLandMask(cliffMask, row - 1, col);
    const southLand = hasLandMask(flatMask, row + 1, col) || hasLandMask(cliffMask, row + 1, col);
    const westLand = hasLandMask(flatMask, row, col - 1) || hasLandMask(cliffMask, row, col - 1);
    const eastLand = hasLandMask(flatMask, row, col + 1) || hasLandMask(cliffMask, row, col + 1);

    if (northLand) {
      slotScores.nw += 2;
      slotScores.ne += 2;
    }
    if (southLand) {
      slotScores.sw += 2;
      slotScores.se += 2;
    }
    if (westLand) {
      slotScores.nw += 2;
      slotScores.sw += 2;
    }
    if (eastLand) {
      slotScores.ne += 2;
      slotScores.se += 2;
    }

    return (['nw', 'ne', 'sw', 'se'] as DecorationSlot[]).sort((left, right) => {
      const delta = slotScores[right] - slotScores[left];
      return Math.abs(delta) > 0.001 ? delta : rng() - 0.5;
    });
  };

  const decorNoise = createPerlinNoise2D(seed ^ 0x4bf31c27);

  const buildDistanceField = (
    seeds: Array<{ row: number; col: number }>,
    passable: (row: number, col: number) => boolean,
  ): number[][] => {
    const distances = Array.from({ length: rows }, () =>
      Array<number>(cols).fill(Number.POSITIVE_INFINITY),
    );
    const queue = [...seeds];
    let head = 0;
    for (const cell of seeds) {
      distances[cell.row][cell.col] = 0;
    }
    while (head < queue.length) {
      const current = queue[head++];
      const currentDistance = distances[current.row][current.col];
      for (const { dr, dc } of CARDINALS) {
        const nextRow = current.row + dr;
        const nextCol = current.col + dc;
        if (!hasInBounds(nextRow, nextCol, rows, cols) || !passable(nextRow, nextCol)) {
          continue;
        }
        if (distances[nextRow][nextCol] <= currentDistance + 1) {
          continue;
        }
        distances[nextRow][nextCol] = currentDistance + 1;
        queue.push({ row: nextRow, col: nextCol });
      }
    }
    return distances;
  };

  type ScoredCell = { row: number; col: number; score: number };

  const scoreCells = (
    cells: Array<{ row: number; col: number }>,
    scorer: (row: number, col: number) => number,
  ): ScoredCell[] =>
    cells
      .map(({ row, col }) => ({ row, col, score: scorer(row, col) }))
      .filter((cell) => cell.score > 0.05);

  const weightedPickScored = (cells: ScoredCell[]): ScoredCell => {
    const total = cells.reduce((sum, cell) => sum + Math.max(0.05, cell.score), 0);
    let roll = rng() * total;
    for (const cell of cells) {
      roll -= Math.max(0.05, cell.score);
      if (roll <= 0) {
        return cell;
      }
    }
    return cells[cells.length - 1];
  };

  const pickSpacedAnchors = (
    cells: ScoredCell[],
    anchorCount: number,
    minSpacing: number,
  ): ScoredCell[] => {
    if (anchorCount <= 0 || cells.length === 0) {
      return [];
    }
    const spacingSq = minSpacing * minSpacing;
    const pool = [...cells];
    const anchors: ScoredCell[] = [];

    while (anchors.length < anchorCount && pool.length > 0) {
      const picked = weightedPickScored(pool);
      anchors.push(picked);
      for (let index = pool.length - 1; index >= 0; index--) {
        const dr = pool[index].row - picked.row;
        const dc = pool[index].col - picked.col;
        if (dr * dr + dc * dc <= spacingSq) {
          pool.splice(index, 1);
        }
      }
    }

    return anchors;
  };

  const sortClusterCandidates = (
    anchor: { row: number; col: number },
    cells: ScoredCell[],
    radius: number,
  ): ScoredCell[] =>
    cells
      .filter((cell) => {
        const dr = cell.row - anchor.row;
        const dc = cell.col - anchor.col;
        return dr * dr + dc * dc <= radius * radius;
      })
      .sort(
        (left, right) =>
          right.score + rng() * 0.18 - (left.score + rng() * 0.18),
      );

  const gatherGroundCandidates = (
    predicate: (row: number, col: number) => boolean,
  ): Array<{ row: number; col: number }> => {
    const cells: Array<{ row: number; col: number }> = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!visibleGroundMask[row][col] || blockedGroundMask[row][col]) {
          continue;
        }
        if (predicate(row, col)) {
          cells.push({ row, col });
        }
      }
    }
    return shuffleCells(cells);
  };

  const waterCandidates = shuffleCells(
    Array.from({ length: rows * cols }, (_, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      return { row, col };
    }).filter(({ row, col }) => {
      if (flatMask[row][col] || plateauMask[row][col] || cliffMask[row][col]) {
        return false;
      }
      return CARDINALS.some(
        ({ dr, dc }) => hasLandMask(flatMask, row + dr, col + dc) || hasLandMask(cliffMask, row + dr, col + dc),
      );
    }),
  );

  const tryPlaceMany = (
    candidates: Array<{ row: number; col: number }>,
    targetCount: number,
    place: (row: number, col: number) => WfcSampleDecoration | null,
  ) => {
    let placed = 0;
    for (const candidate of candidates) {
      if (placed >= targetCount) {
        break;
      }
      const decoration = place(candidate.row, candidate.col);
      if (!decoration) {
        continue;
      }
      decorations.push(decoration);
      placed += 1;
    }
  };

  const visibleArea = countTrue(visibleGroundMask);
  if (visibleArea <= 0) {
    return decorations;
  }

  const treeCandidates = gatherGroundCandidates(
    (row, col) => surfaceNeighborCount(row, col) >= 3 && hasLandMask(visibleGroundMask, row - 1, col),
  );
  const bushCandidates = gatherGroundCandidates((row, col) => surfaceNeighborCount(row, col) >= 2);
  const rockCandidates = gatherGroundCandidates((row, col) => surfaceNeighborCount(row, col) >= 1);

  const coastSeedCells = gatherGroundCandidates(
    (row, col) => cardinalWaterCount(visibleGroundMask, row, col) > 0,
  );
  const cliffSeedCells = gatherGroundCandidates(
    (row, col) => adjacencyCount(cliffMask, row, col) > 0,
  );
  const coastDistance = buildDistanceField(
    coastSeedCells,
    (row, col) => visibleGroundMask[row][col] && !blockedGroundMask[row][col],
  );
  const cliffDistance = buildDistanceField(
    cliffSeedCells,
    (row, col) => visibleGroundMask[row][col] && !blockedGroundMask[row][col],
  );

  const treeScored = scoreCells(treeCandidates, (row, col) => {
    const coast = Number.isFinite(coastDistance[row][col]) ? coastDistance[row][col] : 6;
    const cliff = Number.isFinite(cliffDistance[row][col]) ? cliffDistance[row][col] : 5;
    const openness = surfaceNeighborCount(row, col);
    const localNoise = decorNoise(col * 0.16 + 7.4, row * 0.15 + 19.1);
    return (
      0.4 +
      Math.min(5, coast) * 1.15 +
      Math.min(3, cliff) * 0.35 +
      openness * 0.7 +
      radiusMaskCount(visibleGroundMask, row, col, 2) * 0.06 +
      localNoise * 0.9
    );
  });
  const bushScored = scoreCells(bushCandidates, (row, col) => {
    const coast = Number.isFinite(coastDistance[row][col]) ? coastDistance[row][col] : 4;
    const cliff = Number.isFinite(cliffDistance[row][col]) ? cliffDistance[row][col] : 4;
    const localNoise = decorNoise(col * 0.22 + 31.3, row * 0.19 + 5.6);
    const edgeBias = Math.max(0, 4 - surfaceNeighborCount(row, col));
    return (
      0.35 +
      edgeBias * 0.95 +
      Math.max(0, 3.2 - Math.min(3.2, coast)) * 0.45 +
      Math.max(0, 2.8 - Math.min(2.8, cliff)) * 0.4 +
      radiusMaskCount(visibleGroundMask, row, col, 1) * 0.12 +
      Math.max(0, localNoise + 0.25) * 2.1
    );
  });
  const rockScored = scoreCells(rockCandidates, (row, col) => {
    const coast = Number.isFinite(coastDistance[row][col]) ? coastDistance[row][col] : 4;
    const cliff = Number.isFinite(cliffDistance[row][col]) ? cliffDistance[row][col] : 4;
    const localNoise = decorNoise(col * 0.19 + 101.7, row * 0.23 + 72.8);
    const edgeBias = Math.max(0, 4 - surfaceNeighborCount(row, col));
    return (
      0.2 +
      Math.max(0, 3.5 - Math.min(3.5, cliff)) * 1.5 +
      Math.max(0, 2.5 - Math.min(2.5, coast)) * 0.7 +
      edgeBias * 0.9 +
      adjacencyCount(cliffMask, row, col) * 0.9 +
      Math.max(0, localNoise + 0.15) * 1.25
    );
  });
  const waterRockScored = scoreCells(waterCandidates, (row, col) => {
    const landAdj = CARDINALS.reduce(
      (sum, { dr, dc }) =>
        sum +
        (hasLandMask(flatMask, row + dr, col + dc) || hasLandMask(cliffMask, row + dr, col + dc)
          ? 1
          : 0),
      0,
    );
    const cove = radiusMaskCount(flatMask, row, col, 2) + radiusMaskCount(cliffMask, row, col, 2);
    const localNoise = decorNoise(col * 0.17 + 53.9, row * 0.17 + 140.2);
    return 0.4 + landAdj * 1.7 + cove * 0.14 + Math.max(0, localNoise + 0.2) * 1.4;
  });

  const treeTarget =
    visibleArea >= 18
      ? Math.max(0, Math.floor(visibleArea / 32 + 2 + rng() * Math.max(2, visibleArea / 85)))
      : 0;
  const bushTarget = Math.max(0, Math.floor(visibleArea / 18 + 1 + rng() * Math.max(1, visibleArea / 65)));
  const companionBushTarget = Math.max(0, Math.floor(bushTarget * (0.18 + rng() * 0.14)));
  const rockTarget = Math.max(0, Math.floor(visibleArea / 42 + 1 + rng() * Math.max(1, visibleArea / 110)));
  const companionRockTarget = Math.max(0, Math.floor(rockTarget * (0.18 + rng() * 0.14)));
  const waterRockTarget = Math.max(
    0,
    Math.floor((waterCandidates.length / 18) * (0.9 + rng() * 0.9)),
  );
  const companionWaterRockTarget = Math.max(0, Math.floor(waterRockTarget * (0.42 + rng() * 0.2)));

  const treeAnchors = pickSpacedAnchors(
    treeScored,
    treeTarget,
    2.45 + rng() * 0.75,
  );
  const bushAnchors = pickSpacedAnchors(
    bushScored,
    Math.max(1, Math.ceil(bushTarget / (3 + rng() * 2.5))),
    2 + rng() * 0.8,
  );
  const rockAnchors = pickSpacedAnchors(
    rockScored,
    Math.max(1, Math.ceil(rockTarget / (1.5 + rng() * 1.5))),
    1.55 + rng() * 0.55,
  );
  const waterRockAnchors = pickSpacedAnchors(
    waterRockScored,
    Math.max(1, Math.ceil(waterRockTarget / (1.5 + rng() * 1.5))),
    1.75 + rng() * 0.65,
  );

  const tryPlaceClustered = (
    anchors: ScoredCell[],
    scoredCandidates: ScoredCell[],
    targetCount: number,
    place: (row: number, col: number) => WfcSampleDecoration | null,
    options: {
      radius: number;
      minPerCluster: number;
      maxPerCluster: number;
    },
  ) => {
    if (targetCount <= 0 || anchors.length === 0 || scoredCandidates.length === 0) {
      return;
    }
    let placed = 0;

    for (const anchor of anchors) {
      if (placed >= targetCount) {
        break;
      }
      const desired = Math.min(
        targetCount - placed,
        options.minPerCluster +
          Math.floor(rng() * (options.maxPerCluster - options.minPerCluster + 1)),
      );
      const local = sortClusterCandidates(anchor, scoredCandidates, options.radius);

      let clusterPlaced = 0;
      for (const candidate of local) {
        if (placed >= targetCount || clusterPlaced >= desired) {
          break;
        }
        const decoration = place(candidate.row, candidate.col);
        if (!decoration) {
          continue;
        }
        decorations.push(decoration);
        placed += 1;
        clusterPlaced += 1;
      }
    }
  };

  tryPlaceMany(
    treeAnchors.map(({ row, col }) => ({ row, col })),
    treeTarget,
    (row, col) => {
    const asset = pickOne(rng, SAMPLE_TREE_ASSETS);
    return buildDecoration(asset, 'land', row, col, 0.9, {
      offsetX: (rng() - 0.5) * 0.08,
      offsetY: 0.02 + (rng() - 0.5) * 0.05,
      preferredSlots: rng() < 0.5 ? ['sw', 'nw'] : ['se', 'ne'],
    });
    },
  );

  tryPlaceClustered(bushAnchors, bushScored, bushTarget, (row, col) => {
    const asset = pickOne(rng, SAMPLE_BUSH_ASSETS);
    return buildDecoration(asset, 'land', row, col, 0.45, {
      offsetX: (rng() - 0.5) * 0.07,
      offsetY: (rng() - 0.5) * 0.05,
      frameIndex: Math.floor(rng() * asset.frameCount),
      preferredSlots: getPreferredLandEdgeSlots(row, col),
    });
  }, {
    radius: 3,
    minPerCluster: 2,
    maxPerCluster: 6,
  });

  tryPlaceMany(
    shuffleCells(
      bushScored
        .slice()
        .sort((left, right) => right.score - left.score)
        .map(({ row, col }) => ({ row, col })),
    ),
    companionBushTarget,
    (row, col) => {
    const asset = pickOne(rng, SAMPLE_BUSH_ASSETS);
    return buildDecoration(asset, 'land', row, col, 0.22, {
      offsetX: (rng() - 0.5) * 0.06,
      offsetY: (rng() - 0.5) * 0.05,
      frameIndex: Math.floor(rng() * asset.frameCount),
      preferredSlots: getPreferredLandEdgeSlots(row, col),
    });
    },
  );

  tryPlaceClustered(rockAnchors, rockScored, rockTarget, (row, col) => {
    const asset = pickOne(rng, SAMPLE_ROCK_ASSETS);
    return buildDecoration(asset, 'land', row, col, 0.35, {
      offsetX: (rng() - 0.5) * 0.06,
      offsetY: (rng() - 0.5) * 0.04,
      preferredSlots: getPreferredLandEdgeSlots(row, col),
    });
  }, {
    radius: 2,
    minPerCluster: 1,
    maxPerCluster: 3,
  });

  tryPlaceMany(
    shuffleCells(
      rockScored
        .slice()
        .sort((left, right) => right.score - left.score)
        .map(({ row, col }) => ({ row, col })),
    ),
    companionRockTarget,
    (row, col) => {
      const asset = pickOne(rng, SAMPLE_ROCK_ASSETS);
      return buildDecoration(asset, 'land', row, col, 0.18, {
        offsetX: (rng() - 0.5) * 0.05,
        offsetY: (rng() - 0.5) * 0.05,
        preferredSlots: getPreferredLandEdgeSlots(row, col),
      });
    },
  );

  tryPlaceClustered(waterRockAnchors, waterRockScored, waterRockTarget, (row, col) => {
    const asset = pickOne(rng, SAMPLE_WATER_ROCK_ASSETS);
    return buildDecoration(asset, 'water', row, col, 0.4, {
      offsetX: (rng() - 0.5) * 0.05,
      offsetY: (rng() - 0.5) * 0.05,
      preferredSlots: getPreferredWaterEdgeSlots(row, col),
    });
  }, {
    radius: 3,
    minPerCluster: 1,
    maxPerCluster: 3,
  });

  tryPlaceMany(
    shuffleCells(
      waterRockScored
        .slice()
        .sort((left, right) => right.score - left.score)
        .map(({ row, col }) => ({ row, col })),
    ),
    companionWaterRockTarget,
    (row, col) => {
    const asset = pickOne(rng, SAMPLE_WATER_ROCK_ASSETS);
    return buildDecoration(asset, 'water', row, col, 0.2, {
      offsetX: (rng() - 0.5) * 0.05,
      offsetY: (rng() - 0.5) * 0.05,
      preferredSlots: getPreferredWaterEdgeSlots(row, col),
    });
    },
  );

  return decorations;
}

function buildConflictAudit(
  workspace: MappingWorkspace,
  flatGrid: Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>>,
  elevatedLayers: GeneratedPlateauLayer[],
): {
  count: number;
  cells: WfcSampleConflict[];
  flatCells: WfcSampleConflict[];
  elevatedCells: WfcSampleConflict[];
} {
  const grammar = buildTerrainGrammar(workspace);
  const grammarByTileId = new Map(grammar.tiles.map((tile) => [tile.tileId, tile]));
  const marked = new Map<string, WfcSampleConflict>();
  const flatMarked = new Map<string, WfcSampleConflict>();
  const elevatedMarked = new Map<string, WfcSampleConflict>();
  let count = 0;

  const inspectLayer = (
    grid: Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>>,
    layerMarked: Map<string, WfcSampleConflict>,
    supportGrid?: Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>>,
    mode: 'flat' | 'elevated' = 'flat',
  ) => {
    const rows = grid.length;
    const cols = grid[0]?.length ?? 0;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const source = grid[row][col];
        if (!source) {
          continue;
        }
        const sourceMeta = grammarByTileId.get(source.tileId);
        if (!sourceMeta) {
          continue;
        }
        if (mode === 'elevated' && sourceMeta.selfSocket !== 'elevated') {
          continue;
        }
        const sourceRules = getAuthoredTileRules(workspace, source.atlasKey, source.tileId);

        for (const { direction, dr, dc } of CARDINALS) {
          const nextRow = row + dr;
          const nextCol = col + dc;
          const neighbor = hasInBounds(nextRow, nextCol, rows, cols) ? grid[nextRow][nextCol] : null;
          const neighborMeta = neighbor ? grammarByTileId.get(neighbor.tileId) : null;

          if (!neighbor) {
            const supportedByUpper =
              supportGrid &&
              hasInBounds(nextRow, nextCol, rows, cols) &&
              (() => {
                const upper = supportGrid[nextRow][nextCol];
                if (!upper) {
                  return false;
                }
                const upperMeta = grammarByTileId.get(upper.tileId);
                if (!upperMeta) {
                  return false;
                }
                return (
                  sourceMeta.allowsAbove.includes(upperMeta.selfSocket) &&
                  upperMeta.requiresBelow === sourceMeta.selfSocket
                );
              })();

            if (supportedByUpper) {
              continue;
            }

            if (sourceRules.adjacency[direction].length > 0) {
              count += 1;
              marked.set(`${row},${col}`, { row, col });
              layerMarked.set(`${row},${col}`, { row, col });
            }
            continue;
          }

          if (
            mode === 'elevated' &&
            (!neighborMeta || neighborMeta.selfSocket !== 'elevated')
          ) {
            continue;
          }

          if (row > nextRow || (row === nextRow && col > nextCol)) {
            continue;
          }

          const neighborRules = getAuthoredTileRules(workspace, neighbor.atlasKey, neighbor.tileId);
          const sourceAllows = sourceRules.adjacency[direction].includes(neighbor.tileId);
          const neighborAllows =
            neighborRules.adjacency[oppositeDirection(direction)].includes(source.tileId);

          if (!sourceAllows || !neighborAllows) {
            count += 1;
            marked.set(`${row},${col}`, { row, col });
            marked.set(`${nextRow},${nextCol}`, { row: nextRow, col: nextCol });
            layerMarked.set(`${row},${col}`, { row, col });
            layerMarked.set(`${nextRow},${nextCol}`, { row: nextRow, col: nextCol });
          }
        }
      }
    }
  };

  inspectLayer(flatGrid, flatMarked, elevatedLayers[0]?.topGrid, 'flat');
  for (const elevatedLayer of elevatedLayers) {
    inspectLayer(elevatedLayer.topGrid, elevatedMarked, undefined, 'elevated');
  }

  return {
    count,
    cells: [...marked.values()],
    flatCells: [...flatMarked.values()],
    elevatedCells: [...elevatedMarked.values()],
  };
}

function projectPlacedRuleGrid(
  grid: Array<Array<TerrainGrammarTile | null>>,
): Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>> {
  return grid.map((row) =>
    row.map((tile) =>
      tile
        ? {
            tileId: tile.tileId,
            atlasKey: tile.atlasKey,
          }
        : null,
    ),
  );
}

function retintPlacedGrid(
  grid: Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>>,
  atlasKey: AtlasKey,
): Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>> {
  return grid.map((row) =>
    row.map((tile) =>
      tile
        ? {
            tileId: tile.tileId,
            atlasKey,
          }
        : null,
    ),
  );
}

function flattenPlacedTiles(
  grid: Array<Array<TerrainGrammarTile | null>>,
  atlasKey: AtlasKey,
): WfcSampleTile[] {
  const tiles: WfcSampleTile[] = [];
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const tile = grid[row][col];
      if (!tile) {
        continue;
      }
      tiles.push({
        row,
        col,
        tileId: tile.tileId,
        atlasKey,
      });
    }
  }
  return tiles;
}

function flattenPlacedTileIds(
  grid: Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>>,
  atlasKey: AtlasKey,
  terrainLevel: number,
): WfcSampleTile[] {
  const tiles: WfcSampleTile[] = [];
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[row].length; col++) {
      const tile = grid[row][col];
      if (!tile) {
        continue;
      }
      tiles.push({
        row,
        col,
        tileId: tile.tileId,
        atlasKey: tile.atlasKey ?? atlasKey,
        terrainLevel,
      });
    }
  }
  return tiles;
}

function tileIdsToPlacedGrid(
  tileData: number[][],
  atlasKey: AtlasKey,
): Array<Array<{ tileId: number; atlasKey: AtlasKey } | null>> {
  return tileData.map((row) =>
    row.map((tileId) =>
      tileId > 0
        ? {
            tileId,
            atlasKey,
          }
        : null,
    ),
  );
}

function tileToWorld(col: number, row: number, tileSize: number): { x: number; y: number } {
  return {
    x: (col + 0.5) * tileSize,
    y: (row + 0.5) * tileSize,
  };
}

function pickOne<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

function pickFlatTile(
  mask: boolean[][],
  row: number,
  col: number,
  mapping: TerrainAtlasMapping,
): number {
  const n = hasLandMask(mask, row - 1, col);
  const s = hasLandMask(mask, row + 1, col);
  const w = hasLandMask(mask, row, col - 1);
  const e = hasLandMask(mask, row, col + 1);
  const flatGround = mapping.flatGround;
  const middleRow = flatGround.upperRow;
  const bottomRow = flatGround.lowerRow;

  // Single-width vertical protrusions use the dedicated single-column pieces.
  if (!w && !e) {
    if (!n && s) return flatGround.topSingle;
    if (n && !s) return bottomRow.single;

    const upperReach = hasLandMask(mask, row - 2, col);
    return upperReach ? bottomRow.single : middleRow.single;
  }

  // Single-height horizontal ledges use the bottom row strip pieces.
  if (!n && !s) {
    if (!w && e) return flatGround.bottomLeft;
    if (w && !e) return flatGround.bottomRight;
    return flatGround.bottomCenter;
  }

  if (!n && !w) return flatGround.topLeft;
  if (!n && !e) return flatGround.topRight;
  if (!s && !w) return bottomRow.left;
  if (!s && !e) return bottomRow.right;
  if (!n) return flatGround.topCenter;
  if (!s) return bottomRow.center;
  if (!w) return middleRow.left;
  if (!e) return middleRow.right;
  return middleRow.center;
}

function pickElevatedTopTile(
  mask: boolean[][],
  row: number,
  col: number,
  mapping: TerrainAtlasMapping,
  stairs: StairPreviewList = [],
): number {
  const attachment = getStairAttachmentForTopCell(stairs, row, col);
  const n = hasLandMask(mask, row - 1, col);
  const s = hasLandMask(mask, row + 1, col);
  const w = hasLandMask(mask, row, col - 1) || attachment.west;
  const e = hasLandMask(mask, row, col + 1) || attachment.east;
  const elevatedTop = mapping.elevatedTop;
  const middleRow = elevatedTop.upperRow;
  const bottomLipRow = elevatedTop.middleRow;

  if (!w && !e) {
    if (!n && !s) return elevatedTop.bottomSingle;
    if (!n && s) return elevatedTop.topSingle;
    if (n && !s) return bottomLipRow.single;
    return middleRow.single;
  }

  if (!n && !s) {
    if (!w && e) return elevatedTop.bottomLeft;
    if (w && !e) return elevatedTop.bottomRight;
    return elevatedTop.bottomCenter;
  }

  if (!n && !w) return elevatedTop.topLeft;
  if (!n && !e) return elevatedTop.topRight;
  if (!s && !w) return bottomLipRow.left;
  if (!s && !e) return bottomLipRow.right;
  if (!n) return elevatedTop.topCenter;
  if (!s) return bottomLipRow.center;
  if (!w) return middleRow.left;
  if (!e) return middleRow.right;
  return middleRow.center;
}

function createBoolGrid(rows: number, cols: number, value: boolean): boolean[][] {
  return Array.from({ length: rows }, () => Array<boolean>(cols).fill(value));
}

function createTileGrid<T>(rows: number, cols: number, value: T): T[][] {
  return Array.from({ length: rows }, () => Array<T>(cols).fill(value));
}

function applyMask(target: boolean[][], mask: boolean[][], value: boolean): void {
  for (let row = 0; row < target.length; row++) {
    for (let col = 0; col < target[row].length; col++) {
      if (mask[row][col]) {
        target[row][col] = value;
      }
    }
  }
}

function pickStripTile(
  mask: boolean[][],
  row: number,
  col: number,
  strip: { left: number; center: number; right: number; single: number },
  stairs: StairPreviewList = [],
): number {
  const attachment = getStairAttachmentForCliffCell(stairs, row, col);
  const west = hasLandMask(mask, row, col - 1) || attachment.west;
  const east = hasLandMask(mask, row, col + 1) || attachment.east;
  if (!west && !east) return strip.single;
  if (!west) return strip.left;
  if (!east) return strip.right;
  return strip.center;
}

function getStairAttachmentForTopCell(
  stairs: StairPreviewList,
  row: number,
  col: number,
): { west: boolean; east: boolean } {
  for (const stair of stairs) {
    if (stair.topRow !== row) {
      continue;
    }
    if (stair.variant === 'left' && col === stair.col + 1) {
      return { west: true, east: false };
    }
    if (stair.variant === 'right' && col === stair.col - 1) {
      return { west: false, east: true };
    }
  }

  return { west: false, east: false };
}

function getStairAttachmentForCliffCell(
  stairs: StairPreviewList,
  row: number,
  col: number,
): { west: boolean; east: boolean } {
  for (const stair of stairs) {
    if (stair.topRow + 1 !== row) {
      continue;
    }
    if (stair.variant === 'left' && col === stair.col + 1) {
      return { west: true, east: false };
    }
    if (stair.variant === 'right' && col === stair.col - 1) {
      return { west: false, east: true };
    }
  }

  return { west: false, east: false };
}

function hasLandMask(mask: boolean[][], row: number, col: number): boolean {
  if (row < 0 || col < 0 || row >= mask.length || col >= mask[0].length) {
    return false;
  }
  return mask[row][col];
}

function hasPlacedTile(
  grid: Array<Array<TerrainGrammarTile | null>>,
  row: number,
  col: number,
): boolean {
  return hasInBounds(row, col, grid.length, grid[0]?.length ?? 0) ? grid[row][col] !== null : false;
}

function hasInBounds(row: number, col: number, rows: number, cols: number): boolean {
  return row >= 0 && col >= 0 && row < rows && col < cols;
}

function cardinalWaterCount(mask: boolean[][], row: number, col: number): number {
  return CARDINALS.reduce(
    (count, { dr, dc }) => count + (hasLandMask(mask, row + dr, col + dc) ? 0 : 1),
    0,
  );
}

function oppositeDirection(
  direction: 'north' | 'east' | 'south' | 'west',
): 'north' | 'east' | 'south' | 'west' {
  if (direction === 'north') return 'south';
  if (direction === 'east') return 'west';
  if (direction === 'south') return 'north';
  return 'east';
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
