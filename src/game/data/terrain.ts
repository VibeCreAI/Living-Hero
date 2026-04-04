import { OverworldNode } from '../types';
import { PORTAL_LABEL, PORTAL_NODE_ID } from './portalFloors';

export const OVERWORLD_NODES: OverworldNode[] = [
  {
    id: 'node-playground',
    position: { x: 680, y: 520 },
    label: 'Training Grounds',
    kind: 'node',
    difficulty: 0,
    completed: false,
    mode: 'playground',
  },
  {
    id: PORTAL_NODE_ID,
    position: { x: 960, y: 720 },
    label: PORTAL_LABEL,
    kind: 'portal',
    difficulty: 1,
    completed: false,
    mode: 'battle',
  },
];
