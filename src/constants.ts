import { LucideIcon, Paintbrush, Eraser, PaintBucket, Undo2, Redo2, Download, Trash2, Smile, Shapes, Hand, FlipHorizontal, ImagePlus, FolderOpen } from 'lucide-react';

export type ToolType = 'brush' | 'eraser' | 'bucket' | 'sticker' | 'shape' | 'move';

export interface Tool {
  id: ToolType;
  icon: LucideIcon;
  label: string;
}

export const TOOLS: Tool[] = [
  { id: 'brush', icon: Paintbrush, label: 'Brush' },
  { id: 'bucket', icon: PaintBucket, label: 'Fill' },
  { id: 'eraser', icon: Eraser, label: 'Eraser' },
  { id: 'sticker', icon: Smile, label: 'Stickers' },
  { id: 'shape', icon: Shapes, label: 'Shapes' },
  { id: 'move', icon: Hand, label: 'Move' },
];

export type ShapeType = 'circle' | 'square' | 'triangle' | 'star' | 'heart' | 'cloud';

export const COLORS = [
  '#FF595E', // Red-ish
  '#FF924C', // Orange
  '#FFCA3A', // Yellow
  '#8AC926', // Green
  '#1982C4', // Blue
  '#6A4C93', // Purple
  '#F038FF', // Pink
  '#000000', // Black
  '#FFFFFF', // White
  '#4E342E', // Brown
  'RAINBOW', // Special rainbow color
];

export const TEMPLATES = [
  { id: 'blank', label: 'Blank', icon: '📄' },
  { id: 'cat', label: 'Cat', icon: '🐱' },
  { id: 'house', label: 'House', icon: '🏠' },
  { id: 'sun', label: 'Sun', icon: '☀️' },
];

export const BRUSH_SIZES = [5, 10, 20, 40, 80];

export type BrushTexture = 'solid' | 'chalk' | 'watercolor' | 'sparkle' | 'crayon' | 'marker' | 'spray';

export interface Texture {
  id: BrushTexture;
  label: string;
}

export const TEXTURES: Texture[] = [
  { id: 'solid', label: 'Magic Pen' },
  { id: 'chalk', label: 'Chalk' },
  { id: 'watercolor', label: 'Watercolor' },
  { id: 'sparkle', label: 'Sparkle' },
  { id: 'crayon', label: 'Crayon' },
  { id: 'marker', label: 'Marker' },
  { id: 'spray', label: 'Spray Paint' },
];

export const STICKERS = [
  '⭐', '🎈', '🎨', '🚀', '🌈', '🍦', '🦖', '🦄', '🐱', '🐶', '🍕', '🍩'
];
