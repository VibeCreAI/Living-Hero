import { Position, TileCoord } from '../types';
import {
  AtlasKey,
  createWorkspace,
  getAuthoredTileRules,
  getTerrainAtlasMapping,
  loadWorkspace,
  MappingWorkspace,
  prepareWorkspace,
  TerrainAtlasMapping,
} from './tileMapping';
import { buildTerrainGrammar, TerrainGrammarTile } from './terrainGrammar';
import { generateWfcSampleMap, WfcSampleDecoration, WfcSampleMap, WfcSampleTile } from './wfcSampleMap';

export interface OverworldTerrainOptions {
  cols: number;
  rows: number;
  tileSize: number;
  seed: number;
  nodeAnchors: {
    heroSpawn: Position;
    portal: Position;
    trainingGrounds: Position;
  };
  mappingWorkspace?: MappingWorkspace;
  flatAtlasKey?: AtlasKey;
  elevatedAtlasKey?: AtlasKey;
  strictTileConstraints?: boolean;
  profile?: 'overworld';
}

export interface TerrainTileLayer {
  key: string;
  depth: number;
  tileData: number[][];
}

export interface OverlayStamp {
  kind: 'foam' | 'shadow';
  col: number;
  row: number;
  scale: number;
  depth: number;
  framePolicy: 'random-start' | 'static';
}

export interface TerrainZone {
  kind:
    | 'anchor_clear'
    | 'travel_corridor'
    | 'stair_landing'
    | 'bush_cluster'
    | 'tree_grove'
    | 'shore_rock'
    | 'inland_rock';
  col: number;
  row: number;
  radius: number;
}

export interface GeneratedTerrainMap {
  tileLayers: TerrainTileLayer[];
  foamStamps: OverlayStamp[];
  shadowStamps: OverlayStamp[];
  heightMap: number[][];
  walkMask: boolean[][];
  passabilityMap: Array<
    Array<{
      north: boolean;
      east: boolean;
      south: boolean;
      west: boolean;
    }>
  >;
  clearZones: TerrainZone[];
  decorationZones: TerrainZone[];
  sampleDecorations?: WfcSampleDecoration[];
  placements?: {
    heroSpawn: Position;
    portal: Position;
    trainingGrounds: Position;
  };
}

interface AnchorContext {
  world: Position;
  tile: TileCoord;
}

interface TerrainAnchors {
  heroSpawn: AnchorContext;
  portal: AnchorContext;
  trainingGrounds: AnchorContext;
}

interface StairSpec {
  col: number;
  topRow: number;
  variant: 'left' | 'right';
  style: 'open' | 'cliff';
}

interface PlateauBuildResult {
  plateauMask: boolean[][];
  stair: StairSpec;
}

interface CliffBands {
  land: boolean[][];
  water: boolean[][];
  mask: boolean[][];
}

export interface ConstraintFailureCell {
  row: number;
  col: number;
  issue: 'no_topology_match' | 'propagation_empty';
  expectedOpenDirections: Array<'north' | 'east' | 'south' | 'west'>;
  candidateTileIds: number[];
  neighborOptionTileIds: Partial<Record<'north' | 'east' | 'south' | 'west', number[]>>;
}

export interface ConstraintFailureDiagnostics {
  layer: 'flat' | 'elevated';
  seed: number;
  cells: ConstraintFailureCell[];
}

interface PreparedIslandGeometry {
  anchors: TerrainAnchors;
  landMask: boolean[][];
  plateauMask: boolean[][];
  stair: StairSpec;
  cliffBands: CliffBands;
  walkMask: boolean[][];
  heightMap: number[][];
  clearZones: TerrainZone[];
  decorationZones: TerrainZone[];
}

const OVERWORLD_DEPTHS = {
  foam: -52,
  flat: -40,
  shadow: -24,
  elevated: -16,
} as const;

const CARDINALS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const DIRECTION_STEPS: ReadonlyArray<{
  direction: 'north' | 'east' | 'south' | 'west';
  dr: number;
  dc: number;
}> = [
  { direction: 'north', dr: -1, dc: 0 },
  { direction: 'east', dr: 0, dc: 1 },
  { direction: 'south', dr: 1, dc: 0 },
  { direction: 'west', dr: 0, dc: -1 },
];
const EMPTY_STATE = '__empty__';

export function generateIslandMap(options: OverworldTerrainOptions): GeneratedTerrainMap {
  if (options.profile === 'overworld') {
    return generateIslandMapFromSample(options);
  }

  const maxAttempts = 18;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptSeed = options.seed + attempt * 977;
    const generated = tryGenerateIslandMap({ ...options, seed: attemptSeed }, true);
    if (generated) {
      return generated;
    }
  }

  if (!options.strictTileConstraints) {
    const fallback = tryGenerateIslandMap(options, false);
    if (fallback) {
      return fallback;
    }
  }

  throw new Error('Failed to generate a valid island terrain from the current tile constraints.');
}

function generateIslandMapFromSample(options: OverworldTerrainOptions): GeneratedTerrainMap {
  const workspace = prepareWorkspace(
    options.mappingWorkspace ??
      loadWorkspace() ??
      createWorkspace('flat-guide', 'terrain-tileset'),
  );
  const sample = chooseOverworldSample(workspace, options);
  const mapping = getTerrainAtlasMapping(workspace);
  const rows = options.rows;
  const cols = options.cols;

  const flatLayerKey = sample.flatTiles[0]?.atlasKey ?? options.flatAtlasKey ?? 'terrain-tileset';
  const elevatedLayerKey =
    sample.elevatedTiles[0]?.atlasKey ?? options.elevatedAtlasKey ?? 'terrain-tileset-alt';
  const flatLayer = buildTileLayerFromSampleTiles(sample.flatTiles, rows, cols);
  const elevatedLayer = buildTileLayerFromSampleTiles(sample.elevatedTiles, rows, cols);

  const landMask = createBoolGrid(rows, cols, false);
  for (const tile of sample.flatTiles) {
    landMask[tile.row][tile.col] = true;
  }

  const elevatedTopIds = new Set<number>([
    mapping.elevatedTop.topLeft,
    mapping.elevatedTop.topCenter,
    mapping.elevatedTop.topRight,
    mapping.elevatedTop.topSingle,
    mapping.elevatedTop.upperRow.left,
    mapping.elevatedTop.upperRow.center,
    mapping.elevatedTop.upperRow.right,
    mapping.elevatedTop.upperRow.single,
    mapping.elevatedTop.middleRow.left,
    mapping.elevatedTop.middleRow.center,
    mapping.elevatedTop.middleRow.right,
    mapping.elevatedTop.middleRow.single,
    mapping.elevatedTop.bottomLeft,
    mapping.elevatedTop.bottomCenter,
    mapping.elevatedTop.bottomRight,
    mapping.elevatedTop.bottomSingle,
  ]);
  const cliffIds = new Set<number>([
    mapping.cliffs.land.left,
    mapping.cliffs.land.center,
    mapping.cliffs.land.right,
    mapping.cliffs.land.single,
    mapping.cliffs.water.left,
    mapping.cliffs.water.center,
    mapping.cliffs.water.right,
    mapping.cliffs.water.single,
  ]);
  const upperStairIds = new Map<number, StairSpec['variant']>([
    [mapping.stairs.left.upper, 'left'],
    [mapping.stairs.right.upper, 'right'],
  ]);
  const lowerStairIds = new Map<number, StairSpec['variant']>([
    [mapping.stairs.left.lower, 'left'],
    [mapping.stairs.right.lower, 'right'],
  ]);

  const plateauMask = createBoolGrid(rows, cols, false);
  const cliffMask = createBoolGrid(rows, cols, false);
  const stairs: StairSpec[] = [];

  for (const tile of sample.elevatedTiles) {
    if (elevatedTopIds.has(tile.tileId)) {
      plateauMask[tile.row][tile.col] = true;
    } else if (cliffIds.has(tile.tileId)) {
      cliffMask[tile.row][tile.col] = true;
    }
  }

  for (const tile of sample.elevatedTiles) {
    const variant = upperStairIds.get(tile.tileId);
    if (!variant) {
      continue;
    }
    const lowerRow = tile.row + 1;
    if (!inBounds(lowerRow, tile.col, rows, cols)) {
      continue;
    }
    const lowerTileId = elevatedLayer[lowerRow][tile.col];
    if (lowerStairIds.get(lowerTileId) !== variant) {
      continue;
    }
    stairs.push({
      col: tile.col,
      topRow: tile.row,
      variant,
      style: 'open',
    });
  }

  const walkMask = createBoolGrid(rows, cols, false);
  const heightMap = createNumberGrid(rows, cols, 0);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (landMask[row][col]) {
        heightMap[row][col] = 1;
        walkMask[row][col] = !cliffMask[row][col];
      }
      if (plateauMask[row][col]) {
        heightMap[row][col] = 2;
        walkMask[row][col] = true;
      }
    }
  }
  for (const stair of stairs) {
    if (inBounds(stair.topRow, stair.col, rows, cols)) {
      walkMask[stair.topRow][stair.col] = true;
      heightMap[stair.topRow][stair.col] = 2;
    }
    if (inBounds(stair.topRow + 1, stair.col, rows, cols)) {
      walkMask[stair.topRow + 1][stair.col] = true;
      if (heightMap[stair.topRow + 1][stair.col] === 0) {
        heightMap[stair.topRow + 1][stair.col] = 1;
      }
    }
  }

  const passabilityMap = buildPassabilityMapFromSample(
    workspace,
    sample,
    walkMask,
    elevatedTopIds,
    upperStairIds,
    lowerStairIds,
    rows,
    cols,
  );

  const placements = deriveOverworldPlacementsFromSample(
    landMask,
    plateauMask,
    cliffMask,
    walkMask,
    stairs,
    options.tileSize,
  );
  const anchors = buildAnchorContexts(placements, options.tileSize, cols, rows);
  const clearZones = buildClearZones(anchors);
  const primaryStair =
    stairs[0] ??
    ({
      col: anchors.trainingGrounds.tile.col,
      topRow: anchors.trainingGrounds.tile.row + 1,
      variant: 'left',
      style: 'open',
    } satisfies StairSpec);
  const decorationZones = buildDecorationZones(
    landMask,
    plateauMask,
    walkMask,
    clearZones,
    primaryStair,
    anchors,
    options.seed,
  );

  return {
    tileLayers: [
      {
        key: flatLayerKey,
        depth: OVERWORLD_DEPTHS.flat,
        tileData: flatLayer,
      },
      {
        key: elevatedLayerKey,
        depth: OVERWORLD_DEPTHS.elevated,
        tileData: elevatedLayer,
      },
    ],
    foamStamps: sample.foamStamps.map((stamp) => ({
      kind: 'foam',
      col: stamp.col,
      row: stamp.row,
      scale: stamp.scale,
      depth: OVERWORLD_DEPTHS.foam,
      framePolicy: 'random-start',
    })),
    shadowStamps: sample.shadowStamps.map((stamp) => ({
      kind: 'shadow',
      col: stamp.col,
      row: stamp.row,
      scale: stamp.scale,
      depth: OVERWORLD_DEPTHS.shadow,
      framePolicy: 'static',
    })),
    heightMap,
    walkMask,
    passabilityMap,
    clearZones,
    decorationZones,
    sampleDecorations: sample.decorations,
    placements,
  };
}

function chooseOverworldSample(
  workspace: MappingWorkspace,
  options: OverworldTerrainOptions,
): WfcSampleMap {
  const attempts = 16;
  let bestSample: WfcSampleMap | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const sample = generateWfcSampleMap(workspace, {
      seed: options.seed + attempt * 977,
      cols: options.cols,
      rows: options.rows,
      randomness: 0.35,
    });
    const score =
      sample.stats.plateauTiles * 1000 +
      sample.decorations.length * 8 -
      sample.stats.ruleConflicts * 100 -
      (sample.failureReason ? 250 : 0);
    if (score > bestScore) {
      bestScore = score;
      bestSample = sample;
    }
    if (sample.stats.plateauTiles > 0 && !sample.failureReason) {
      return sample;
    }
  }

  return bestSample!;
}

function buildTileLayerFromSampleTiles(
  tiles: WfcSampleTile[],
  rows: number,
  cols: number,
): number[][] {
  const tileData = createNumberGrid(rows, cols, 0);
  for (const tile of tiles) {
    if (inBounds(tile.row, tile.col, rows, cols)) {
      tileData[tile.row][tile.col] = tile.tileId;
    }
  }
  return tileData;
}

function buildPassabilityMapFromSample(
  workspace: MappingWorkspace,
  sample: WfcSampleMap,
  walkMask: boolean[][],
  elevatedTopIds: Set<number>,
  upperStairIds: Map<number, StairSpec['variant']>,
  lowerStairIds: Map<number, StairSpec['variant']>,
  rows: number,
  cols: number,
): GeneratedTerrainMap['passabilityMap'] {
  const defaultPassable = { north: false, east: false, south: false, west: false };
  const passabilityMap = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ ...defaultPassable })),
  );
  const flatByCell = new Map<string, WfcSampleTile>();
  const elevatedByCell = new Map<string, WfcSampleTile>();

  for (const tile of sample.flatTiles) {
    flatByCell.set(`${tile.row},${tile.col}`, tile);
  }
  for (const tile of sample.elevatedTiles) {
    elevatedByCell.set(`${tile.row},${tile.col}`, tile);
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!walkMask[row][col]) {
        continue;
      }

      const cellKey = `${row},${col}`;
      const elevatedTile = elevatedByCell.get(cellKey);
      const flatTile = flatByCell.get(cellKey);
      const usesElevatedRules =
        elevatedTile &&
        (elevatedTopIds.has(elevatedTile.tileId) ||
          upperStairIds.has(elevatedTile.tileId) ||
          lowerStairIds.has(elevatedTile.tileId));
      const sourceTile = usesElevatedRules ? elevatedTile : flatTile;

      if (!sourceTile) {
        passabilityMap[row][col] = { north: true, east: true, south: true, west: true };
        continue;
      }

      passabilityMap[row][col] = { ...getAuthoredTileRules(workspace, sourceTile.atlasKey, sourceTile.tileId).passable };
    }
  }

  return passabilityMap;
}

function buildDefaultPassabilityMap(
  walkMask: boolean[][],
): GeneratedTerrainMap['passabilityMap'] {
  return walkMask.map((row) =>
    row.map((walkable) => ({
      north: walkable,
      east: walkable,
      south: walkable,
      west: walkable,
    })),
  );
}

function deriveOverworldPlacementsFromSample(
  landMask: boolean[][],
  plateauMask: boolean[][],
  cliffMask: boolean[][],
  walkMask: boolean[][],
  stairs: StairSpec[],
  tileSize: number,
): {
  heroSpawn: Position;
  portal: Position;
  trainingGrounds: Position;
} {
  const rows = landMask.length;
  const cols = landMask[0]?.length ?? 0;
  const plateauBounds = getMaskBounds(plateauMask);
  const plateauCenter = plateauBounds
    ? {
        row: (plateauBounds.minRow + plateauBounds.maxRow) / 2,
        col: (plateauBounds.minCol + plateauBounds.maxCol) / 2,
      }
    : { row: rows * 0.4, col: cols * 0.5 };

  const trainingTile =
    pickBestTile(
      rows,
      cols,
      (row, col) =>
        plateauMask[row][col] &&
        !cliffMask[row][col] &&
        cardinalLandCount(plateauMask, row, col) >= 2 &&
        !stairs.some((stair) => Math.abs(stair.topRow - row) <= 1 && Math.abs(stair.col - col) <= 2),
      (row, col) => {
        const plateauNeighbors = cardinalLandCount(plateauMask, row, col);
        const dist = Math.abs(row - plateauCenter.row) + Math.abs(col - plateauCenter.col);
        return plateauNeighbors * 12 - dist * 2;
      },
    ) ??
    pickBestTile(
      rows,
      cols,
      (row, col) => plateauMask[row][col] && !cliffMask[row][col],
      (row, col) => -Math.abs(row - plateauCenter.row) - Math.abs(col - plateauCenter.col),
    ) ??
    { row: Math.floor(rows * 0.45), col: Math.floor(cols * 0.5) };

  const landingTarget =
    stairs[0]
      ? {
          row: stairs[0].topRow + 2,
          col: stairs[0].variant === 'left' ? stairs[0].col - 1 : stairs[0].col + 1,
        }
      : { row: rows * 0.72, col: cols * 0.46 };
  const heroTile =
    pickBestTile(
      rows,
      cols,
      (row, col) => walkMask[row][col] && !plateauMask[row][col] && !cliffMask[row][col],
      (row, col) => {
        const distToLanding = Math.abs(row - landingTarget.row) + Math.abs(col - landingTarget.col);
        const distToTraining = Math.abs(row - trainingTile.row) + Math.abs(col - trainingTile.col);
        return row * 1.8 - distToLanding * 2.2 - distToTraining * 0.8 - Math.abs(col - cols * 0.5) * 0.4;
      },
    ) ??
    trainingTile;

  const portalTile =
    pickBestTile(
      rows,
      cols,
      (row, col) =>
        walkMask[row][col] &&
        !plateauMask[row][col] &&
        !cliffMask[row][col] &&
        (Math.abs(row - heroTile.row) + Math.abs(col - heroTile.col) >= 8),
      (row, col) => {
        const distHero = Math.abs(row - heroTile.row) + Math.abs(col - heroTile.col);
        const distTraining = Math.abs(row - trainingTile.row) + Math.abs(col - trainingTile.col);
        return distHero * 1.2 + distTraining * 1.6 + col * 0.9;
      },
    ) ??
    heroTile;

  return {
    heroSpawn: tileToWorldPosition(heroTile, tileSize),
    portal: tileToWorldPosition(portalTile, tileSize),
    trainingGrounds: tileToWorldPosition(trainingTile, tileSize),
  };
}

function pickBestTile(
  rows: number,
  cols: number,
  predicate: (row: number, col: number) => boolean,
  score: (row: number, col: number) => number,
): TileCoord | null {
  let best: TileCoord | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!predicate(row, col)) {
        continue;
      }
      const currentScore = score(row, col);
      if (currentScore > bestScore) {
        bestScore = currentScore;
        best = { row, col };
      }
    }
  }

  return best;
}

function getMaskBounds(mask: boolean[][]): {
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

function tryGenerateIslandMap(
  options: OverworldTerrainOptions,
  useConstraintSolver: boolean,
): GeneratedTerrainMap | null {
  const { cols, rows, seed } = options;
  const prepared = prepareIslandGeometry(options);
  const tileLayers = buildTileLayers(
    prepared.landMask,
    prepared.plateauMask,
    prepared.cliffBands,
    prepared.stair,
    rows,
    cols,
    seed,
    useConstraintSolver,
    options.mappingWorkspace,
    options.flatAtlasKey,
    options.elevatedAtlasKey,
  );
  if (!tileLayers) {
    return null;
  }
  const shadowStamps = buildShadowStamps(
    prepared.plateauMask,
    prepared.landMask,
    prepared.stair,
    rows,
    cols,
  );
  const foamStamps = buildFoamStamps(prepared.landMask, prepared.cliffBands.mask, rows, cols);
  const passabilityMap = buildDefaultPassabilityMap(prepared.walkMask);

  return {
    tileLayers,
    foamStamps,
    shadowStamps,
    heightMap: prepared.heightMap,
    walkMask: prepared.walkMask,
    passabilityMap,
    clearZones: prepared.clearZones,
    decorationZones: prepared.decorationZones,
  };
}

function prepareIslandGeometry(options: OverworldTerrainOptions): PreparedIslandGeometry {
  const { cols, rows, tileSize, seed } = options;
  const rng = mulberry32(seed);
  const anchors = buildAnchorContexts(options.nodeAnchors, tileSize, cols, rows);

  const protectedLand = createBoolGrid(rows, cols, false);
  paintProtectedLand(protectedLand, anchors);

  let landMask = buildBaseLandMask(cols, rows, rng, anchors);
  applyMask(landMask, protectedLand, true);
  landMask = repairLandMask(landMask, protectedLand, anchors.portal.tile);
  landMask = ensureCorridors(landMask, anchors);
  landMask = repairLandMask(landMask, protectedLand, anchors.portal.tile);

  const clearZones = buildClearZones(anchors);
  const { plateauMask, stair } = buildPlateauMask(landMask, anchors, seed);
  landMask = widenLandMaskForStair(landMask, stair);

  const heightMap = buildHeightMap(landMask, plateauMask);
  const cliffBands = buildCliffBands(landMask, plateauMask, stair, rows, cols);
  const walkMask = buildWalkMask(landMask, cliffBands.mask, stair, plateauMask);
  const decorationZones = buildDecorationZones(
    landMask,
    plateauMask,
    walkMask,
    clearZones,
    stair,
    anchors,
    seed,
  );

  return {
    anchors,
    landMask,
    plateauMask,
    stair,
    cliffBands,
    walkMask,
    heightMap,
    clearZones,
    decorationZones,
  };
}

export function diagnoseIslandConstraintFailure(
  options: OverworldTerrainOptions,
): ConstraintFailureDiagnostics | null {
  const grammar = buildTerrainGrammar(options.mappingWorkspace);
  const flatCandidates = grammar.tiles.filter((tile) => tile.templateKey === 'flat-guide');
  const elevatedCandidates = grammar.tiles.filter(
    (tile) => tile.templateKey === 'elevated-guide' && tile.selfSocket === 'elevated',
  );
  let bestFailure: ConstraintFailureDiagnostics | null = null;
  const maxAttempts = 18;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const attemptSeed = options.seed + attempt * 977;
    const prepared = prepareIslandGeometry({ ...options, seed: attemptSeed });
    const flatFailure = diagnoseMaskedTileLayer(
      prepared.landMask,
      flatCandidates,
      'flat',
      attemptSeed + 17,
    );
    const elevatedFailure =
      flatFailure ??
      diagnoseMaskedTileLayer(
        prepared.plateauMask,
        elevatedCandidates,
        'elevated',
        attemptSeed + 31,
      );

    if (!elevatedFailure) {
      return null;
    }
    if (
      !bestFailure ||
      elevatedFailure.cells.length < bestFailure.cells.length ||
      (elevatedFailure.cells.length === bestFailure.cells.length &&
        elevatedFailure.layer === 'flat' &&
        bestFailure.layer === 'elevated')
    ) {
      bestFailure = elevatedFailure;
    }
  }

  return bestFailure;
}

function diagnoseMaskedTileLayer(
  mask: boolean[][],
  candidates: TerrainGrammarTile[],
  layer: ConstraintFailureDiagnostics['layer'],
  seed: number,
): ConstraintFailureDiagnostics | null {
  const rows = mask.length;
  const cols = mask[0]?.length ?? 0;
  const tileByKey = new Map(candidates.map((tile) => [tile.key, tile]));
  const candidateKeys = candidates.map((tile) => tile.key);
  const topologyFailures: ConstraintFailureCell[] = [];
  const domains = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      if (!mask[row][col]) {
        return new Set<string>([EMPTY_STATE]);
      }
      const matchingKeys = candidateKeys.filter((key) =>
        candidateMatchesMask(tileByKey.get(key)!, mask, row, col),
      );
      if (matchingKeys.length === 0) {
        topologyFailures.push(buildTopologyFailureCell(mask, row, col, candidates));
      }
      return new Set<string>(matchingKeys);
    }),
  );

  if (topologyFailures.length > 0) {
    return {
      layer,
      seed,
      cells: topologyFailures.slice(0, 12),
    };
  }

  const propagationFailure = propagateDomainsForDiagnostics(domains, tileByKey, mask);
  if (propagationFailure) {
    return {
      layer,
      seed,
      cells: propagationFailure.slice(0, 12),
    };
  }

  const rng = mulberry32(seed);
  const searchFailure = diagnoseDomainSearchFailure(domains, tileByKey, mask, rng, rows, cols);
  if (!searchFailure) {
    return null;
  }

  return {
    layer,
    seed,
    cells: searchFailure.slice(0, 12),
  };
}

function diagnoseDomainSearchFailure(
  domains: Set<string>[][],
  tileByKey: Map<string, TerrainGrammarTile>,
  mask: boolean[][],
  rng: () => number,
  rows: number,
  cols: number,
): ConstraintFailureCell[] | null {
  const target = pickLowestEntropyDomain(domains);
  if (!target) {
    return null;
  }

  const choices = [...domains[target.row][target.col]];
  orderDomainChoices(choices, tileByKey, target.row, target.col, rows, cols, rng);
  let bestFailure: ConstraintFailureCell[] | null = null;

  for (const choice of choices) {
    const nextDomains = cloneDomains(domains);
    nextDomains[target.row][target.col] = new Set([choice]);
    const propagationFailure = propagateDomainsForDiagnostics(
      nextDomains,
      tileByKey,
      mask,
      [{ row: target.row, col: target.col }],
    );
    if (propagationFailure) {
      bestFailure = pickBetterFailureSet(bestFailure, propagationFailure);
      continue;
    }

    const recursiveFailure = diagnoseDomainSearchFailure(
      nextDomains,
      tileByKey,
      mask,
      rng,
      rows,
      cols,
    );
    if (!recursiveFailure) {
      return null;
    }
    bestFailure = pickBetterFailureSet(bestFailure, recursiveFailure);
  }

  return (
    bestFailure ??
    [
      buildPropagationFailureCell(
        mask,
        target.row,
        target.col,
        [...domains[target.row][target.col]],
        domains,
        tileByKey,
      ),
    ]
  );
}

function propagateDomainsForDiagnostics(
  domains: Set<string>[][],
  tileByKey: Map<string, TerrainGrammarTile>,
  mask: boolean[][],
  seeds: Array<{ row: number; col: number }> = [],
): ConstraintFailureCell[] | null {
  const rows = domains.length;
  const cols = domains[0]?.length ?? 0;
  const queue = seeds.length > 0 ? [...seeds] : buildDomainQueue(rows, cols);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDomain = domains[current.row][current.col];

    for (const { direction, dr, dc } of DIRECTION_STEPS) {
      const nextRow = current.row + dr;
      const nextCol = current.col + dc;
      if (!inBounds(nextRow, nextCol, rows, cols)) {
        continue;
      }

      const nextDomain = domains[nextRow][nextCol];
      const filtered = new Set(
        [...nextDomain].filter((candidateState) =>
          [...currentDomain].some((currentState) =>
            areStatesCompatible(currentState, candidateState, direction, tileByKey),
          ),
        ),
      );

      if (filtered.size === 0) {
        return [
          buildPropagationFailureCell(
            mask,
            nextRow,
            nextCol,
            [...nextDomain],
            domains,
            tileByKey,
          ),
        ];
      }
      if (filtered.size !== nextDomain.size) {
        domains[nextRow][nextCol] = filtered;
        queue.push({ row: nextRow, col: nextCol });
      }
    }
  }

  return null;
}

function buildTopologyFailureCell(
  mask: boolean[][],
  row: number,
  col: number,
  candidates: TerrainGrammarTile[],
): ConstraintFailureCell {
  const expectedOpenDirections = getExpectedOpenDirections(mask, row, col);
  const rankedTiles = candidates
    .map((tile) => ({
      tile,
      score: DIRECTION_STEPS.reduce((score, { direction }) => {
        const expectsNeighbor = expectedOpenDirections.includes(direction);
        const tileOpens = tile.adjacencyRules[direction].length > 0;
        return score + (expectsNeighbor === tileOpens ? 1 : 0);
      }, 0),
    }))
    .sort((left, right) => right.score - left.score || left.tile.tileId - right.tile.tileId)
    .slice(0, 8)
    .map(({ tile }) => tile);

  return {
    row,
    col,
    issue: 'no_topology_match',
    expectedOpenDirections,
    candidateTileIds: rankedTiles.map((tile) => tile.tileId),
    neighborOptionTileIds: Object.fromEntries(
      DIRECTION_STEPS.map(({ direction }) => [
        direction,
        uniqueSortedNumbers(rankedTiles.flatMap((tile) => tile.adjacencyRules[direction])).slice(0, 8),
      ]),
    ) as ConstraintFailureCell['neighborOptionTileIds'],
  };
}

function buildPropagationFailureCell(
  mask: boolean[][],
  row: number,
  col: number,
  states: string[],
  domains: Set<string>[][],
  tileByKey: Map<string, TerrainGrammarTile>,
): ConstraintFailureCell {
  return {
    row,
    col,
    issue: 'propagation_empty',
    expectedOpenDirections: getExpectedOpenDirections(mask, row, col),
    candidateTileIds: tileIdsFromStates(states, tileByKey),
    neighborOptionTileIds: collectNeighborOptionTileIds(row, col, domains, tileByKey),
  };
}

function collectNeighborOptionTileIds(
  row: number,
  col: number,
  domains: Set<string>[][],
  tileByKey: Map<string, TerrainGrammarTile>,
): ConstraintFailureCell['neighborOptionTileIds'] {
  const rows = domains.length;
  const cols = domains[0]?.length ?? 0;
  const result: ConstraintFailureCell['neighborOptionTileIds'] = {};

  for (const { direction, dr, dc } of DIRECTION_STEPS) {
    const nextRow = row + dr;
    const nextCol = col + dc;
    if (!inBounds(nextRow, nextCol, rows, cols)) {
      result[direction] = [];
      continue;
    }
    result[direction] = tileIdsFromStates([...domains[nextRow][nextCol]], tileByKey).slice(0, 8);
  }

  return result;
}

function tileIdsFromStates(
  states: string[],
  tileByKey: Map<string, TerrainGrammarTile>,
): number[] {
  return uniqueSortedNumbers(
    states.flatMap((state) => {
      if (!state || state === EMPTY_STATE) {
        return [];
      }
      const tile = tileByKey.get(state);
      return tile ? [tile.tileId] : [];
    }),
  );
}

function getExpectedOpenDirections(
  mask: boolean[][],
  row: number,
  col: number,
): Array<'north' | 'east' | 'south' | 'west'> {
  return DIRECTION_STEPS.filter(({ dr, dc }) => hasLand(mask, row + dr, col + dc)).map(
    ({ direction }) => direction,
  );
}

function uniqueSortedNumbers(values: number[]): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function pickBetterFailureSet(
  current: ConstraintFailureCell[] | null,
  candidate: ConstraintFailureCell[],
): ConstraintFailureCell[] {
  if (!current) {
    return candidate;
  }
  if (candidate.length < current.length) {
    return candidate;
  }
  const currentWeight = current.reduce((sum, cell) => sum + cell.candidateTileIds.length, 0);
  const candidateWeight = candidate.reduce((sum, cell) => sum + cell.candidateTileIds.length, 0);
  return candidateWeight < currentWeight ? candidate : current;
}

function buildAnchorContexts(
  anchors: OverworldTerrainOptions['nodeAnchors'],
  tileSize: number,
  cols: number,
  rows: number,
): TerrainAnchors {
  return {
    heroSpawn: { world: anchors.heroSpawn, tile: worldToTile(anchors.heroSpawn, tileSize, cols, rows) },
    portal: { world: anchors.portal, tile: worldToTile(anchors.portal, tileSize, cols, rows) },
    trainingGrounds: {
      world: anchors.trainingGrounds,
      tile: worldToTile(anchors.trainingGrounds, tileSize, cols, rows),
    },
  };
}

function buildBaseLandMask(
  cols: number,
  rows: number,
  rng: () => number,
  anchors: TerrainAnchors,
): boolean[][] {
  const mask = createBoolGrid(rows, cols, false);
  const cx = cols * 0.48;
  const cy = rows * 0.6;
  const rx = cols * 0.29;
  const ry = rows * 0.24;
  const ring = buildNoiseRing(96, rng, 0.12);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const sampleX = col + 0.5;
      const sampleY = row + 0.5;
      const dx = (sampleX - cx) / rx;
      const dy = (sampleY - cy) / ry;
      const baseDistance = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(sampleY - cy, sampleX - cx);
      const ringIndex = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * ring.length) % ring.length;
      const southBias = sampleY > cy ? 0.02 : -0.01;
      mask[row][col] = baseDistance <= 1 + ring[ringIndex] + southBias;
    }
  }

  paintEllipse(mask, anchors.heroSpawn.tile.col + 2.5, anchors.heroSpawn.tile.row + 1.4, 7.3, 5.9, true);
  paintEllipse(mask, anchors.portal.tile.col - 1.4, anchors.portal.tile.row + 1.1, 6.8, 5.8, true);
  paintEllipse(mask, anchors.trainingGrounds.tile.col + 0.2, anchors.trainingGrounds.tile.row + 0.6, 8, 5.8, true);
  paintEllipse(mask, cols * 0.31, rows * 0.76, 5, 4, true);
  paintEllipse(mask, cols * 0.72, rows * 0.39, 5.4, 3.9, true);

  // Shave the corners back so the overworld reads as an island rather than a full-screen field.
  paintEllipse(mask, 4.2, 4.6, 4.6, 3.6, false);
  paintEllipse(mask, cols - 4.8, 5.2, 4.4, 3.4, false);
  paintEllipse(mask, cols - 3.6, rows - 5.5, 4.8, 4.2, false);

  return mask;
}

function buildNoiseRing(count: number, rng: () => number, amplitude: number): number[] {
  const values = Array.from({ length: count }, () => (rng() * 2 - 1) * amplitude);
  for (let pass = 0; pass < 5; pass++) {
    const copy = [...values];
    for (let index = 0; index < count; index++) {
      const prev = copy[(index - 1 + count) % count];
      const next = copy[(index + 1) % count];
      values[index] = (prev + copy[index] * 2 + next) / 4;
    }
  }
  return values;
}

function paintProtectedLand(mask: boolean[][], anchors: TerrainAnchors): void {
  paintCircle(mask, anchors.heroSpawn.tile.col, anchors.heroSpawn.tile.row, 3.2, true);
  paintCircle(mask, anchors.portal.tile.col, anchors.portal.tile.row, 3.8, true);
  paintCircle(mask, anchors.trainingGrounds.tile.col, anchors.trainingGrounds.tile.row, 4.6, true);
  paintLine(mask, anchors.heroSpawn.tile, anchors.portal.tile, 2.2, true);
  paintLine(
    mask,
    anchors.portal.tile,
    { col: anchors.trainingGrounds.tile.col, row: anchors.trainingGrounds.tile.row + 4 },
    2,
    true,
  );
}

function refineMask(source: boolean[][], protectedMask: boolean[][]): boolean[][] {
  let mask = cloneBoolGrid(source);
  for (let pass = 0; pass < 4; pass++) {
    mask = fillInteriorWater(mask);
    mask = removeOneTileNotches(mask);
    mask = fillDiagonalOnlyGaps(mask);
    mask = removeOneTilePeninsulas(mask, protectedMask);
    applyMask(mask, protectedMask, true);
  }
  return mask;
}

function repairLandMask(
  source: boolean[][],
  protectedLand: boolean[][],
  rootTile: TileCoord,
): boolean[][] {
  return keepComponentContaining(refineMask(source, protectedLand), rootTile);
}

function ensureCorridors(mask: boolean[][], anchors: TerrainAnchors): boolean[][] {
  const result = cloneBoolGrid(mask);
  paintLine(result, anchors.heroSpawn.tile, anchors.portal.tile, 2, true);
  paintLine(
    result,
    anchors.portal.tile,
    { col: anchors.trainingGrounds.tile.col, row: anchors.trainingGrounds.tile.row + 4 },
    2,
    true,
  );
  return result;
}

function fillInteriorWater(source: boolean[][]): boolean[][] {
  const rows = source.length;
  const cols = source[0]?.length ?? 0;
  const result = cloneBoolGrid(source);
  const reachable = createBoolGrid(rows, cols, false);
  const queue: TileCoord[] = [];

  const enqueue = (row: number, col: number) => {
    if (!inBounds(row, col, rows, cols) || reachable[row][col] || source[row][col]) {
      return;
    }
    reachable[row][col] = true;
    queue.push({ row, col });
  };

  for (let col = 0; col < cols; col++) {
    enqueue(0, col);
    enqueue(rows - 1, col);
  }
  for (let row = 0; row < rows; row++) {
    enqueue(row, 0);
    enqueue(row, cols - 1);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    enqueue(current.row - 1, current.col);
    enqueue(current.row + 1, current.col);
    enqueue(current.row, current.col - 1);
    enqueue(current.row, current.col + 1);
  }

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!source[row][col] && !reachable[row][col]) {
        result[row][col] = true;
      }
    }
  }

  return result;
}

function removeOneTileNotches(source: boolean[][]): boolean[][] {
  const rows = source.length;
  const cols = source[0]?.length ?? 0;
  const result = cloneBoolGrid(source);

  for (let row = 1; row < rows - 1; row++) {
    for (let col = 1; col < cols - 1; col++) {
      if (source[row][col]) {
        continue;
      }
      const cardinal = cardinalLandCount(source, row, col);
      const diagonal = diagonalLandCount(source, row, col);
      if (cardinal >= 3 || (cardinal >= 2 && diagonal >= 3)) {
        result[row][col] = true;
      }
    }
  }

  return result;
}

function fillDiagonalOnlyGaps(source: boolean[][]): boolean[][] {
  const rows = source.length;
  const cols = source[0]?.length ?? 0;
  const result = cloneBoolGrid(source);

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols - 1; col++) {
      const nw = source[row][col];
      const ne = source[row][col + 1];
      const sw = source[row + 1][col];
      const se = source[row + 1][col + 1];

      if (nw && se && !ne && !sw) {
        result[row][col + 1] = true;
        result[row + 1][col] = true;
      }
      if (ne && sw && !nw && !se) {
        result[row][col] = true;
        result[row + 1][col + 1] = true;
      }
    }
  }

  return result;
}

function removeOneTilePeninsulas(source: boolean[][], protectedMask: boolean[][]): boolean[][] {
  const rows = source.length;
  const cols = source[0]?.length ?? 0;
  const result = cloneBoolGrid(source);

  for (let row = 1; row < rows - 1; row++) {
    for (let col = 1; col < cols - 1; col++) {
      if (!source[row][col] || protectedMask[row][col]) {
        continue;
      }
      if (cardinalLandCount(source, row, col) <= 1) {
        result[row][col] = false;
      }
    }
  }

  return result;
}

function keepComponentContaining(source: boolean[][], root: TileCoord): boolean[][] {
  const rows = source.length;
  const cols = source[0]?.length ?? 0;
  if (!inBounds(root.row, root.col, rows, cols) || !source[root.row][root.col]) {
    return source;
  }

  const keep = createBoolGrid(rows, cols, false);
  const queue: TileCoord[] = [root];
  keep[root.row][root.col] = true;

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [dr, dc] of CARDINALS) {
      const nextRow = current.row + dr;
      const nextCol = current.col + dc;
      if (!inBounds(nextRow, nextCol, rows, cols) || keep[nextRow][nextCol] || !source[nextRow][nextCol]) {
        continue;
      }
      keep[nextRow][nextCol] = true;
      queue.push({ row: nextRow, col: nextCol });
    }
  }

  return keep;
}

function buildClearZones(anchors: TerrainAnchors): TerrainZone[] {
  return [
    {
      kind: 'anchor_clear',
      col: anchors.heroSpawn.tile.col,
      row: anchors.heroSpawn.tile.row,
      radius: 3,
    },
    {
      kind: 'anchor_clear',
      col: anchors.portal.tile.col,
      row: anchors.portal.tile.row,
      radius: 4,
    },
    {
      kind: 'anchor_clear',
      col: anchors.trainingGrounds.tile.col,
      row: anchors.trainingGrounds.tile.row,
      radius: 4,
    },
    {
      kind: 'travel_corridor',
      col: Math.round((anchors.heroSpawn.tile.col + anchors.portal.tile.col) / 2),
      row: Math.round((anchors.heroSpawn.tile.row + anchors.portal.tile.row) / 2),
      radius: 5,
    },
    {
      kind: 'travel_corridor',
      col: Math.round((anchors.portal.tile.col + anchors.trainingGrounds.tile.col) / 2),
      row: Math.round((anchors.portal.tile.row + anchors.trainingGrounds.tile.row) / 2),
      radius: 4,
    },
  ];
}

function buildPlateauMask(
  landMask: boolean[][],
  anchors: TerrainAnchors,
  seed: number,
): PlateauBuildResult {
  const rows = landMask.length;
  const cols = landMask[0]?.length ?? 0;
  const eligible = erodeMask(landMask, 1);
  const plateau = createBoolGrid(rows, cols, false);
  const rng = mulberry32(seed + 113);
  const centerCol = anchors.trainingGrounds.tile.col + (rng() - 0.5) * 1.2;
  const centerRow = anchors.trainingGrounds.tile.row + (rng() - 0.5) * 0.6;
  const radiusX = 3.5 + rng() * 2.2;
  const radiusY = 2.5 + rng() * 1.4;
  const lobeOffset = 1.1 + rng() * 1.1;

  paintEllipse(plateau, centerCol, centerRow, radiusX, radiusY, true);
  paintEllipse(
    plateau,
    centerCol + (rng() < 0.5 ? -lobeOffset : lobeOffset),
    centerRow + (rng() - 0.5) * 0.7,
    Math.max(2.4, radiusX * 0.58),
    Math.max(1.8, radiusY * 0.72),
    true,
  );

  if (rng() < 0.55) {
    paintCircle(
      plateau,
      centerCol + (rng() < 0.5 ? -radiusX * 0.7 : radiusX * 0.7),
      centerRow - radiusY * 0.35,
      1.15 + rng() * 0.55,
      false,
    );
  }

  intersectMask(plateau, eligible);
  plateauMaskSmooth(plateau, eligible);
  paintCircle(plateau, anchors.heroSpawn.tile.col, anchors.heroSpawn.tile.row, 4, false);
  paintCircle(plateau, anchors.portal.tile.col, anchors.portal.tile.row, 4, false);
  paintRectangle(
    plateau,
    anchors.trainingGrounds.tile.col - 1,
    anchors.trainingGrounds.tile.row - 1,
    3,
    3,
    true,
  );
  intersectMask(plateau, eligible);

  if (countMaskCells(plateau) < 8) {
    const terraceLeft = clamp(anchors.trainingGrounds.tile.col - 3, 3, cols - 10);
    const terraceTop = clamp(anchors.trainingGrounds.tile.row - 2, 3, rows - 8);
    paintRectangle(plateau, terraceLeft, terraceTop, 7, 4, true);
    intersectMask(plateau, eligible);
  }

  const candidateStairs = findPlateauStairCandidates(landMask, plateau);
  const stair =
    pickPreferredPlateauStair(candidateStairs, cols, rng) ??
    {
      col: clamp(anchors.trainingGrounds.tile.col - 3, 1, cols - 2),
      topRow: clamp(anchors.trainingGrounds.tile.row + 1, 1, rows - 3),
      variant: 'left',
      style: 'open',
    };

  return { plateauMask: plateau, stair };
}

function hasValidStairFooting(
  landMask: boolean[][],
  plateauMask: boolean[][],
  stair: StairSpec,
): boolean {
  const rows = landMask.length;
  const cols = landMask[0]?.length ?? 0;
  const insideCol = stair.variant === 'left' ? stair.col + 1 : stair.col - 1;
  const outsideCol = stair.variant === 'left' ? stair.col - 1 : stair.col + 1;

  if (
    !inBounds(stair.topRow + 2, stair.col, rows, cols) ||
    !inBounds(stair.topRow, insideCol, rows, cols)
  ) {
    return false;
  }

  if (
    !plateauMask[stair.topRow][stair.col] ||
    !hasLand(plateauMask, stair.topRow, insideCol) ||
    hasLand(plateauMask, stair.topRow, outsideCol) ||
    landMask[stair.topRow + 1][stair.col] === false ||
    landMask[stair.topRow + 2][stair.col] === false
  ) {
    return false;
  }

  if (stair.style === 'open') {
    return (
      inBounds(stair.topRow + 2, outsideCol, rows, cols) &&
      !hasLand(plateauMask, stair.topRow + 1, outsideCol)
    );
  }

  return true;
}

function widenLandMaskForStair(
  landMask: boolean[][],
  stair: StairSpec,
): boolean[][] {
  const widened = cloneBoolGrid(landMask);
  const rows = widened.length;
  const cols = widened[0]?.length ?? 0;
  const lowerRow = stair.topRow + 1;
  const outwardSign = stair.variant === 'left' ? -1 : 1;

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
    if (inBounds(row, col, rows, cols)) {
      widened[row][col] = true;
    }
  }

  return widened;
}

function plateauMaskSmooth(mask: boolean[][], limitMask: boolean[][]): void {
  const rows = mask.length;
  const cols = mask[0]?.length ?? 0;

  for (let pass = 0; pass < 2; pass++) {
    const next = cloneBoolGrid(mask);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (!limitMask[row][col]) {
          next[row][col] = false;
          continue;
        }
        const neighbors = countNeighborLand(mask, row, col);
        next[row][col] = mask[row][col] ? neighbors >= 3 : neighbors >= 5;
      }
    }
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        mask[row][col] = next[row][col];
      }
    }
  }
}

function countMaskCells(mask: boolean[][]): number {
  return mask.reduce(
    (sum, row) => sum + row.reduce((rowSum, cell) => rowSum + (cell ? 1 : 0), 0),
    0,
  );
}

function countNeighborLand(mask: boolean[][], row: number, col: number): number {
  let count = 0;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) {
        continue;
      }
      if (hasLand(mask, row + dr, col + dc)) {
        count += 1;
      }
    }
  }
  return count;
}

function findPlateauStairCandidates(
  landMask: boolean[][],
  plateauMask: boolean[][],
): StairSpec[] {
  const candidates: StairSpec[] = [];
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
        hasClearPlateauStairApproach(plateauMask, row, col - 1, 'left')
      ) {
        candidates.push({ col: col - 1, topRow: row, variant: 'left', style: 'open' });
      }

      if (
        !plateauMask[row][col + 1] &&
        col + 1 < cols &&
        landMask[row][col + 1] &&
        row + 1 < rows &&
        landMask[row + 1][col + 1] &&
        !plateauMask[row + 1][col] &&
        hasClearPlateauStairApproach(plateauMask, row, col + 1, 'right')
      ) {
        candidates.push({ col: col + 1, topRow: row, variant: 'right', style: 'open' });
      }
    }
  }

  return candidates;
}

function hasClearPlateauStairApproach(
  plateauMask: boolean[][],
  topRow: number,
  stairCol: number,
  variant: 'left' | 'right',
): boolean {
  const attachCol = variant === 'left' ? stairCol + 1 : stairCol - 1;
  return !hasLand(plateauMask, topRow - 1, stairCol) && !hasLand(plateauMask, topRow - 1, attachCol);
}

function pickPreferredPlateauStair(
  candidates: StairSpec[],
  cols: number,
  rng: () => number,
): StairSpec | null {
  if (candidates.length === 0) {
    return null;
  }

  const sorted = [...candidates].sort((left, right) => {
    const center = (cols - 1) / 2;
    const leftDistance = Math.abs(left.col - center);
    const rightDistance = Math.abs(right.col - center);
    if (rightDistance !== leftDistance) {
      return rightDistance - leftDistance;
    }
    return right.topRow - left.topRow;
  });

  const bestDistance = Math.abs(sorted[0].col - (cols - 1) / 2);
  const tied = sorted.filter((candidate) => Math.abs(candidate.col - (cols - 1) / 2) === bestDistance);
  return tied[Math.floor(rng() * tied.length)] ?? sorted[0];
}

function buildHeightMap(landMask: boolean[][], plateauMask: boolean[][]): number[][] {
  const rows = landMask.length;
  const cols = landMask[0]?.length ?? 0;
  const heightMap = createNumberGrid(rows, cols, 0);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!landMask[row][col]) {
        continue;
      }
      heightMap[row][col] = plateauMask[row][col] ? 2 : 1;
    }
  }

  return heightMap;
}

function buildCliffBands(
  landMask: boolean[][],
  plateauMask: boolean[][],
  _stair: StairSpec,
  rows: number,
  cols: number,
): CliffBands {
  const land = createBoolGrid(rows, cols, false);
  const water = createBoolGrid(rows, cols, false);

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols; col++) {
      if (!plateauMask[row][col] || plateauMask[row + 1][col]) {
        continue;
      }

      if (hasLand(landMask, row + 1, col)) {
        land[row + 1][col] = true;
      } else {
        water[row + 1][col] = true;
      }
    }
  }

  const mask = createBoolGrid(rows, cols, false);
  applyMask(mask, land, true);
  applyMask(mask, water, true);
  return { land, water, mask };
}

function buildWalkMask(
  landMask: boolean[][],
  cliffMask: boolean[][],
  stair: StairSpec,
  plateauMask: boolean[][],
): boolean[][] {
  const rows = landMask.length;
  const cols = landMask[0]?.length ?? 0;
  const walkMask = createBoolGrid(rows, cols, false);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (landMask[row][col] && !cliffMask[row][col]) {
        walkMask[row][col] = true;
      }
      if (plateauMask[row][col]) {
        walkMask[row][col] = true;
      }
    }
  }

  applyStairWalkMask(walkMask, stair);
  return walkMask;
}

function applyStairWalkMask(walkMask: boolean[][], stair: StairSpec): void {
  walkMask[stair.topRow][stair.col] = true;
  walkMask[stair.topRow + 1][stair.col] = true;
  walkMask[stair.topRow + 2][stair.col] = true;
}

function buildTileLayers(
  landMask: boolean[][],
  plateauMask: boolean[][],
  cliffBands: CliffBands,
  stair: StairSpec,
  rows: number,
  cols: number,
  seed: number,
  useConstraintSolver: boolean,
  mappingWorkspace?: MappingWorkspace,
  flatAtlasKey: AtlasKey = 'terrain-tileset',
  elevatedAtlasKey: AtlasKey = 'terrain-tileset-alt',
): TerrainTileLayer[] | null {
  const terrainAtlasMapping = getTerrainAtlasMapping(mappingWorkspace);
  if (!useConstraintSolver) {
    return buildDeterministicTileLayers(
      landMask,
      plateauMask,
      cliffBands,
      stair,
      rows,
      cols,
      terrainAtlasMapping,
      flatAtlasKey,
      elevatedAtlasKey,
    );
  }

  const grammar = buildTerrainGrammar(mappingWorkspace);
  const flatCandidates = grammar.tiles.filter((tile) => tile.templateKey === 'flat-guide');
  const elevatedCandidates = grammar.tiles.filter(
    (tile) => tile.templateKey === 'elevated-guide' && tile.selfSocket === 'elevated',
  );
  const solvedFlat = solveMaskedTileLayer(landMask, flatCandidates, seed + 17);
  const solvedElevatedTop = solveMaskedTileLayer(plateauMask, elevatedCandidates, seed + 31);
  if (!solvedFlat || !solvedElevatedTop) {
    return null;
  }

  const flatLayer = createNumberGrid(rows, cols, 0);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      flatLayer[row][col] = landMask[row][col] ? solvedFlat[row][col]?.tileId ?? 0 : 0;
    }
  }

  const elevatedLayer = buildElevatedLayerFromSolvedTop(
    solvedElevatedTop,
    plateauMask,
    cliffBands,
    stair,
    rows,
    cols,
    terrainAtlasMapping,
  );

  return [
    {
      key: flatAtlasKey,
      depth: OVERWORLD_DEPTHS.flat,
      tileData: flatLayer,
    },
    {
      key: elevatedAtlasKey,
      depth: OVERWORLD_DEPTHS.elevated,
      tileData: elevatedLayer,
    },
  ];
}

function buildDeterministicTileLayers(
  landMask: boolean[][],
  plateauMask: boolean[][],
  cliffBands: CliffBands,
  stair: StairSpec,
  rows: number,
  cols: number,
  terrainAtlasMapping: TerrainAtlasMapping,
  flatAtlasKey: AtlasKey,
  elevatedAtlasKey: AtlasKey,
): TerrainTileLayer[] {
  const flatLayer = createNumberGrid(rows, cols, 0);
  const topLayer = createNumberGrid(rows, cols, 0);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (landMask[row][col]) {
        flatLayer[row][col] = pickFlatTile(landMask, row, col, terrainAtlasMapping);
      }

      if (plateauMask[row][col]) {
        topLayer[row][col] = pickElevatedTopTile(
          plateauMask,
          row,
          col,
          terrainAtlasMapping,
          stair,
        );
      }
    }
  }

  const elevatedLayer = buildElevatedLayerFromTileIds(
    topLayer,
    plateauMask,
    cliffBands,
    stair,
    rows,
    cols,
    terrainAtlasMapping,
  );

  return [
    {
      key: flatAtlasKey,
      depth: OVERWORLD_DEPTHS.flat,
      tileData: flatLayer,
    },
    {
      key: elevatedAtlasKey,
      depth: OVERWORLD_DEPTHS.elevated,
      tileData: elevatedLayer,
    },
  ];
}

function buildElevatedLayerFromSolvedTop(
  solvedTop: Array<Array<TerrainGrammarTile | null>>,
  plateauMask: boolean[][],
  cliffBands: CliffBands,
  stair: StairSpec,
  rows: number,
  cols: number,
  terrainAtlasMapping: TerrainAtlasMapping,
): number[][] {
  const topLayer = createNumberGrid(rows, cols, 0);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      topLayer[row][col] = solvedTop[row][col]?.tileId ?? 0;
    }
  }
  return buildElevatedLayerFromTileIds(
    topLayer,
    plateauMask,
    cliffBands,
    stair,
    rows,
    cols,
    terrainAtlasMapping,
  );
}

function buildElevatedLayerFromTileIds(
  topLayer: number[][],
  plateauMask: boolean[][],
  cliffBands: CliffBands,
  stair: StairSpec,
  rows: number,
  cols: number,
  terrainAtlasMapping: TerrainAtlasMapping,
): number[][] {
  const elevatedLayer = createNumberGrid(rows, cols, 0);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!plateauMask[row][col]) {
        continue;
      }
      elevatedLayer[row][col] = topLayer[row][col] || pickElevatedTopTile(
        plateauMask,
        row,
        col,
        terrainAtlasMapping,
        stair,
      );
    }
  }

  applyStairTopAttachmentSwap(elevatedLayer, stair, terrainAtlasMapping);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (cliffBands.land[row][col]) {
        elevatedLayer[row][col] = pickStripTile(
          cliffBands.land,
          row,
          col,
          terrainAtlasMapping.cliffs.land,
          stair,
        );
      } else if (cliffBands.water[row][col]) {
        elevatedLayer[row][col] = pickStripTile(
          cliffBands.water,
          row,
          col,
          terrainAtlasMapping.cliffs.water,
          stair,
        );
      }
    }
  }

  applyStairTiles(elevatedLayer, stair, terrainAtlasMapping);
  normalizeDerivedCliffTiles(elevatedLayer, cliffBands, terrainAtlasMapping);

  return elevatedLayer;
}

function solveMaskedTileLayer(
  mask: boolean[][],
  candidates: TerrainGrammarTile[],
  seed: number,
): Array<Array<TerrainGrammarTile | null>> | null {
  const rows = mask.length;
  const cols = mask[0]?.length ?? 0;
  const tileByKey = new Map(candidates.map((tile) => [tile.key, tile]));
  const allCandidateKeys = candidates.map((tile) => tile.key);
  const initialDomains = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      if (!mask[row][col]) {
        return new Set<string>([EMPTY_STATE]);
      }
      const domain = allCandidateKeys.filter((key) =>
        candidateMatchesMask(tileByKey.get(key)!, mask, row, col),
      );
      return new Set<string>(domain);
    }),
  );

  if (initialDomains.some((row) => row.some((domain) => domain.size === 0))) {
    return null;
  }
  if (!propagateDomains(initialDomains, tileByKey)) {
    return null;
  }

  const rng = mulberry32(seed);
  return searchDomains(initialDomains, tileByKey, rng, rows, cols);
}

function candidateMatchesMask(
  candidate: TerrainGrammarTile,
  mask: boolean[][],
  row: number,
  col: number,
): boolean {
  return DIRECTION_STEPS.every(({ direction, dr, dc }) => {
    const hasNeighbor = hasLand(mask, row + dr, col + dc);
    const allowsNeighbor = candidate.adjacencyRules[direction].length > 0;
    return hasNeighbor === allowsNeighbor;
  });
}

function searchDomains(
  domains: Set<string>[][],
  tileByKey: Map<string, TerrainGrammarTile>,
  rng: () => number,
  rows: number,
  cols: number,
): Array<Array<TerrainGrammarTile | null>> | null {
  const target = pickLowestEntropyDomain(domains);
  if (!target) {
    return domains.map((row) => row.map((domain) => resolveDomain(domain, tileByKey)));
  }

  const choices = [...domains[target.row][target.col]];
  orderDomainChoices(choices, tileByKey, target.row, target.col, rows, cols, rng);

  for (const choice of choices) {
    const nextDomains = cloneDomains(domains);
    nextDomains[target.row][target.col] = new Set([choice]);
    if (!propagateDomains(nextDomains, tileByKey, [{ row: target.row, col: target.col }])) {
      continue;
    }

    const solved = searchDomains(nextDomains, tileByKey, rng, rows, cols);
    if (solved) {
      return solved;
    }
  }

  return null;
}

function propagateDomains(
  domains: Set<string>[][],
  tileByKey: Map<string, TerrainGrammarTile>,
  seeds: Array<{ row: number; col: number }> = [],
): boolean {
  const rows = domains.length;
  const cols = domains[0]?.length ?? 0;
  const queue = seeds.length > 0 ? [...seeds] : buildDomainQueue(rows, cols);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDomain = domains[current.row][current.col];

    for (const { direction, dr, dc } of DIRECTION_STEPS) {
      const nextRow = current.row + dr;
      const nextCol = current.col + dc;
      if (!inBounds(nextRow, nextCol, rows, cols)) {
        continue;
      }

      const nextDomain = domains[nextRow][nextCol];
      const filtered = new Set(
        [...nextDomain].filter((candidateState) =>
          [...currentDomain].some((currentState) =>
            areStatesCompatible(currentState, candidateState, direction, tileByKey),
          ),
        ),
      );

      if (filtered.size === 0) {
        return false;
      }
      if (filtered.size !== nextDomain.size) {
        domains[nextRow][nextCol] = filtered;
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
  const source = sourceState === EMPTY_STATE ? null : tileByKey.get(sourceState) ?? null;
  const candidate = candidateState === EMPTY_STATE ? null : tileByKey.get(candidateState) ?? null;
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

function pickLowestEntropyDomain(
  domains: Set<string>[][],
): { row: number; col: number } | null {
  let bestRow = -1;
  let bestCol = -1;
  let bestSize = Number.POSITIVE_INFINITY;

  for (let row = 0; row < domains.length; row++) {
    for (let col = 0; col < domains[row].length; col++) {
      const size = domains[row][col].size;
      if (size <= 1 || size >= bestSize) {
        continue;
      }
      bestSize = size;
      bestRow = row;
      bestCol = col;
    }
  }

  if (bestRow < 0 || bestCol < 0) {
    return null;
  }
  return { row: bestRow, col: bestCol };
}

function orderDomainChoices(
  choices: string[],
  tileByKey: Map<string, TerrainGrammarTile>,
  row: number,
  col: number,
  rows: number,
  cols: number,
  rng: () => number,
): void {
  const weightFor = (state: string) => {
    if (state === EMPTY_STATE) {
      return 0;
    }
    const tile = tileByKey.get(state);
    if (!tile) {
      return 0;
    }
    const dx = Math.abs(col + 0.5 - cols / 2) / Math.max(1, cols / 2);
    const dy = Math.abs(row + 0.5 - rows / 2) / Math.max(1, rows / 2);
    const centerBias = 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy));

    let weight = 1;
    if (tile.tags.includes('center')) weight = 4.5 + centerBias * 2;
    else if (tile.tags.includes('edge') || tile.tags.includes('lip')) weight = 2.8 + centerBias;
    else if (tile.tags.includes('corner')) weight = 2 + centerBias * 0.5;
    else if (tile.tags.includes('single')) weight = 0.9;

    return weight + rng() * 0.1;
  };

  choices.sort((left, right) => weightFor(right) - weightFor(left));
}

function resolveDomain(
  domain: Set<string>,
  tileByKey: Map<string, TerrainGrammarTile>,
): TerrainGrammarTile | null {
  const value = [...domain][0];
  if (!value || value === EMPTY_STATE) {
    return null;
  }
  return tileByKey.get(value) ?? null;
}

function cloneDomains(domains: Set<string>[][]): Set<string>[][] {
  return domains.map((row) => row.map((domain) => new Set(domain)));
}

function buildDomainQueue(rows: number, cols: number): Array<{ row: number; col: number }> {
  const queue: Array<{ row: number; col: number }> = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      queue.push({ row, col });
    }
  }
  return queue;
}

function oppositeDirection(
  direction: 'north' | 'east' | 'south' | 'west',
): 'north' | 'east' | 'south' | 'west' {
  if (direction === 'north') return 'south';
  if (direction === 'east') return 'west';
  if (direction === 'south') return 'north';
  return 'east';
}

function pickFlatTile(
  mask: boolean[][],
  row: number,
  col: number,
  terrainAtlasMapping: TerrainAtlasMapping,
): number {
  const n = hasLand(mask, row - 1, col);
  const s = hasLand(mask, row + 1, col);
  const w = hasLand(mask, row, col - 1);
  const e = hasLand(mask, row, col + 1);
  const flatGround = terrainAtlasMapping.flatGround;
  const middleRow = flatGround.upperRow;
  const bottomRow = flatGround.lowerRow;

  if (!w && !e) {
    if (!n && s) return flatGround.topSingle;
    if (n && !s) return bottomRow.single;
    const upperReach = hasLand(mask, row - 2, col);
    return upperReach ? bottomRow.single : middleRow.single;
  }

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
  terrainAtlasMapping: TerrainAtlasMapping,
  stair: StairSpec,
): number {
  const attachment = getStairAttachmentForTopCell(stair, row, col);
  const n = hasLand(mask, row - 1, col);
  const s = hasLand(mask, row + 1, col);
  const w = hasLand(mask, row, col - 1) || attachment.west;
  const e = hasLand(mask, row, col + 1) || attachment.east;
  const elevatedTop = terrainAtlasMapping.elevatedTop;
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

function applyStairTopAttachmentSwap(
  layer: number[][],
  stair: StairSpec,
  terrainAtlasMapping: TerrainAtlasMapping,
): void {
  const targetCol = stair.variant === 'left' ? stair.col + 1 : stair.col - 1;
  if (!inBounds(stair.topRow, targetCol, layer.length, layer[0]?.length ?? 0)) {
    return;
  }
  const tileId = layer[stair.topRow][targetCol];
  if (tileId <= 0) {
    return;
  }
  layer[stair.topRow][targetCol] = swapElevatedTopTileForStairAttachment(
    tileId,
    stair.variant,
    terrainAtlasMapping,
  );
}

function swapElevatedTopTileForStairAttachment(
  tileId: number,
  variant: 'left' | 'right',
  terrainAtlasMapping: TerrainAtlasMapping,
): number {
  const top = terrainAtlasMapping.elevatedTop;

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

function applyStairTiles(
  layer: number[][],
  stair: StairSpec,
  terrainAtlasMapping: TerrainAtlasMapping,
): void {
  const tiles = stair.variant === 'left' ? terrainAtlasMapping.stairs.left : terrainAtlasMapping.stairs.right;
  if (tiles.upper > 0) {
    layer[stair.topRow][stair.col] = tiles.upper;
  }
  if (tiles.lower > 0) {
    layer[stair.topRow + 1][stair.col] = tiles.lower;
  }
}

function buildShadowStamps(
  plateauMask: boolean[][],
  landMask: boolean[][],
  stair: StairSpec,
  rows: number,
  cols: number,
): OverlayStamp[] {
  const stamps = new Map<string, OverlayStamp>();

  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols; col++) {
      if (!plateauMask[row][col] || plateauMask[row + 1][col]) {
        continue;
      }
      if ((row === stair.topRow && col === stair.col) || !hasLand(landMask, row + 1, col)) {
        continue;
      }

      const key = `${col},${row + 1}`;
      stamps.set(key, {
        kind: 'shadow',
        col,
        row: row + 1,
        scale: 1,
        depth: OVERWORLD_DEPTHS.shadow,
        framePolicy: 'static',
      });
    }
  }

  return [...stamps.values()];
}

function pickStripTile(
  mask: boolean[][],
  row: number,
  col: number,
  tiles: TerrainAtlasMapping['cliffs']['land'],
  stair?: StairSpec,
): number {
  const attachment = stair ? getStairAttachmentForCliffCell(stair, row, col) : { west: false, east: false };
  const w = hasLand(mask, row, col - 1) || attachment.west;
  const e = hasLand(mask, row, col + 1) || attachment.east;

  if (!w && !e) {
    return tiles.single;
  }
  if (!w) {
    return tiles.left;
  }
  if (!e) {
    return tiles.right;
  }
  return tiles.center;
}

function normalizeDerivedCliffTiles(
  layer: number[][],
  cliffBands: CliffBands,
  terrainAtlasMapping: TerrainAtlasMapping,
): void {
  const rows = layer.length;
  const cols = layer[0]?.length ?? 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const isLandCliff = cliffBands.land[row]?.[col];
      const isWaterCliff = cliffBands.water[row]?.[col];
      if (!isLandCliff && !isWaterCliff) {
        continue;
      }

      const westOccupied = inBounds(row, col - 1, rows, cols) && layer[row][col - 1] > 0;
      const eastOccupied = inBounds(row, col + 1, rows, cols) && layer[row][col + 1] > 0;
      const strip = isWaterCliff ? terrainAtlasMapping.cliffs.water : terrainAtlasMapping.cliffs.land;
      layer[row][col] = pickClosedStripTile(strip, westOccupied, eastOccupied);
    }
  }
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

function getStairAttachmentForTopCell(
  stair: StairSpec,
  row: number,
  col: number,
): { west: boolean; east: boolean } {
  if (stair.topRow !== row) {
    return { west: false, east: false };
  }
  if (stair.variant === 'left' && col === stair.col + 1) {
    return { west: true, east: false };
  }
  if (stair.variant === 'right' && col === stair.col - 1) {
    return { west: false, east: true };
  }
  return { west: false, east: false };
}

function getStairAttachmentForCliffCell(
  stair: StairSpec,
  row: number,
  col: number,
): { west: boolean; east: boolean } {
  if (stair.topRow + 1 !== row) {
    return { west: false, east: false };
  }
  if (stair.variant === 'left' && col === stair.col + 1) {
    return { west: true, east: false };
  }
  if (stair.variant === 'right' && col === stair.col - 1) {
    return { west: false, east: true };
  }
  return { west: false, east: false };
}

function buildFoamStamps(
  landMask: boolean[][],
  cliffMask: boolean[][],
  rows: number,
  cols: number,
): OverlayStamp[] {
  const solidMask = createBoolGrid(rows, cols, false);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      solidMask[row][col] = landMask[row][col] || cliffMask[row][col];
    }
  }

  const stamps = new Map<string, OverlayStamp>();

  const addStamp = (col: number, row: number) => {
    if (row < -1 || col < -1 || row > rows || col > cols) {
      return;
    }
    const key = `${col},${row}`;
    if (!stamps.has(key)) {
      stamps.set(key, {
        kind: 'foam',
        col,
        row,
        scale: 1,
        depth: OVERWORLD_DEPTHS.foam,
        framePolicy: 'random-start',
      });
    }
  };

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!solidMask[row][col]) {
        continue;
      }
      if (cardinalWaterCount(solidMask, row, col) > 0) {
        addStamp(col, row);
      }
    }
  }

  return [...stamps.values()];
}

function buildDecorationZones(
  landMask: boolean[][],
  plateauMask: boolean[][],
  walkMask: boolean[][],
  clearZones: TerrainZone[],
  stair: StairSpec,
  anchors: TerrainAnchors,
  seed: number,
): TerrainZone[] {
  const rows = landMask.length;
  const cols = landMask[0]?.length ?? 0;
  const rng = mulberry32(seed + 17);
  const waterDistance = buildWaterDistanceMap(landMask);
  const blocked = createBoolGrid(rows, cols, false);

  for (const zone of clearZones) {
    paintCircle(blocked, zone.col, zone.row, zone.radius, true);
  }
  paintCircle(blocked, stair.col, stair.topRow + 1, 2.6, true);
  paintLine(blocked, anchors.heroSpawn.tile, anchors.portal.tile, 2.2, true);
  paintLine(
    blocked,
    anchors.portal.tile,
    { col: stair.col, row: stair.topRow + 2 },
    2,
    true,
  );
  paintLine(
    blocked,
    { col: stair.col, row: stair.topRow },
    anchors.trainingGrounds.tile,
    2,
    true,
  );

  const flatInterior: TileCoord[] = [];
  const shoreline: TileCoord[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!walkMask[row][col] || blocked[row][col]) {
        continue;
      }
      if (!plateauMask[row][col] && waterDistance[row][col] >= 3) {
        flatInterior.push({ row, col });
      }
      if (!plateauMask[row][col] && waterDistance[row][col] === 1) {
        shoreline.push({ row, col });
      }
    }
  }

  const zones: TerrainZone[] = [];
  zones.push(...pickZones(flatInterior, 4 + Math.floor(rng() * 3), 5, rng, 'bush_cluster', 2));
  zones.push(...pickZones(flatInterior, 3 + Math.floor(rng() * 2), 6, rng, 'tree_grove', 3));
  zones.push(...pickZones(shoreline, 3, 5, rng, 'shore_rock', 1));
  zones.push(...pickZones(flatInterior, 2, 7, rng, 'inland_rock', 1));
  zones.push({
    kind: 'stair_landing',
    col: stair.col,
    row: stair.topRow + 2,
    radius: 2,
  });

  return zones;
}

function pickZones(
  candidates: TileCoord[],
  desiredCount: number,
  minDistance: number,
  rng: () => number,
  kind: TerrainZone['kind'],
  radius: number,
): TerrainZone[] {
  const shuffled = [...candidates];
  shuffleInPlace(shuffled, rng);
  const selected: TerrainZone[] = [];

  for (const candidate of shuffled) {
    if (
      selected.some((zone) => {
        const dx = zone.col - candidate.col;
        const dy = zone.row - candidate.row;
        return Math.hypot(dx, dy) < minDistance || (Math.abs(dy) <= 1 && Math.abs(dx) < minDistance + 1);
      })
    ) {
      continue;
    }

    selected.push({
      kind,
      col: candidate.col,
      row: candidate.row,
      radius,
    });

    if (selected.length >= desiredCount) {
      break;
    }
  }

  return selected;
}

function buildWaterDistanceMap(landMask: boolean[][]): number[][] {
  const rows = landMask.length;
  const cols = landMask[0]?.length ?? 0;
  const distance = createNumberGrid(rows, cols, Number.POSITIVE_INFINITY);
  const queue: TileCoord[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!landMask[row][col]) {
        continue;
      }
      if (cardinalWaterCount(landMask, row, col) > 0) {
        distance[row][col] = 1;
        queue.push({ row, col });
      }
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const [dr, dc] of CARDINALS) {
      const nextRow = current.row + dr;
      const nextCol = current.col + dc;
      if (!inBounds(nextRow, nextCol, rows, cols) || !landMask[nextRow][nextCol]) {
        continue;
      }

      const nextDistance = distance[current.row][current.col] + 1;
      if (nextDistance < distance[nextRow][nextCol]) {
        distance[nextRow][nextCol] = nextDistance;
        queue.push({ row: nextRow, col: nextCol });
      }
    }
  }

  return distance;
}

function erodeMask(source: boolean[][], radius: number): boolean[][] {
  const rows = source.length;
  const cols = source[0]?.length ?? 0;
  const result = createBoolGrid(rows, cols, false);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!source[row][col]) {
        continue;
      }

      let intact = true;
      for (let dr = -radius; dr <= radius && intact; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (!inBounds(row + dr, col + dc, rows, cols) || !source[row + dr][col + dc]) {
            intact = false;
            break;
          }
        }
      }

      result[row][col] = intact;
    }
  }

  return result;
}

function createBoolGrid(rows: number, cols: number, fill: boolean): boolean[][] {
  return Array.from({ length: rows }, () => Array<boolean>(cols).fill(fill));
}

function createNumberGrid(rows: number, cols: number, fill: number): number[][] {
  return Array.from({ length: rows }, () => Array<number>(cols).fill(fill));
}

function cloneBoolGrid(source: boolean[][]): boolean[][] {
  return source.map((row) => [...row]);
}

function applyMask(target: boolean[][], other: boolean[][], value: boolean): void {
  for (let row = 0; row < target.length; row++) {
    for (let col = 0; col < target[row].length; col++) {
      if (other[row][col]) {
        target[row][col] = value;
      }
    }
  }
}

function intersectMask(target: boolean[][], other: boolean[][]): void {
  for (let row = 0; row < target.length; row++) {
    for (let col = 0; col < target[row].length; col++) {
      target[row][col] = target[row][col] && other[row][col];
    }
  }
}

function paintCircle(
  mask: boolean[][],
  centerCol: number,
  centerRow: number,
  radius: number,
  value: boolean,
): void {
  const rows = mask.length;
  const cols = mask[0]?.length ?? 0;
  for (let row = Math.floor(centerRow - radius); row <= Math.ceil(centerRow + radius); row++) {
    for (let col = Math.floor(centerCol - radius); col <= Math.ceil(centerCol + radius); col++) {
      if (!inBounds(row, col, rows, cols)) {
        continue;
      }
      const dx = col + 0.5 - (centerCol + 0.5);
      const dy = row + 0.5 - (centerRow + 0.5);
      if (dx * dx + dy * dy <= radius * radius) {
        mask[row][col] = value;
      }
    }
  }
}

function paintEllipse(
  mask: boolean[][],
  centerCol: number,
  centerRow: number,
  radiusX: number,
  radiusY: number,
  value: boolean,
): void {
  const rows = mask.length;
  const cols = mask[0]?.length ?? 0;
  for (let row = Math.floor(centerRow - radiusY); row <= Math.ceil(centerRow + radiusY); row++) {
    for (let col = Math.floor(centerCol - radiusX); col <= Math.ceil(centerCol + radiusX); col++) {
      if (!inBounds(row, col, rows, cols)) {
        continue;
      }
      const dx = (col + 0.5 - (centerCol + 0.5)) / radiusX;
      const dy = (row + 0.5 - (centerRow + 0.5)) / radiusY;
      if (dx * dx + dy * dy <= 1) {
        mask[row][col] = value;
      }
    }
  }
}

function paintRectangle(
  mask: boolean[][],
  startCol: number,
  startRow: number,
  width: number,
  height: number,
  value: boolean,
): void {
  const rows = mask.length;
  const cols = mask[0]?.length ?? 0;
  for (let row = startRow; row < startRow + height; row++) {
    for (let col = startCol; col < startCol + width; col++) {
      if (inBounds(row, col, rows, cols)) {
        mask[row][col] = value;
      }
    }
  }
}

function paintLine(
  mask: boolean[][],
  from: TileCoord,
  to: TileCoord,
  radius: number,
  value: boolean,
): void {
  const steps = Math.max(Math.abs(to.col - from.col), Math.abs(to.row - from.row)) * 2 + 1;
  for (let step = 0; step <= steps; step++) {
    const t = steps === 0 ? 0 : step / steps;
    const col = lerp(from.col, to.col, t);
    const row = lerp(from.row, to.row, t);
    paintCircle(mask, col, row, radius, value);
  }
}

function worldToTile(world: Position, tileSize: number, cols: number, rows: number): TileCoord {
  const col = clamp(Math.round(world.x / tileSize - 0.5), 0, cols - 1);
  const row = clamp(Math.round(world.y / tileSize - 0.5), 0, rows - 1);
  return { col, row };
}

function tileToWorldPosition(tile: TileCoord, tileSize: number): Position {
  return {
    x: (tile.col + 0.5) * tileSize,
    y: (tile.row + 0.5) * tileSize,
  };
}

function cardinalLandCount(mask: boolean[][], row: number, col: number): number {
  let count = 0;
  if (hasLand(mask, row - 1, col)) count++;
  if (hasLand(mask, row + 1, col)) count++;
  if (hasLand(mask, row, col - 1)) count++;
  if (hasLand(mask, row, col + 1)) count++;
  return count;
}

function cardinalWaterCount(mask: boolean[][], row: number, col: number): number {
  let count = 0;
  if (!hasLand(mask, row - 1, col)) count++;
  if (!hasLand(mask, row + 1, col)) count++;
  if (!hasLand(mask, row, col - 1)) count++;
  if (!hasLand(mask, row, col + 1)) count++;
  return count;
}

function diagonalLandCount(mask: boolean[][], row: number, col: number): number {
  let count = 0;
  if (hasLand(mask, row - 1, col - 1)) count++;
  if (hasLand(mask, row - 1, col + 1)) count++;
  if (hasLand(mask, row + 1, col - 1)) count++;
  if (hasLand(mask, row + 1, col + 1)) count++;
  return count;
}

function hasLand(mask: boolean[][], row: number, col: number): boolean {
  return inBounds(row, col, mask.length, mask[0]?.length ?? 0) ? mask[row][col] : false;
}

function inBounds(row: number, col: number, rows: number, cols: number): boolean {
  return row >= 0 && row < rows && col >= 0 && col < cols;
}

function shuffleInPlace<T>(values: T[], rng: () => number): void {
  for (let index = values.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
}

function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
