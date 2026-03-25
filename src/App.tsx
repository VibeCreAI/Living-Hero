import { useRef, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import { OverworldHUD } from './app/react/components/hud/OverworldHUD';
import { BattleHUD } from './app/react/components/hud/BattleHUD';

function App() {
  const phaserRef = useRef<IRefPhaserGame | null>(null);
  const [sceneKey, setSceneKey] = useState<string>('');

  const currentScene = (scene: Phaser.Scene) => {
    setSceneKey(scene.scene.key);
  };

  return (
    <div id="app">
      <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
      <div>
        {sceneKey === 'OverworldScene' && <OverworldHUD />}
        {sceneKey === 'BattleScene' && <BattleHUD />}
      </div>
    </div>
  );
}

export default App;
