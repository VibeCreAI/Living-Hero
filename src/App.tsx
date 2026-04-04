import { useRef, useState } from 'react';
import { IRefPhaserGame, PhaserGame } from './PhaserGame';
import { OverworldHUD } from './app/react/components/hud/OverworldHUD';
import { BattleHUD } from './app/react/components/hud/BattleHUD';
import { TileMappingTool } from './app/react/components/devtools/TileMappingTool';

function App() {
  const search = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
  const showTileMapper = search?.get('tool') === 'tile-mapper' || pathname.endsWith('/tile-mapper');
  const previewMode = search?.has('preview');
  const phaserRef = useRef<IRefPhaserGame | null>(null);
  const [sceneKey, setSceneKey] = useState<string>('');
  const isBattleScene = sceneKey === 'BattleScene';

  const currentScene = (scene: Phaser.Scene) => {
    setSceneKey(scene.scene.key);
  };

  if (showTileMapper) {
    return <TileMappingTool />;
  }

  if (previewMode) {
    return (
      <div id="app">
        <div id="scene-shell">
          <div id="game-stage">
            <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="app">
      <div id={isBattleScene ? 'battle-shell' : 'scene-shell'}>
        <div id="game-stage">
          <PhaserGame ref={phaserRef} currentActiveScene={currentScene} />
          {sceneKey === 'OverworldScene' && <OverworldHUD />}
        </div>
        {isBattleScene && <BattleHUD />}
      </div>
    </div>
  );
}

export default App;
