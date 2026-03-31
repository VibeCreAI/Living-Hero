import { Scene } from 'phaser';
import {
  UnitRole,
  Position,
  BattleResult,
  BattleState,
  BattleMode,
  DamageEvent,
  PlayerChatMessageEvent,
  BattleGridConfig,
  TileCoord,
  PortalFloorNumber,
} from '../types';
import { Unit, createUnitState } from '../entities/Unit';
import { Hero, createHeroState } from '../entities/Hero';
import { BattleStateManager } from '../state/BattleState';
import { MovementSystem } from './MovementSystem';
import { TargetingSystem } from './TargetingSystem';
import { CombatSystem } from './CombatSystem';
import { HeroScheduler } from '../ai/HeroScheduler';
import { ScoredPersonalityBrain } from '../ai/ScoredPersonalityBrain';
import { OllamaHeroBrain } from '../ai/OllamaHeroBrain';
import { FeedbackOverlay } from './FeedbackOverlay';
import { ObstacleSystem, Obstacle } from './Obstacles';
import { DEFAULT_HEROES } from '../data/heroes';
import { getEnemyVariantDefinition } from '../data/enemyVariants';
import { getPortalFloorConfig } from '../data/portalFloors';
import { UNIT_CONFIGS } from '../data/units';
import { BattleGrid } from './BattleGrid';

interface BattleConfig {
  nodeId: string;
  difficulty: number;
  floorNumber?: PortalFloorNumber;
  mode?: BattleMode;
  layout?: BattleMapLayout;
}

interface ArmyComposition {
  role: UnitRole;
  count: number;
}

export interface PlaygroundTargetConfig {
  name: string;
  role: UnitRole;
  position: Position;
}

export interface BattleMapLayout {
  mapSummary?: BattleGridConfig;
  obstacles?: Obstacle[];
  heroSpawn?: Position;
  alliedSpawns?: Position[];
  enemySpawns?: Position[];
  playgroundTargets?: PlaygroundTargetConfig[];
}

const DEFAULT_BATTLE_MAP: BattleGridConfig = {
  cols: 22,
  rows: 16,
  tileWidth: 48,
  tileHeight: 48,
  worldWidth: 22 * 48,
  worldHeight: 16 * 48,
};

const DEFAULT_PLAYGROUND_LAYOUT: Obstacle[] = [
  { id: 'wall-top', label: 'North Wall', x: 410, y: 90, width: 44, height: 220 },
  { id: 'rock-top', label: 'Top Rocks', x: 550, y: 150, width: 110, height: 70 },
  { id: 'center-wall', label: 'Center Wall', x: 500, y: 315, width: 150, height: 42 },
  { id: 'rock-bot', label: 'Bottom Rocks', x: 340, y: 500, width: 110, height: 80 },
  { id: 'wall-bot', label: 'South Wall', x: 650, y: 420, width: 46, height: 220 },
];

const PLAYGROUND_TARGETS: PlaygroundTargetConfig[] = [
  { name: 'North Target', role: 'archer', position: { x: 860, y: 130 } },
  { name: 'Center Target', role: 'warrior', position: { x: 860, y: 360 } },
  { name: 'South Target', role: 'archer', position: { x: 860, y: 620 } },
  { name: 'Pocket Target', role: 'warrior', position: { x: 710, y: 235 } },
];

export class BattleLoop {
  private sessionId = '';
  private nodeId = '';
  private floorNumber?: PortalFloorNumber;
  private stateManager: BattleStateManager;
  private movementSystem: MovementSystem;
  private targetingSystem: TargetingSystem;
  private combatSystem: CombatSystem;
  private heroScheduler: HeroScheduler;
  private ollamaBrain: OllamaHeroBrain;
  private feedbackOverlay: FeedbackOverlay | null = null;
  private obstacleSystem: ObstacleSystem;
  private battleGrid!: BattleGrid;
  private stopHealthChecks: (() => void) | null = null;
  private mode: BattleMode = 'battle';
  private planningRequested = false;
  private layout: BattleMapLayout = {};

  private allDamageEvents: DamageEvent[] = [];

  alliedUnits: Unit[] = [];
  enemyUnits: Unit[] = [];
  heroes: Hero[] = [];

  constructor() {
    this.stateManager = new BattleStateManager();
    this.movementSystem = new MovementSystem();
    this.targetingSystem = new TargetingSystem();
    this.combatSystem = new CombatSystem();
    this.obstacleSystem = new ObstacleSystem();
    const heroTraits = DEFAULT_HEROES[0].traits;
    const fallbackBrain = new ScoredPersonalityBrain(heroTraits);
    this.ollamaBrain = new OllamaHeroBrain();
    this.heroScheduler = new HeroScheduler(fallbackBrain, this.ollamaBrain);
    this.stopHealthChecks = this.ollamaBrain.startHealthChecks();
  }

  setPlayerDirective(event: PlayerChatMessageEvent): void {
    const targetHeroIds =
      event.targetHeroIds.length > 0 ? event.targetHeroIds : this.heroes.map((hero) => hero.state.id);
    this.heroScheduler.setPlayerDirective(event.text, targetHeroIds);
    if (this.mode === 'battle' && this.stateManager.getState().phase === 'init') {
      this.planningRequested = true;
    }
  }

  startBattle(): void {
    if (this.mode !== 'battle') {
      return;
    }

    if (this.stateManager.getState().phase === 'init') {
      this.stateManager.setPhase('active');
      this.planningRequested = false;
    }
  }

  getObstacleDescription(): string {
    return this.obstacleSystem.describe();
  }

  init(scene: Scene, config: BattleConfig): void {
    this.sessionId = this.createSessionId();
    this.nodeId = config.nodeId;
    this.floorNumber = config.floorNumber;
    this.mode = config.mode ?? 'battle';
    this.layout = config.layout ?? {};
    this.feedbackOverlay = new FeedbackOverlay(scene);
    this.battleGrid = new BattleGrid(
      this.layout.mapSummary ?? DEFAULT_BATTLE_MAP,
      this.resolveObstacleLayout()
    );
    this.initObstacles(scene);
    this.movementSystem.setBattleGrid(this.battleGrid);
    this.movementSystem.setObstacles(this.obstacleSystem);
    this.targetingSystem.setBattleGrid(this.battleGrid);
    this.targetingSystem.setObstacles(this.obstacleSystem);
    this.combatSystem.setBattleGrid(this.battleGrid);
    this.combatSystem.setObstacles(this.obstacleSystem);
    this.feedbackOverlay.setGrid(this.battleGrid);
    this.heroScheduler.setBattleGrid(this.battleGrid);

    this.spawnHero(scene);
    this.spawnAlliedArmy(scene);

    if (this.mode === 'playground') {
      this.spawnPlaygroundTargets(scene);
    } else if (config.floorNumber) {
      this.spawnPortalFloorArmy(scene, config.floorNumber);
    } else {
      this.spawnGenericEnemyArmy(scene, config.difficulty);
    }

    this.heroScheduler.setTerrainDescription(this.buildTerrainDescription());

    // Initialize vocabulary with nicknames for all units
    this.heroScheduler.initVocabulary(
      this.alliedUnits.map((unit) => unit.state),
      this.enemyUnits.map((unit) => unit.state)
    );

    this.stateManager.init(
      this.sessionId,
      this.nodeId,
      this.alliedUnits.map((unit) => unit.state),
      this.enemyUnits.map((unit) => unit.state),
      this.heroes.map((hero) => hero.state),
      this.obstacleSystem.getObstacles(),
      this.battleGrid.getSummary(),
      this.mode,
      this.floorNumber
    );
    this.stateManager.setPhase(this.mode === 'battle' ? 'init' : 'active');
  }

  update(dt: number): BattleResult {
    const state = this.stateManager.getState();

    if (state.phase === 'init') {
      if (this.shouldProcessPlanning()) {
        this.heroScheduler.update(dt, this.heroes, state, this.alliedUnits, this.enemyUnits);
      }

      this.syncVisuals();
      this.feedbackOverlay?.update(this.heroes, this.alliedUnits, this.enemyUnits);
      return null;
    }

    if (state.phase !== 'active') {
      return null;
    }

    this.stateManager.updateTime(dt);

    this.heroScheduler.update(dt, this.heroes, this.stateManager.getState(), this.alliedUnits, this.enemyUnits);
    this.targetingSystem.update(this.alliedUnits, this.enemyUnits);
    this.movementSystem.update(this.alliedUnits, this.enemyUnits, dt);
    this.targetingSystem.update(this.alliedUnits, this.enemyUnits);
    const damageEvents = this.combatSystem.update(
      this.alliedUnits,
      this.enemyUnits,
      dt,
      this.stateManager.getState().timeSec
    );
    this.stateManager.recordDamage(damageEvents);
    if (damageEvents.length > 0) {
      this.allDamageEvents.push(...damageEvents);
    }

    this.syncVisuals();

    this.feedbackOverlay?.showDamageEvents(damageEvents, [...this.alliedUnits, ...this.enemyUnits]);
    this.feedbackOverlay?.update(this.heroes, this.alliedUnits, this.enemyUnits);

    return this.winConditionCheck();
  }

  getState(): BattleState {
    return this.stateManager.getState();
  }

  getAllDamageEvents(): DamageEvent[] {
    return this.allDamageEvents;
  }

  getAIStats(): { llmCallCount: number; fallbackCount: number; lastLatencyMs: number } {
    return {
      llmCallCount: this.ollamaBrain.llmCallCount,
      fallbackCount: this.ollamaBrain.fallbackCount,
      lastLatencyMs: this.ollamaBrain.lastLatencyMs,
    };
  }

  private shouldProcessPlanning(): boolean {
    if (this.mode !== 'battle') {
      return false;
    }

    if (this.planningRequested) {
      return true;
    }

    return this.heroes.some((hero) => Boolean(hero.state.currentDirective || hero.state.currentDecision));
  }

  private initObstacles(scene: Scene): void {
    this.obstacleSystem.init(scene, {
      layout: this.resolveObstacleLayout(),
      worldWidth: this.battleGrid.width,
      worldHeight: this.battleGrid.height,
    });
  }

  private spawnHero(scene: Scene): void {
    const heroConfig = DEFAULT_HEROES[0];
    const heroSpawn = this.layout.heroSpawn ?? { x: 60, y: 380 };
    const heroPlacement = this.resolveSpawnPlacement(heroSpawn);
    const heroUnitState = createUnitState('allied', 'hero', heroPlacement.tile, heroPlacement.position, {
      displayName: heroConfig.name,
      assignedHeroId: heroConfig.id,
    });
    const heroUnit = new Unit(scene, heroUnitState);
    heroUnit.labelText?.destroy();
    heroUnit.labelText = undefined;
    this.alliedUnits.push(heroUnit);

    const heroState = createHeroState(
      heroConfig,
      heroUnit.id,
      heroPlacement.tile,
      heroPlacement.position
    );
    this.heroes.push(new Hero(scene, heroState, heroUnit));
  }

  private spawnAlliedArmy(scene: Scene): void {
    const alliedComposition: ArmyComposition[] = [
      { role: 'warrior', count: 3 },
      { role: 'archer', count: 2 },
    ];
    const ownerHeroId = this.heroes[0]?.state.id;

    let yOffset = 200;
    let spawnIndex = 0;
    for (const composition of alliedComposition) {
      for (let i = 0; i < composition.count; i++) {
        const currentSpawnIndex = spawnIndex++;
        const fallbackPosition: Position = { x: 100 + Math.random() * 80, y: yOffset + i * 100 };
        const placement =
          this.layout.alliedSpawns && this.layout.alliedSpawns.length > 0
            ? this.resolveSpawnPosition(this.layout.alliedSpawns, currentSpawnIndex)
            : this.resolveSpawnPlacement(fallbackPosition);
        const state = createUnitState('allied', composition.role, placement.tile, placement.position, {
          assignedHeroId: ownerHeroId,
        });
        this.alliedUnits.push(new Unit(scene, state));
      }
      yOffset += composition.count * 100 + 30;
    }
  }

  private spawnGenericEnemyArmy(scene: Scene, difficulty: number): void {
    const enemyCount = Math.ceil(difficulty);
    const enemyComposition: ArmyComposition[] = [
      { role: 'warrior', count: 2 + enemyCount },
      { role: 'archer', count: 1 + Math.floor(difficulty) },
    ];

    let yOffset = 200;
    let spawnIndex = 0;
    for (const composition of enemyComposition) {
      for (let i = 0; i < composition.count; i++) {
        const currentSpawnIndex = spawnIndex++;
        const fallbackPosition: Position = { x: 800 + Math.random() * 80, y: yOffset + i * 90 };
        const placement =
          this.layout.enemySpawns && this.layout.enemySpawns.length > 0
            ? this.resolveSpawnPosition(this.layout.enemySpawns, currentSpawnIndex)
            : this.resolveSpawnPlacement(fallbackPosition);
        const state = createUnitState('enemy', composition.role, placement.tile, placement.position);
        this.enemyUnits.push(new Unit(scene, state));
      }
      yOffset += composition.count * 90 + 20;
    }
  }

  private spawnPortalFloorArmy(scene: Scene, floorNumber: PortalFloorNumber): void {
    const floorConfig = getPortalFloorConfig(floorNumber);
    const nameCounts = new Map<string, number>();
    let spawnIndex = 0;

    for (const group of floorConfig.enemies) {
      const variant = getEnemyVariantDefinition(group.variantId);

      for (let i = 0; i < group.count; i++) {
        const currentSpawnIndex = spawnIndex++;
        const fallbackPosition: Position = { x: 800 + Math.random() * 80, y: 200 + currentSpawnIndex * 54 };
        const placement =
          this.layout.enemySpawns && this.layout.enemySpawns.length > 0
            ? this.resolveSpawnPosition(this.layout.enemySpawns, currentSpawnIndex)
            : this.resolveSpawnPlacement(fallbackPosition);
        const nextNameIndex = (nameCounts.get(variant.displayName) ?? 0) + 1;
        nameCounts.set(variant.displayName, nextNameIndex);
        const scaledHp = Math.max(
          1,
          Math.round(UNIT_CONFIGS[variant.role].hp * floorConfig.statMultiplier)
        );
        const scaledAttack = Math.max(
          1,
          Math.round(UNIT_CONFIGS[variant.role].attack * floorConfig.statMultiplier)
        );
        const state = createUnitState('enemy', variant.role, placement.tile, placement.position, {
          variantId: group.variantId,
          displayName: `${variant.displayName} ${nextNameIndex}`,
          hp: scaledHp,
          maxHp: scaledHp,
          attack: scaledAttack,
        });
        this.enemyUnits.push(new Unit(scene, state));
      }
    }
  }

  private spawnPlaygroundTargets(scene: Scene): void {
    const targets =
      this.layout.playgroundTargets && this.layout.playgroundTargets.length > 0
        ? this.layout.playgroundTargets
        : PLAYGROUND_TARGETS;

    for (const target of targets) {
      const placement = this.resolveSpawnPlacement(target.position);
      const state = createUnitState('enemy', target.role, placement.tile, placement.position, {
        displayName: target.name,
        hp: 9999,
        maxHp: 9999,
        attack: 0,
        attackRange: 0,
        attackSpeed: 0,
        moveSpeed: 0,
        isPassive: true,
        isInvulnerable: true,
      });
      this.enemyUnits.push(new Unit(scene, state));
    }
  }

  private buildTerrainDescription(): string {
    if (this.mode !== 'playground') {
      if (!this.floorNumber) {
        return this.obstacleSystem.describe();
      }

      return `${this.obstacleSystem.describe()}
  Portal floor ${this.floorNumber} is active. Expect stronger enemies on higher floors.`;
    }

    const targets = this.enemyUnits
      .map(
        (unit) =>
          `  - ${unit.state.displayName} [${unit.id}] at (${Math.round(unit.state.position.x)}, ${Math.round(unit.state.position.y)}) is a passive training target`
      )
      .join('\n');

    return `${this.obstacleSystem.describe()}
  Playground mode: there are no hostile enemies here.
  Use the named training targets to test routing and obedience.
${targets}`;
  }

  private winConditionCheck(): BattleResult {
    if (this.mode === 'playground') {
      return null;
    }

    const heroAlive = this.heroes.every((hero) => this.getHeroCombatUnit(hero)?.isAlive() === true);
    if (!heroAlive) {
      this.stateManager.setPhase('ended');
      return 'enemy_win';
    }

    const alliedAlive = this.alliedUnits.some((unit) => unit.isAlive());
    const enemyAlive = this.enemyUnits.some((unit) => unit.isAlive());

    if (!enemyAlive) {
      this.stateManager.setPhase('ended');
      return 'allied_win';
    }
    if (!alliedAlive) {
      this.stateManager.setPhase('ended');
      return 'enemy_win';
    }
    return null;
  }

  destroy(): void {
    this.stopHealthChecks?.();
    this.ollamaBrain.resetConversation();
    this.feedbackOverlay?.destroy();
    this.obstacleSystem.destroy();

    for (const hero of this.heroes) {
      hero.destroy();
    }
    for (const unit of [...this.alliedUnits, ...this.enemyUnits]) {
      unit.destroy();
    }

    this.alliedUnits = [];
    this.enemyUnits = [];
    this.heroes = [];
    this.allDamageEvents = [];
    this.mode = 'battle';
    this.planningRequested = false;
    this.layout = {};
    this.nodeId = '';
    this.floorNumber = undefined;
    this.sessionId = '';
  }

  private syncVisuals(): void {
    for (const unit of [...this.alliedUnits, ...this.enemyUnits]) {
      unit.syncVisuals();
    }
    for (const hero of this.heroes) {
      hero.syncVisuals();
    }
  }

  private getHeroCombatUnit(hero: Hero): Unit | undefined {
    return this.alliedUnits.find((unit) => unit.id === hero.state.combatUnitId);
  }

  private resolveSpawnPosition(
    spawns: Position[],
    index: number
  ): { tile: TileCoord; position: Position } {
    const anchor = spawns[index % spawns.length];
    const cycle = Math.floor(index / spawns.length);

    if (cycle === 0) {
      return this.resolveSpawnPlacement(anchor);
    }

    const anchorTile = this.battleGrid.worldToTile(anchor);
    const offset = this.spawnOffsetForIndex(index);
    const offsetTile = this.battleGrid.findNearestWalkableTile({
      col: anchorTile.col + offset.col,
      row: anchorTile.row + offset.row,
    });

    return {
      tile: offsetTile,
      position: this.battleGrid.tileToWorld(offsetTile),
    };
  }

  private resolveSpawnPlacement(position: Position): { tile: TileCoord; position: Position } {
    const tile = this.battleGrid.findNearestWalkableTile(this.battleGrid.worldToTile(position));
    return {
      tile,
      position: this.battleGrid.tileToWorld(tile),
    };
  }

  private resolveObstacleLayout(): Obstacle[] {
    if (this.layout.obstacles && this.layout.obstacles.length > 0) {
      return this.layout.obstacles;
    }

    if (this.mode === 'playground') {
      return DEFAULT_PLAYGROUND_LAYOUT;
    }

    return [];
  }

  private spawnOffsetForIndex(index: number): TileCoord {
    const ring = [
      { col: 1, row: 0 },
      { col: -1, row: 0 },
      { col: 0, row: 1 },
      { col: 0, row: -1 },
      { col: 1, row: 1 },
      { col: 1, row: -1 },
      { col: -1, row: 1 },
      { col: -1, row: -1 },
    ];

    const cycle = Math.max(1, Math.floor(index / Math.max(1, ring.length)) + 1);
    const base = ring[index % ring.length];
    return {
      col: base.col * cycle,
      row: base.row * cycle,
    };
  }

  private createSessionId(): string {
    return `battle-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }
}
