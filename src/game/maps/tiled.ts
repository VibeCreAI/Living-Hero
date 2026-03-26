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
