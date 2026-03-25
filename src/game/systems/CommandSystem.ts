import { PlayerCommand } from '../types';
import { Hero } from '../entities/Hero';

export class CommandSystem {
  private currentCommand: PlayerCommand = { type: 'advance' };

  setCommand(cmd: PlayerCommand): void {
    this.currentCommand = cmd;
  }

  getCommand(): PlayerCommand {
    return this.currentCommand;
  }

  update(heroes: Hero[]): void {
    for (const hero of heroes) {
      hero.setCommand(this.currentCommand);
    }
  }
}
