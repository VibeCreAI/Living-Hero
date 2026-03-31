import {
  GroupOrder,
  HeroDecision,
  TileCoord,
  UnitGroup,
  UnitOrderMode,
  UnitRole,
} from '../types';
import { Hero } from '../entities/Hero';
import { Unit } from '../entities/Unit';
import { BattleGrid } from '../systems/BattleGrid';

const ADVANCE_RADIUS = 150;
const FOCUS_RADIUS = 180;
const HOLD_RADIUS = 90;
const PROTECT_RADIUS = 120;
const RETREAT_RADIUS = 75;

const WARRIOR_FOCUS_LEASH = 280;
const ARCHER_FOCUS_LEASH = 130;
const HERO_FOCUS_LEASH = 320;
const WARRIOR_ADVANCE_LEASH = 240;
const ARCHER_ADVANCE_LEASH = 135;
const HERO_ADVANCE_LEASH = 270;
const WARRIOR_HOLD_LEASH = 170;
const ARCHER_HOLD_LEASH = 105;
const HERO_HOLD_LEASH = 155;
const WARRIOR_PROTECT_LEASH = 185;
const ARCHER_PROTECT_LEASH = 115;
const HERO_PROTECT_LEASH = 180;
const WARRIOR_RETREAT_LEASH = 110;
const ARCHER_RETREAT_LEASH = 90;
const HERO_RETREAT_LEASH = 110;
const FORMATION_SLOT_STICKINESS = 1.6;
const HERO_ANCHOR_BIAS = 0.85;
const ORDER_TILE_HARD_RETENTION_RADIUS = 3.25;

interface RoleOrderSpec {
  mode: UnitOrderMode;
  anchorTile: TileCoord;
  targetId?: string;
  orderRadiusPx: number;
  leashRadiusPx: number;
  preferredTargetRole?: UnitRole;
}

interface RoleExecutionContext {
  hero: Hero;
  heroUnit?: Unit;
  allies: Unit[];
  enemies: Unit[];
  allyCenter: TileCoord;
  enemyCenter?: TileCoord;
  nearestEnemyToAnchor?: Unit;
  nearestEnemyArcher?: Unit;
  focusTarget?: Unit;
}

interface UnitAssignment {
  decision: HeroDecision;
  allies: Unit[];
}

type FormationTemplate = Array<{ forward: number; side: number }>;

const WARRIOR_TEMPLATE: FormationTemplate = [
  { forward: 1, side: 0 },
  { forward: 1, side: -1 },
  { forward: 1, side: 1 },
  { forward: 2, side: 0 },
  { forward: 2, side: -1 },
  { forward: 2, side: 1 },
  { forward: 0, side: -1 },
  { forward: 0, side: 1 },
  { forward: -1, side: 0 },
];

const ARCHER_TEMPLATE: FormationTemplate = [
  { forward: -1, side: 0 },
  { forward: -1, side: -1 },
  { forward: -1, side: 1 },
  { forward: -2, side: 0 },
  { forward: -2, side: -1 },
  { forward: -2, side: 1 },
  { forward: 0, side: -1 },
  { forward: 0, side: 1 },
];

const HERO_TEMPLATE: FormationTemplate = [
  { forward: 0, side: 0 },
  { forward: 1, side: 0 },
  { forward: 1, side: -1 },
  { forward: 1, side: 1 },
  { forward: 0, side: -1 },
  { forward: 0, side: 1 },
  { forward: -1, side: 0 },
];

export class IntentExecutor {
  private battleGrid: BattleGrid | null = null;

  setBattleGrid(battleGrid: BattleGrid): void {
    this.battleGrid = battleGrid;
  }

  execute(
    hero: Hero,
    decision: HeroDecision,
    alliedUnits: Unit[],
    enemyUnits: Unit[]
  ): void {
    if (!this.battleGrid) {
      return;
    }

    const aliveAllies = alliedUnits.filter((unit) => unit.isAlive());
    const aliveEnemies = enemyUnits.filter((unit) => unit.isAlive());
    const heroUnit = aliveAllies.find((unit) => unit.id === hero.state.combatUnitId);
    const ownedAllies = aliveAllies.filter(
      (unit) => unit.state.role !== 'hero' && unit.state.assignedHeroId === hero.state.id
    );

    const orderedGroupOrders = this.sortGroupOrders(decision.groupOrders);
    const heroGroupOrder = orderedGroupOrders.find((groupOrder) => groupOrder.group === 'hero');
    const allGroupOrder = orderedGroupOrders.find((groupOrder) => groupOrder.group === 'all');
    const baseDecision = allGroupOrder
      ? this.expandGroupOrder(decision, allGroupOrder)
      : this.stripGroupOrders(decision);
    const usesScopedGroupOrders =
      decision.groupOrderMode === 'explicit_only' && orderedGroupOrders.length > 0 && !allGroupOrder;
    const formationUnits = heroUnit ? [heroUnit, ...ownedAllies] : [...ownedAllies];
    const claimedTiles = new Set<string>();
    let heroAssignment: UnitAssignment | undefined;
    const allyAssignments = new Map<string, UnitAssignment>();

    if (!usesScopedGroupOrders) {
      if (heroUnit?.isAlive()) {
        heroAssignment = {
          decision: this.cloneDecision(baseDecision),
          allies: ownedAllies,
        };
      }

      for (const ally of ownedAllies) {
        allyAssignments.set(ally.id, {
          decision: this.cloneDecision(baseDecision),
          allies: ownedAllies,
        });
      }
    }

    if (heroGroupOrder && heroUnit?.isAlive()) {
      heroAssignment = {
        decision: this.expandGroupOrder(decision, heroGroupOrder),
        allies: ownedAllies,
      };
    }

    for (const groupOrder of orderedGroupOrders) {
      if (groupOrder.group === 'hero' || groupOrder.group === 'all') {
        continue;
      }

      const groupUnits = this.selectGroupUnits(groupOrder.group, ownedAllies);
      if (groupUnits.length === 0) {
        continue;
      }

      const groupDecision = this.expandGroupOrder(decision, groupOrder);
      for (const unit of groupUnits) {
        allyAssignments.set(unit.id, {
          decision: groupDecision,
          allies: groupUnits,
        });
      }
    }

    if (heroUnit && heroAssignment) {
      this.applyUnitAssignment(
        hero,
        heroUnit,
        heroUnit,
        heroAssignment.decision,
        heroAssignment.allies,
        formationUnits,
        aliveEnemies,
        claimedTiles
      );
    }

    const orderedAllies = [...ownedAllies].sort((a, b) => {
      const rolePriority = a.state.role === b.state.role
        ? 0
        : a.state.role === 'warrior'
          ? -1
          : 1;
      if (rolePriority !== 0) {
        return rolePriority;
      }
      return a.id.localeCompare(b.id);
    });

    for (const ally of orderedAllies) {
      const assignment = allyAssignments.get(ally.id);
      if (!assignment) {
        continue;
      }

      this.applyUnitAssignment(
        hero,
        heroUnit,
        ally,
        assignment.decision,
        assignment.allies,
        formationUnits,
        aliveEnemies,
        claimedTiles
      );
    }
  }

  private applyUnitAssignment(
    hero: Hero,
    heroUnit: Unit | undefined,
    unit: Unit,
    decision: HeroDecision,
    allies: Unit[],
    formationUnits: Unit[],
    enemies: Unit[],
    claimedTiles: Set<string>
  ): void {
    if (!unit.isAlive() || !this.battleGrid) {
      return;
    }

    const context = this.buildExecutionContext(hero, heroUnit, decision, allies, enemies);
    const spec = this.buildSpecForUnit(decision, context, unit);
    if (!spec) {
      return;
    }

    const orderTile = this.assignFormationTile(
      spec.anchorTile,
      context,
      unit,
      formationUnits,
      claimedTiles
    );
    this.applyOrder(unit, spec, orderTile);
    unit.state.targetId = spec.targetId;
  }

  private cloneDecision(decision: HeroDecision): HeroDecision {
    return {
      ...decision,
      moveToTile: decision.moveToTile ? { ...decision.moveToTile } : undefined,
      groupOrders: undefined,
    };
  }

  private buildExecutionContext(
    hero: Hero,
    heroUnit: Unit | undefined,
    decision: HeroDecision,
    allies: Unit[],
    enemies: Unit[]
  ): RoleExecutionContext {
    const allyReference = allies.length > 0 ? allies : heroUnit ? [heroUnit] : [];
    const allyCenter = this.clusterCenter(allyReference);
    const enemyCenter = enemies.length > 0 ? this.clusterCenter(enemies) : undefined;
    const anchor = decision.moveToTile ?? allyCenter;

    return {
      hero,
      heroUnit,
      allies,
      enemies,
      allyCenter,
      enemyCenter,
      nearestEnemyToAnchor: this.findNearestToPoint(anchor, enemies),
      nearestEnemyArcher: this.findNearestEnemyByRole(anchor, enemies, 'archer'),
      focusTarget: decision.targetId ? enemies.find((enemy) => enemy.id === decision.targetId) : undefined,
    };
  }

  private buildSpecForUnit(
    decision: HeroDecision,
    context: RoleExecutionContext,
    unit: Unit
  ): RoleOrderSpec | undefined {
    const anchor =
      decision.intent === 'focus_enemy'
        ? context.focusTarget?.state.tile ??
          decision.moveToTile ??
          context.nearestEnemyToAnchor?.state.tile ??
          context.allyCenter
        : decision.moveToTile ?? context.allyCenter;

    const isHero = unit.state.role === 'hero';
    const role = unit.state.role;

    switch (decision.intent) {
      case 'advance_to_point':
        return {
          mode: 'advance',
          anchorTile: anchor,
          targetId: decision.targetId,
          orderRadiusPx: role === 'archer' ? ADVANCE_RADIUS - 35 : ADVANCE_RADIUS,
          leashRadiusPx: isHero
            ? HERO_ADVANCE_LEASH
            : role === 'warrior'
              ? WARRIOR_ADVANCE_LEASH
              : ARCHER_ADVANCE_LEASH,
          preferredTargetRole: context.nearestEnemyArcher ? 'archer' : undefined,
        };

      case 'focus_enemy':
        return {
          mode: 'focus',
          anchorTile: anchor,
          targetId: context.focusTarget?.id ?? decision.targetId,
          orderRadiusPx: role === 'archer' ? FOCUS_RADIUS - 55 : FOCUS_RADIUS,
          leashRadiusPx: isHero
            ? HERO_FOCUS_LEASH
            : role === 'warrior'
              ? WARRIOR_FOCUS_LEASH
              : ARCHER_FOCUS_LEASH,
          preferredTargetRole:
            context.focusTarget?.state.role ??
            (context.nearestEnemyArcher ? 'archer' : undefined),
        };

      case 'protect_target':
        return {
          mode: 'protect',
          anchorTile: decision.moveToTile ?? context.hero.state.tile,
          targetId: context.nearestEnemyToAnchor?.id,
          orderRadiusPx: role === 'archer' ? PROTECT_RADIUS - 30 : PROTECT_RADIUS,
          leashRadiusPx: isHero
            ? HERO_PROTECT_LEASH
            : role === 'warrior'
              ? WARRIOR_PROTECT_LEASH
              : ARCHER_PROTECT_LEASH,
          preferredTargetRole: context.nearestEnemyToAnchor?.state.role,
        };

      case 'retreat_to_point':
        return {
          mode: 'retreat',
          anchorTile: decision.moveToTile ?? context.hero.state.tile,
          orderRadiusPx: role === 'warrior' ? RETREAT_RADIUS + 15 : RETREAT_RADIUS,
          leashRadiusPx: isHero
            ? HERO_RETREAT_LEASH
            : role === 'warrior'
              ? WARRIOR_RETREAT_LEASH
              : ARCHER_RETREAT_LEASH,
        };

      case 'hold_position':
        return {
          mode: 'hold',
          anchorTile: decision.moveToTile ?? context.hero.state.tile,
          orderRadiusPx: role === 'warrior' ? HOLD_RADIUS + 24 : HOLD_RADIUS - 20,
          leashRadiusPx: isHero
            ? HERO_HOLD_LEASH
            : role === 'warrior'
              ? WARRIOR_HOLD_LEASH
              : ARCHER_HOLD_LEASH,
          preferredTargetRole: context.nearestEnemyArcher ? 'archer' : undefined,
        };

      case 'use_skill':
        return undefined;
    }
  }

  private assignFormationTile(
    anchorTile: TileCoord,
    context: RoleExecutionContext,
    unit: Unit,
    formationUnits: Unit[],
    claimed = new Set<string>()
  ): TileCoord {
    if (!this.battleGrid) {
      return anchorTile;
    }

    const forward = this.getForwardVector(anchorTile, context);
    const right = { col: -forward.row, row: forward.col };
    const template =
      unit.state.role === 'warrior'
        ? WARRIOR_TEMPLATE
        : unit.state.role === 'archer'
          ? ARCHER_TEMPLATE
          : HERO_TEMPLATE;

    const otherAllies = formationUnits.filter((ally) => ally.id !== unit.id);
    const occupiedTiles = otherAllies.map((ally) => ally.state.tile);
    const retainedOrderTile = this.resolveRetainedOrderTile(unit, anchorTile, claimed);
    if (retainedOrderTile) {
      claimed.add(this.battleGrid.tileKey(retainedOrderTile));
      return retainedOrderTile;
    }

    const scoredCandidates = new Map<string, { tile: TileCoord; cost: number }>();

    for (const offset of template) {
      const candidate = this.battleGrid.findNearestWalkableTile({
        col: anchorTile.col + forward.col * offset.forward + right.col * offset.side,
        row: anchorTile.row + forward.row * offset.forward + right.row * offset.side,
      });
      const key = this.battleGrid.tileKey(candidate);
      if (claimed.has(key)) {
        continue;
      }

      scoredCandidates.set(key, {
        tile: candidate,
        cost: this.scoreFormationCandidate(unit, candidate, anchorTile, occupiedTiles),
      });
    }

    const orderedCandidates = [...scoredCandidates.values()].sort((a, b) => {
      if (a.cost !== b.cost) {
        return a.cost - b.cost;
      }
      if (a.tile.row !== b.tile.row) {
        return a.tile.row - b.tile.row;
      }
      return a.tile.col - b.tile.col;
    });

    const selected = orderedCandidates[0]?.tile ?? this.battleGrid.findNearestWalkableTile(anchorTile);
    claimed.add(this.battleGrid.tileKey(selected));
    return selected;
  }

  private scoreFormationCandidate(
    unit: Unit,
    candidate: TileCoord,
    anchorTile: TileCoord,
    occupiedTiles: TileCoord[]
  ): number {
    if (!this.battleGrid) {
      return Number.POSITIVE_INFINITY;
    }

    let cost = this.battleGrid.estimatePathCost(unit.state.tile, candidate, {
      occupiedTiles,
    });

    if (unit.state.orderTile && this.battleGrid.tilesEqual(unit.state.orderTile, candidate)) {
      cost -= FORMATION_SLOT_STICKINESS;
    }

    if (unit.state.role === 'hero' && this.battleGrid.tilesEqual(candidate, anchorTile)) {
      cost -= HERO_ANCHOR_BIAS;
    }

    return cost;
  }

  private resolveRetainedOrderTile(
    unit: Unit,
    anchorTile: TileCoord,
    claimed: Set<string>
  ): TileCoord | undefined {
    if (!this.battleGrid || !unit.state.orderTile) {
      return undefined;
    }

    const retained = this.battleGrid.findNearestWalkableTile(unit.state.orderTile);
    if (claimed.has(this.battleGrid.tileKey(retained))) {
      return undefined;
    }

    return this.battleGrid.distance(retained, anchorTile) <= ORDER_TILE_HARD_RETENTION_RADIUS
      ? retained
      : undefined;
  }

  private getForwardVector(anchorTile: TileCoord, context: RoleExecutionContext): TileCoord {
    const threatTile = context.focusTarget?.state.tile ?? context.enemyCenter;
    if (!threatTile) {
      return { col: 1, row: 0 };
    }

    const dx = Math.sign(threatTile.col - anchorTile.col);
    const dy = Math.sign(threatTile.row - anchorTile.row);
    if (dx === 0 && dy === 0) {
      return { col: 1, row: 0 };
    }
    return { col: dx, row: dy };
  }

  private applyOrder(unit: Unit, spec: RoleOrderSpec, orderTile: TileCoord): void {
    if (!this.battleGrid) {
      return;
    }

    unit.state.orderMode = spec.mode;
    unit.state.orderTile = { ...orderTile };
    unit.state.orderTargetId = spec.targetId;
    unit.state.orderRadiusTiles = this.battleGrid.pixelsToRadiusTiles(spec.orderRadiusPx);
    unit.state.orderLeashTiles = this.battleGrid.pixelsToRadiusTiles(spec.leashRadiusPx);
    unit.state.orderPreferredTargetRole = spec.preferredTargetRole;
  }

  private findNearestEnemyByRole(point: TileCoord, enemies: Unit[], role: UnitRole): Unit | undefined {
    return this.findNearestToPoint(
      point,
      enemies.filter((enemy) => enemy.state.role === role)
    );
  }

  private clusterCenter(units: Unit[]): TileCoord {
    if (!this.battleGrid || units.length === 0) {
      return { col: 0, row: 0 };
    }

    let sumCol = 0;
    let sumRow = 0;
    for (const unit of units) {
      sumCol += unit.state.tile.col;
      sumRow += unit.state.tile.row;
    }

    return this.battleGrid.findNearestWalkableTile({
      col: Math.round(sumCol / units.length),
      row: Math.round(sumRow / units.length),
    });
  }

  private findNearestToPoint(point: TileCoord, enemies: Unit[]): Unit | undefined {
    if (!this.battleGrid) {
      return undefined;
    }

    let nearest: Unit | undefined;
    let nearestDistance = Infinity;
    for (const enemy of enemies) {
      const distance = this.battleGrid.distance(point, enemy.state.tile);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = enemy;
      }
    }

    return nearest;
  }

  private sortGroupOrders(groupOrders: GroupOrder[] | undefined): GroupOrder[] {
    if (!groupOrders?.length) {
      return [];
    }

    const groupPriority: Record<UnitGroup, number> = {
      all: 0,
      hero: 1,
      warriors: 1,
      archers: 1,
    };

    return [...groupOrders].sort((a, b) => groupPriority[a.group] - groupPriority[b.group]);
  }

  private selectGroupUnits(group: UnitGroup, allies: Unit[]): Unit[] {
    switch (group) {
      case 'all':
        return allies;
      case 'hero':
        return [];
      case 'warriors':
        return allies.filter((unit) => unit.state.role === 'warrior');
      case 'archers':
        return allies.filter((unit) => unit.state.role === 'archer');
    }
  }

  private stripGroupOrders(decision: HeroDecision): HeroDecision {
    return {
      ...decision,
      moveToTile: decision.moveToTile ? { ...decision.moveToTile } : undefined,
      groupOrders: undefined,
    };
  }

  private expandGroupOrder(baseDecision: HeroDecision, groupOrder: GroupOrder): HeroDecision {
    return {
      intent: groupOrder.intent,
      targetId: groupOrder.targetId,
      moveToTile: groupOrder.moveToTile ? { ...groupOrder.moveToTile } : undefined,
      skillId: undefined,
      priority: baseDecision.priority,
      rationaleTag: `${baseDecision.rationaleTag}_${groupOrder.group}`,
      recheckInSec: baseDecision.recheckInSec,
    };
  }
}
