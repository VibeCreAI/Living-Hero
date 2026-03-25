import { useEffect, useState } from 'react';
import { EventBus } from '../../../../game/EventBus';
import { BattleState, PlayerCommand, CommandType } from '../../../../game/types';

export function BattleHUD() {
  const [battleState, setBattleState] = useState<BattleState | null>(null);
  const [currentCommand, setCurrentCommand] = useState<CommandType>('advance');
  const [heroIntent, setHeroIntent] = useState('Awaiting orders...');

  useEffect(() => {
    const stateHandler = (state: BattleState) => {
      setBattleState(state);
      if (state.heroes.length > 0 && state.heroes[0].currentDecision) {
        setHeroIntent(state.heroes[0].currentDecision.intent);
      }
    };

    const commandHandler = (cmd: PlayerCommand) => {
      setCurrentCommand(cmd.type);
    };

    EventBus.on('battle-state-update', stateHandler);
    EventBus.on('command-issued', commandHandler);

    return () => {
      EventBus.removeListener('battle-state-update', stateHandler);
      EventBus.removeListener('command-issued', commandHandler);
    };
  }, []);

  const issueCommand = (type: CommandType) => {
    const cmd: PlayerCommand = { type };
    setCurrentCommand(type);
    EventBus.emit('player-command', cmd);
  };

  const alliedAlive = battleState?.alliedUnits.filter((u) => u.state !== 'dead').length ?? 0;
  const enemyAlive = battleState?.enemyUnits.filter((u) => u.state !== 'dead').length ?? 0;
  const timeSec = battleState?.timeSec ?? 0;

  const commands: CommandType[] = ['advance', 'hold', 'protect', 'focus'];

  return (
    <div style={{ padding: '8px', color: '#ccc', fontFamily: 'monospace', fontSize: '12px' }}>
      <div style={{ marginBottom: '6px', color: '#ff6644', fontSize: '14px' }}>BATTLE</div>

      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: '#4488ff' }}>Allies: {alliedAlive}</span>
        {' | '}
        <span style={{ color: '#ff4444' }}>Enemies: {enemyAlive}</span>
        {' | '}
        <span>Time: {timeSec.toFixed(1)}s</span>
      </div>

      <div style={{ marginBottom: '6px' }}>
        <span style={{ color: '#ffd700' }}>Intent: </span>
        <span>{heroIntent}</span>
      </div>

      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {commands.map((cmd, i) => (
          <button
            key={cmd}
            onClick={() => issueCommand(cmd)}
            style={{
              padding: '4px 10px',
              fontFamily: 'monospace',
              fontSize: '11px',
              cursor: 'pointer',
              backgroundColor: currentCommand === cmd ? '#ffd700' : '#333',
              color: currentCommand === cmd ? '#000' : '#ccc',
              border: '1px solid #666',
              borderRadius: '3px',
            }}
          >
            [{i + 1}] {cmd.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}
