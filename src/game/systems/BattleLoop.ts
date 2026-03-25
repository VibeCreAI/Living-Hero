import { Scene } from 'phaser';
import { UnitRole, Position, BattleResult, BattleState, PlayerCommand } from '../types';
import { Unit, createUnitState } from '../entities/Unit';
import { Hero, createHeroState } from '../entities/Hero';
import { BattleStateManager } from '../state/BattleState';
import { CommandSystem } from './CommandSystem';
import { MovementSystem } from './MovementSystem';
import { TargetingSystem } from './TargetingSystem';
import { CombatSystem } from './CombatSystem';
import { HeroScheduler } from '../ai/HeroScheduler';
import { LocalRuleBasedHeroBrain } from '../ai/LocalRuleBasedHeroBrain';
import { DEFAULT_HEROES } from '../data/heroes';

interface BattleConfig {
  difficulty: number;
}

interface ArmyComposition {
  role: UnitRole;
  count: number;
}

export class BattleLoop {
  private stateManager: BattleStateManager;
  private commandSystem: CommandSystem;
  private movementSystem: MovementSystem;
  private targetingSystem: TargetingSystem;
  private combatSystem: CombatSystem;
  private heroScheduler: HeroScheduler;

  alliedUnits: Unit[] = [];
  enemyUnits: Unit[] = [];
  heroes: Hero[] = [];

  constructor() {
    this.stateManager = new BattleStateManager();
    this.commandSystem = new CommandSystem();
    this.movementSystem = new MovementSystem();
    this.targetingSystem = new TargetingSystem();
    this.combatSystem = new CombatSystem();
    this.heroScheduler = new HeroScheduler(new LocalRuleBasedHeroBrain());
  }

  init(scene: Scene, config: BattleConfig): void {
    const alliedComp: ArmyComposition[] = [
      { role: 'warrior', count: 3 },
      { role: 'archer', count: 2 },
    ];

    const enemyCount = Math.ceil(config.difficulty);
    const enemyComp: ArmyComposition[] = [
      { role: 'warrior', count: 2 + enemyCount },
      { role: 'archer', count: 1 + Math.floor(config.difficulty) },
    ];

    // Spawn allied units on left side
    let yOffset = 200;
    for (const comp of alliedComp) {
      for (let i = 0; i < comp.count; i++) {
        const pos: Position = { x: 100 + Math.random() * 80, y: yOffset + i * 100 };
        const state = createUnitState('allied', comp.role, pos);
        const unit = new Unit(scene, state);
        this.alliedUnits.push(unit);
      }
      yOffset += comp.count * 100 + 30;
    }

    // Spawn enemy units on right side
    yOffset = 200;
    for (const comp of enemyComp) {
      for (let i = 0; i < comp.count; i++) {
        const pos: Position = { x: 800 + Math.random() * 80, y: yOffset + i * 90 };
        const state = createUnitState('enemy', comp.role, pos);
        const unit = new Unit(scene, state);
        this.enemyUnits.push(unit);
      }
      yOffset += comp.count * 90 + 20;
    }

    // Spawn hero
    const heroConfig = DEFAULT_HEROES[0];
    const heroState = createHeroState(heroConfig, { x: 60, y: 380 });
    const hero = new Hero(scene, heroState);
    this.heroes.push(hero);

    // Initialize state manager
    this.stateManager.init(
      this.alliedUnits.map((u) => u.state),
      this.enemyUnits.map((u) => u.state),
      this.heroes.map((h) => h.state)
    );
    this.stateManager.setPhase('active');
  }

  setCommand(cmd: PlayerCommand): void {
    this.commandSystem.setCommand(cmd);
  }

  update(dt: number): BattleResult {
    if (this.stateManager.getState().phase !== 'active') return null;

    this.stateManager.updateTime(dt);

    // TDD-specified update order
    this.commandSystem.update(this.heroes);
    this.heroScheduler.update(
      dt,
      this.heroes,
      this.stateManager.getState(),
      this.alliedUnits,
      this.enemyUnits
    );
    this.movementSystem.update(this.alliedUnits, this.enemyUnits, dt);
    this.targetingSystem.update(
      this.alliedUnits,
      this.enemyUnits,
      this.commandSystem.getCommand()
    );
    this.combatSystem.update(this.alliedUnits, this.enemyUnits, dt);

    // Sync visuals
    for (const unit of [...this.alliedUnits, ...this.enemyUnits]) {
      unit.syncVisuals();
    }

    return this.winConditionCheck();
  }

  getState(): BattleState {
    return this.stateManager.getState();
  }

  private winConditionCheck(): BattleResult {
    const alliedAlive = this.alliedUnits.some((u) => u.isAlive());
    const enemyAlive = this.enemyUnits.some((u) => u.isAlive());

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
    for (const unit of [...this.alliedUnits, ...this.enemyUnits]) {
      unit.destroy();
    }
    for (const hero of this.heroes) {
      hero.destroy();
    }
    this.alliedUnits = [];
    this.enemyUnits = [];
    this.heroes = [];
  }
}
