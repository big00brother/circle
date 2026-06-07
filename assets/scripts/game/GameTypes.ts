export enum RingSize {
  Inner = 0,
  Middle = 1,
  Outer = 2,
}

export type RingColor = 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

export interface Ring {
  color: RingColor;
  size: RingSize;
}

export interface Piece {
  id: number;
  rings: Ring[];
}

export type CellState = [Ring | null, Ring | null, Ring | null];

export interface PlacementResult {
  placed: boolean;
  scoreDelta: number;
  clearedRings: number;
  gameOver: boolean;
  reason?: string;
}

export const GRID_SIZE = 3;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;

export const RING_SIZES: RingSize[] = [
  RingSize.Inner,
  RingSize.Middle,
  RingSize.Outer,
];

export const RING_COLORS: RingColor[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'pink',
  'purple',
];

export const RING_COLOR_HEX: Record<RingColor, string> = {
  red: '#ff4747',
  orange: '#ff9f2e',
  yellow: '#ffdf44',
  green: '#56e33a',
  blue: '#32a8ff',
  pink: '#ff5ec8',
  purple: '#9b5cff',
};

export const COLOR_LABELS: Record<RingColor, string> = {
  red: '红',
  orange: '橙',
  yellow: '黄',
  green: '绿',
  blue: '蓝',
  pink: '粉',
  purple: '紫',
};
