import type { TerrainTileLayer } from './islandGenerator';

const PROCEDURAL_ATLAS_TILE_SIZE = 64;
const PROCEDURAL_RENDER_TILE_SIZE = 48;
const PROCEDURAL_RENDER_SCALE = PROCEDURAL_RENDER_TILE_SIZE / PROCEDURAL_ATLAS_TILE_SIZE;

export function createGroundTilemapLayer(
  scene: Phaser.Scene,
  mapKey: string,
  layerDepth: number
): Phaser.Tilemaps.Tilemap {
  scene.textures.get('terrain-tileset')?.setFilter(Phaser.Textures.FilterMode.NEAREST);
  const map = scene.make.tilemap({ key: mapKey });
  const mapTileset = map.tilesets[0];
  const tilesetName = mapTileset?.name ?? 'terrain-base';
  const tileset = map.addTilesetImage(tilesetName, 'terrain-tileset');

  if (!tileset) {
    throw new Error(`Failed to bind tileset "${tilesetName}" for map "${mapKey}".`);
  }

  const layer = map.createLayer('Ground', tileset, 0, 0);
  layer?.setDepth(layerDepth);

  return map;
}

export function createProceduralTilemap(
  scene: Phaser.Scene,
  tileData: number[][],
  tilesetTextureKey: string,
  layerDepth: number,
): { map: Phaser.Tilemaps.Tilemap; layer: Phaser.Tilemaps.TilemapLayer } {
  scene.textures.get(tilesetTextureKey)?.setFilter(Phaser.Textures.FilterMode.NEAREST);

  const map = scene.make.tilemap({
    data: tileData,
    tileWidth: PROCEDURAL_ATLAS_TILE_SIZE,
    tileHeight: PROCEDURAL_ATLAS_TILE_SIZE,
  });

  // firstgid=1 to match Tiled convention: tile ID 1 = first frame in texture
  const tileset = map.addTilesetImage(
    '__DEFAULT',
    tilesetTextureKey,
    PROCEDURAL_ATLAS_TILE_SIZE,
    PROCEDURAL_ATLAS_TILE_SIZE,
    0,
    0,
    1,
  );
  if (!tileset) {
    throw new Error(`Failed to bind tileset texture "${tilesetTextureKey}" for procedural map.`);
  }

  const layer = map.createLayer(0, tileset, 0, 0);
  if (!layer) {
    throw new Error('Failed to create procedural tilemap layer.');
  }

  layer.setScale(PROCEDURAL_RENDER_SCALE);
  layer.setDepth(layerDepth);
  return { map, layer };
}

export function createProceduralTilemapStack(
  scene: Phaser.Scene,
  layers: TerrainTileLayer[],
): Array<{ map: Phaser.Tilemaps.Tilemap; layer: Phaser.Tilemaps.TilemapLayer }> {
  return layers.map((entry) =>
    createProceduralTilemap(scene, entry.tileData, entry.key, entry.depth),
  );
}

export function getObjectLayer(
  map: Phaser.Tilemaps.Tilemap,
  name: string
): Phaser.Tilemaps.ObjectLayer | null {
  return map.getObjectLayer(name) ?? null;
}

export function getObjectLayerObjects(
  map: Phaser.Tilemaps.Tilemap,
  layerName: string
): Phaser.Types.Tilemaps.TiledObject[] {
  const layer = getObjectLayer(map, layerName);
  if (!layer || !Array.isArray(layer.objects)) {
    return [];
  }

  return layer.objects;
}

export function getObjectProperty(
  object: Phaser.Types.Tilemaps.TiledObject,
  propertyName: string
): unknown {
  if (!Array.isArray(object.properties)) {
    return undefined;
  }

  const property = object.properties.find((entry) => entry.name === propertyName);
  return property?.value;
}

export function getStringProperty(
  object: Phaser.Types.Tilemaps.TiledObject,
  propertyName: string
): string | undefined {
  const value = getObjectProperty(object, propertyName);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return `${value}`;
  }

  return undefined;
}

export function getNumberProperty(
  object: Phaser.Types.Tilemaps.TiledObject,
  propertyName: string
): number | undefined {
  const value = getObjectProperty(object, propertyName);
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}
