import {
  GroupOrder,
  HeroDecision,
  Position,
  UnitGroup,
  UnitOrderMode,
  UnitRole,
} from '../types';
import { Hero } from '../entities/Hero';
import { Unit } from '../entities/Unit';

const ADVANCE_RADIUS = 150;
const FOCUS_RADIUS = 180;
const HOLD_RADIUS = 90;
const PROTECT_RADIUS = 120;
const RETREAT_RADIUS = 75;
const MAP_WIDTH = 1024;
const MAP_HEIGHT = 768;
const MAP_PADDING = 28;

const WARRIOR_FRONT_OFFSET = 56;
const ARCHER_REAR_OFFSET = 64;
const WARRIOR_FOCUS_LEASH = 280;
const ARCHER_FOCUS_LEASH = 130;
const WARRIOR_ADVANCE_LEASH = 240;
const ARCHER_ADVANCE_LEASH = 135;
const WARRIOR_HOLD_LEASH = 170;
const ARCHER_HOLD_LEASH = 105;
const WARRIOR_PROTECT_LEASH = 185;
const ARCHER_PROTECT_LEASH = 115;
const WARRIOR_RETREAT_LEASH = 110;
const ARCHER_RETREAT_LEASH = 90;

interface RoleOrderSpec {
  mode: UnitOrderMode;
  orderPoint: Position;
  targetId?: string;
  orderRadius: number;
  orderLeashRadius: number;
  preferredTargetRole?: UnitRole;
}

interface RoleExecutionContext {
  hero: Hero;
  allies: Unit[];
  enemies: Unit[];
  allyCenter: Position;
  enemyCenter?: Position;
  nearestEnemyToAnchor?: Unit;
  nearestEnemyArcher?: Unit;
  focusTarget?: Unit;
}

export class IntentExecutor {
  execute(
    hero: Hero,
    decision: HeroDecision,
    alliedUnits: Unit[],
    enemyUnits: Unit[]
  ): void {
    const aliveAllies = alliedUnits.filter((unit) => unit.isAlive());
    const aliveEnemies = enemyUnits.filter((unit) => unit.isAlive());

    const heroAnchor =
      decision.moveTo ??
      decision.groupOrders?.find((groupOrder) => groupOrder.group === 'all')?.moveTo;
    if (heroAnchor) {
      hero.setPosition(heroAnchor);
    }

    this.applyDecisionToUnits(hero, this.stripGroupOrders(decision), aliveAllies, aliveEnemies);

    const orderedGroupOrders = this.sortGroupOrders(decision.groupOrders);
    for (const groupOrder of orderedGroupOrders) {
      const groupUnits = this.selectGroupUnits(groupOrder.group, aliveAllies);
      if (groupUnits.length === 0) {
        continue;
      }

      const groupDecision = this.expandGroupOrder(decision, groupOrder);
      this.applyDecisionToUnits(hero, groupDecision, groupUnits, aliveEnemies);
    }
  }

  private applyDecisionToUnits(
    hero: Hero,
    decision: HeroDecision,
    allies: Unit[],
    enemies: Unit[]
  ): void {
    if (allies.length === 0) {
      return;
    }

    const context = this.buildExecutionContext(hero, decision, allies, enemies);

    switch (decision.intent) {
      case 'advance_to_point':
        this.executeAdvance(decision, context);
        break;
      case 'focus_enemy':
        this.executeFocus(decision, context);
        break;
      case 'protect_target':
        this.executeProtect(decision, context);
        break;
      case 'retreat_to_point':
        this.executeRetreat(decision, context);
        break;
      case 'hold_position':
        this.executeHold(decision, context);
        break;
      case 'use_skill':
        break;
    }
  }

  private buildExecutionContext(
    hero: Hero,
    decision: HeroDecision,
    allies: Unit[],
    enemies: Unit[]
  ): RoleExecutionContext {
    const allyCenter = this.clusterCenter(allies);
    const enemyCenter = enemies.length > 0 ? this.clusterCenter(enemies) : undefined;
    const anchor = decision.moveTo ?? allyCenter;

    return {
      hero,
      allies,
      enemies,
      allyCenter,
      enemyCenter,
      nearestEnemyToAnchor: this.findNearestToPoint(anchor, enemies),
      nearestEnemyArcher: this.findNearestEnemyByRole(anchor, enemies, 'archer'),
      focusTarget: decision.targetId
        ? enemies.find((enemy) => enemy.id === decision.targetId)
        : undefined,
    };
  }

  private executeAdvance(decision: HeroDecision, context: RoleExecutionContext): void {
    const anchor = decision.moveTo ?? context.allyCenter;
    const screenPoint = this.getScreenPoint(anchor, context);
    const supportPoint = this.getSupportPoint(anchor, context);
    const pressureTarget =
      context.focusTarget ??
      this.chooseWarriorPressureTarget(context, anchor) ??
      context.nearestEnemyToAnchor;

    for (const ally of context.allies) {
      const spec: RoleOrderSpec =
        ally.state.role === 'warrior'
          ? {
              mode: 'advance',
              orderPoint: screenPoint,
              targetId: decision.targetId ?? pressureTarget?.id,
              orderRadius: ADVANCE_RADIUS,
              orderLeashRadius: WARRIOR_ADVANCE_LEASH,
              preferredTargetRole: context.nearestEnemyArcher ? 'archer' : undefined,
            }
          : {
              mode: 'advance',
              orderPoint: supportPoint,
              targetId: decision.targetId,
              orderRadius: ADVANCE_RADIUS - 35,
              orderLeashRadius: ARCHER_ADVANCE_LEASH,
            };

      this.applyOrder(ally, spec);
      ally.state.targetId = spec.targetId;
    }
  }

  private executeFocus(decision: HeroDecision, context: RoleExecutionContext): void {
    const focusTarget =
      context.focusTarget ??
      this.findNearestToPoint(
        decision.moveTo ?? context.hero.state.position,
        context.enemies
      );
    const anchor = focusTarget?.state.position ?? decision.moveTo ?? context.hero.state.position;
    const screenPoint = this.getScreenPoint(anchor, context, 40);
    const supportPoint = this.getSupportPoint(anchor, context, 76);

    for (const ally of context.allies) {
      const spec: RoleOrderSpec =
        ally.state.role === 'warrior'
          ? {
              mode: 'focus',
              orderPoint: screenPoint,
              targetId: focusTarget?.id,
              orderRadius: FOCUS_RADIUS,
              orderLeashRadius: WARRIOR_FOCUS_LEASH,
              preferredTargetRole:
                focusTarget?.state.role === 'archer' || context.nearestEnemyArcher
                  ? 'archer'
                  : undefined,
            }
          : {
              mode: 'focus',
              orderPoint: supportPoint,
              targetId: focusTarget?.id,
              orderRadius: FOCUS_RADIUS - 55,
              orderLeashRadius: ARCHER_FOCUS_LEASH,
            };

      this.applyOrder(ally, spec);
      ally.state.targetId = spec.targetId;
    }
  }

  private executeProtect(decision: HeroDecision, context: RoleExecutionContext): void {
    const anchor = decision.moveTo ?? context.hero.state.position;
    const screenPoint = this.getScreenPoint(anchor, context);
    const supportPoint = this.getSupportPoint(anchor, context, 54);
    const nearestThreat = this.findNearestToPoint(anchor, context.enemies);

    for (const ally of context.allies) {
      const spec: RoleOrderSpec =
        ally.state.role === 'warrior'
          ? {
              mode: 'protect',
              orderPoint: screenPoint,
              targetId: nearestThreat?.id,
              orderRadius: PROTECT_RADIUS,
              orderLeashRadius: WARRIOR_PROTECT_LEASH,
              preferredTargetRole: nearestThreat?.state.role,
            }
          : {
              mode: 'protect',
              orderPoint: supportPoint,
              orderRadius: PROTECT_RADIUS - 30,
              orderLeashRadius: ARCHER_PROTECT_LEASH,
            };

      this.applyOrder(ally, spec);
      ally.state.targetId = spec.targetId;
    }
  }

  private executeRetreat(decision: HeroDecision, context: RoleExecutionContext): void {
    const anchor = decision.moveTo ?? context.hero.state.position;
    const rearGuardPoint = this.getScreenPoint(anchor, context, 20);
    const fallbackPoint = this.getSupportPoint(anchor, context, 72);

    for (const ally of context.allies) {
      const spec: RoleOrderSpec =
        ally.state.role === 'warrior'
          ? {
              mode: 'retreat',
              orderPoint: rearGuardPoint,
              orderRadius: RETREAT_RADIUS + 15,
              orderLeashRadius: WARRIOR_RETREAT_LEASH,
            }
          : {
              mode: 'retreat',
              orderPoint: fallbackPoint,
              orderRadius: RETREAT_RADIUS,
              orderLeashRadius: ARCHER_RETREAT_LEASH,
            };

      this.applyOrder(ally, spec);
      ally.state.targetId = undefined;
    }
  }

  private executeHold(decision: HeroDecision, context: RoleExecutionContext): void {
    const anchor = decision.moveTo ?? context.hero.state.position;
    const screenPoint = this.getScreenPoint(anchor, context);
    const supportPoint = this.getSupportPoint(anchor, context);

    for (const ally of context.allies) {
      const spec: RoleOrderSpec =
        ally.state.role === 'warrior'
          ? {
              mode: 'hold',
              orderPoint: screenPoint,
              orderRadius: HOLD_RADIUS + 24,
              orderLeashRadius: WARRIOR_HOLD_LEASH,
              preferredTargetRole: context.nearestEnemyArcher ? 'archer' : undefined,
            }
          : {
              mode: 'hold',
              orderPoint: supportPoint,
              orderRadius: HOLD_RADIUS - 20,
              orderLeashRadius: ARCHER_HOLD_LEASH,
            };

      this.applyOrder(ally, spec);
      ally.state.targetId = undefined;
    }
  }

  private applyOrder(unit: Unit, spec: RoleOrderSpec): void {
    unit.state.orderMode = spec.mode;
    unit.state.orderPoint = { ...spec.orderPoint };
    unit.state.orderTargetId = spec.targetId;
    unit.state.orderRadius = spec.orderRadius;
    unit.state.orderLeashRadius = spec.orderLeashRadius;
    unit.state.orderPreferredTargetRole = spec.preferredTargetRole;
  }

  private getScreenPoint(
    anchor: Position,
    context: RoleExecutionContext,
    distance = WARRIOR_FRONT_OFFSET
  ): Position {
    const threat = context.focusTarget?.state.position ?? context.enemyCenter;
    return threat ? this.projectPoint(anchor, threat, distance) : { ...anchor };
  }

  private getSupportPoint(
    anchor: Position,
    context: RoleExecutionContext,
    distance = ARCHER_REAR_OFFSET
  ): Position {
    const threat = context.focusTarget?.state.position ?? context.enemyCenter;
    return threat ? this.projectPoint(anchor, threat, -distance) : { ...anchor };
  }

  private chooseWarriorPressureTarget(
    context: RoleExecutionContext,
    anchor: Position
  ): Unit | undefined {
    return (
      this.findNearestEnemyByRole(anchor, context.enemies, 'archer') ??
      this.findNearestToPoint(anchor, context.enemies)
    );
  }

  private findNearestEnemyByRole(
    point: Position,
    enemies: Unit[],
    role: UnitRole
  ): Unit | undefined {
    return this.findNearestToPoint(
      point,
      enemies.filter((enemy) => enemy.state.role === role)
    );
  }

  private clusterCenter(units: Unit[]): Position {
    if (units.length === 0) {
      return { x: 512, y: 384 };
    }

    let sumX = 0;
    let sumY = 0;
    for (const unit of units) {
      sumX += unit.state.position.x;
      sumY += unit.state.position.y;
    }

    return {
      x: sumX / units.length,
      y: sumY / units.length,
    };
  }

  private findNearestToPoint(point: Position, enemies: Unit[]): Unit | undefined {
    let nearest: Unit | undefined;
    let nearestDistance = Infinity;

    for (const enemy of enemies) {
      const distance = Math.hypot(
        enemy.state.position.x - point.x,
        enemy.state.position.y - point.y
      );
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = enemy;
      }
    }

    return nearest;
  }

  private projectPoint(from: Position, toward: Position, distance: number): Position {
    const dx = toward.x - from.x;
    const dy = toward.y - from.y;
    const length = Math.hypot(dx, dy);

    if (length < 1) {
      return { ...from };
    }

    return {
      x: this.clamp(from.x + (dx / length) * distance, MAP_PADDING, MAP_WIDTH - MAP_PADDING),
      y: this.clamp(from.y + (dy / length) * distance, MAP_PADDING, MAP_HEIGHT - MAP_PADDING),
    };
  }

  private sortGroupOrders(groupOrders: GroupOrder[] | undefined): GroupOrder[] {
    if (!groupOrders?.length) {
      return [];
    }

    const groupPriority: Record<UnitGroup, number> = {
      all: 0,
      warriors: 1,
      archers: 1,
    };

    return [...groupOrders].sort((a, b) => groupPriority[a.group] - groupPriority[b.group]);
  }

  private selectGroupUnits(group: UnitGroup, allies: Unit[]): Unit[] {
    switch (group) {
      case 'all':
        return allies;
      case 'warriors':
        return allies.filter((unit) => unit.state.role === 'warrior');
      case 'archers':
        return allies.filter((unit) => unit.state.role === 'archer');
    }
  }

  private stripGroupOrders(decision: HeroDecision): HeroDecision {
    return {
      ...decision,
      moveTo: decision.moveTo ? { ...decision.moveTo } : undefined,
      groupOrders: undefined,
    };
  }

  private expandGroupOrder(baseDecision: HeroDecision, groupOrder: GroupOrder): HeroDecision {
    return {
      intent: groupOrder.intent,
      targetId: groupOrder.targetId,
      moveTo: groupOrder.moveTo ? { ...groupOrder.moveTo } : undefined,
      skillId: undefined,
      priority: baseDecision.priority,
      rationaleTag: `${baseDecision.rationaleTag}_${groupOrder.group}`,
      recheckInSec: baseDecision.recheckInSec,
    };
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
