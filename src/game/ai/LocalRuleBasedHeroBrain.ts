import { IHeroDecisionProvider } from './HeroDecisionProvider';
import { HeroDecision, HeroSummary, TileCoord } from '../types';
import { refineDecisionPositionForCover } from './cover';

export class LocalRuleBasedHeroBrain implements IHeroDecisionProvider {
  decide(summary: HeroSummary): HeroDecision {
    const allies = summary.nearbyAllies;
    const enemies = summary.nearbyEnemies;
    const allyHpPct =
      allies.length > 0
        ? allies.reduce((sum, ally) => sum + ally.hp / ally.maxHp, 0) / allies.length
        : 1;

    if (enemies.length === 0) {
      return {
        intent: 'hold_position',
        moveToTile: { ...summary.heroState.tile },
        priority: 'low',
        rationaleTag: 'fallback_no_enemies',
        recheckInSec: 3,
      };
    }

    let decision: HeroDecision;
    if (allyHpPct < 0.35) {
      decision = this.protectDecision(allies.map((ally) => ({ tile: ally.tile, hp: ally.hp })));
    } else if (allyHpPct < 0.55 && allies.length <= enemies.length) {
      decision = this.holdDecision(summary.heroState.tile);
    } else {
      decision = this.advanceDecision(enemies.map((enemy) => enemy.tile), summary);
    }

    return refineDecisionPositionForCover(summary, decision);
  }

  private advanceDecision(enemies: TileCoord[], summary: HeroSummary): HeroDecision {
    return {
      intent: 'advance_to_point',
      moveToTile: this.clusterCenter(enemies, summary),
      priority: 'medium',
      rationaleTag: 'advance_toward_enemies',
      recheckInSec: 2,
    };
  }

  private protectDecision(allies: Array<{ tile: TileCoord; hp: number }>): HeroDecision {
    if (allies.length === 0) {
      return {
        intent: 'hold_position',
        priority: 'low',
        rationaleTag: 'no_allies_to_protect',
        recheckInSec: 1,
      };
    }

    let weakest = allies[0];
    for (const ally of allies) {
      if (ally.hp < weakest.hp) {
        weakest = ally;
      }
    }

    return {
      intent: 'protect_target',
      moveToTile: { ...weakest.tile },
      priority: 'medium',
      rationaleTag: 'protect_weakest_ally',
      recheckInSec: 2,
    };
  }

  private holdDecision(heroTile: TileCoord): HeroDecision {
    return {
      intent: 'hold_position',
      moveToTile: { ...heroTile },
      priority: 'medium',
      rationaleTag: 'hold_ordered',
      recheckInSec: 3,
    };
  }

  private clusterCenter(tiles: TileCoord[], summary: HeroSummary): TileCoord {
    if (tiles.length === 0) {
      return { col: Math.floor(summary.grid.cols / 2), row: Math.floor(summary.grid.rows / 2) };
    }

    let sumCol = 0;
    let sumRow = 0;
    for (const tile of tiles) {
      sumCol += tile.col;
      sumRow += tile.row;
    }

    return {
      col: Math.round(sumCol / tiles.length),
      row: Math.round(sumRow / tiles.length),
    };
  }
}
