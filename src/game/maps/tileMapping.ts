export const TILE_MAPPER_STORAGE_KEY = 'living-heroes.tile-mapper.workspace.v1';
export const TILE_MAPPER_BACKUP_STORAGE_KEY = 'living-heroes.tile-mapper.workspace.backup.v1';

export type AtlasKey =
  | 'terrain-tileset'
  | 'terrain-tileset-2'
  | 'terrain-tileset-alt'
  | 'terrain-tileset-4'
  | 'terrain-tileset-5';
export type TemplateKey = 'flat-guide' | 'elevated-guide' | 'stairs-guide' | 'freeform-9x6';
export type GrammarDirection = 'north' | 'east' | 'south' | 'west';
export type GrammarSocket = 'void' | 'water' | 'flat' | 'elevated' | 'cliff' | 'stair' | 'overlay';

export const GRAMMAR_DIRECTIONS: GrammarDirection[] = ['north', 'east', 'south', 'west'];
export const GRAMMAR_SOCKETS: GrammarSocket[] = [
  'void',
  'water',
  'flat',
  'elevated',
  'cliff',
  'stair',
  'overlay',
];

export const TERRAIN_COLOR_ATLAS_KEYS: AtlasKey[] = [
  'terrain-tileset',
  'terrain-tileset-2',
  'terrain-tileset-alt',
  'terrain-tileset-4',
  'terrain-tileset-5',
];

export interface MappingCellRules {
  edges: Record<GrammarDirection, GrammarSocket>;
  adjacency: Record<GrammarDirection, number[]>;
  passable: Record<GrammarDirection, boolean>;
  tags: string[];
  layer: {
    level: number;
    requiresBelow: GrammarSocket;
    allowsAbove: GrammarSocket[];
  };
}

export interface AuthoredTileRules {
  edges: Record<GrammarDirection, GrammarSocket>;
  adjacency: Record<GrammarDirection, number[]>;
  passable: Record<GrammarDirection, boolean>;
  layer: MappingCellRules['layer'];
}

export interface MappingCell {
  label: string;
  tileId: number;
  rules: MappingCellRules;
}

export interface MappingDocument {
  version: 1;
  atlasKey: AtlasKey;
  templateKey: TemplateKey;
  width: number;
  height: number;
  cells: MappingCell[][];
}

export interface MappingWorkspace {
  version: 1;
  currentAtlasKey: AtlasKey;
  currentTemplateKey: TemplateKey;
  documents: Partial<Record<TemplateKey, MappingDocument>>;
  tileRulesByAtlas?: Partial<Record<AtlasKey, Record<string, AuthoredTileRules>>>;
}

export interface MappingTemplate {
  key: TemplateKey;
  name: string;
  description: string;
  width: number;
  height: number;
  labels: string[][];
  defaults: number[][];
}

interface StripTiles {
  left: number;
  center: number;
  right: number;
  single: number;
}

export interface TerrainAtlasMapping {
  flatGround: {
    topLeft: number;
    topCenter: number;
    topRight: number;
    topSingle: number;
    upperRow: StripTiles;
    lowerRow: StripTiles;
    bottomLeft: number;
    bottomCenter: number;
    bottomRight: number;
    bottomSingle: number;
  };
  elevatedTop: {
    topLeft: number;
    topCenter: number;
    topRight: number;
    topSingle: number;
    upperRow: StripTiles;
    middleRow: StripTiles;
    bottomLeft: number;
    bottomCenter: number;
    bottomRight: number;
    bottomSingle: number;
  };
  cliffs: {
    land: StripTiles;
    water: StripTiles;
  };
  stairs: {
    left: {
      upper: number;
      lower: number;
    };
    right: {
      upper: number;
      lower: number;
    };
  };
}

export const ATLAS_OPTIONS: Record<AtlasKey, { name: string; src: string }> = {
  'terrain-tileset': {
    name: 'Terrain Color 1',
    src: '/assets/Terrain/Tileset/Tilemap_color1.png',
  },
  'terrain-tileset-2': {
    name: 'Terrain Color 2',
    src: '/assets/Terrain/Tileset/Tilemap_color2.png',
  },
  'terrain-tileset-alt': {
    name: 'Terrain Color 3',
    src: '/assets/Terrain/Tileset/Tilemap_color3.png',
  },
  'terrain-tileset-4': {
    name: 'Terrain Color 4',
    src: '/assets/Terrain/Tileset/Tilemap_color4.png',
  },
  'terrain-tileset-5': {
    name: 'Terrain Color 5',
    src: '/assets/Terrain/Tileset/Tilemap_color5.png',
  },
};

export const TEMPLATES: Record<TemplateKey, MappingTemplate> = {
  'flat-guide': {
    key: 'flat-guide',
    name: 'Flat Guide 1-16',
    description: 'Guide slots for the flat ground shoreline block.',
    width: 4,
    height: 4,
    labels: [
      ['1', '2', '3', '13'],
      ['4', '5', '6', '14'],
      ['7', '8', '9', '15'],
      ['10', '11', '12', '16'],
    ],
    defaults: [
      [1, 2, 3, 4],
      [10, 11, 12, 13],
      [19, 20, 21, 22],
      [28, 29, 30, 31],
    ],
  },
  'elevated-guide': {
    key: 'elevated-guide',
    name: 'Elevated Guide 1-24',
    description: 'Guide slots for elevated top surfaces plus land and water cliff rows.',
    width: 4,
    height: 6,
    labels: [
      ['1', '2', '3', '13'],
      ['4', '5', '6', '14'],
      ['7', '8', '9', '15'],
      ['10', '11', '12', '16'],
      ['17', '18', '19', '20'],
      ['21', '22', '23', '24'],
    ],
    defaults: [
      [6, 7, 8, 9],
      [15, 16, 17, 18],
      [24, 25, 26, 27],
      [33, 34, 35, 36],
      [42, 43, 44, 45],
      [51, 52, 53, 54],
    ],
  },
  'stairs-guide': {
    key: 'stairs-guide',
    name: 'Stair Slots',
    description: 'Upper and lower left/right stair pieces used by the generator.',
    width: 2,
    height: 2,
    labels: [
      ['upper-left', 'upper-right'],
      ['lower-left', 'lower-right'],
    ],
    defaults: [[37, 40], [46, 49]],
  },
  'freeform-9x6': {
    key: 'freeform-9x6',
    name: 'Freeform 9x6',
    description: 'Blank board matching the raw atlas dimensions.',
    width: 9,
    height: 6,
    labels: Array.from({ length: 6 }, (_, row) =>
      Array.from({ length: 9 }, (_, col) => `${row},${col}`),
    ),
    defaults: Array.from({ length: 6 }, () => Array<number>(9).fill(0)),
  },
};

export function createDocument(templateKey: TemplateKey, atlasKey: AtlasKey): MappingDocument {
  const template = TEMPLATES[templateKey];
  return {
    version: 1,
    atlasKey,
    templateKey,
    width: template.width,
    height: template.height,
    cells: template.labels.map((row, rowIndex) =>
      row.map((label, colIndex) => ({
        label,
        tileId: template.defaults[rowIndex]?.[colIndex] ?? 0,
        rules: getDefaultRulesForCell(templateKey, label),
      })),
    ),
  };
}

export function createWorkspace(
  currentTemplateKey: TemplateKey = 'elevated-guide',
  currentAtlasKey: AtlasKey = 'terrain-tileset',
): MappingWorkspace {
  return seedMissingTileRules({
    version: 1,
    currentAtlasKey,
    currentTemplateKey,
    documents: {
      'flat-guide': createDocument('flat-guide', currentAtlasKey),
      'elevated-guide': createDocument('elevated-guide', currentAtlasKey),
      'stairs-guide': createDocument('stairs-guide', currentAtlasKey),
      'freeform-9x6': createDocument('freeform-9x6', currentAtlasKey),
    },
    tileRulesByAtlas: Object.fromEntries(
      TERRAIN_COLOR_ATLAS_KEYS.map((atlasKey) => [atlasKey, {}]),
    ) as Partial<Record<AtlasKey, Record<string, AuthoredTileRules>>>,
  });
}

export function getDocument(
  workspace: MappingWorkspace,
  templateKey: TemplateKey,
  atlasKey: AtlasKey = workspace.currentAtlasKey,
): MappingDocument {
  return workspace.documents[templateKey] ?? createDocument(templateKey, atlasKey);
}

export function upsertDocument(
  workspace: MappingWorkspace,
  documentState: MappingDocument,
): MappingWorkspace {
  return {
    ...workspace,
    currentAtlasKey: documentState.atlasKey,
    currentTemplateKey: documentState.templateKey,
    documents: {
      ...workspace.documents,
      [documentState.templateKey]: documentState,
    },
  };
}

export function loadWorkspace(): MappingWorkspace | null {
  return loadWorkspaceFromStorageKey(TILE_MAPPER_STORAGE_KEY);
}

export function loadWorkspaceBackup(): MappingWorkspace | null {
  return loadWorkspaceFromStorageKey(TILE_MAPPER_BACKUP_STORAGE_KEY);
}

export function saveWorkspace(workspace: MappingWorkspace): void {
  saveWorkspaceToStorageKey(TILE_MAPPER_STORAGE_KEY, workspace);
}

export function saveWorkspaceBackup(workspace: MappingWorkspace): void {
  saveWorkspaceToStorageKey(TILE_MAPPER_BACKUP_STORAGE_KEY, workspace);
}

function loadWorkspaceFromStorageKey(storageKey: string): MappingWorkspace | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as MappingWorkspace | MappingDocument;
    if (isMappingWorkspace(parsed)) {
      return normalizeWorkspace(parsed);
    }
    if (isMappingDocument(parsed)) {
      return upsertDocument(
        createWorkspace(parsed.templateKey, parsed.atlasKey),
        parsed,
      );
    }
  } catch {
    return null;
  }

  return null;
}

function saveWorkspaceToStorageKey(storageKey: string, workspace: MappingWorkspace): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(workspace));
}

export function getAuthoredTileRules(
  workspace: MappingWorkspace,
  atlasKey: AtlasKey,
  tileId: number,
  fallback?: Partial<AuthoredTileRules>,
): AuthoredTileRules {
  const raw =
    workspace.tileRulesByAtlas?.['terrain-tileset']?.[`${tileId}`] ??
    workspace.tileRulesByAtlas?.[atlasKey]?.[`${tileId}`] ??
    findSharedTileRulesFallback(workspace, atlasKey, tileId);
  return normalizeAuthoredTileRules(raw, fallback);
}

export function isMappingDocument(value: unknown): value is MappingDocument {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<MappingDocument>;
  return (
    candidate.version === 1 &&
    isAtlasKey(candidate.atlasKey) &&
    (candidate.templateKey === 'flat-guide' ||
      candidate.templateKey === 'elevated-guide' ||
      candidate.templateKey === 'stairs-guide' ||
      candidate.templateKey === 'freeform-9x6') &&
    typeof candidate.width === 'number' &&
    typeof candidate.height === 'number' &&
    Array.isArray(candidate.cells)
  );
}

export function isMappingWorkspace(value: unknown): value is MappingWorkspace {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<MappingWorkspace>;
  return (
    candidate.version === 1 &&
    isAtlasKey(candidate.currentAtlasKey) &&
    (candidate.currentTemplateKey === 'flat-guide' ||
      candidate.currentTemplateKey === 'elevated-guide' ||
      candidate.currentTemplateKey === 'stairs-guide' ||
      candidate.currentTemplateKey === 'freeform-9x6') &&
    !!candidate.documents &&
    typeof candidate.documents === 'object'
  );
}

export function getTerrainAtlasMapping(
  workspace: MappingWorkspace | null = loadWorkspace(),
): TerrainAtlasMapping {
  return resolveTerrainAtlasMapping(workspace);
}

export function prepareWorkspace(workspace: MappingWorkspace): MappingWorkspace {
  return normalizeWorkspace(workspace);
}

function isAtlasKey(value: unknown): value is AtlasKey {
  return typeof value === 'string' && TERRAIN_COLOR_ATLAS_KEYS.includes(value as AtlasKey);
}

function findSharedTileRulesFallback(
  workspace: MappingWorkspace,
  preferredAtlasKey: AtlasKey,
  tileId: number,
): Partial<AuthoredTileRules> | undefined {
  for (const atlasKey of TERRAIN_COLOR_ATLAS_KEYS) {
    if (atlasKey === preferredAtlasKey) {
      continue;
    }
    const candidate = workspace.tileRulesByAtlas?.[atlasKey]?.[`${tileId}`];
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

function normalizeWorkspace(workspace: MappingWorkspace): MappingWorkspace {
  let next = {
    ...workspace,
    documents: { ...workspace.documents },
    tileRulesByAtlas: normalizeTileRulesByAtlas(workspace.tileRulesByAtlas),
  };

  for (const templateKey of Object.keys(TEMPLATES) as TemplateKey[]) {
    const existing = next.documents[templateKey];
    if (!existing) {
      next.documents[templateKey] = createDocument(templateKey, next.currentAtlasKey);
      continue;
    }
    next.documents[templateKey] = normalizeDocument(templateKey, existing, next.currentAtlasKey);
  }

  return seedMissingTileRules(next);
}

function seedMissingTileRules(workspace: MappingWorkspace): MappingWorkspace {
  const nextTileRulesByAtlas = normalizeTileRulesByAtlas(workspace.tileRulesByAtlas);
  let changed = false;

  for (const templateKey of ['flat-guide', 'elevated-guide', 'stairs-guide'] as TemplateKey[]) {
    const documentState = getDocument(workspace, templateKey);
    const atlasKey = documentState.atlasKey;
    const guessedByTileId = nextTileRulesByAtlas[atlasKey];

    for (const row of documentState.cells) {
      for (const cell of row) {
        if (cell.tileId <= 0) {
          continue;
        }

        const nextGuess = guessTileRulesForCell(workspace, documentState, cell);
        const existing = guessedByTileId[`${cell.tileId}`];

        if (!existing) {
          guessedByTileId[`${cell.tileId}`] = nextGuess;
          changed = true;
          continue;
        }

        if (shouldBackfillMissingLayer(existing, nextGuess)) {
          guessedByTileId[`${cell.tileId}`] = {
            ...existing,
            layer: {
              level: nextGuess.layer.level,
              requiresBelow: nextGuess.layer.requiresBelow,
              allowsAbove: [...nextGuess.layer.allowsAbove],
            },
          };
          changed = true;
        }
      }
    }
  }

  if (!changed) {
    return workspace;
  }

  return {
    ...workspace,
    tileRulesByAtlas: nextTileRulesByAtlas,
  };
}

function normalizeTileRulesByAtlas(
  value: MappingWorkspace['tileRulesByAtlas'],
): NonNullable<MappingWorkspace['tileRulesByAtlas']> {
  return Object.fromEntries(
    TERRAIN_COLOR_ATLAS_KEYS.map((atlasKey) => [
      atlasKey,
      normalizeTileRuleMap(value?.[atlasKey]),
    ]),
  ) as NonNullable<MappingWorkspace['tileRulesByAtlas']>;
}

function normalizeTileRuleMap(
  value: Record<string, AuthoredTileRules> | undefined,
): Record<string, AuthoredTileRules> {
  const result: Record<string, AuthoredTileRules> = {};

  if (!value || typeof value !== 'object') {
    return result;
  }

  for (const [tileId, rules] of Object.entries(value)) {
    const numericTileId = Number(tileId);
    if (!Number.isInteger(numericTileId) || numericTileId <= 0) {
      continue;
    }
    result[`${numericTileId}`] = normalizeAuthoredTileRules(rules);
  }

  return result;
}

function guessTileRulesForCell(
  workspace: MappingWorkspace,
  documentState: MappingDocument,
  cell: MappingCell,
): AuthoredTileRules {
  return normalizeAuthoredTileRules(
    {
      edges: cell.rules.edges,
      adjacency: guessAdjacencyForCell(workspace, documentState, cell.label),
      passable: cell.rules.passable,
      layer: cell.rules.layer,
    },
    {
      edges: cell.rules.edges,
      passable: cell.rules.passable,
      layer: cell.rules.layer,
    },
  );
}

function guessLegacyTileRulesForCell(
  workspace: MappingWorkspace,
  documentState: MappingDocument,
  cell: MappingCell,
): AuthoredTileRules {
  return normalizeAuthoredTileRules(
    {
      edges: cell.rules.edges,
      adjacency: guessAdjacencyForCell(workspace, documentState, cell.label, true),
      passable: cell.rules.passable,
      layer: cell.rules.layer,
    },
    {
      edges: cell.rules.edges,
      passable: cell.rules.passable,
      layer: cell.rules.layer,
    },
  );
}

function shouldBackfillMissingLayer(
  existing: AuthoredTileRules,
  nextGuess: AuthoredTileRules,
): boolean {
  return isEmptyLayer(existing.layer) && !isEmptyLayer(nextGuess.layer);
}

function guessAdjacencyForCell(
  workspace: MappingWorkspace,
  documentState: MappingDocument,
  label: string,
  useLegacy = false,
): Record<GrammarDirection, number[]> {
  const templateKey = documentState.templateKey;
  if (templateKey === 'stairs-guide') {
    const tileIdsByDirection = buildStairAdjacency(workspace, documentState.atlasKey)[label];
    return {
      north: normalizeTileIdList(tileIdsByDirection?.north ?? []),
      east: normalizeTileIdList(tileIdsByDirection?.east ?? []),
      south: normalizeTileIdList(tileIdsByDirection?.south ?? []),
      west: normalizeTileIdList(tileIdsByDirection?.west ?? []),
    };
  }

  const labelsByDirection =
    templateKey === 'flat-guide'
      ? (useLegacy ? buildLegacyStripGridAdjacency(TEMPLATES['flat-guide'].labels) : buildStripGridAdjacency(TEMPLATES['flat-guide'].labels))[label]
      : (useLegacy ? buildLegacyElevatedAdjacency(TEMPLATES['elevated-guide'].labels) : buildElevatedAdjacency(TEMPLATES['elevated-guide'].labels))[label];

  return {
    north: mapLabelsToTileIds(documentState, labelsByDirection?.north ?? []),
    east: mapLabelsToTileIds(documentState, labelsByDirection?.east ?? []),
    south: mapLabelsToTileIds(documentState, labelsByDirection?.south ?? []),
    west: mapLabelsToTileIds(documentState, labelsByDirection?.west ?? []),
  };
}

function buildStripGridAdjacency(
  labels: string[][],
): Record<string, Partial<Record<GrammarDirection, string[]>>> {
  const result = createEmptyLabelAdjacency(labels);

  for (let rowIndex = 0; rowIndex < labels.length; rowIndex++) {
    applyHorizontalAdjacency(result, labels[rowIndex]);
  }

  for (let colIndex = 0; colIndex < labels[0].length; colIndex++) {
    const top = labels[0][colIndex];
    const upper = labels[1][colIndex];
    const lower = labels[2][colIndex];
    const bottom = labels[3][colIndex];

    result[top].south = normalizeLabelList([upper, bottom]);
    result[upper].north = normalizeLabelList([top]);
    result[upper].south = normalizeLabelList([lower, bottom]);
    result[lower].north = normalizeLabelList([upper, lower]);
    result[lower].south = normalizeLabelList([lower, bottom]);
    result[bottom].north = normalizeLabelList([top, upper, lower]);
  }

  return result;
}

function buildLegacyStripGridAdjacency(
  labels: string[][],
): Record<string, Partial<Record<GrammarDirection, string[]>>> {
  const result: Record<string, Partial<Record<GrammarDirection, string[]>>> = {};

  for (let rowIndex = 0; rowIndex < labels.length; rowIndex++) {
    for (let colIndex = 0; colIndex < labels[rowIndex].length; colIndex++) {
      const label = labels[rowIndex][colIndex];
      const adjacency: Partial<Record<GrammarDirection, string[]>> = {
        north: [],
        east: [],
        south: [],
        west: [],
      };

      if (colIndex <= 2) {
        if (colIndex === 0) {
          adjacency.east = [labels[rowIndex][1], labels[rowIndex][2]];
        } else if (colIndex === 1) {
          adjacency.east = [labels[rowIndex][1], labels[rowIndex][2]];
          adjacency.west = [labels[rowIndex][0], labels[rowIndex][1]];
        } else if (colIndex === 2) {
          adjacency.west = [labels[rowIndex][0], labels[rowIndex][1]];
        }
      }

      if (rowIndex === 0) {
        adjacency.south = [labels[1][colIndex], labels[2][colIndex]];
      } else if (rowIndex === 1) {
        adjacency.north = [labels[0][colIndex]];
        adjacency.south = [labels[2][colIndex], labels[3][colIndex]];
      } else if (rowIndex === 2) {
        adjacency.north = [labels[0][colIndex], labels[1][colIndex]];
        adjacency.south = [labels[3][colIndex]];
      } else if (rowIndex === 3) {
        adjacency.north = [labels[1][colIndex], labels[2][colIndex]];
      }

      result[label] = adjacency;
    }
  }

  return result;
}

function buildElevatedAdjacency(
  labels: string[][],
): Record<string, Partial<Record<GrammarDirection, string[]>>> {
  const result = createEmptyLabelAdjacency(labels);

  for (let rowIndex = 0; rowIndex < labels.length; rowIndex++) {
    applyHorizontalAdjacency(result, labels[rowIndex]);
  }

  for (let colIndex = 0; colIndex < labels[0].length; colIndex++) {
    const top = labels[0][colIndex];
    const upper = labels[1][colIndex];
    const middle = labels[2][colIndex];
    const lip = labels[3][colIndex];
    const land = labels[4][colIndex];
    const water = labels[5][colIndex];

    result[top].south = normalizeLabelList([upper, lip]);
    result[upper].north = normalizeLabelList([top]);
    result[upper].south = normalizeLabelList([middle, lip]);
    result[middle].north = normalizeLabelList([upper, middle]);
    result[middle].south = normalizeLabelList([middle, lip]);
    result[lip].north = normalizeLabelList([top, upper, middle]);
    result[lip].south = normalizeLabelList([land]);
    result[land].north = normalizeLabelList([lip, land]);
    result[land].south = normalizeLabelList([land, water]);
    result[water].north = normalizeLabelList([land]);
  }

  return result;
}

function buildLegacyElevatedAdjacency(
  labels: string[][],
): Record<string, Partial<Record<GrammarDirection, string[]>>> {
  const stripAdjacency = buildLegacyStripGridAdjacency(labels.slice(0, 4));
  const result: Record<string, Partial<Record<GrammarDirection, string[]>>> = {
    ...stripAdjacency,
  };

  result['10'] = {
    ...result['10'],
    south: ['17', '21'],
  };
  result['11'] = {
    ...result['11'],
    south: ['18', '22'],
  };
  result['12'] = {
    ...result['12'],
    south: ['19', '23'],
  };
  result['16'] = {
    ...result['16'],
    south: ['20', '24'],
  };

  const landRow = labels[4];
  const waterRow = labels[5];
  for (const [row, lipLabel] of [
    [landRow, ['10', '11', '12', '16']],
    [waterRow, ['10', '11', '12', '16']],
  ] as const) {
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const label = row[colIndex];
      const adjacency: Partial<Record<GrammarDirection, string[]>> = {
        north: [lipLabel[colIndex]],
        east: [],
        south: [],
        west: [],
      };

      if (colIndex <= 2) {
        if (colIndex === 0) {
          adjacency.east = [row[1], row[2]];
        } else if (colIndex === 1) {
          adjacency.east = [row[1], row[2]];
          adjacency.west = [row[0], row[1]];
        } else if (colIndex === 2) {
          adjacency.west = [row[0], row[1]];
        }
      }

      result[label] = adjacency;
    }
  }

  return result;
}

function createEmptyLabelAdjacency(
  labels: string[][],
): Record<string, Record<GrammarDirection, string[]>> {
  const result: Record<string, Record<GrammarDirection, string[]>> = {};
  for (const row of labels) {
    for (const label of row) {
      result[label] = {
        north: [],
        east: [],
        south: [],
        west: [],
      };
    }
  }
  return result;
}

function applyHorizontalAdjacency(
  target: Record<string, Record<GrammarDirection, string[]>>,
  row: string[],
): void {
  for (let colIndex = 0; colIndex < row.length; colIndex++) {
    const label = row[colIndex];
    if (colIndex === 0) {
      target[label].east = normalizeLabelList([row[1], row[2]]);
    } else if (colIndex === 1) {
      target[label].east = normalizeLabelList([row[1], row[2]]);
      target[label].west = normalizeLabelList([row[0], row[1]]);
    } else if (colIndex === 2) {
      target[label].west = normalizeLabelList([row[0], row[1]]);
    }
  }
}

function normalizeLabelList(labels: string[]): string[] {
  return Array.from(new Set(labels.filter(Boolean)));
}

function buildStairAdjacency(
  workspace: MappingWorkspace,
  atlasKey: AtlasKey,
): Record<string, Partial<Record<GrammarDirection, number[]>>> {
  const flatDoc = getDocument(workspace, 'flat-guide', atlasKey);
  const elevatedDoc = getDocument(workspace, 'elevated-guide', atlasKey);

  return {
    'upper-left': {
      north: [getCellTileId(elevatedDoc, '7'), getCellTileId(elevatedDoc, '8'), getCellTileId(elevatedDoc, '10'), getCellTileId(elevatedDoc, '11')],
      east: [getCellTileId(getDocument(workspace, 'stairs-guide', atlasKey), 'upper-right')],
      south: [getCellTileId(getDocument(workspace, 'stairs-guide', atlasKey), 'lower-left')],
      west: [],
    },
    'upper-right': {
      north: [getCellTileId(elevatedDoc, '8'), getCellTileId(elevatedDoc, '9'), getCellTileId(elevatedDoc, '11'), getCellTileId(elevatedDoc, '12')],
      east: [],
      south: [getCellTileId(getDocument(workspace, 'stairs-guide', atlasKey), 'lower-right')],
      west: [getCellTileId(getDocument(workspace, 'stairs-guide', atlasKey), 'upper-left')],
    },
    'lower-left': {
      north: [getCellTileId(getDocument(workspace, 'stairs-guide', atlasKey), 'upper-left')],
      east: [getCellTileId(getDocument(workspace, 'stairs-guide', atlasKey), 'lower-right')],
      south: [getCellTileId(flatDoc, '7'), getCellTileId(flatDoc, '8'), getCellTileId(flatDoc, '10'), getCellTileId(flatDoc, '11')],
      west: [],
    },
    'lower-right': {
      north: [getCellTileId(getDocument(workspace, 'stairs-guide', atlasKey), 'upper-right')],
      east: [],
      south: [getCellTileId(flatDoc, '8'), getCellTileId(flatDoc, '9'), getCellTileId(flatDoc, '11'), getCellTileId(flatDoc, '12')],
      west: [getCellTileId(getDocument(workspace, 'stairs-guide', atlasKey), 'lower-left')],
    },
  };
}

function mapLabelsToTileIds(documentState: MappingDocument, labels: string[]): number[] {
  return normalizeTileIdList(labels.map((label) => getCellTileId(documentState, label)));
}

function normalizeDocument(
  templateKey: TemplateKey,
  documentState: MappingDocument,
  atlasKey: AtlasKey,
): MappingDocument {
  const fresh = createDocument(templateKey, atlasKey);
  if (!isMappingDocument(documentState)) {
    return fresh;
  }

  const labelToTileId = new Map<string, number>();
  const labelToRules = new Map<string, MappingCellRules>();
  for (const row of documentState.cells) {
    for (const cell of row) {
      if (cell.label) {
        labelToTileId.set(cell.label, cell.tileId);
        labelToRules.set(cell.label, normalizeCellRules(cell.rules, getDefaultRulesForCell(templateKey, cell.label)));
      }
    }
  }

  return {
    ...fresh,
    atlasKey,
    cells: fresh.cells.map((row) =>
      row.map((cell) => ({
        ...cell,
        tileId: labelToTileId.get(cell.label) ?? cell.tileId,
        rules: labelToRules.get(cell.label) ?? cell.rules,
      })),
    ),
  };
}

function resolveTerrainAtlasMapping(workspace: MappingWorkspace | null): TerrainAtlasMapping {
  const flatDoc = workspace
    ? getDocument(workspace, 'flat-guide')
    : createDocument('flat-guide', 'terrain-tileset');
  const elevatedDoc = workspace
    ? getDocument(workspace, 'elevated-guide')
    : createDocument('elevated-guide', 'terrain-tileset');
  const stairDoc = workspace
    ? getDocument(workspace, 'stairs-guide')
    : createDocument('stairs-guide', 'terrain-tileset');

  return {
    flatGround: {
      topLeft: getCellTileId(flatDoc, '1'),
      topCenter: getCellTileId(flatDoc, '2'),
      topRight: getCellTileId(flatDoc, '3'),
      topSingle: getCellTileId(flatDoc, '13'),
      upperRow: {
        left: getCellTileId(flatDoc, '4'),
        center: getCellTileId(flatDoc, '5'),
        right: getCellTileId(flatDoc, '6'),
        single: getCellTileId(flatDoc, '14'),
      },
      lowerRow: {
        left: getCellTileId(flatDoc, '7'),
        center: getCellTileId(flatDoc, '8'),
        right: getCellTileId(flatDoc, '9'),
        single: getCellTileId(flatDoc, '15'),
      },
      bottomLeft: getCellTileId(flatDoc, '10'),
      bottomCenter: getCellTileId(flatDoc, '11'),
      bottomRight: getCellTileId(flatDoc, '12'),
      bottomSingle: getCellTileId(flatDoc, '16'),
    },
    elevatedTop: {
      topLeft: getCellTileId(elevatedDoc, '1'),
      topCenter: getCellTileId(elevatedDoc, '2'),
      topRight: getCellTileId(elevatedDoc, '3'),
      topSingle: getCellTileId(elevatedDoc, '13'),
      upperRow: {
        left: getCellTileId(elevatedDoc, '4'),
        center: getCellTileId(elevatedDoc, '5'),
        right: getCellTileId(elevatedDoc, '6'),
        single: getCellTileId(elevatedDoc, '14'),
      },
      middleRow: {
        left: getCellTileId(elevatedDoc, '7'),
        center: getCellTileId(elevatedDoc, '8'),
        right: getCellTileId(elevatedDoc, '9'),
        single: getCellTileId(elevatedDoc, '15'),
      },
      bottomLeft: getCellTileId(elevatedDoc, '10'),
      bottomCenter: getCellTileId(elevatedDoc, '11'),
      bottomRight: getCellTileId(elevatedDoc, '12'),
      bottomSingle: getCellTileId(elevatedDoc, '16'),
    },
    cliffs: {
      land: {
        left: getCellTileId(elevatedDoc, '17'),
        center: getCellTileId(elevatedDoc, '18'),
        right: getCellTileId(elevatedDoc, '19'),
        single: getCellTileId(elevatedDoc, '20'),
      },
      water: {
        left: getCellTileId(elevatedDoc, '21'),
        center: getCellTileId(elevatedDoc, '22'),
        right: getCellTileId(elevatedDoc, '23'),
        single: getCellTileId(elevatedDoc, '24'),
      },
    },
    stairs: {
      left: {
        upper: getCellTileId(stairDoc, 'upper-left'),
        lower: getCellTileId(stairDoc, 'lower-left'),
      },
      right: {
        upper: getCellTileId(stairDoc, 'upper-right'),
        lower: getCellTileId(stairDoc, 'lower-right'),
      },
    },
  };
}

function getCellTileId(documentState: MappingDocument | null, label: string): number {
  if (!documentState) {
    return 0;
  }

  for (const row of documentState.cells) {
    for (const cell of row) {
      if (cell.label === label) {
        return cell.tileId;
      }
    }
  }

  return 0;
}

function getDefaultRulesForCell(templateKey: TemplateKey, label: string): MappingCellRules {
  const defaultsByTemplate: Partial<Record<TemplateKey, Record<string, MappingCellRules>>> = {
    'flat-guide': {
      '1': createRules({ north: 'water', east: 'flat', south: 'flat', west: 'water' }, { north: false, east: true, south: true, west: false }, ['flat', 'corner', 'shore'], { level: 1, requiresBelow: 'void', allowsAbove: ['overlay', 'elevated', 'cliff', 'stair'] }),
      '2': createRules({ north: 'water', east: 'flat', south: 'flat', west: 'flat' }, { north: false, east: true, south: true, west: true }, ['flat', 'edge', 'shore'], { level: 1, requiresBelow: 'void', allowsAbove: ['overlay', 'elevated', 'cliff', 'stair'] }),
      '3': createRules({ north: 'water', east: 'water', south: 'flat', west: 'flat' }, { north: false, east: false, south: true, west: true }, ['flat', 'corner', 'shore'], { level: 1, requiresBelow: 'void', allowsAbove: ['overlay', 'elevated', 'cliff', 'stair'] }),
      '13': createRules({ north: 'water', east: 'water', south: 'flat', west: 'water' }, { north: false, east: false, south: true, west: false }, ['flat', 'single', 'shore'], { level: 1, requiresBelow: 'void', allowsAbove: ['overlay', 'elevated', 'cliff', 'stair'] }),
      '4': createRules({ north: 'flat', east: 'flat', south: 'flat', west: 'water' }, { north: true, east: true, south: true, west: false }, ['flat', 'edge'], { level: 1, requiresBelow: 'void', allowsAbove: ['overlay', 'elevated', 'cliff', 'stair'] }),
      '5': createRules({ north: 'flat', east: 'flat', south: 'flat', west: 'flat' }, { north: true, east: true, south: true, west: true }, ['flat', 'center'], { level: 1, requiresBelow: 'void', allowsAbove: ['overlay', 'elevated', 'cliff', 'stair'] }),
      '6': createRules({ north: 'flat', east: 'water', south: 'flat', west: 'flat' }, { north: true, east: false, south: true, west: true }, ['flat', 'edge'], { level: 1, requiresBelow: 'void', allowsAbove: ['overlay', 'elevated', 'cliff', 'stair'] }),
      '14': createRules({ north: 'flat', east: 'water', south: 'flat', west: 'water' }, { north: true, east: false, south: true, west: false }, ['flat', 'single'], { level: 1, requiresBelow: 'void', allowsAbove: ['overlay', 'elevated', 'cliff', 'stair'] }),
      '7': createRules({ north: 'flat', east: 'flat', south: 'flat', west: 'water' }, { north: true, east: true, south: true, west: false }, ['flat', 'edge'], { level: 1, requiresBelow: 'void', allowsAbove: ['overlay', 'elevated', 'cliff', 'stair'] }),
      '8': createRules({ north: 'flat', east: 'flat', south: 'flat', west: 'flat' }, { north: true, east: true, south: true, west: true }, ['flat', 'center'], { level: 1, requiresBelow: 'void', allowsAbove: ['overlay', 'elevated', 'cliff', 'stair'] }),
      '9': createRules({ north: 'flat', east: 'water', south: 'flat', west: 'flat' }, { north: true, east: false, south: true, west: true }, ['flat', 'edge'], { level: 1, requiresBelow: 'void', allowsAbove: ['overlay', 'elevated', 'cliff', 'stair'] }),
      '15': createRules({ north: 'flat', east: 'water', south: 'flat', west: 'water' }, { north: true, east: false, south: true, west: false }, ['flat', 'single'], { level: 1, requiresBelow: 'void', allowsAbove: ['overlay', 'elevated', 'cliff', 'stair'] }),
      '10': createRules({ north: 'flat', east: 'flat', south: 'water', west: 'water' }, { north: true, east: true, south: false, west: false }, ['flat', 'corner', 'shore'], { level: 1, requiresBelow: 'void', allowsAbove: ['overlay', 'elevated', 'cliff', 'stair'] }),
      '11': createRules({ north: 'flat', east: 'flat', south: 'water', west: 'flat' }, { north: true, east: true, south: false, west: true }, ['flat', 'edge', 'shore'], { level: 1, requiresBelow: 'void', allowsAbove: ['overlay', 'elevated', 'cliff', 'stair'] }),
      '12': createRules({ north: 'flat', east: 'water', south: 'water', west: 'flat' }, { north: true, east: false, south: false, west: true }, ['flat', 'corner', 'shore'], { level: 1, requiresBelow: 'void', allowsAbove: ['overlay', 'elevated', 'cliff', 'stair'] }),
      '16': createRules({ north: 'flat', east: 'water', south: 'water', west: 'water' }, { north: true, east: false, south: false, west: false }, ['flat', 'single', 'shore'], { level: 1, requiresBelow: 'void', allowsAbove: ['overlay', 'elevated', 'cliff', 'stair'] }),
    },
    'elevated-guide': {
      '1': createRules({ north: 'void', east: 'elevated', south: 'elevated', west: 'void' }, { north: false, east: true, south: true, west: false }, ['elevated', 'corner'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '2': createRules({ north: 'void', east: 'elevated', south: 'elevated', west: 'elevated' }, { north: false, east: true, south: true, west: true }, ['elevated', 'edge'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '3': createRules({ north: 'void', east: 'void', south: 'elevated', west: 'elevated' }, { north: false, east: false, south: true, west: true }, ['elevated', 'corner'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '13': createRules({ north: 'void', east: 'void', south: 'elevated', west: 'void' }, { north: false, east: false, south: true, west: false }, ['elevated', 'single'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '4': createRules({ north: 'elevated', east: 'elevated', south: 'elevated', west: 'void' }, { north: true, east: true, south: true, west: false }, ['elevated', 'edge'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '5': createRules({ north: 'elevated', east: 'elevated', south: 'elevated', west: 'elevated' }, { north: true, east: true, south: true, west: true }, ['elevated', 'center'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '6': createRules({ north: 'elevated', east: 'void', south: 'elevated', west: 'elevated' }, { north: true, east: false, south: true, west: true }, ['elevated', 'edge'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '14': createRules({ north: 'elevated', east: 'void', south: 'elevated', west: 'void' }, { north: true, east: false, south: true, west: false }, ['elevated', 'single'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '7': createRules({ north: 'elevated', east: 'elevated', south: 'elevated', west: 'void' }, { north: true, east: true, south: true, west: false }, ['elevated', 'edge'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '8': createRules({ north: 'elevated', east: 'elevated', south: 'elevated', west: 'elevated' }, { north: true, east: true, south: true, west: true }, ['elevated', 'center'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '9': createRules({ north: 'elevated', east: 'void', south: 'elevated', west: 'elevated' }, { north: true, east: false, south: true, west: true }, ['elevated', 'edge'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '15': createRules({ north: 'elevated', east: 'void', south: 'elevated', west: 'void' }, { north: true, east: false, south: true, west: false }, ['elevated', 'single'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '10': createRules({ north: 'elevated', east: 'elevated', south: 'cliff', west: 'void' }, { north: true, east: true, south: false, west: false }, ['elevated', 'lip'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '11': createRules({ north: 'elevated', east: 'elevated', south: 'cliff', west: 'elevated' }, { north: true, east: true, south: false, west: true }, ['elevated', 'lip'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '12': createRules({ north: 'elevated', east: 'void', south: 'cliff', west: 'elevated' }, { north: true, east: false, south: false, west: true }, ['elevated', 'lip'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '16': createRules({ north: 'elevated', east: 'void', south: 'cliff', west: 'void' }, { north: true, east: false, south: false, west: false }, ['elevated', 'lip'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '17': createRules({ north: 'elevated', east: 'cliff', south: 'flat', west: 'void' }, { north: false, east: false, south: false, west: false }, ['cliff', 'land'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '18': createRules({ north: 'elevated', east: 'cliff', south: 'flat', west: 'cliff' }, { north: false, east: false, south: false, west: false }, ['cliff', 'land'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '19': createRules({ north: 'elevated', east: 'void', south: 'flat', west: 'cliff' }, { north: false, east: false, south: false, west: false }, ['cliff', 'land'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '20': createRules({ north: 'elevated', east: 'void', south: 'flat', west: 'void' }, { north: false, east: false, south: false, west: false }, ['cliff', 'land', 'single'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      '21': createRules({ north: 'elevated', east: 'cliff', south: 'water', west: 'void' }, { north: false, east: false, south: false, west: false }, ['cliff', 'water'], { level: 2, requiresBelow: 'water', allowsAbove: ['overlay'] }),
      '22': createRules({ north: 'elevated', east: 'cliff', south: 'water', west: 'cliff' }, { north: false, east: false, south: false, west: false }, ['cliff', 'water'], { level: 2, requiresBelow: 'water', allowsAbove: ['overlay'] }),
      '23': createRules({ north: 'elevated', east: 'void', south: 'water', west: 'cliff' }, { north: false, east: false, south: false, west: false }, ['cliff', 'water'], { level: 2, requiresBelow: 'water', allowsAbove: ['overlay'] }),
      '24': createRules({ north: 'elevated', east: 'void', south: 'water', west: 'void' }, { north: false, east: false, south: false, west: false }, ['cliff', 'water', 'single'], { level: 2, requiresBelow: 'water', allowsAbove: ['overlay'] }),
    },
    'stairs-guide': {
      'upper-left': createRules({ north: 'elevated', east: 'stair', south: 'stair', west: 'cliff' }, { north: true, east: true, south: true, west: false }, ['stair', 'entry'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      'upper-right': createRules({ north: 'elevated', east: 'cliff', south: 'stair', west: 'stair' }, { north: true, east: false, south: true, west: true }, ['stair', 'entry'], { level: 2, requiresBelow: 'flat', allowsAbove: ['overlay'] }),
      'lower-left': createRules({ north: 'stair', east: 'flat', south: 'flat', west: 'cliff' }, { north: true, east: true, south: true, west: false }, ['stair', 'exit'], { level: 1, requiresBelow: 'flat', allowsAbove: ['stair', 'overlay'] }),
      'lower-right': createRules({ north: 'stair', east: 'cliff', south: 'flat', west: 'flat' }, { north: true, east: false, south: true, west: true }, ['stair', 'exit'], { level: 1, requiresBelow: 'flat', allowsAbove: ['stair', 'overlay'] }),
    },
  };

  return defaultsByTemplate[templateKey]?.[label] ?? createRules(
    { north: 'void', east: 'void', south: 'void', west: 'void' },
    { north: false, east: false, south: false, west: false },
    [],
    { level: 0, requiresBelow: 'void', allowsAbove: [] },
  );
}

function createRules(
  edges: Record<GrammarDirection, GrammarSocket>,
  passable: Record<GrammarDirection, boolean>,
  tags: string[],
  layer: MappingCellRules['layer'],
  adjacency?: Partial<Record<GrammarDirection, number[]>>,
): MappingCellRules {
  return {
    edges: { ...edges },
    adjacency: {
      north: normalizeTileIdList(adjacency?.north),
      east: normalizeTileIdList(adjacency?.east),
      south: normalizeTileIdList(adjacency?.south),
      west: normalizeTileIdList(adjacency?.west),
    },
    passable: { ...passable },
    tags: [...tags],
    layer: {
      level: layer.level,
      requiresBelow: layer.requiresBelow,
      allowsAbove: [...layer.allowsAbove],
    },
  };
}

function normalizeCellRules(
  value: MappingCellRules | undefined,
  fallback: MappingCellRules,
): MappingCellRules {
  if (!value) {
    return createRules(fallback.edges, fallback.passable, fallback.tags, fallback.layer);
  }

  const edges = {
    north: GRAMMAR_SOCKETS.includes(value.edges?.north) ? value.edges.north : fallback.edges.north,
    east: GRAMMAR_SOCKETS.includes(value.edges?.east) ? value.edges.east : fallback.edges.east,
    south: GRAMMAR_SOCKETS.includes(value.edges?.south) ? value.edges.south : fallback.edges.south,
    west: GRAMMAR_SOCKETS.includes(value.edges?.west) ? value.edges.west : fallback.edges.west,
  };

  const passable = {
    north: typeof value.passable?.north === 'boolean' ? value.passable.north : fallback.passable.north,
    east: typeof value.passable?.east === 'boolean' ? value.passable.east : fallback.passable.east,
    south: typeof value.passable?.south === 'boolean' ? value.passable.south : fallback.passable.south,
    west: typeof value.passable?.west === 'boolean' ? value.passable.west : fallback.passable.west,
  };

  const adjacency = {
    north: normalizeTileIdList(value.adjacency?.north ?? fallback.adjacency.north),
    east: normalizeTileIdList(value.adjacency?.east ?? fallback.adjacency.east),
    south: normalizeTileIdList(value.adjacency?.south ?? fallback.adjacency.south),
    west: normalizeTileIdList(value.adjacency?.west ?? fallback.adjacency.west),
  };

  const tags = Array.isArray(value.tags)
    ? value.tags.map((tag) => `${tag}`.trim()).filter(Boolean)
    : fallback.tags;

  const layer = {
    level:
      typeof value.layer?.level === 'number' && Number.isFinite(value.layer.level)
        ? value.layer.level
        : fallback.layer.level,
    requiresBelow: GRAMMAR_SOCKETS.includes(value.layer?.requiresBelow)
      ? value.layer.requiresBelow
      : fallback.layer.requiresBelow,
    allowsAbove: Array.isArray(value.layer?.allowsAbove)
      ? value.layer.allowsAbove.filter((socket): socket is GrammarSocket =>
          GRAMMAR_SOCKETS.includes(socket),
        )
      : fallback.layer.allowsAbove,
  };

  return { edges, adjacency, passable, tags, layer };
}

function normalizeTileIdList(value: number[] | undefined): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((tileId) => Number(tileId))
        .filter((tileId) => Number.isInteger(tileId) && tileId > 0),
    ),
  ).sort((left, right) => left - right);
}

function normalizeAuthoredTileRules(
  value: Partial<AuthoredTileRules> | undefined,
  fallback: Partial<AuthoredTileRules> = {},
): AuthoredTileRules {
  const fallbackEdges = fallback.edges ?? createEmptyEdges();
  const fallbackAdjacency = fallback.adjacency ?? createEmptyAdjacency();
  const fallbackPassable = fallback.passable ?? createEmptyPassable();
  const fallbackLayer = fallback.layer ?? createEmptyLayer();

  return {
    edges: {
      north: GRAMMAR_SOCKETS.includes(value?.edges?.north) ? value.edges.north : fallbackEdges.north,
      east: GRAMMAR_SOCKETS.includes(value?.edges?.east) ? value.edges.east : fallbackEdges.east,
      south: GRAMMAR_SOCKETS.includes(value?.edges?.south) ? value.edges.south : fallbackEdges.south,
      west: GRAMMAR_SOCKETS.includes(value?.edges?.west) ? value.edges.west : fallbackEdges.west,
    },
    adjacency: {
      north: normalizeTileIdList(value?.adjacency?.north ?? fallbackAdjacency.north),
      east: normalizeTileIdList(value?.adjacency?.east ?? fallbackAdjacency.east),
      south: normalizeTileIdList(value?.adjacency?.south ?? fallbackAdjacency.south),
      west: normalizeTileIdList(value?.adjacency?.west ?? fallbackAdjacency.west),
    },
    passable: {
      north:
        typeof value?.passable?.north === 'boolean'
          ? value.passable.north
          : fallbackPassable.north,
      east:
        typeof value?.passable?.east === 'boolean'
          ? value.passable.east
          : fallbackPassable.east,
      south:
        typeof value?.passable?.south === 'boolean'
          ? value.passable.south
          : fallbackPassable.south,
      west:
        typeof value?.passable?.west === 'boolean'
          ? value.passable.west
          : fallbackPassable.west,
    },
    layer: {
      level:
        typeof value?.layer?.level === 'number' && Number.isFinite(value.layer.level)
          ? value.layer.level
          : fallbackLayer.level,
      requiresBelow: GRAMMAR_SOCKETS.includes(value?.layer?.requiresBelow)
        ? value.layer.requiresBelow
        : fallbackLayer.requiresBelow,
      allowsAbove: Array.isArray(value?.layer?.allowsAbove)
        ? value.layer.allowsAbove.filter((socket): socket is GrammarSocket =>
            GRAMMAR_SOCKETS.includes(socket),
          )
        : fallbackLayer.allowsAbove,
    },
  };
}

function authoredTileRulesEqual(left: AuthoredTileRules, right: AuthoredTileRules): boolean {
  return (
    GRAMMAR_DIRECTIONS.every((direction) => left.edges[direction] === right.edges[direction]) &&
    GRAMMAR_DIRECTIONS.every(
      (direction) =>
        left.passable[direction] === right.passable[direction] &&
        left.adjacency[direction].length === right.adjacency[direction].length &&
        left.adjacency[direction].every((tileId, index) => tileId === right.adjacency[direction][index]),
    ) &&
    left.layer.level === right.layer.level &&
    left.layer.requiresBelow === right.layer.requiresBelow &&
    left.layer.allowsAbove.length === right.layer.allowsAbove.length &&
    left.layer.allowsAbove.every((socket, index) => socket === right.layer.allowsAbove[index])
  );
}

function createEmptyEdges(): Record<GrammarDirection, GrammarSocket> {
  return {
    north: 'void',
    east: 'void',
    south: 'void',
    west: 'void',
  };
}

function createEmptyAdjacency(): Record<GrammarDirection, number[]> {
  return {
    north: [],
    east: [],
    south: [],
    west: [],
  };
}

function createEmptyPassable(): Record<GrammarDirection, boolean> {
  return {
    north: false,
    east: false,
    south: false,
    west: false,
  };
}

function createEmptyLayer(): MappingCellRules['layer'] {
  return {
    level: 0,
    requiresBelow: 'void',
    allowsAbove: [],
  };
}

function isEmptyLayer(layer: MappingCellRules['layer']): boolean {
  return (
    layer.level === 0 &&
    layer.requiresBelow === 'void' &&
    layer.allowsAbove.length === 0
  );
}
