import { OverworldNode } from '../types';

export const OVERWORLD_NODES: OverworldNode[] = [
  {
    id: 'node-playground',
    position: { x: 180, y: 160 },
    label: 'Training Grounds',
    difficulty: 0,
    completed: false,
    mode: 'playground',
  },
  {
    id: 'node-1',
    position: { x: 300, y: 250 },
    label: 'Forest Camp',
    difficulty: 1,
    completed: false,
  },
  {
    id: 'node-2',
    position: { x: 550, y: 450 },
    label: 'Bandit Fort',
    difficulty: 1.5,
    completed: false,
  },
  {
    id: 'node-3',
    position: { x: 800, y: 300 },
    label: 'Dark Keep',
    difficulty: 2,
    completed: false,
  },
];
