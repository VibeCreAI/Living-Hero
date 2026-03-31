import { OverworldNode } from '../types';
import { PORTAL_LABEL, PORTAL_NODE_ID } from './portalFloors';

export const OVERWORLD_NODES: OverworldNode[] = [
  {
    id: 'node-playground',
    position: { x: 180, y: 160 },
    label: 'Training Grounds',
    kind: 'node',
    difficulty: 0,
    completed: false,
    mode: 'playground',
  },
  {
    id: PORTAL_NODE_ID,
    position: { x: 512, y: 384 },
    label: PORTAL_LABEL,
    kind: 'portal',
    difficulty: 1,
    completed: false,
    mode: 'battle',
  },
];
