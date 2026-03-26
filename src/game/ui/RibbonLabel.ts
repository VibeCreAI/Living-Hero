type RibbonTone = 'blue' | 'red' | 'gold' | 'purple' | 'steel';

interface RibbonLabelOptions {
  x: number;
  y: number;
  text: string;
  tone: RibbonTone;
  depth?: number;
  ribbonScale?: number;
  fontSizePx?: number;
  textScale?: number;
}

const FRAME_BASE_BY_TONE: Record<RibbonTone, number> = {
  blue: 0,
  red: 10,
  gold: 20,
  purple: 30,
  steel: 40,
};

const TEXT_COLOR_BY_TONE: Record<RibbonTone, string> = {
  blue: '#d8ecff',
  red: '#ffe1d1',
  gold: '#fff2b5',
  purple: '#efdcff',
  steel: '#d8e4ef',
};

export function addRibbonLabel(
  scene: Phaser.Scene,
  options: RibbonLabelOptions
): Phaser.GameObjects.Text {
  const depth = options.depth ?? 20;
  const ribbonScale = options.ribbonScale ?? 0.72;
  const fontSizePx = options.fontSizePx ?? 8;
  const textScale = options.textScale ?? 1.8;
  const finalFontSizePx = Math.max(8, Math.round(fontSizePx * textScale));
  const strokeThickness = Math.max(2, Math.round(finalFontSizePx / 7));
  const x = Math.round(options.x);
  const y = Math.round(options.y);
  const frameBase = FRAME_BASE_BY_TONE[options.tone];

  scene.textures.get('ui-ribbons-small')?.setFilter(Phaser.Textures.FilterMode.NEAREST);

  const labelText = scene.add.text(x, y, options.text, {
    fontFamily: '"NeoDunggeunmoPro", monospace',
    fontSize: `${finalFontSizePx}px`,
    fontStyle: 'bold',
    color: TEXT_COLOR_BY_TONE[options.tone],
    stroke: '#1b1620',
    strokeThickness,
    shadow: {
      color: '#000000',
      offsetX: 0,
      offsetY: 0,
      blur: 0,
      fill: false,
    },
  });
  labelText.setOrigin(0.5);
  labelText.setScale(1);
  labelText.setResolution(3);
  labelText.setDepth(depth + 0.2);

  const capSize = 64 * ribbonScale;
  const targetWidth = labelText.displayWidth + 26;
  const centerWidth = Math.max(10, targetWidth - capSize * 2 + 6);

  const center = scene.add.tileSprite(
    x,
    y,
    centerWidth,
    capSize,
    'ui-ribbons-small',
    frameBase + 2
  );
  center.setDepth(depth);

  const leftCap = scene.add.image(
    Math.round(x - centerWidth / 2 - capSize / 2 + 2),
    y,
    'ui-ribbons-small',
    frameBase
  );
  leftCap.setDisplaySize(capSize, capSize);
  leftCap.setDepth(depth + 0.01);

  const rightCap = scene.add.image(
    Math.round(x + centerWidth / 2 + capSize / 2 - 2),
    y,
    'ui-ribbons-small',
    frameBase + 4
  );
  rightCap.setDisplaySize(capSize, capSize);
  rightCap.setDepth(depth + 0.01);

  return labelText;
}
