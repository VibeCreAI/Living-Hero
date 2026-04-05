import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ATLAS_OPTIONS,
  AtlasKey,
  createDocument,
  createWorkspace,
  GRAMMAR_DIRECTIONS,
  GRAMMAR_SOCKETS,
  getAuthoredTileRules,
  getDocument,
  getTerrainAtlasMapping,
  GrammarDirection,
  GrammarSocket,
  isMappingDocument,
  isMappingWorkspace,
  MappingCellRules,
  MappingDocument,
  MappingWorkspace,
  prepareWorkspace,
  saveWorkspaceBackup,
  TEMPLATES,
  TemplateKey,
  upsertDocument,
} from '../../../../game/maps/tileMapping';
import { buildTerrainGrammar, TerrainGrammarTile } from '../../../../game/maps/terrainGrammar';
import {
  generateWfcSampleMap,
  WfcSampleConflict,
  WfcSampleDecoration,
  WfcSampleMap,
  WfcSampleOverlay,
  WfcSampleTile,
} from '../../../../game/maps/wfcSampleMap';

const TILE_SIZE = 64;
const ATLAS_COLUMNS = 9;
const ATLAS_ROWS = 6;
const ATLAS_TILE_COUNT = ATLAS_COLUMNS * ATLAS_ROWS;
const ATLAS_PREVIEW_SCALE = 1.5;
const ATLAS_PREVIEW_TILE = TILE_SIZE * ATLAS_PREVIEW_SCALE;
const BOARD_TILE_SIZE = 72;
const SAMPLE_TILE_SIZE = 40;
const RUNTIME_TEMPLATE_KEYS: TemplateKey[] = ['flat-guide', 'elevated-guide', 'stairs-guide'];
const SHARED_EDIT_ATLAS_KEY: AtlasKey = 'terrain-tileset';
const REPO_WORKSPACE_FILENAME = 'tile-mapper.workspace.json';
const REPO_WORKSPACE_URL = `/dev/${REPO_WORKSPACE_FILENAME}`;
const normalizeSharedWorkspace = (workspace: MappingWorkspace): MappingWorkspace => {
  const documents = Object.fromEntries(
    (Object.keys(TEMPLATES) as TemplateKey[]).map((templateKey) => {
      const documentState =
        workspace.documents[templateKey] ?? createDocument(templateKey, SHARED_EDIT_ATLAS_KEY);
      return [templateKey, { ...documentState, atlasKey: SHARED_EDIT_ATLAS_KEY }];
    }),
  ) as MappingWorkspace['documents'];

  return {
    ...workspace,
    documents,
  };
};

type ActiveCell = {
  templateKey: TemplateKey;
  row: number;
  col: number;
};

type TilePlacement = {
  templateKey: TemplateKey;
  row: number;
  col: number;
  cell: MappingDocument['cells'][number][number];
};

type TravelState = 'two-way' | 'outbound-only' | 'inbound-only' | 'sealed';

type HorizontalInspectorMatch = {
  tile: TerrainGrammarTile;
  travel: TravelState;
};

type SampleSettings = {
  cols: number;
  rows: number;
  randomness: number;
};

type SampleLayerView = 'total' | 'flat' | 'elevated';
type SamplePawnFacing = 'left' | 'right';
type SamplePawnState = {
  x: number;
  y: number;
  facing: SamplePawnFacing;
  moving: boolean;
};
type SampleWalkCell = {
  row: number;
  col: number;
  terrainLevel: number;
  passable: Record<GrammarDirection, boolean>;
};

const SAMPLE_PAWN_SPEED = 104;
const SAMPLE_PAWN_COLLISION_RADIUS = 8;
const SAMPLE_PAWN_FOOT_OFFSET_Y = 12;

const SLOT_TITLES: Partial<Record<TemplateKey, Record<string, string>>> = {
  'flat-guide': {
    '1': 'Top left corner',
    '2': 'Top edge',
    '3': 'Top right corner',
    '13': 'Top single',
    '4': 'Upper row left',
    '5': 'Upper row center',
    '6': 'Upper row right',
    '14': 'Upper row single',
    '7': 'Lower row left',
    '8': 'Lower row center',
    '9': 'Lower row right',
    '15': 'Lower row single',
    '10': 'Bottom left corner',
    '11': 'Bottom edge',
    '12': 'Bottom right corner',
    '16': 'Bottom single',
  },
  'elevated-guide': {
    '1': 'Top left corner',
    '2': 'Top edge',
    '3': 'Top right corner',
    '13': 'Top single',
    '4': 'Upper row left',
    '5': 'Upper row center',
    '6': 'Upper row right',
    '14': 'Upper row single',
    '7': 'Middle row left',
    '8': 'Middle row center',
    '9': 'Middle row right',
    '15': 'Middle row single',
    '10': 'Bottom lip left',
    '11': 'Bottom lip center',
    '12': 'Bottom lip right',
    '16': 'Bottom lip single',
    '17': 'Cliff over land left',
    '18': 'Cliff over land center',
    '19': 'Cliff over land right',
    '20': 'Cliff over land single',
    '21': 'Cliff over water left',
    '22': 'Cliff over water center',
    '23': 'Cliff over water right',
    '24': 'Cliff over water single',
  },
  'stairs-guide': {
    'upper-left': 'Left stair top',
    'upper-right': 'Right stair top',
    'lower-left': 'Left stair bottom',
    'lower-right': 'Right stair bottom',
  },
};

const STAIR_PAIR_CONFIG = [
  {
    key: 'left',
    title: 'Left Stair Variant',
    description: 'Generator stamps these two pieces together as one left stair.',
    upperLabel: 'upper-left',
    lowerLabel: 'lower-left',
  },
  {
    key: 'right',
    title: 'Right Stair Variant',
    description: 'Generator stamps these two pieces together as one right stair.',
    upperLabel: 'upper-right',
    lowerLabel: 'lower-right',
  },
] as const;

export function TileMappingTool() {
  const [workspace, setWorkspace] = useState<MappingWorkspace>(() =>
    normalizeSharedWorkspace(prepareWorkspace(createWorkspace('flat-guide', 'terrain-tileset'))),
  );
  const [activeConnectionDirection, setActiveConnectionDirection] =
    useState<GrammarDirection>('north');
  const [activeCell, setActiveCell] = useState<ActiveCell>({
    templateKey: 'flat-guide',
    row: 0,
    col: 0,
  });
  const [selectedTileId, setSelectedTileId] = useState<number>(1);
  const [importText, setImportText] = useState('');
  const [sampleMap, setSampleMap] = useState<WfcSampleMap | null>(null);
  const [sampleLayerView, setSampleLayerView] = useState<SampleLayerView>('total');
  const [showSampleConflicts, setShowSampleConflicts] = useState(true);
  const [sampleZoom, setSampleZoom] = useState(1);
  const [samplePawnEnabled, setSamplePawnEnabled] = useState(false);
  const [samplePawn, setSamplePawn] = useState<SamplePawnState | null>(null);
  const [sampleSettings, setSampleSettings] = useState<SampleSettings>({
    cols: 18,
    rows: 12,
    randomness: 35,
  });
  const [sampleColsInput, setSampleColsInput] = useState('18');
  const [sampleRowsInput, setSampleRowsInput] = useState('12');
  const [statusText, setStatusText] = useState(
    'Autosaved in the browser. Reload the game page after edits to see the new terrain mapping.',
  );
  const [hasAttemptedRepoBootstrap, setHasAttemptedRepoBootstrap] = useState(false);
  const sampleViewportRef = useRef<HTMLDivElement | null>(null);
  const samplePawnNodeRef = useRef<HTMLDivElement | null>(null);
  const samplePawnStateRef = useRef<SamplePawnState | null>(null);
  const sampleMovementRef = useRef<Record<GrammarDirection, boolean>>({
    north: false,
    east: false,
    south: false,
    west: false,
  });

  const activeDocument = getDocument(workspace, activeCell.templateKey);
  const activeSlot = activeDocument.cells[activeCell.row]?.[activeCell.col];
  const atlas = ATLAS_OPTIONS[workspace.currentAtlasKey];
  const isEditableAtlas = workspace.currentAtlasKey === SHARED_EDIT_ATLAS_KEY;
  const sharedWorkspace = normalizeSharedWorkspace(workspace);
  const exportText = JSON.stringify(sharedWorkspace, null, 2);
  const grammar = buildTerrainGrammar(workspace);
  const placementUsingSelectedTile = findFirstPlacementUsingTile(
    workspace,
    SHARED_EDIT_ATLAS_KEY,
    selectedTileId,
  );
  const selectedTileRules = getAuthoredTileRules(
    workspace,
    SHARED_EDIT_ATLAS_KEY,
    selectedTileId,
    {
      edges: placementUsingSelectedTile?.cell.rules.edges,
      adjacency: placementUsingSelectedTile?.cell.rules.adjacency,
      passable: placementUsingSelectedTile?.cell.rules.passable,
      layer: placementUsingSelectedTile?.cell.rules.layer,
    },
  );
  const activeAllowedTileIds = selectedTileRules.adjacency[activeConnectionDirection] ?? [];
  const tileByKey = new Map(grammar.tiles.map((tile) => [tile.key, tile]));
  const activeGrammarKey = activeSlot ? `${activeCell.templateKey}.${activeSlot.label}` : null;
  const activeGrammarTile = activeGrammarKey ? tileByKey.get(activeGrammarKey) ?? null : null;
  const placementGrammarKey = placementUsingSelectedTile
    ? `${placementUsingSelectedTile.templateKey}.${placementUsingSelectedTile.cell.label}`
    : null;
  const placementGrammarTile = placementGrammarKey
    ? tileByKey.get(placementGrammarKey) ?? null
    : null;
  const inspectorTile =
    activeSlot?.tileId === selectedTileId ? activeGrammarTile : placementGrammarTile;
  const inspectorTileSource =
    activeSlot?.tileId === selectedTileId
      ? activeSlot
        ? describeSlot(activeCell.templateKey, activeSlot.label)
        : null
      : placementUsingSelectedTile
        ? describeSlot(
            placementUsingSelectedTile.templateKey,
            placementUsingSelectedTile.cell.label,
          )
        : null;
  const usedRuntimeTileIds = Array.from(new Set(grammar.tiles.map((tile) => tile.tileId))).sort(
    (left, right) => left - right,
  );
  const adjacencyByDirection = inspectorTile
    ? Object.fromEntries(
        GRAMMAR_DIRECTIONS.map((direction) => [
          direction,
          (grammar.adjacency[inspectorTile.key]?.[direction] ?? [])
            .map((key) => tileByKey.get(key))
            .filter(Boolean)
            .map((tile) => ({
              tile: tile as TerrainGrammarTile,
              travel: getTravelState(inspectorTile, tile as TerrainGrammarTile, direction),
            })),
        ]),
      ) as Record<GrammarDirection, HorizontalInspectorMatch[]>
    : {
        north: [],
        east: [],
        south: [],
        west: [],
      };
  const allowsAboveSockets = inspectorTile
    ? inspectorTile.allowsAbove.filter((socket) => socket !== 'overlay')
    : [];
  const belowMatches = inspectorTile
    ? grammar.tiles.filter(
        (tile) =>
          tile.layerLevel === inspectorTile.layerLevel - 1 &&
          tile.selfSocket === inspectorTile.requiresBelow &&
          tile.allowsAbove.includes(inspectorTile.selfSocket),
      )
    : [];
  const aboveMatches = inspectorTile
    ? grammar.tiles.filter(
        (tile) =>
          tile.layerLevel === inspectorTile.layerLevel + 1 &&
          tile.requiresBelow === inspectorTile.selfSocket &&
          inspectorTile.allowsAbove.includes(tile.selfSocket),
      )
    : [];
  const inspectorWarnings = inspectorTile
    ? [
        ...GRAMMAR_DIRECTIONS.flatMap((direction) => {
          const warnings: string[] = [];
          const matches = adjacencyByDirection[direction];
          const explicitAllowedTileIds = inspectorTile.adjacencyRules[direction] ?? [];

          if (matches.length === 0) {
            warnings.push(
              explicitAllowedTileIds.length > 0
                ? `No ${directionLabel(direction).toLowerCase()} runtime match for allowed tiles ${explicitAllowedTileIds.join(', ')}`
                : `No ${directionLabel(direction).toLowerCase()} allowed tiles configured`,
            );
          }

          if (inspectorTile.passable[direction] && !matches.some(({ travel }) => travel === 'two-way')) {
            warnings.push(
              `No ${directionLabel(direction).toLowerCase()} match keeps travel open in both directions`,
            );
          }

          return warnings;
        }),
        ...(inspectorTile.layerLevel > 0 &&
        inspectorTile.requiresBelow !== 'void' &&
        belowMatches.length === 0
          ? [`No layer ${inspectorTile.layerLevel - 1} support tile for "${inspectorTile.requiresBelow}"`]
          : []),
        ...(allowsAboveSockets.length > 0 &&
        aboveMatches.length === 0
          ? [`No layer ${inspectorTile.layerLevel + 1} tile can stack above "${inspectorTile.selfSocket}"`]
          : []),
      ]
    : [];

  const previewOnlyMessage = `${ATLAS_OPTIONS[workspace.currentAtlasKey].name} is preview only. Switch to "${ATLAS_OPTIONS[SHARED_EDIT_ATLAS_KEY].name}" to edit the shared mapping.`;
  const visibleSampleConflicts =
    sampleMap == null
      ? []
      : sampleLayerView === 'flat'
        ? sampleMap.flatConflictCells
        : sampleLayerView === 'elevated'
          ? sampleMap.elevatedConflictCells
          : sampleMap.conflictCells;
  const sampleElevatedLevels = sampleMap
    ? Array.from(new Set(sampleMap.elevatedTiles.map((tile) => tile.terrainLevel))).sort(
        (left, right) => left - right,
      )
    : [];
  const sampleWalkCells = useMemo(
    () => buildSampleWalkCells(sampleMap, workspace),
    [sampleMap, workspace],
  );
  const syncSamplePawnPresentation = (
    pawn: SamplePawnState | null,
    options?: { viewport?: HTMLDivElement | null; centerCamera?: boolean },
  ) => {
    const node = samplePawnNodeRef.current;
    if (!node || !sampleMap) {
      return;
    }

    if (!samplePawnEnabled || !pawn) {
      node.style.display = 'none';
      return;
    }

    const tile = getSampleMovementTile(pawn.x, pawn.y);
    const cell = tile ? sampleWalkCells.get(`${tile.row},${tile.col}`) ?? null : null;
    const visible =
      cell != null &&
      !(
        (sampleLayerView === 'flat' && cell.terrainLevel !== 1) ||
        (sampleLayerView === 'elevated' && cell.terrainLevel <= 1)
      );

    node.style.display = visible ? 'block' : 'none';
    if (!visible) {
      return;
    }

    const width = SAMPLE_TILE_SIZE * 1.55;
    const height = SAMPLE_TILE_SIZE * 1.55;
    const feetY = pawn.y + SAMPLE_PAWN_FOOT_OFFSET_Y;
    node.style.left = `${pawn.x - width / 2}px`;
    node.style.top = `${pawn.y - height / 2}px`;
    node.style.zIndex = `${Math.round(feetY * 10)}`;
    node.className = `tile-mapper-sample-pawn${pawn.moving ? ' is-moving' : ''}${pawn.facing === 'left' ? ' is-facing-left' : ''}`;

    if (options?.centerCamera && options.viewport) {
      const maxScrollLeft = Math.max(0, options.viewport.scrollWidth - options.viewport.clientWidth);
      const maxScrollTop = Math.max(0, options.viewport.scrollHeight - options.viewport.clientHeight);
      const targetLeft = clamp(
        pawn.x * sampleZoom - options.viewport.clientWidth / 2,
        0,
        maxScrollLeft,
      );
      const targetTop = clamp(
        pawn.y * sampleZoom - options.viewport.clientHeight / 2,
        0,
        maxScrollTop,
      );
      options.viewport.scrollTo(targetLeft, targetTop);
    }
  };

  const spawnSamplePawn = () => {
    if (!sampleMap) {
      return;
    }
    sampleMovementRef.current = { north: false, east: false, south: false, west: false };
    const spawn = pickSamplePawnSpawn(sampleMap, sampleWalkCells);
    if (!spawn) {
      setStatusText('No walkable tile is available in the current sample map for the pawn.');
      return;
    }
    const nextPawn = {
      x: (spawn.col + 0.5) * SAMPLE_TILE_SIZE,
      y: (spawn.row + 0.5) * SAMPLE_TILE_SIZE,
      facing: 'right',
      moving: false,
    };
    samplePawnStateRef.current = nextPawn;
    setSamplePawn(nextPawn);
    setSamplePawnEnabled(true);
    setSampleZoom(1.2);
  };

  useEffect(() => {
    if (!sampleMap) {
      setSamplePawn(null);
      setSamplePawnEnabled(false);
      sampleMovementRef.current = { north: false, east: false, south: false, west: false };
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const viewport = sampleViewportRef.current;
      if (!viewport) {
        return;
      }

      const key = event.key.toLowerCase();
      const movementDirection =
        key === 'arrowup' || key === 'w'
          ? 'north'
          : key === 'arrowdown' || key === 's'
            ? 'south'
            : key === 'arrowleft' || key === 'a'
              ? 'west'
              : key === 'arrowright' || key === 'd'
                ? 'east'
                : null;

      if (samplePawnEnabled && movementDirection) {
        sampleMovementRef.current[movementDirection] = true;
        event.preventDefault();
        return;
      }

      const panAmount = 96;
      if (event.key === 'ArrowUp') {
        viewport.scrollTop -= panAmount;
        event.preventDefault();
      } else if (event.key === 'ArrowDown') {
        viewport.scrollTop += panAmount;
        event.preventDefault();
      } else if (event.key === 'ArrowLeft') {
        viewport.scrollLeft -= panAmount;
        event.preventDefault();
      } else if (event.key === 'ArrowRight') {
        viewport.scrollLeft += panAmount;
        event.preventDefault();
      } else if ((event.key === '+' || event.key === '=') && sampleZoom < 2) {
        setSampleZoom((current) => Math.min(2, Math.round((current + 0.25) * 100) / 100));
        event.preventDefault();
      } else if ((event.key === '-' || event.key === '_') && sampleZoom > 0.5) {
        setSampleZoom((current) => Math.max(0.5, Math.round((current - 0.25) * 100) / 100));
        event.preventDefault();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!samplePawnEnabled) {
        return;
      }
      const key = event.key.toLowerCase();
      const movementDirection =
        key === 'arrowup' || key === 'w'
          ? 'north'
          : key === 'arrowdown' || key === 's'
            ? 'south'
            : key === 'arrowleft' || key === 'a'
              ? 'west'
              : key === 'arrowright' || key === 'd'
                ? 'east'
                : null;
      if (!movementDirection) {
        return;
      }
      sampleMovementRef.current[movementDirection] = false;
      event.preventDefault();
    };

    const clearMovement = () => {
      sampleMovementRef.current = { north: false, east: false, south: false, west: false };
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', clearMovement);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', clearMovement);
    };
  }, [sampleMap, samplePawnEnabled, sampleZoom]);

  useEffect(() => {
    if (!sampleMap || !samplePawnEnabled) {
      return;
    }

    const spawn = pickSamplePawnSpawn(sampleMap, sampleWalkCells);
    if (!spawn) {
      samplePawnStateRef.current = null;
      setSamplePawn(null);
      return;
    }

    const current = samplePawnStateRef.current;
    const currentTile = current ? getSampleMovementTile(current.x, current.y) : null;
    if (current && currentTile && sampleWalkCells.has(`${currentTile.row},${currentTile.col}`)) {
      syncSamplePawnPresentation(current, {
        viewport: sampleViewportRef.current,
        centerCamera: true,
      });
      return;
    }

    const nextPawn = {
      x: (spawn.col + 0.5) * SAMPLE_TILE_SIZE,
      y: (spawn.row + 0.5) * SAMPLE_TILE_SIZE,
      facing: 'right' as SamplePawnFacing,
      moving: false,
    };
    samplePawnStateRef.current = nextPawn;
    setSamplePawn(nextPawn);
  }, [sampleMap, samplePawnEnabled, sampleWalkCells]);

  useEffect(() => {
    if (!samplePawnEnabled || !samplePawnStateRef.current) {
      return;
    }
    setSampleZoom(1.2);
  }, [samplePawnEnabled]);

  useEffect(() => {
    syncSamplePawnPresentation(samplePawnStateRef.current, {
      viewport: sampleViewportRef.current,
      centerCamera: samplePawnEnabled,
    });
  }, [samplePawnEnabled, sampleZoom, sampleMap, sampleLayerView, sampleWalkCells, samplePawn]);

  useEffect(() => {
    if (!samplePawnEnabled) {
      return;
    }

    let frameId = 0;
    let lastTime = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const current = samplePawnStateRef.current;
      if (current) {
        const next = advanceSamplePawnState(current, sampleMovementRef.current, sampleWalkCells, dt);
        samplePawnStateRef.current = next;
        syncSamplePawnPresentation(next, {
          viewport: sampleViewportRef.current,
          centerCamera: true,
        });
      }
      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [samplePawnEnabled, sampleWalkCells]);

  useEffect(() => {
    setSampleColsInput(String(sampleSettings.cols));
  }, [sampleSettings.cols]);

  useEffect(() => {
    setSampleRowsInput(String(sampleSettings.rows));
  }, [sampleSettings.rows]);

  const ensureEditableAtlas = (): boolean => {
    if (isEditableAtlas) {
      return true;
    }
    setStatusText(previewOnlyMessage);
    return false;
  };

  const updateDocument = (
    templateKey: TemplateKey,
    updater: (documentState: MappingDocument) => MappingDocument,
  ) => {
    if (!ensureEditableAtlas()) {
      return;
    }
    setWorkspace((current) => {
      const currentDocument = getDocument(current, templateKey, current.currentAtlasKey);
      const nextDocument = { ...updater(currentDocument), atlasKey: current.currentAtlasKey };
      return upsertDocument({ ...current, currentTemplateKey: templateKey }, nextDocument);
    });
  };

  const updateSelectedTileRules = (
    updater: (currentRules: typeof selectedTileRules) => typeof selectedTileRules,
  ) => {
    if (!ensureEditableAtlas()) {
      return;
    }
    setWorkspace((current) => {
      const atlasKey = SHARED_EDIT_ATLAS_KEY;
      const fallbackPlacement = findFirstPlacementUsingTile(current, atlasKey, selectedTileId);
      const currentRules = getAuthoredTileRules(current, atlasKey, selectedTileId, {
        edges: fallbackPlacement?.cell.rules.edges,
        adjacency: fallbackPlacement?.cell.rules.adjacency,
        passable: fallbackPlacement?.cell.rules.passable,
        layer: fallbackPlacement?.cell.rules.layer,
      });
      const nextRules = updater(currentRules);
      const tileRulesByAtlas = {
        ...(current.tileRulesByAtlas ?? {}),
        [atlasKey]: {
          ...(current.tileRulesByAtlas?.[atlasKey] ?? {}),
          [`${selectedTileId}`]: nextRules,
        },
      };
      return {
        ...current,
        tileRulesByAtlas,
      };
    });
  };

  const toggleAllowedTileId = (direction: GrammarDirection, tileId: number) => {
    if (!ensureEditableAtlas()) {
      return;
    }
    const wasAllowed = selectedTileRules.adjacency[direction].includes(tileId);
    updateSelectedTileRules((rules) => ({
      ...rules,
      adjacency: {
        ...rules.adjacency,
        [direction]: wasAllowed
          ? rules.adjacency[direction].filter((candidate) => candidate !== tileId)
          : [...rules.adjacency[direction], tileId].sort((left, right) => left - right),
      },
    }));
    setStatusText(
      `${wasAllowed ? 'Removed' : 'Allowed'} tile ${tileId} on ${directionLabel(direction).toLowerCase()} for atlas tile ${selectedTileId}.`,
    );
  };

  const clearAllowedDirection = (direction: GrammarDirection) => {
    if (!ensureEditableAtlas()) {
      return;
    }
    updateSelectedTileRules((rules) => ({
      ...rules,
      adjacency: {
        ...rules.adjacency,
        [direction]: [],
      },
    }));
    setStatusText(
      `Cleared ${directionLabel(direction).toLowerCase()} allowed tiles for atlas tile ${selectedTileId}.`,
    );
  };

  const selectCell = (templateKey: TemplateKey, row: number, col: number) => {
    setActiveCell({ templateKey, row, col });
  };

  const assignTile = (templateKey: TemplateKey, row: number, col: number, tileId: number) => {
    updateDocument(templateKey, (documentState) => ({
      ...documentState,
      cells: documentState.cells.map((cellRow, rowIndex) =>
        cellRow.map((cell, colIndex) =>
          rowIndex === row && colIndex === col ? { ...cell, tileId } : cell,
        ),
      ),
    }));
  };

  const updateActiveRules = (updater: (rules: MappingCellRules) => MappingCellRules) => {
    updateDocument(activeCell.templateKey, (documentState) => ({
      ...documentState,
      cells: documentState.cells.map((cellRow, rowIndex) =>
        cellRow.map((cell, colIndex) =>
          rowIndex === activeCell.row && colIndex === activeCell.col
            ? { ...cell, rules: updater(cell.rules) }
            : cell,
        ),
      ),
    }));
  };

  const clearBoard = (templateKey: TemplateKey) => {
    updateDocument(templateKey, (documentState) => ({
      ...documentState,
      cells: documentState.cells.map((row) =>
        row.map((cell) => ({
          ...cell,
          tileId: 0,
        })),
      ),
    }));
    setStatusText(`Cleared "${TEMPLATES[templateKey].name}".`);
  };

  const clearActiveSlot = () => {
    if (!ensureEditableAtlas()) {
      return;
    }
    assignTile(activeCell.templateKey, activeCell.row, activeCell.col, 0);
    setStatusText(`Cleared ${describeSlot(activeCell.templateKey, activeSlot?.label ?? '')}.`);
  };

  const resetWorkspace = () => {
    if (!ensureEditableAtlas()) {
      return;
    }
    setWorkspace(createWorkspace('flat-guide', SHARED_EDIT_ATLAS_KEY));
    setActiveCell({ templateKey: 'flat-guide', row: 0, col: 0 });
    setStatusText('Reset the saved mapping workspace.');
  };

  const setAtlas = (atlasKey: AtlasKey) => {
    setWorkspace((current) => ({
      ...current,
      currentAtlasKey: atlasKey,
    }));
    setStatusText(
      atlasKey === SHARED_EDIT_ATLAS_KEY
        ? `Switched atlas to "${ATLAS_OPTIONS[atlasKey].name}". Editing is enabled.`
        : `Switched atlas to "${ATLAS_OPTIONS[atlasKey].name}". Preview only; Color 1 remains the shared editable source.`,
    );
  };

  const handleAtlasClick = (tileId: number) => {
    setSelectedTileId(tileId);
    setStatusText(`Selected atlas tile ${tileId} for authoring and slot assignment.`);
  };

  const assignSelectedTileToActiveSlot = () => {
    if (!ensureEditableAtlas()) {
      return;
    }
    assignTile(activeCell.templateKey, activeCell.row, activeCell.col, selectedTileId);
    setStatusText(
      `Assigned tile ${selectedTileId} to ${describeSlot(activeCell.templateKey, activeSlot?.label ?? '')}.`,
    );
  };

  const buildSampleFromSettings = (seed: number, sourceWorkspace: MappingWorkspace = workspace) =>
    generateWfcSampleMap(normalizeSharedWorkspace(sourceWorkspace), {
      seed,
      cols: sampleSettings.cols,
      rows: sampleSettings.rows,
      randomness: sampleSettings.randomness / 100,
    });

  const normalizeImportedPayload = (
    parsed: MappingWorkspace | MappingDocument,
    current: MappingWorkspace = workspace,
  ): MappingWorkspace => {
    if (isMappingWorkspace(parsed)) {
      return normalizeSharedWorkspace(prepareWorkspace(parsed));
    }

    if (isMappingDocument(parsed)) {
      return normalizeSharedWorkspace(
        prepareWorkspace(
          upsertDocument(current, { ...parsed, atlasKey: SHARED_EDIT_ATLAS_KEY }),
        ),
      );
    }

    throw new Error('Repo file is not a valid mapping workspace.');
  };

  const fetchRepoWorkspace = async (): Promise<MappingWorkspace> => {
    const response = await fetch(`${REPO_WORKSPACE_URL}?ts=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(
        `Repo file not found. Save "${REPO_WORKSPACE_FILENAME}" under public/dev/ and try again.`,
      );
    }

    const parsed = (await response.json()) as MappingWorkspace | MappingDocument;
    return normalizeImportedPayload(parsed);
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrapFromRepo = async () => {
      try {
        const repoWorkspace = await fetchRepoWorkspace();
        if (cancelled) {
          return;
        }
        setWorkspace(repoWorkspace);
        setStatusText(`Loaded repo workspace from public/dev/${REPO_WORKSPACE_FILENAME} on open.`);
      } catch {
        if (cancelled) {
          return;
        }
        setStatusText(
          'Using browser working copy. Load the repo file if you want the exact public/dev source of truth.',
        );
      } finally {
        if (!cancelled) {
          setHasAttemptedRepoBootstrap(true);
        }
      }
    };

    void bootstrapFromRepo();

    return () => {
      cancelled = true;
    };
  }, []);

  const generateSampleFromLatestSource = async (mode: 'open' | 'regenerate') => {
    const seed = Date.now();

    try {
      const repoWorkspace = await fetchRepoWorkspace();
      setWorkspace(repoWorkspace);
      const nextSampleMap = buildSampleFromSettings(seed, repoWorkspace);
      setSampleLayerView('total');
      setShowSampleConflicts(true);
      setSampleMap(nextSampleMap);
      setStatusText(
        `${mode === 'open' ? 'Generated' : 'Regenerated'} sample map audit with seed ${seed} from public/dev/${REPO_WORKSPACE_FILENAME}.`,
      );
    } catch {
      const nextSampleMap = buildSampleFromSettings(seed, workspace);
      setSampleLayerView('total');
      setShowSampleConflicts(true);
      setSampleMap(nextSampleMap);
      setStatusText(
        `${mode === 'open' ? 'Generated' : 'Regenerated'} sample map audit with seed ${seed} from the browser working copy because the repo file could not be loaded.`,
      );
    }
  };

  const openSampleMap = async () => {
    await generateSampleFromLatestSource('open');
  };

  const regenerateSampleMap = async () => {
    await generateSampleFromLatestSource('regenerate');
  };

  const saveSnapshot = () => {
    saveWorkspaceBackup(sharedWorkspace);
    setStatusText('Saved a manual backup snapshot for the tile mapper.');
  };

  const downloadRepoFile = () => {
    const blob = new Blob([exportText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = REPO_WORKSPACE_FILENAME;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusText(
      `Downloaded "${REPO_WORKSPACE_FILENAME}". Save it to public/dev/${REPO_WORKSPACE_FILENAME} for a file-backed source of truth.`,
    );
  };

  const loadRepoFile = async () => {
    try {
      const nextWorkspace = await fetchRepoWorkspace();
      setWorkspace(nextWorkspace);
      setStatusText(`Loaded repo workspace from public/dev/${REPO_WORKSPACE_FILENAME}.`);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'Failed to load repo workspace file.');
    }
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      setStatusText('Copied mapping workspace JSON to clipboard.');
    } catch {
      setStatusText('Clipboard copy failed. Use the advanced export panel below.');
    }
  };

  const downloadJson = () => {
    const blob = new Blob([exportText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'terrain-mapping-workspace.json';
    anchor.click();
    URL.revokeObjectURL(url);
    setStatusText('Downloaded mapping workspace JSON.');
  };

  const importJson = () => {
    try {
      const parsed = JSON.parse(importText) as MappingWorkspace | MappingDocument;
      if (isMappingWorkspace(parsed)) {
        setWorkspace(normalizeSharedWorkspace(prepareWorkspace(parsed)));
        setStatusText('Imported mapping workspace JSON.');
        return;
      }
      if (isMappingDocument(parsed)) {
        setWorkspace((current) =>
          normalizeSharedWorkspace(
            prepareWorkspace(
              upsertDocument(current, { ...parsed, atlasKey: SHARED_EDIT_ATLAS_KEY }),
            ),
          ),
        );
        setStatusText(`Imported document "${TEMPLATES[parsed.templateKey].name}".`);
        return;
      }
      throw new Error('Invalid mapping JSON.');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : 'Failed to import JSON.');
    }
  };

  const runtimeBoardsPanel = (
    <section className="tile-mapper-panel">
      <div className="tile-mapper-panel-header">
        <h2>Runtime Boards</h2>
        <span>The game reads these boards directly.</span>
      </div>
      <div className="tile-mapper-runtime-grid">
        {RUNTIME_TEMPLATE_KEYS.map((templateKey) => {
          const documentState = getDocument(workspace, templateKey);
          if (templateKey === 'stairs-guide') {
            return (
              <article key={templateKey} className="tile-mapper-board-wrapper">
                <div className="tile-mapper-board-wrapper-header">
                  <div>
                    <h3>{TEMPLATES[templateKey].name}</h3>
                    <p>{TEMPLATES[templateKey].description}</p>
                  </div>
                  <button
                    type="button"
                    className="tile-mapper-button"
                    onClick={() => clearBoard(templateKey)}
                    disabled={!isEditableAtlas}
                  >
                    Clear Board
                  </button>
                </div>
                <div className="tile-mapper-stair-pairs">
                  {STAIR_PAIR_CONFIG.map((pair) => {
                    const upperCell =
                      documentState.cells.flat().find((cell) => cell.label === pair.upperLabel) ??
                      null;
                    const lowerCell =
                      documentState.cells.flat().find((cell) => cell.label === pair.lowerLabel) ??
                      null;

                    return (
                      <article key={pair.key} className="tile-mapper-stair-pair-card">
                        <div className="tile-mapper-stair-pair-copy">
                          <strong>{pair.title}</strong>
                          <span>{pair.description}</span>
                        </div>
                        <div className="tile-mapper-stair-pair-stack">
                          {[upperCell, lowerCell].map((cell, index) => {
                            if (!cell) {
                              return null;
                            }
                            const rowIndex = index;
                            const colIndex = pair.key === 'left' ? 0 : 1;
                            const isActive =
                              activeCell.templateKey === templateKey &&
                              activeCell.row === rowIndex &&
                              activeCell.col === colIndex;
                            const previewStyle =
                              cell.tileId > 0
                                ? getTilePreviewStyle(atlas.src, cell.tileId, BOARD_TILE_SIZE)
                                : undefined;
                            return (
                              <button
                                key={`${pair.key}-${cell.label}`}
                                type="button"
                                className={`tile-mapper-board-cell tile-mapper-stair-pair-cell${isActive ? ' is-active' : ''}`}
                                style={previewStyle}
                                title={`${describeSlot(templateKey, cell.label)}${cell.tileId ? ` - tile ${cell.tileId}` : ''}`}
                                onClick={() => {
                                  selectCell(templateKey, rowIndex, colIndex);
                                  if (cell.tileId > 0) {
                                    setSelectedTileId(cell.tileId);
                                  }
                                  setStatusText(`Selected ${describeSlot(templateKey, cell.label)} in ${pair.title}.`);
                                }}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  if (!isEditableAtlas) {
                                    setStatusText(previewOnlyMessage);
                                    return;
                                  }
                                  selectCell(templateKey, rowIndex, colIndex);
                                  assignTile(templateKey, rowIndex, colIndex, 0);
                                  setStatusText(`Cleared ${describeSlot(templateKey, cell.label)} in ${pair.title}.`);
                                }}
                              >
                                <span className="tile-mapper-board-label">{cell.label}</span>
                                <span className="tile-mapper-board-id">{cell.tileId || '--'}</span>
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </article>
            );
          }

          return (
            <article key={templateKey} className="tile-mapper-board-wrapper">
              <div className="tile-mapper-board-wrapper-header">
                <div>
                  <h3>{TEMPLATES[templateKey].name}</h3>
                  <p>{TEMPLATES[templateKey].description}</p>
                </div>
                <button
                  type="button"
                  className="tile-mapper-button"
                  onClick={() => clearBoard(templateKey)}
                  disabled={!isEditableAtlas}
                >
                  Clear Board
                </button>
              </div>
              <div
                className="tile-mapper-board"
                style={{
                  gridTemplateColumns: `repeat(${documentState.width}, ${BOARD_TILE_SIZE}px)`,
                }}
              >
                {documentState.cells.flatMap((row, rowIndex) =>
                  row.map((cell, colIndex) => {
                    const isActive =
                      activeCell.templateKey === templateKey &&
                      activeCell.row === rowIndex &&
                      activeCell.col === colIndex;
                    const previewStyle =
                      cell.tileId > 0
                        ? getTilePreviewStyle(atlas.src, cell.tileId, BOARD_TILE_SIZE)
                        : undefined;
                    return (
                      <button
                        key={`${templateKey}-${rowIndex}-${colIndex}`}
                        type="button"
                        className={`tile-mapper-board-cell${isActive ? ' is-active' : ''}`}
                        style={previewStyle}
                        title={`${describeSlot(templateKey, cell.label)}${cell.tileId ? ` - tile ${cell.tileId}` : ''}`}
                        onClick={() => {
                          selectCell(templateKey, rowIndex, colIndex);
                          if (cell.tileId > 0) {
                            setSelectedTileId(cell.tileId);
                          }
                          setStatusText(`Selected ${describeSlot(templateKey, cell.label)}.`);
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          if (!isEditableAtlas) {
                            setStatusText(previewOnlyMessage);
                            return;
                          }
                          selectCell(templateKey, rowIndex, colIndex);
                          assignTile(templateKey, rowIndex, colIndex, 0);
                          setStatusText(`Cleared ${describeSlot(templateKey, cell.label)}.`);
                        }}
                      >
                        <span className="tile-mapper-board-label">{cell.label}</span>
                        <span className="tile-mapper-board-id">{cell.tileId || '--'}</span>
                      </button>
                    );
                  }),
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="tile-mapper-shell">
      <header className="tile-mapper-header">
        <div>
          <p className="tile-mapper-kicker">Dev Tool</p>
          <h1>Tile Mapping Tool</h1>
          <p className="tile-mapper-copy">
            Click a slot on a runtime board, then click atlas tiles until it looks right. The same
            slot also stores explicit same-layer connections, directional passability, and vertical
            layer rules for WFC-style authoring.
          </p>
        </div>
        <div className="tile-mapper-actions">
          <label>
            <span>Atlas</span>
            <select
              value={workspace.currentAtlasKey}
              onChange={(event) => setAtlas(event.target.value as AtlasKey)}
            >
              {Object.entries(ATLAS_OPTIONS).map(([key, option]) => (
                <option key={key} value={key}>
                  {option.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="tile-mapper-button"
            onClick={clearActiveSlot}
            disabled={!isEditableAtlas}
          >
            Clear Slot
          </button>
          <button
            type="button"
            className="tile-mapper-button"
            onClick={resetWorkspace}
            disabled={!isEditableAtlas}
          >
            Reset Workspace
          </button>
          <a className="tile-mapper-link" href="/">
            Back To Game
          </a>
        </div>
      </header>

      <div className="tile-mapper-status">
        <span>{statusText}</span>
        <span>
          {hasAttemptedRepoBootstrap
            ? isEditableAtlas
              ? 'Live workflow: repo file is loaded on open when available. Edit here, then re-download and re-load the repo file before sampling if you want to test disk state.'
              : previewOnlyMessage
            : 'Checking for repo file source of truth...'}
        </span>
      </div>

      <section className="tile-mapper-panel tile-mapper-utility-panel">
        <div className="tile-mapper-panel-header">
          <h2>Utility</h2>
          <span>{`Primary file-backed workflow using public/dev/${REPO_WORKSPACE_FILENAME}.`}</span>
        </div>
        <div className="tile-mapper-utility-guide">
          <strong>Recommended workflow</strong>
          <span>1. Edit tiles and rules in the mapper.</span>
          <span>2. Click `Save Snapshot` for a quick browser-only safety copy.</span>
          <span>3. Click `Download Repo File` and save it as `public/dev/tile-mapper.workspace.json`.</span>
          <span>4. Click `Load Repo File` to confirm the file-backed state is what the tool will use.</span>
          <span>5. Click `Generate Sample Map`, then tweak cols, rows, and randomness inside the sample modal.</span>
        </div>
        <div className="tile-mapper-utility-grid">
          <div className="tile-mapper-utility-actions">
            <button type="button" className="tile-mapper-button" onClick={saveSnapshot}>
              Save Snapshot
            </button>
            <button type="button" className="tile-mapper-button" onClick={downloadRepoFile}>
              Download Repo File
            </button>
            <button type="button" className="tile-mapper-button" onClick={loadRepoFile}>
              Load Repo File
            </button>
            <button type="button" className="tile-mapper-button" onClick={openSampleMap}>
              Generate Sample Map
            </button>
          </div>
        </div>
      </section>

      <details className="tile-mapper-panel tile-mapper-guide-panel">
        <summary className="tile-mapper-guide-summary">
          <span>Authoring Guide</span>
          <span>Recommended terrain-height, support, and socket defaults for the current solver.</span>
        </summary>
        <div className="tile-mapper-guide-grid">
          <article className="tile-mapper-guide-card">
            <strong>Terrain Height</strong>
            <span>`Flat` and lower stair exit pieces should use height `1`.</span>
            <span>`Elevated`, cliffs, and upper stair entry pieces should use height `2`.</span>
          </article>
          <article className="tile-mapper-guide-card">
            <strong>Support Below</strong>
            <span>`Flat` ground should usually keep `Requires Below = void`.</span>
            <span>`Elevated`, land cliffs, and stairs should usually use `Requires Below = flat`.</span>
            <span>`Cliff over water` pieces should use `Requires Below = water`.</span>
          </article>
          <article className="tile-mapper-guide-card">
            <strong>Auto Layers</strong>
            <span>`Water foam` and `shadow` are generated by code, not authored in the tool.</span>
            <span>The guide image draw-order numbers are render layers, not these terrain-height values.</span>
          </article>
          <article className="tile-mapper-guide-card">
            <strong>Edge Socket Rules</strong>
            <span>`Flat` shoreline edges should usually face `water`.</span>
            <span>`Elevated` top edges that open off the plateau should usually face `void`.</span>
            <span>`Cliff over land` frontage should usually face `flat`, and `cliff over water` frontage should face `water`.</span>
          </article>
        </div>
      </details>

      <div className="tile-mapper-layout">
        <div className="tile-mapper-board-stack">
          <section className="tile-mapper-panel">
            <div className="tile-mapper-panel-header">
              <h2>Atlas</h2>
              <span>Rule subject tile: {selectedTileId}</span>
            </div>
            <div className="tile-mapper-atlas-scroll">
              <div
                className="tile-mapper-atlas"
                style={{
                  width: ATLAS_COLUMNS * ATLAS_PREVIEW_TILE,
                  height: ATLAS_ROWS * ATLAS_PREVIEW_TILE,
                  backgroundImage: `url(${atlas.src})`,
                  backgroundSize: '100% 100%',
                }}
              >
                {Array.from({ length: ATLAS_TILE_COUNT }, (_, index) => {
                  const tileId = index + 1;
                  const col = index % ATLAS_COLUMNS;
                  const row = Math.floor(index / ATLAS_COLUMNS);
                  const isSelected = tileId === selectedTileId;
                  return (
                    <button
                      key={tileId}
                      type="button"
                      className={`tile-mapper-atlas-tile${isSelected ? ' is-selected' : ''}`}
                      style={{
                        left: col * ATLAS_PREVIEW_TILE,
                        top: row * ATLAS_PREVIEW_TILE,
                        width: ATLAS_PREVIEW_TILE,
                        height: ATLAS_PREVIEW_TILE,
                      }}
                      onClick={() => handleAtlasClick(tileId)}
                      title={`Tile ${tileId}`}
                    >
                      <span>{tileId}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="tile-mapper-hint">
              Clicking an atlas tile now selects it for rule authoring. Use the selected-slot
              button to assign that tile to a board slot.
            </p>
          </section>

          {runtimeBoardsPanel}
        </div>

        <div className="tile-mapper-board-stack">
          <section className="tile-mapper-panel">
            <div className="tile-mapper-panel-header">
              <h2>Selected Slot</h2>
              <div className="tile-mapper-inline-actions">
                <button type="button" className="tile-mapper-button" onClick={clearActiveSlot}>
                  disabled={!isEditableAtlas}
                  Clear Selected
                </button>
              </div>
            </div>
            <div className="tile-mapper-selection-grid">
              <div className="tile-mapper-selection-card">
                <strong>Board</strong>
                <span>{TEMPLATES[activeCell.templateKey].name}</span>
                <span>{describeSlot(activeCell.templateKey, activeSlot?.label ?? '')}</span>
              </div>
              <div className="tile-mapper-selection-card">
                <strong>Slot Tile</strong>
                <div
                  className="tile-mapper-selection-preview"
                  style={
                    activeSlot?.tileId
                      ? getTilePreviewStyle(atlas.src, activeSlot.tileId, BOARD_TILE_SIZE)
                      : undefined
                  }
                />
                <span>{activeSlot?.tileId ? `Tile ${activeSlot.tileId}` : 'Empty slot'}</span>
                <button
                  type="button"
                  className="tile-mapper-button"
                  onClick={assignSelectedTileToActiveSlot}
                  disabled={!isEditableAtlas}
                >
                  Use Selected Tile
                </button>
              </div>
              <div className="tile-mapper-selection-card">
                <strong>Rule Subject Tile</strong>
                <div
                  className="tile-mapper-selection-preview"
                  style={getTilePreviewStyle(atlas.src, selectedTileId, BOARD_TILE_SIZE)}
                />
                <span>{`Tile ${selectedTileId}`}</span>
                <span>Atlas clicks change this tile.</span>
              </div>
              <div className="tile-mapper-selection-card">
                <strong>How To Use</strong>
                <span>1. Click a slot below.</span>
                <span>2. Click an atlas tile to select the rule subject.</span>
                <span>3. Apply that tile to the slot, then author connections and rules.</span>
              </div>
            </div>
            <div className="tile-mapper-slot-summary">
              <div className="tile-mapper-slot-summary-header">
                <strong>Rule Summary</strong>
                <span>
                  {inspectorTile
                    ? `Rule subject socket: ${inspectorTile.selfSocket}`
                    : 'Assign the selected atlas tile to a runtime slot to inspect its WFC role.'}
                </span>
              </div>
              <div className="tile-mapper-slot-summary-grid">
                <div className="tile-mapper-slot-summary-field">
                  <span>Selected Tile</span>
                  <strong>{selectedTileId}</strong>
                </div>
                <div className="tile-mapper-slot-summary-field">
                  <span>Layer</span>
                  <strong>{selectedTileRules.layer.level}</strong>
                </div>
                <div className="tile-mapper-slot-summary-field">
                  <span>Requires Below</span>
                  <strong>{selectedTileRules.layer.requiresBelow}</strong>
                </div>
                <div className="tile-mapper-slot-summary-field">
                  <span>Allows Above</span>
                  <strong>{formatSocketList(selectedTileRules.layer.allowsAbove)}</strong>
                </div>
                <div className="tile-mapper-slot-summary-field">
                  <span>Tile Passage</span>
                  <strong>{formatPassability(selectedTileRules.passable)}</strong>
                </div>
              </div>
              <div className="tile-mapper-chip-row">
                {(activeSlot?.rules.tags ?? []).length > 0 ? (
                  activeSlot?.rules.tags.map((tag) => (
                    <span key={tag} className="tile-mapper-chip">
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="tile-mapper-chip is-muted">No tags</span>
                )}
              </div>
            </div>
            <div className="tile-mapper-connection-editor">
              <div className="tile-mapper-panel-header">
                <h2>Same-Layer Connections</h2>
                <div className="tile-mapper-inline-actions">
                  <button
                    type="button"
                    className="tile-mapper-button"
                    onClick={() => clearAllowedDirection(activeConnectionDirection)}
                    disabled={!isEditableAtlas}
                  >
                    Clear {directionLabel(activeConnectionDirection)}
                  </button>
                </div>
              </div>
              <p className="tile-mapper-hint">
                Pick a side, then toggle which used atlas tiles are allowed to connect on that side.
                Blank or unused atlas tiles do not need any setup. Leaving a side empty now means
                no tiles are allowed on that side.
              </p>
              <div className="tile-mapper-allowed-summary">
                <strong>Authoring atlas tile {selectedTileId}</strong>
              </div>
              <div className="tile-mapper-direction-tabs">
                {GRAMMAR_DIRECTIONS.map((direction) => {
                  const count = selectedTileRules.adjacency[direction].length ?? 0;
                  return (
                    <button
                      key={direction}
                      type="button"
                      className={`tile-mapper-direction-tab${activeConnectionDirection === direction ? ' is-active' : ''}`}
                      onClick={() => setActiveConnectionDirection(direction)}
                    >
                      <span>{directionLabel(direction)}</span>
                      <strong>{count}</strong>
                    </button>
                  );
                })}
              </div>
              <div className="tile-mapper-allowed-summary">
                <strong>{directionLabel(activeConnectionDirection)} Allowed Tiles</strong>
                <div className="tile-mapper-chip-row">
                  {activeAllowedTileIds.length > 0 ? (
                    activeAllowedTileIds.map((tileId) => (
                      <button
                        key={`${activeConnectionDirection}-${tileId}`}
                        type="button"
                        className="tile-mapper-chip tile-mapper-chip-button"
                        onClick={() => toggleAllowedTileId(activeConnectionDirection, tileId)}
                        disabled={!isEditableAtlas}
                      >
                        Tile {tileId} ×
                      </button>
                    ))
                  ) : (
                    <span className="tile-mapper-chip is-muted">No explicit tiles yet</span>
                  )}
                </div>
              </div>
              <div className="tile-mapper-allowed-grid">
                {usedRuntimeTileIds.length > 0 ? (
                  usedRuntimeTileIds.map((tileId) => {
                    const isAllowed = activeAllowedTileIds.includes(tileId);
                    return (
                      <button
                        key={`allowed-${activeConnectionDirection}-${tileId}`}
                        type="button"
                        className={`tile-mapper-allowed-tile${isAllowed ? ' is-active' : ''}`}
                        onClick={() => toggleAllowedTileId(activeConnectionDirection, tileId)}
                        disabled={!isEditableAtlas}
                      >
                        <div
                          className="tile-mapper-allowed-preview"
                          style={getTilePreviewStyle(atlas.src, tileId, 56)}
                        />
                        <span>Tile {tileId}</span>
                      </button>
                    );
                  })
                ) : (
                  <span className="tile-mapper-inspector-empty">
                    No runtime tiles are assigned yet.
                  </span>
                )}
              </div>
            </div>
            <div className="tile-mapper-rule-editor">
              <div className="tile-mapper-rule-column">
                <h3>Layer Rules</h3>
                <div className="tile-mapper-rule-grid">
                  <label className="tile-mapper-rule-field">
                    <span>Layer Level</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={selectedTileRules.layer.level}
                      disabled={!isEditableAtlas}
                      onChange={(event) =>
                        updateSelectedTileRules((rules) => ({
                          ...rules,
                          layer: {
                            ...rules.layer,
                            level: Number(event.target.value) || 0,
                          },
                        }))
                      }
                    />
                  </label>
                  <label className="tile-mapper-rule-field">
                    <span>Requires Below</span>
                    <select
                      value={selectedTileRules.layer.requiresBelow}
                      disabled={!isEditableAtlas}
                      onChange={(event) =>
                        updateSelectedTileRules((rules) => ({
                          ...rules,
                          layer: {
                            ...rules.layer,
                            requiresBelow: event.target.value as GrammarSocket,
                          },
                        }))
                      }
                    >
                      {GRAMMAR_SOCKETS.map((socket) => (
                        <option key={socket} value={socket}>
                          {socket}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="tile-mapper-rule-field tile-mapper-rule-field-wide">
                    <span>Allows Above</span>
                    <input
                      type="text"
                      value={selectedTileRules.layer.allowsAbove.join(', ')}
                      disabled={!isEditableAtlas}
                      onChange={(event) =>
                        updateSelectedTileRules((rules) => ({
                          ...rules,
                          layer: {
                            ...rules.layer,
                            allowsAbove: event.target.value
                              .split(',')
                              .map((socket) => socket.trim())
                              .filter((socket): socket is GrammarSocket =>
                                GRAMMAR_SOCKETS.includes(socket as GrammarSocket),
                              ),
                          },
                        }))
                      }
                      placeholder="overlay, stair"
                    />
                  </label>
                </div>
              </div>
              <div className="tile-mapper-rule-column">
                <h3>Edge Sockets</h3>
                <div className="tile-mapper-rule-grid">
                  {GRAMMAR_DIRECTIONS.map((direction) => (
                    <label key={direction} className="tile-mapper-rule-field">
                      <span>{directionLabel(direction)}</span>
                      <select
                        value={selectedTileRules.edges[direction] ?? 'void'}
                        disabled={!isEditableAtlas}
                        onChange={(event) =>
                          updateSelectedTileRules((rules) => ({
                            ...rules,
                            edges: {
                              ...rules.edges,
                              [direction]: event.target.value as GrammarSocket,
                            },
                          }))
                        }
                      >
                        {GRAMMAR_SOCKETS.map((socket) => (
                          <option key={socket} value={socket}>
                            {socket}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
              <div className="tile-mapper-rule-column">
                <h3>Tile Passability</h3>
                <div className="tile-mapper-passable-grid">
                  {GRAMMAR_DIRECTIONS.map((direction) => (
                    <label key={direction} className="tile-mapper-passable-toggle">
                      <input
                        type="checkbox"
                        checked={selectedTileRules.passable[direction] ?? false}
                        disabled={!isEditableAtlas}
                        onChange={(event) =>
                          updateSelectedTileRules((rules) => ({
                            ...rules,
                            passable: {
                              ...rules.passable,
                              [direction]: event.target.checked,
                            },
                          }))
                        }
                      />
                      <span>{directionLabel(direction)}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="tile-mapper-rule-column">
                <h3>Tags</h3>
                <label className="tile-mapper-rule-field">
                  <span>Comma separated</span>
                  <input
                    type="text"
                    value={activeSlot?.rules.tags.join(', ') ?? ''}
                    disabled={!isEditableAtlas}
                    onChange={(event) =>
                      updateActiveRules((rules) => ({
                        ...rules,
                        tags: event.target.value
                          .split(',')
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                      }))
                    }
                    placeholder="flat, shore, entry"
                  />
                </label>
              </div>
            </div>
            <div className="tile-mapper-inspector">
              <div className="tile-mapper-panel-header">
                <h2>Compatibility Inspector</h2>
                <span>
                  {inspectorTile && inspectorTileSource
                    ? `Tile ${selectedTileId} via ${inspectorTileSource} at layer ${inspectorTile.layerLevel}`
                    : `Tile ${selectedTileId} is not mapped into a runtime slot yet`}
                </span>
              </div>
              <div
                className={`tile-mapper-rule-health${inspectorWarnings.length > 0 ? ' is-warning' : ' is-ok'}`}
              >
                {inspectorWarnings.length > 0
                  ? `Warnings: ${inspectorWarnings.join(' | ')}`
                  : inspectorTile
                    ? 'No immediate rule conflicts for the selected rule-subject tile.'
                    : 'Map this tile into a runtime slot first so the inspector has layer and socket context.'}
              </div>
              <p className="tile-mapper-hint">
                <code>In only</code> means the candidate tile can enter this tile from that side,
                but this tile cannot move back out through that same edge.
              </p>
              <div className="tile-mapper-inspector-grid">
                {GRAMMAR_DIRECTIONS.map((direction) => (
                  <div key={direction} className="tile-mapper-inspector-card">
                    <strong>{directionLabel(direction)}</strong>
                    <span>{adjacencyByDirection[direction].length} matches</span>
                    <div className="tile-mapper-inspector-list">
                      {adjacencyByDirection[direction].length > 0 ? (
                        adjacencyByDirection[direction].map(({ tile, travel }) => (
                          <button
                            key={`${direction}-${tile.key}`}
                            type="button"
                            className="tile-mapper-inspector-item"
                            onClick={() => jumpToGrammarTile(tile)}
                          >
                            <div
                              className="tile-mapper-inspector-preview"
                              style={getTilePreviewStyle(
                                atlas.src,
                                tile.tileId,
                                48,
                              )}
                            />
                            <div className="tile-mapper-inspector-copy">
                              <strong>{describeSlot(tile.templateKey, tile.label)}</strong>
                              <span>{formatGrammarTile(tile)}</span>
                            </div>
                            <span className={`tile-mapper-inspector-status is-${travel}`}>
                              {travelStateLabel(travel)}
                            </span>
                          </button>
                        ))
                      ) : (
                        <span className="tile-mapper-inspector-empty">No matches</span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="tile-mapper-inspector-card">
                  <strong>Below</strong>
                  <span>{belowMatches.length} matches</span>
                  <div className="tile-mapper-inspector-list">
                    {belowMatches.length > 0 ? (
                      belowMatches.map((tile) => (
                        <button
                          key={`below-${tile.key}`}
                          type="button"
                          className="tile-mapper-inspector-item"
                          onClick={() => jumpToGrammarTile(tile)}
                        >
                          <div
                            className="tile-mapper-inspector-preview"
                            style={getTilePreviewStyle(
                              atlas.src,
                              tile.tileId,
                              48,
                            )}
                          />
                          <div className="tile-mapper-inspector-copy">
                            <strong>{describeSlot(tile.templateKey, tile.label)}</strong>
                            <span>{formatGrammarTile(tile)}</span>
                          </div>
                          <span className="tile-mapper-inspector-status is-stack">Supports</span>
                        </button>
                      ))
                    ) : (
                      <span className="tile-mapper-inspector-empty">
                        {inspectorTile?.layerLevel === 0 ? 'Base layer tile' : 'No support tile'}
                      </span>
                    )}
                  </div>
                </div>
                <div className="tile-mapper-inspector-card">
                  <strong>Above</strong>
                  <span>{aboveMatches.length} matches</span>
                  <div className="tile-mapper-inspector-list">
                    {aboveMatches.length > 0 ? (
                      aboveMatches.map((tile) => (
                        <button
                          key={`above-${tile.key}`}
                          type="button"
                          className="tile-mapper-inspector-item"
                          onClick={() => jumpToGrammarTile(tile)}
                        >
                          <div
                            className="tile-mapper-inspector-preview"
                            style={getTilePreviewStyle(
                              atlas.src,
                              tile.tileId,
                              48,
                            )}
                          />
                          <div className="tile-mapper-inspector-copy">
                            <strong>{describeSlot(tile.templateKey, tile.label)}</strong>
                            <span>{formatGrammarTile(tile)}</span>
                          </div>
                          <span className="tile-mapper-inspector-status is-stack">Stacks</span>
                        </button>
                      ))
                    ) : (
                      <span className="tile-mapper-inspector-empty">No tiles above</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>

      {sampleMap ? (
        <div className="tile-mapper-modal-backdrop" role="presentation" onClick={() => setSampleMap(null)}>
          <section
            className="tile-mapper-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Sample map audit"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="tile-mapper-modal-header">
              <div>
                <p className="tile-mapper-kicker">Sample</p>
                <h2>Sample Map Audit</h2>
                <p className="tile-mapper-copy">
                  Generated from the current saved board mapping. Red boxes mark cells where
                  explicit same-layer rules still disagree with the generated terrain.
                </p>
                {sampleMap.failureReason ? (
                  <p className="tile-mapper-sample-failure">{sampleMap.failureReason}</p>
                ) : null}
                {sampleMap.failureDiagnostics ? (
                  <div className="tile-mapper-diagnostic-summary">
                    <strong>
                      Solver failed on {sampleMap.failureDiagnostics.layer} layer, seed{' '}
                      {sampleMap.failureDiagnostics.seed}
                    </strong>
                    <span>
                      These are the first cells the strict solver could not satisfy from your saved
                      rules.
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="tile-mapper-inline-actions">
                <button type="button" className="tile-mapper-button" onClick={regenerateSampleMap}>
                  Regenerate
                </button>
                <button type="button" className="tile-mapper-button" onClick={() => setSampleMap(null)}>
                  Close
                </button>
              </div>
            </div>
            <div className="tile-mapper-sample-meta">
              <span>Seed {sampleMap.seed}</span>
              <span>{sampleMap.cols} cols x {sampleMap.rows} rows</span>
              <span>{Math.round(sampleMap.randomness * 100)}% randomness</span>
              <span>{sampleMap.stats.landTiles} flat tiles</span>
              <span>{sampleMap.stats.plateauTiles} elevated tiles</span>
              <span>max tier {sampleMap.stats.maxTerrainLevel}</span>
              <span>{sampleMap.stats.ruleConflicts} rule conflicts</span>
            </div>
            <div className="tile-mapper-sample-controls">
              <label className="tile-mapper-sample-control">
                <span>Cols</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={sampleColsInput}
                  onChange={(event) => {
                    const sanitized = event.target.value.replace(/[^\d]/g, '');
                    setSampleColsInput(sanitized);
                    const nextValue = Number.parseInt(sanitized, 10);
                    if (!Number.isFinite(nextValue) || nextValue < 1) {
                      return;
                    }
                    setSampleSettings((current) => ({
                      ...current,
                      cols: nextValue,
                    }));
                  }}
                  onBlur={() => {
                    if (sampleColsInput.trim().length === 0) {
                      setSampleColsInput(String(sampleSettings.cols));
                    }
                  }}
                />
              </label>
              <label className="tile-mapper-sample-control">
                <span>Rows</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={sampleRowsInput}
                  onChange={(event) => {
                    const sanitized = event.target.value.replace(/[^\d]/g, '');
                    setSampleRowsInput(sanitized);
                    const nextValue = Number.parseInt(sanitized, 10);
                    if (!Number.isFinite(nextValue) || nextValue < 1) {
                      return;
                    }
                    setSampleSettings((current) => ({
                      ...current,
                      rows: nextValue,
                    }));
                  }}
                  onBlur={() => {
                    if (sampleRowsInput.trim().length === 0) {
                      setSampleRowsInput(String(sampleSettings.rows));
                    }
                  }}
                />
              </label>
              <label className="tile-mapper-sample-control tile-mapper-sample-control-wide">
                <span>Randomness {sampleSettings.randomness}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={sampleSettings.randomness}
                  onChange={(event) =>
                    setSampleSettings((current) => ({
                      ...current,
                      randomness: Number(event.target.value) || 0,
                    }))
                  }
                />
              </label>
              <label className="tile-mapper-sample-control">
                <span>Layer View</span>
                <select
                  value={sampleLayerView}
                  onChange={(event) => setSampleLayerView(event.target.value as SampleLayerView)}
                >
                  <option value="total">Total</option>
                  <option value="flat">Flat Only</option>
                  <option value="elevated">Elevated Only</option>
                </select>
              </label>
              <label className="tile-mapper-sample-control">
                <span>Zoom</span>
                <select
                  value={String(sampleZoom)}
                  onChange={(event) => setSampleZoom(Number(event.target.value) || 1)}
                  disabled={samplePawnEnabled}
                >
                  <option value="0.5">50%</option>
                  <option value="0.75">75%</option>
                  <option value="1">100%</option>
                  <option value="1.2">120%</option>
                  <option value="1.25">125%</option>
                  <option value="1.5">150%</option>
                  <option value="2">200%</option>
                </select>
              </label>
              <label className="tile-mapper-sample-toggle">
                <input
                  type="checkbox"
                  checked={samplePawnEnabled}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    if (!enabled) {
                      sampleMovementRef.current = {
                        north: false,
                        east: false,
                        south: false,
                        west: false,
                      };
                      setSamplePawnEnabled(false);
                      setSamplePawn(null);
                      return;
                    }
                    spawnSamplePawn();
                  }}
                />
                <span>Spawn Pawn</span>
              </label>
              <label className="tile-mapper-sample-toggle">
                <input
                  type="checkbox"
                  checked={showSampleConflicts}
                  onChange={(event) => setShowSampleConflicts(event.target.checked)}
                />
                <span>Show Conflict Overlay</span>
              </label>
              <span className="tile-mapper-sample-active-count">
                {sampleLayerView === 'flat'
                  ? `${sampleMap.flatConflictCells.length} flat conflicts`
                  : sampleLayerView === 'elevated'
                    ? `${sampleMap.elevatedConflictCells.length} elevated conflicts`
                    : `${sampleMap.conflictCells.length} total conflicts`}
              </span>
            </div>
            <div className="tile-mapper-sample-stage">
              <div
                ref={sampleViewportRef}
                className="tile-mapper-sample-viewport"
                tabIndex={0}
                aria-label="Sample map viewport"
              >
                <div
                  className="tile-mapper-sample-scaled"
                  style={{
                    width: sampleMap.cols * SAMPLE_TILE_SIZE * sampleZoom,
                    height: sampleMap.rows * SAMPLE_TILE_SIZE * sampleZoom,
                  }}
                >
                  <div
                    className="tile-mapper-sample-map"
                    style={{
                      width: sampleMap.cols * SAMPLE_TILE_SIZE,
                      height: sampleMap.rows * SAMPLE_TILE_SIZE,
                      transform: `scale(${sampleZoom})`,
                      transformOrigin: 'top left',
                    }}
                  >
                    <div className="tile-mapper-sample-water" />
                    {sampleLayerView === 'total'
                      ? sampleMap.decorations
                          .filter((decoration) => decoration.layer === 'water')
                          .map((decoration, index) => renderSampleDecoration(decoration, index))
                      : null}
                    {sampleLayerView !== 'elevated'
                      ? sampleMap.foamStamps.map((stamp) => renderSampleOverlay(stamp))
                      : null}
                    {sampleLayerView !== 'elevated'
                      ? sampleMap.flatTiles.map((tile) => renderSampleTile(tile))
                      : null}
                    {sampleLayerView !== 'flat'
                      ? sampleElevatedLevels.map((terrainLevel) => (
                          <div key={`sample-elevated-level-${terrainLevel}`}>
                            {sampleMap.shadowStamps
                              .filter((stamp) => stamp.terrainLevel === terrainLevel)
                              .map((stamp) => renderSampleOverlay(stamp))}
                            {sampleMap.elevatedTiles
                              .filter((tile) => tile.terrainLevel === terrainLevel)
                              .map((tile) => renderSampleTile(tile))}
                          </div>
                        ))
                      : null}
                    {sampleLayerView === 'total'
                      ? sampleMap.decorations
                          .filter((decoration) => decoration.layer === 'land')
                          .map((decoration, index) => renderSampleDecoration(decoration, index))
                      : null}
                    {samplePawnEnabled && samplePawn ? (
                      <div
                        ref={samplePawnNodeRef}
                        className={`tile-mapper-sample-pawn${samplePawn.moving ? ' is-moving' : ''}${samplePawn.facing === 'left' ? ' is-facing-left' : ''}`}
                        style={{
                          left: samplePawn.x - (SAMPLE_TILE_SIZE * 1.55) / 2,
                          top: samplePawn.y - (SAMPLE_TILE_SIZE * 1.55) / 2,
                          zIndex: Math.round((samplePawn.y + SAMPLE_PAWN_FOOT_OFFSET_Y) * 10),
                        }}
                      />
                    ) : null}
                    {showSampleConflicts
                      ? visibleSampleConflicts.map((cell) => renderSampleConflict(cell))
                      : null}
                  </div>
                </div>
              </div>
            </div>
            {sampleMap.failureDiagnostics ? (
              <div className="tile-mapper-diagnostic-panel">
                <h3>Constraint Failure Details</h3>
                <div className="tile-mapper-diagnostic-list">
                  {sampleMap.failureDiagnostics.cells.map((cell, index) => (
                    <article
                      key={`diag-${cell.row}-${cell.col}-${index}`}
                      className="tile-mapper-diagnostic-card"
                    >
                      <div className="tile-mapper-diagnostic-heading">
                        <strong>
                          Cell r{cell.row}, c{cell.col}
                        </strong>
                        <span>
                          {cell.issue === 'no_topology_match'
                            ? 'No topology match'
                            : 'Propagation emptied the domain'}
                        </span>
                      </div>
                      <div className="tile-mapper-diagnostic-meta">
                        <span>
                          Expected openings:{' '}
                          {cell.expectedOpenDirections.length > 0
                            ? cell.expectedOpenDirections.map(directionLabel).join(', ')
                            : 'none'}
                        </span>
                        <span>
                          Candidate tiles:{' '}
                          {cell.candidateTileIds.length > 0
                            ? cell.candidateTileIds.join(', ')
                            : 'none'}
                        </span>
                      </div>
                      <div className="tile-mapper-diagnostic-neighbors">
                        {GRAMMAR_DIRECTIONS.map((direction) => (
                          <span key={`diag-${index}-${direction}`}>
                            <strong>{directionLabel(direction)}:</strong>{' '}
                            {formatTileIdList(cell.neighborOptionTileIds[direction] ?? [])}
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      <details className="tile-mapper-advanced">
        <summary>Advanced JSON Backup</summary>
        <div className="tile-mapper-export-layout">
          <section className="tile-mapper-panel">
            <div className="tile-mapper-panel-header">
              <h2>Export Workspace</h2>
              <div className="tile-mapper-inline-actions">
                <button type="button" className="tile-mapper-button" onClick={copyJson}>
                  Copy JSON
                </button>
                <button type="button" className="tile-mapper-button" onClick={downloadJson}>
                  Download JSON
                </button>
              </div>
            </div>
            <textarea className="tile-mapper-textarea" value={exportText} readOnly />
          </section>

          <section className="tile-mapper-panel">
            <div className="tile-mapper-panel-header">
              <h2>Import Workspace</h2>
              <button type="button" className="tile-mapper-button" onClick={importJson}>
                Load JSON
              </button>
            </div>
            <textarea
              className="tile-mapper-textarea"
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="Paste a workspace export or a single mapping document here."
            />
          </section>
        </div>
      </details>
    </div>
  );

  function jumpToGrammarTile(tile: TerrainGrammarTile): void {
    const documentState = getDocument(workspace, tile.templateKey);
    for (let rowIndex = 0; rowIndex < documentState.cells.length; rowIndex++) {
      const colIndex = documentState.cells[rowIndex].findIndex((cell) => cell.label === tile.label);
      if (colIndex >= 0) {
        selectCell(tile.templateKey, rowIndex, colIndex);
        setSelectedTileId(tile.tileId);
        setStatusText(`Jumped to ${formatGrammarTile(tile)}.`);
        return;
      }
    }
  }
}

function describeSlot(templateKey: TemplateKey, label: string): string {
  const title = SLOT_TITLES[templateKey]?.[label];
  if (!title) {
    return label || 'slot';
  }

  return `${label} - ${title}`;
}

function directionLabel(direction: GrammarDirection): string {
  if (direction === 'north') return 'North';
  if (direction === 'east') return 'East';
  if (direction === 'south') return 'South';
  return 'West';
}

function formatGrammarTile(tile: TerrainGrammarTile): string {
  return `Tile ${tile.tileId} | layer ${tile.layerLevel} | ${tile.selfSocket}`;
}

function getTilePreviewStyle(src: string, tileId: number, targetSize: number) {
  const zeroBased = tileId - 1;
  const col = zeroBased % ATLAS_COLUMNS;
  const row = Math.floor(zeroBased / ATLAS_COLUMNS);
  return {
    backgroundImage: `url(${src})`,
    backgroundSize: `${ATLAS_COLUMNS * targetSize}px ${ATLAS_ROWS * targetSize}px`,
    backgroundPosition: `${-col * targetSize}px ${-row * targetSize}px`,
  };
}

function renderSampleTile(tile: WfcSampleTile) {
  return (
    <div
      key={`sample-tile-${tile.terrainLevel}-${tile.row}-${tile.col}-${tile.tileId}`}
      className="tile-mapper-sample-tile"
      style={{
        ...getTilePreviewStyle(ATLAS_OPTIONS[tile.atlasKey].src, tile.tileId, SAMPLE_TILE_SIZE),
        left: tile.col * SAMPLE_TILE_SIZE,
        top: tile.row * SAMPLE_TILE_SIZE,
        width: SAMPLE_TILE_SIZE,
        height: SAMPLE_TILE_SIZE,
      }}
    />
  );
}

function renderSampleOverlay(stamp: WfcSampleOverlay) {
  const size = SAMPLE_TILE_SIZE * 3 * stamp.scale;
  const left = stamp.col * SAMPLE_TILE_SIZE + SAMPLE_TILE_SIZE / 2 - size / 2;
  const top = stamp.row * SAMPLE_TILE_SIZE + SAMPLE_TILE_SIZE / 2 - size / 2;

  if (stamp.kind === 'foam') {
    return (
      <div
        key={`sample-foam-${stamp.terrainLevel}-${stamp.row}-${stamp.col}`}
        className="tile-mapper-sample-overlay is-foam"
        style={{
          left,
          top,
          width: size,
          height: size,
        }}
      />
    );
  }

  return (
    <div
      key={`sample-shadow-${stamp.terrainLevel}-${stamp.row}-${stamp.col}`}
      className="tile-mapper-sample-overlay is-shadow"
      style={{
        left,
        top,
        width: size,
        height: size,
      }}
    />
  );
}

function renderSampleDecoration(decoration: WfcSampleDecoration, index: number) {
  const width = decoration.width * SAMPLE_TILE_SIZE;
  const height = decoration.height * SAMPLE_TILE_SIZE;
  const centerX = (decoration.col + 0.5 + decoration.offsetX) * SAMPLE_TILE_SIZE;
  const baseY = (decoration.row + decoration.offsetY) * SAMPLE_TILE_SIZE;
  const frameCount = Math.max(1, decoration.frameCount);
  const framePosition =
    frameCount > 1
      ? `${(decoration.frameIndex / Math.max(1, frameCount - 1)) * 100}% 0`
      : '0 0';

  return (
    <div
      key={`sample-decoration-${decoration.kind}-${decoration.layer}-${decoration.row}-${decoration.col}-${index}`}
      className={`tile-mapper-sample-decoration is-${decoration.kind}${decoration.animated ? ' is-animated' : ''}`}
      style={{
        left: centerX - width / 2,
        top: baseY - height,
        width,
        height,
        zIndex:
          decoration.layer === 'water'
            ? 4
            : decoration.kind === 'tree'
              ? Math.round(baseY * 10)
              : 6,
        backgroundImage: `url("${decoration.src}")`,
        backgroundSize: frameCount > 1 ? `${frameCount * 100}% 100%` : '100% 100%',
        backgroundPosition: framePosition,
        animationDuration: decoration.animated ? `${decoration.animationDurationMs ?? 1000}ms` : undefined,
        animationDelay:
          decoration.animated && decoration.animationDelayMs
            ? `${-decoration.animationDelayMs}ms`
            : undefined,
      }}
    />
  );
}

function renderSampleConflict(cell: WfcSampleConflict) {
  return (
    <div
      key={`sample-conflict-${cell.row}-${cell.col}`}
      className="tile-mapper-sample-conflict"
      style={{
        left: cell.col * SAMPLE_TILE_SIZE,
        top: cell.row * SAMPLE_TILE_SIZE,
        width: SAMPLE_TILE_SIZE,
        height: SAMPLE_TILE_SIZE,
      }}
    />
  );
}

function buildSampleWalkCells(
  sampleMap: WfcSampleMap | null,
  workspace: MappingWorkspace,
): Map<string, SampleWalkCell> {
  const cells = new Map<string, SampleWalkCell>();
  if (!sampleMap) {
    return cells;
  }

  const sharedMapping = getTerrainAtlasMapping(workspace, SHARED_EDIT_ATLAS_KEY);
  const lowerStairTileIds = new Set<number>([
    sharedMapping.stairs.left.lower,
    sharedMapping.stairs.right.lower,
  ]);
  const topTileByCell = new Map<
    string,
    { tile: WfcSampleTile; effectiveLevel: number; passable: Record<GrammarDirection, boolean> }
  >();
  const allTiles = [...sampleMap.flatTiles, ...sampleMap.elevatedTiles];
  for (const tile of allTiles) {
    const rules = getAuthoredTileRules(workspace, tile.atlasKey, tile.tileId);
    const effectiveLevel = lowerStairTileIds.has(tile.tileId)
      ? Math.max(1, tile.terrainLevel - 1)
      : tile.terrainLevel;
    const key = `${tile.row},${tile.col}`;
    const current = topTileByCell.get(key);
    if (!current || effectiveLevel >= current.effectiveLevel) {
      topTileByCell.set(key, {
        tile,
        effectiveLevel,
        passable: { ...rules.passable },
      });
    }
  }

  for (const [key, entry] of topTileByCell.entries()) {
    if (!GRAMMAR_DIRECTIONS.some((direction) => entry.passable[direction])) {
      continue;
    }

    cells.set(key, {
      row: entry.tile.row,
      col: entry.tile.col,
      terrainLevel: entry.effectiveLevel,
      passable: entry.passable,
    });
  }

  return cells;
}

function pickSamplePawnSpawn(
  sampleMap: WfcSampleMap,
  walkCells: Map<string, SampleWalkCell>,
): SampleWalkCell | null {
  let best: SampleWalkCell | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  const centerRow = sampleMap.rows / 2;
  const centerCol = sampleMap.cols / 2;

  for (const cell of walkCells.values()) {
    const distance = Math.abs(cell.row + 0.5 - centerRow) + Math.abs(cell.col + 0.5 - centerCol);
    const score = distance - cell.terrainLevel * 0.2;
    if (score < bestScore) {
      best = cell;
      bestScore = score;
    }
  }

  return best;
}

function advanceSamplePawnState(
  pawn: SamplePawnState,
  movement: Record<GrammarDirection, boolean>,
  walkCells: Map<string, SampleWalkCell>,
  dt: number,
): SamplePawnState {
  let dx = 0;
  let dy = 0;
  if (movement.west) dx -= 1;
  if (movement.east) dx += 1;
  if (movement.north) dy -= 1;
  if (movement.south) dy += 1;

  if (dx === 0 && dy === 0) {
    return pawn.moving ? { ...pawn, moving: false } : pawn;
  }

  if (dx !== 0 && dy !== 0) {
    const inv = 1 / Math.SQRT2;
    dx *= inv;
    dy *= inv;
  }

  const facing = dx < 0 ? 'left' : dx > 0 ? 'right' : pawn.facing;
  const nextX = pawn.x + dx * SAMPLE_PAWN_SPEED * dt;
  const nextY = pawn.y + dy * SAMPLE_PAWN_SPEED * dt;

  if (canMoveSamplePawn(pawn.x, pawn.y, nextX, nextY, walkCells)) {
    return { x: nextX, y: nextY, facing, moving: true };
  }
  if (canMoveSamplePawn(pawn.x, pawn.y, nextX, pawn.y, walkCells)) {
    return { x: nextX, y: pawn.y, facing, moving: true };
  }
  if (canMoveSamplePawn(pawn.x, pawn.y, pawn.x, nextY, walkCells)) {
    return { x: pawn.x, y: nextY, facing, moving: true };
  }

  if (pawn.facing === facing && !pawn.moving) {
    return pawn;
  }
  return { ...pawn, facing, moving: false };
}

function oppositeDirection(direction: GrammarDirection): GrammarDirection {
  if (direction === 'north') return 'south';
  if (direction === 'south') return 'north';
  if (direction === 'west') return 'east';
  return 'west';
}

function canMoveSamplePawn(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  walkCells: Map<string, SampleWalkCell>,
): boolean {
  const fromTile = getSampleMovementTile(fromX, fromY);
  const toTile = getSampleMovementTile(toX, toY);
  if (!fromTile || !toTile) {
    return false;
  }

  const fromCell = walkCells.get(`${fromTile.row},${fromTile.col}`);
  const toCell = walkCells.get(`${toTile.row},${toTile.col}`);
  if (!fromCell || !toCell) {
    return false;
  }

  if (fromTile.row === toTile.row && fromTile.col === toTile.col) {
    return canOccupySamplePawn(toX, toY, walkCells);
  }

  if (fromCell.terrainLevel === toCell.terrainLevel) {
    return canSweepSamplePawn(
      fromX,
      fromY,
      toX,
      toY,
      walkCells,
      SAMPLE_PAWN_COLLISION_RADIUS * 0.68,
    );
  }

  const rowDelta = toTile.row - fromTile.row;
  const colDelta = toTile.col - fromTile.col;
  if (Math.abs(rowDelta) > 1 || Math.abs(colDelta) > 1 || (rowDelta === 0 && colDelta === 0)) {
    return false;
  }

  if (Math.abs(rowDelta) === 1 && Math.abs(colDelta) === 1) {
    const horizontalCell = walkCells.get(`${fromTile.row},${toTile.col}`);
    const verticalCell = walkCells.get(`${toTile.row},${fromTile.col}`);

    const canHorizontalThenVertical =
      horizontalCell &&
      isSampleCardinalTransitionAllowed(fromCell, horizontalCell, 0, colDelta) &&
      isSampleCardinalTransitionAllowed(horizontalCell, toCell, rowDelta, 0);

    const canVerticalThenHorizontal =
      verticalCell &&
      isSampleCardinalTransitionAllowed(fromCell, verticalCell, rowDelta, 0) &&
      isSampleCardinalTransitionAllowed(verticalCell, toCell, 0, colDelta);

    if (canHorizontalThenVertical || canVerticalThenHorizontal) {
      return true;
    }

    const diagonalRadius = SAMPLE_PAWN_COLLISION_RADIUS * 0.72;
    const sameLevel = fromCell.terrainLevel === toCell.terrainLevel;
    const horizontalBlocked = !horizontalCell || horizontalCell.terrainLevel !== fromCell.terrainLevel;
    const verticalBlocked = !verticalCell || verticalCell.terrainLevel !== fromCell.terrainLevel;

    return (
      sameLevel &&
      horizontalBlocked &&
      verticalBlocked &&
      canOccupySamplePawn(toX, toY, walkCells, diagonalRadius, true, true)
    );
  }

  return (
    isSampleCardinalTransitionAllowed(fromCell, toCell, rowDelta, colDelta) &&
    canOccupySamplePawn(toX, toY, walkCells)
  );
}

function canSweepSamplePawn(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  walkCells: Map<string, SampleWalkCell>,
  collisionRadius: number,
): boolean {
  const distance = Math.hypot(toX - fromX, toY - fromY);
  const steps = Math.max(2, Math.ceil(distance / 4));

  for (let index = 1; index <= steps; index++) {
    const t = index / steps;
    const x = fromX + (toX - fromX) * t;
    const y = fromY + (toY - fromY) * t;
    if (!canOccupySamplePawn(x, y, walkCells, collisionRadius, true)) {
      return false;
    }
  }

  return true;
}

function isSampleCardinalTransitionAllowed(
  fromCell: SampleWalkCell,
  toCell: SampleWalkCell,
  rowDelta: number,
  colDelta: number,
): boolean {
  if (rowDelta === -1) return fromCell.passable.north && toCell.passable.south;
  if (rowDelta === 1) return fromCell.passable.south && toCell.passable.north;
  if (colDelta === -1) return fromCell.passable.west && toCell.passable.east;
  if (colDelta === 1) return fromCell.passable.east && toCell.passable.west;
  return false;
}

function canOccupySamplePawn(
  x: number,
  y: number,
  walkCells: Map<string, SampleWalkCell>,
  collisionRadius = SAMPLE_PAWN_COLLISION_RADIUS,
  ignoreEdgePassability = false,
  ignoreNeighborRing = false,
): boolean {
  const tile = getSampleMovementTile(x, y);
  if (!tile) {
    return false;
  }
  const cell = walkCells.get(`${tile.row},${tile.col}`);
  if (!cell) {
    return false;
  }

  const footY = y + SAMPLE_PAWN_FOOT_OFFSET_Y;
  const localX = x - tile.col * SAMPLE_TILE_SIZE;
  const localY = footY - tile.row * SAMPLE_TILE_SIZE;
  if (!ignoreEdgePassability) {
    if (!cell.passable.north && localY < collisionRadius) {
      return false;
    }
    if (!cell.passable.south && localY > SAMPLE_TILE_SIZE - collisionRadius) {
      return false;
    }
    if (!cell.passable.west && localX < collisionRadius) {
      return false;
    }
    if (!cell.passable.east && localX > SAMPLE_TILE_SIZE - collisionRadius) {
      return false;
    }
  }

  if (ignoreNeighborRing) {
    return true;
  }

  const offsets = [
    { x: 0, y: -collisionRadius },
    { x: collisionRadius, y: 0 },
    { x: collisionRadius * 0.7, y: collisionRadius * 0.7 },
    { x: 0, y: collisionRadius },
    { x: -collisionRadius * 0.7, y: collisionRadius * 0.7 },
    { x: -collisionRadius, y: 0 },
    { x: -collisionRadius * 0.7, y: -collisionRadius * 0.7 },
    { x: collisionRadius * 0.7, y: -collisionRadius * 0.7 },
  ];

  return offsets.every((offset) => {
    const sampleTile = getSampleMovementTile(x + offset.x, y + offset.y);
    return sampleTile ? walkCells.has(`${sampleTile.row},${sampleTile.col}`) : false;
  });
}

function getSampleMovementTile(x: number, y: number): { row: number; col: number } | null {
  const col = Math.floor(x / SAMPLE_TILE_SIZE);
  const row = Math.floor((y + SAMPLE_PAWN_FOOT_OFFSET_Y) / SAMPLE_TILE_SIZE);
  if (row < 0 || col < 0) {
    return null;
  }
  return { row, col };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatSocketList(sockets: GrammarSocket[]): string {
  return sockets.length > 0 ? sockets.join(', ') : 'none';
}

function formatTileIdList(tileIds: number[]): string {
  return tileIds.length > 0 ? tileIds.join(', ') : 'none';
}

function formatPassability(
  passable: Record<GrammarDirection, boolean> | undefined,
): string {
  if (!passable) {
    return 'blocked';
  }

  const openDirections = GRAMMAR_DIRECTIONS.filter((direction) => passable[direction]).map(
    directionLabel,
  );
  return openDirections.length > 0 ? openDirections.join(', ') : 'blocked';
}

function getTravelState(
  source: TerrainGrammarTile,
  candidate: TerrainGrammarTile,
  direction: GrammarDirection,
): TravelState {
  const sourcePassable = source.passable[direction];
  const candidatePassable = candidate.passable[oppositeDirection(direction)];

  if (sourcePassable && candidatePassable) {
    return 'two-way';
  }
  if (sourcePassable) {
    return 'outbound-only';
  }
  if (candidatePassable) {
    return 'inbound-only';
  }
  return 'sealed';
}

function travelStateLabel(state: TravelState): string {
  if (state === 'two-way') return 'Two-way';
  if (state === 'outbound-only') return 'Out only';
  if (state === 'inbound-only') return 'In only';
  return 'Sealed';
}

function findFirstPlacementUsingTile(
  workspace: MappingWorkspace,
  atlasKey: AtlasKey,
  tileId: number,
) : TilePlacement | null {
  for (const templateKey of RUNTIME_TEMPLATE_KEYS) {
    const documentState = getDocument(workspace, templateKey, atlasKey);
    for (let rowIndex = 0; rowIndex < documentState.cells.length; rowIndex++) {
      const row = documentState.cells[rowIndex];
      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        const cell = row[colIndex];
        if (cell.tileId === tileId) {
          return {
            templateKey,
            row: rowIndex,
            col: colIndex,
            cell,
          };
        }
      }
    }
  }

  return null;
}

