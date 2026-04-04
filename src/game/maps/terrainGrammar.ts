import {
  AtlasKey,
  createWorkspace,
  getAuthoredTileRules,
  getDocument,
  GrammarDirection,
  GrammarSocket,
  loadWorkspace,
  MappingWorkspace,
  TemplateKey,
} from './tileMapping';

const RUNTIME_TEMPLATE_KEYS: TemplateKey[] = ['flat-guide', 'elevated-guide', 'stairs-guide'];

export interface TerrainGrammarTile {
  key: string;
  templateKey: TemplateKey;
  label: string;
  tileId: number;
  atlasKey: AtlasKey;
  selfSocket: GrammarSocket;
  edges: Record<GrammarDirection, GrammarSocket>;
  adjacencyRules: Record<GrammarDirection, number[]>;
  passable: Record<GrammarDirection, boolean>;
  tags: string[];
  layerLevel: number;
  requiresBelow: GrammarSocket;
  allowsAbove: GrammarSocket[];
}

export interface TerrainGrammarSet {
  tiles: TerrainGrammarTile[];
  adjacency: Record<string, Record<GrammarDirection, string[]>>;
}

export function buildTerrainGrammar(
  workspace: MappingWorkspace | null = loadWorkspace() ?? createWorkspace(),
): TerrainGrammarSet {
  const tiles = RUNTIME_TEMPLATE_KEYS.flatMap((templateKey) => {
    const documentState = getDocument(workspace, templateKey);
    return documentState.cells.flatMap((row) =>
      row
        .filter((cell) => cell.tileId > 0)
        .map((cell) => {
          const tileRules = getAuthoredTileRules(workspace, documentState.atlasKey, cell.tileId, {
            edges: cell.rules.edges,
            adjacency: cell.rules.adjacency,
            passable: cell.rules.passable,
            layer: cell.rules.layer,
          });

          return {
            key: `${templateKey}.${cell.label}`,
            templateKey,
            label: cell.label,
            tileId: cell.tileId,
            atlasKey: documentState.atlasKey,
            selfSocket: inferSelfSocket(templateKey, cell.label, cell.rules.tags),
            edges: tileRules.edges,
            adjacencyRules: tileRules.adjacency,
            passable: tileRules.passable,
            tags: [...cell.rules.tags, templateKey],
            layerLevel: tileRules.layer.level,
            requiresBelow: tileRules.layer.requiresBelow,
            allowsAbove: [...tileRules.layer.allowsAbove],
          };
        }),
    );
  });

  const adjacency = Object.fromEntries(
    tiles.map((tile) => [tile.key, buildAdjacencyForTile(tile, tiles)]),
  ) as TerrainGrammarSet['adjacency'];

  return { tiles, adjacency };
}

function inferSelfSocket(
  templateKey: TemplateKey,
  label: string,
  tags: string[],
): GrammarSocket {
  if (templateKey === 'flat-guide') {
    return 'flat';
  }
  if (templateKey === 'stairs-guide') {
    return 'stair';
  }
  if (templateKey === 'elevated-guide') {
    if (tags.includes('cliff') || ['17', '18', '19', '20', '21', '22', '23', '24'].includes(label)) {
      return 'cliff';
    }
    return 'elevated';
  }
  return 'void';
}

function buildAdjacencyForTile(
  tile: TerrainGrammarTile,
  tiles: TerrainGrammarTile[],
): Record<GrammarDirection, string[]> {
  return {
    north: matchTiles(tile, 'north', tiles),
    east: matchTiles(tile, 'east', tiles),
    south: matchTiles(tile, 'south', tiles),
    west: matchTiles(tile, 'west', tiles),
  };
}

function matchTiles(
  source: TerrainGrammarTile,
  direction: GrammarDirection,
  tiles: TerrainGrammarTile[],
): string[] {
  const explicitAllowed = source.adjacencyRules[direction];
  return tiles
    .filter(
      (candidate) =>
        candidate.layerLevel === source.layerLevel && explicitAllowed.includes(candidate.tileId),
    )
    .map((candidate) => candidate.key);
}
