import { Position } from '../types';

export class OverworldStateManager {
  heroPosition: Position;
  visitedNodes: Set<string>;

  constructor(startPosition: Position) {
    this.heroPosition = { ...startPosition };
    this.visitedNodes = new Set();
  }

  moveHero(pos: Position): void {
    this.heroPosition = { ...pos };
  }

  isNearNode(nodePosition: Position, threshold: number = 60): boolean {
    const dx = this.heroPosition.x - nodePosition.x;
    const dy = this.heroPosition.y - nodePosition.y;
    return Math.sqrt(dx * dx + dy * dy) < threshold;
  }

  markVisited(nodeId: string): void {
    this.visitedNodes.add(nodeId);
  }
}
