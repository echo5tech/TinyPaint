/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Download, Trash2, Undo2, Redo2, Layout, ZoomIn, ZoomOut, Maximize, FlipHorizontal, FolderOpen, ImagePlus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ToolType, COLORS, TOOLS, BRUSH_SIZES, STICKERS, TEMPLATES, BrushTexture, TEXTURES, ShapeType } from './constants';

interface HistoryState {
  imageData: ImageData;
}

const HISTORY_LIMIT = 20;
const GALLERY_STORAGE_KEY = 'tinypaint-gallery';
const GALLERY_LIMIT = 12;
const MAX_GALLERY_IMAGE_SIZE = 1200;

const fillCanvasWhite = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
};

const drawImageCentered = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  image: HTMLCanvasElement | HTMLImageElement,
) => {
  const sourceWidth = image instanceof HTMLImageElement ? image.naturalWidth || image.width : image.width;
  const sourceHeight = image instanceof HTMLImageElement ? image.naturalHeight || image.height : image.height;
  if (sourceWidth <= 0 || sourceHeight <= 0) return;

  const scale = Math.min(canvas.width / sourceWidth, canvas.height / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;

  ctx.drawImage(image, x, y, width, height);
};

const createCanvasSnapshot = (canvas: HTMLCanvasElement) => {
  if (canvas.width <= 0 || canvas.height <= 0) return null;

  const snapshot = document.createElement('canvas');
  snapshot.width = canvas.width;
  snapshot.height = canvas.height;
  const snapshotCtx = snapshot.getContext('2d');
  if (!snapshotCtx) return null;

  snapshotCtx.drawImage(canvas, 0, 0);
  return snapshot;
};

const resizeImageData = (imageData: ImageData, width: number, height: number) => {
  const source = document.createElement('canvas');
  source.width = imageData.width;
  source.height = imageData.height;
  const sourceCtx = source.getContext('2d');
  if (!sourceCtx) return imageData;
  sourceCtx.putImageData(imageData, 0, 0);

  const target = document.createElement('canvas');
  target.width = width;
  target.height = height;
  const targetCtx = target.getContext('2d', { willReadFrequently: true });
  if (!targetCtx) return imageData;

  fillCanvasWhite(targetCtx, target);
  drawImageCentered(targetCtx, target, source);
  return targetCtx.getImageData(0, 0, width, height);
};

const readSavedArtworks = () => {
  try {
    const saved = localStorage.getItem(GALLERY_STORAGE_KEY);
    if (!saved) return [];

    const parsed: unknown = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch (error) {
    console.warn('Unable to read saved TinyPaint gallery.', error);
    return [];
  }
};

const writeSavedArtworks = (artworks: string[]) => {
  try {
    localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(artworks));
    return true;
  } catch (error) {
    console.warn('Unable to save TinyPaint gallery.', error);
    return false;
  }
};

const createGalleryImage = (canvas: HTMLCanvasElement) => {
  const scale = Math.min(1, MAX_GALLERY_IMAGE_SIZE / Math.max(canvas.width, canvas.height));
  const preview = document.createElement('canvas');
  preview.width = Math.max(1, Math.round(canvas.width * scale));
  preview.height = Math.max(1, Math.round(canvas.height * scale));

  const previewCtx = preview.getContext('2d');
  if (!previewCtx) return canvas.toDataURL('image/jpeg', 0.75);

  fillCanvasWhite(previewCtx, preview);
  previewCtx.drawImage(canvas, 0, 0, preview.width, preview.height);
  return preview.toDataURL('image/jpeg', 0.75);
};

const getColorLabel = (color: string) => {
  if (color === 'RAINBOW') return 'Rainbow';

  const colorNames: Record<string, string> = {
    '#FF595E': 'Red',
    '#FF924C': 'Orange',
    '#FFCA3A': 'Yellow',
    '#8AC926': 'Green',
    '#1982C4': 'Blue',
    '#6A4C93': 'Purple',
    '#F038FF': 'Pink',
    '#000000': 'Black',
    '#FFFFFF': 'White',
    '#4E342E': 'Brown',
  };

  return colorNames[color] ?? color;
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const [currentTool, setCurrentTool] = useState<ToolType>('brush');
  const [currentTexture, setCurrentTexture] = useState<BrushTexture>('solid');
  const [currentColor, setCurrentColor] = useState(COLORS[0]);
  const [brushSize, setBrushSize] = useState(10);
  const [isDrawing, setIsDrawing] = useState(false);
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const historyIndexRef = useRef(historyIndex);
  const historyStatesRef = useRef<HistoryState[]>([]);
  const [selectedSticker, setSelectedSticker] = useState<string | null>(null);
  const [showStickers, setShowStickers] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showShapes, setShowShapes] = useState(false);
  const [currentShape, setCurrentShape] = useState<ShapeType>('circle');
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [placingSticker, setPlacingSticker] = useState<{char: string, x: number, y: number, scale: number} | null>(null);
  const [placingShape, setPlacingShape] = useState<{type: ShapeType, x: number, y: number, width: number, height: number} | null>(null);
  const [hue, setHue] = useState(0);
  
  // Advanced Features State
  const [isSymmetry, setIsSymmetry] = useState(false);
  const [showGallery, setShowGallery] = useState(false);
  const [savedArtworks, setSavedArtworks] = useState<string[]>([]);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const lastPos = useRef({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Zoom and Pan state
  const [viewScale, setViewScale] = useState(1);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  const getCanvasCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = ('touches' in e) ? e.touches[0].clientX : e.clientX;
    const clientY = ('touches' in e) ? e.touches[0].clientY : e.clientY;
    
    // Convert screen coordinates to canvas-space coordinates
    // When CSS scale is applied, rect.width = canvas.width * scale
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    
    return { x, y };
  };
  useEffect(() => {
    if (currentColor !== 'RAINBOW') return undefined;

    const interval = setInterval(() => {
      setHue(h => (h + 5) % 360);
    }, 50);
    return () => clearInterval(interval);
  }, [currentColor]);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    setSavedArtworks(readSavedArtworks());

    const resizeCanvas = () => {
      const container = containerRef.current;
      if (!container) return;

      const { width, height } = container.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(width));
      const nextHeight = Math.max(1, Math.round(height));
      const sameSize = canvas.width === nextWidth && canvas.height === nextHeight;

      if (sameSize && historyStatesRef.current.length > 0) return;

      const currentSnapshot = createCanvasSnapshot(canvas);
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      fillCanvasWhite(ctx, canvas);

      if (historyStatesRef.current.length > 0 && historyIndexRef.current >= 0) {
        const resizedHistory = historyStatesRef.current.map(({ imageData }) => ({
          imageData: resizeImageData(imageData, nextWidth, nextHeight),
        }));
        const nextIndex = Math.min(historyIndexRef.current, resizedHistory.length - 1);

        if (resizedHistory[nextIndex]) {
          ctx.putImageData(resizedHistory[nextIndex].imageData, 0, 0);
        }

        historyStatesRef.current = resizedHistory;
        historyIndexRef.current = nextIndex;
        setHistory(resizedHistory);
        setHistoryIndex(nextIndex);
      } else {
        if (currentSnapshot) {
          drawImageCentered(ctx, canvas, currentSnapshot);
        }
        saveToHistory();
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  const saveToHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const newState: HistoryState = { imageData };
    const currentIndex = historyIndexRef.current;
    const nextIndex = Math.min(currentIndex + 1, HISTORY_LIMIT - 1);

    setHistory(prev => {
      const sliced = prev.slice(0, currentIndex + 1);
      const nextHistory = [...sliced, newState].slice(-HISTORY_LIMIT);
      historyStatesRef.current = nextHistory;
      return nextHistory;
    });

    historyIndexRef.current = nextIndex;
    setHistoryIndex(nextIndex);
  }, []);

  const undo = () => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    historyIndexRef.current = newIndex;
    setHistoryIndex(newIndex);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && history[newIndex]) {
      ctx.putImageData(history[newIndex].imageData, 0, 0);
    }
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    historyIndexRef.current = newIndex;
    setHistoryIndex(newIndex);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && history[newIndex]) {
      ctx.putImageData(history[newIndex].imageData, 0, 0);
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      fillCanvasWhite(ctx, canvas);
      saveToHistory();
    }
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoords(e);
    const clientX = ('touches' in e) ? e.touches[0].clientX : e.clientX;
    const clientY = ('touches' in e) ? e.touches[0].clientY : e.clientY;

    if (currentTool === 'move') {
      setIsPanning(true);
      setPanStart({ x: clientX - viewOffset.x, y: clientY - viewOffset.y });
      return;
    }

    if (currentTool === 'bucket') {
      const fill = currentColor === 'RAINBOW' ? `hsl(${hue}, 100%, 50%)` : currentColor;
      floodFill(Math.round(x), Math.round(y), fill);
      saveToHistory();
      return;
    }

    if (currentTool === 'sticker' && selectedSticker) {
      if (placingSticker) {
        // If already placing, we could finalize or just move. 
        // User request asks for confirmation, so we'll let them drag the existing one.
        return;
      }
      setPlacingSticker({ char: selectedSticker, x, y, scale: 1 });
      return;
    }

    if (currentTool === 'shape') {
      if (placingShape) return;
      setStartPos({ x, y });
      setPlacingShape({ type: currentShape, x, y, width: 0, height: 0 });
      setIsDrawing(true);
      return;
    }

    setIsDrawing(true);
    lastPos.current = { x, y };
    
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    if (currentTool === 'eraser') {
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 1.0;
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
    } else if (currentTexture === 'watercolor') {
      ctx.strokeStyle = currentColor === 'RAINBOW' ? `hsla(${hue}, 100%, 50%, 0.1)` : `${currentColor}1A`;
      ctx.globalAlpha = 0.1;
      ctx.shadowBlur = brushSize / 2;
      ctx.shadowColor = currentColor === 'RAINBOW' ? `hsl(${hue}, 100%, 50%)` : currentColor;
      ctx.globalCompositeOperation = 'source-over';
    } else if (currentTexture === 'chalk') {
      ctx.strokeStyle = currentColor === 'RAINBOW' ? `hsl(${hue}, 100%, 50%)` : currentColor;
      ctx.globalAlpha = 0.8;
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
      // Roughness is handled in draw()
    } else if (currentTexture === 'crayon') {
      ctx.strokeStyle = currentColor === 'RAINBOW' ? `hsl(${hue}, 100%, 50%)` : currentColor;
      ctx.globalAlpha = 0.7;
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
    } else if (currentTexture === 'marker') {
      ctx.strokeStyle = currentColor === 'RAINBOW' ? `hsl(${hue}, 100%, 50%)` : currentColor;
      ctx.globalAlpha = 0.5;
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'multiply';
    } else if (currentTexture === 'sparkle') {
      ctx.strokeStyle = currentColor === 'RAINBOW' ? `hsl(${hue}, 100%, 50%)` : currentColor;
      ctx.globalAlpha = 1.0;
      ctx.shadowBlur = 10;
      ctx.shadowColor = ctx.strokeStyle as string;
      ctx.globalCompositeOperation = 'source-over';
    } else if (currentTexture === 'spray') {
      ctx.fillStyle = currentColor === 'RAINBOW' ? `hsl(${hue}, 100%, 50%)` : currentColor;
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.strokeStyle = currentColor === 'RAINBOW' ? `hsl(${hue}, 100%, 50%)` : currentColor;
      ctx.globalAlpha = 1.0;
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = 'source-over';
    }
    
    ctx.lineWidth = brushSize;
  };

  const drawStroke = (ctx: CanvasRenderingContext2D, startX: number, startY: number, endX: number, endY: number) => {
    if (currentTexture === 'spray' && currentTool !== 'eraser') {
      const dist = Math.hypot(endX - startX, endY - startY);
      const steps = Math.ceil(dist / 2);
      for (let s = 0; s < steps; s++) {
        const cx = startX + (endX - startX) * (s / steps);
        const cy = startY + (endY - startY) * (s / steps);
        for (let i = 0; i < brushSize; i++) {
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * (brushSize / 2);
          ctx.fillRect(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, 1.5, 1.5);
        }
      }
      return;
    }

    if (currentTexture === 'chalk' && currentTool !== 'eraser') {
       for (let i = 0; i < Math.max(1, brushSize/5); i++) {
         const offsetX = (Math.random() - 0.5) * brushSize;
         const offsetY = (Math.random() - 0.5) * brushSize;
         ctx.beginPath();
         ctx.moveTo(startX + offsetX, startY + offsetY);
         ctx.lineTo(endX + offsetX + 1, endY + offsetY + 1);
         ctx.stroke();
       }
       return;
    }

    if (currentTexture === 'crayon' && currentTool !== 'eraser') {
      for (let i = 0; i < 3; i++) {
        const offsetX = (Math.random() - 0.5) * brushSize * 0.3;
        const offsetY = (Math.random() - 0.5) * brushSize * 0.3;
        ctx.beginPath();
        ctx.moveTo(startX + offsetX, startY + offsetY);
        ctx.lineTo(endX + offsetX, endY + offsetY);
        ctx.stroke();
      }
      return;
    }

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    if (currentTexture === 'sparkle' && currentTool !== 'eraser') {
      if (Math.random() > 0.6) {
        const sparkX = endX + (Math.random() - 0.5) * brushSize * 2;
        const sparkY = endY + (Math.random() - 0.5) * brushSize * 2;
        const size = Math.random() * 4 + 2;
        
        ctx.save();
        ctx.translate(sparkX, sparkY);
        ctx.rotate(Math.random() * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.shadowBlur = 8;
        ctx.shadowColor = ctx.strokeStyle as string;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          ctx.lineTo(0, -size);
          ctx.rotate(Math.PI / 2.5);
          ctx.lineTo(0, -size/2);
          ctx.rotate(Math.PI / 2.5);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const clientX = ('touches' in e) ? e.touches[0].clientX : e.clientX;
    const clientY = ('touches' in e) ? e.touches[0].clientY : e.clientY;

    if (isPanning) {
      setViewOffset({
        x: clientX - panStart.x,
        y: clientY - panStart.y
      });
      return;
    }

    if (!isDrawing) return;

    const { x, y } = getCanvasCoords(e);

    if (currentTool === 'shape' && placingShape) {
      const width = x - startPos.x;
      const height = y - startPos.y;
      setPlacingShape({ ...placingShape, width, height });
      return;
    }

    if (currentColor === 'RAINBOW') {
      const rainbowColor = `hsl(${hue}, 100%, 50%)`;
      ctx.strokeStyle = currentTexture === 'watercolor' ? `hsla(${hue}, 100%, 50%, 0.1)` : rainbowColor;
      ctx.fillStyle = rainbowColor;
      if (currentTexture === 'watercolor' || currentTexture === 'sparkle') {
        ctx.shadowColor = rainbowColor;
      }
    }

    drawStroke(ctx, lastPos.current.x, lastPos.current.y, x, y);
    
    if (isSymmetry && currentTool !== 'eraser' && currentTool !== 'move') {
      const mirrorSX = canvas.width - lastPos.current.x;
      const mirrorEX = canvas.width - x;
      drawStroke(ctx, mirrorSX, lastPos.current.y, mirrorEX, y);
    }

    lastPos.current = { x, y };
  };

  const stopDrawing = () => {
    setIsPanning(false);
    if (isDrawing) {
      setIsDrawing(false);

      // If we were drawing a shape and it's tiny, just cancel it
      if (currentTool === 'shape' && placingShape) {
        if (Math.abs(placingShape.width) < 5 && Math.abs(placingShape.height) < 5) {
          setPlacingShape(null);
        }
      }

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        ctx.globalAlpha = 1.0;
        ctx.shadowBlur = 0;
        ctx.globalCompositeOperation = 'source-over';
      }
      
      // Only regular brushes save immediately on mouse up
      if (currentTool !== 'shape' && currentTool !== 'sticker' && currentTool !== 'move') {
        saveToHistory();
      }
    }
  };

  const finalizeSticker = () => {
    if (!placingSticker) return;
    drawSticker(placingSticker.x, placingSticker.y, placingSticker.char, placingSticker.scale);
    setPlacingSticker(null);
    saveToHistory();
  };

  const finalizeShape = () => {
    if (!placingShape) return;
    drawShape(placingShape.x, placingShape.y, placingShape.x + placingShape.width, placingShape.y + placingShape.height, placingShape.type);
    setPlacingShape(null);
    saveToHistory();
  };

  const drawShape = (x1: number, y1: number, x2: number, y2: number, shape: ShapeType) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    ctx.beginPath();
    ctx.lineWidth = brushSize;
    ctx.strokeStyle = currentColor === 'RAINBOW' ? `hsl(${hue}, 100%, 50%)` : currentColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const width = x2 - x1;
    const height = y2 - y1;

    if (shape === 'square') {
      ctx.strokeRect(x1, y1, width, height);
    } else if (shape === 'circle') {
      const radius = Math.sqrt(width * width + height * height);
      ctx.arc(x1, y1, radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (shape === 'triangle') {
      ctx.moveTo(x1 + width / 2, y1);
      ctx.lineTo(x1, y1 + height);
      ctx.lineTo(x1 + width, y1 + height);
      ctx.closePath();
      ctx.stroke();
    } else if (shape === 'star') {
      const outerRadius = Math.sqrt(width * width + height * height);
      const innerRadius = outerRadius / 2.5;
      const cx = x1;
      const cy = y1;
      let rot = (Math.PI / 2) * 3;
      let step = Math.PI / 5;

      ctx.moveTo(cx, cy - outerRadius);
      for (let i = 0; i < 5; i++) {
        ctx.lineTo(cx + Math.cos(rot) * outerRadius, cy + Math.sin(rot) * outerRadius);
        rot += step;
        ctx.lineTo(cx + Math.cos(rot) * innerRadius, cy + Math.sin(rot) * innerRadius);
        rot += step;
      }
      ctx.lineTo(cx, cy - outerRadius);
      ctx.closePath();
      ctx.stroke();
    } else if (shape === 'heart') {
       const d = Math.min(Math.abs(width), Math.abs(height));
       const cx = x1;
       const cy = y1 - d/4;
       ctx.moveTo(cx, cy + d/4);
       ctx.bezierCurveTo(cx, cy, cx - d/2, cy, cx - d/2, cy + d/4);
       ctx.bezierCurveTo(cx - d/2, cy + d/2, cx, cy + d*0.75, cx, cy + d);
       ctx.bezierCurveTo(cx, cy + d*0.75, cx + d/2, cy + d/2, cx + d/2, cy + d/4);
       ctx.bezierCurveTo(cx + d/2, cy, cx, cy, cx, cy + d/4);
       ctx.stroke();
    } else if (shape === 'cloud') {
       const cx = x1;
       const cy = y1;
       const w = width;
       const h = height;
       ctx.moveTo(cx - w/2, cy);
       ctx.bezierCurveTo(cx - w/2, cy - h/2, cx - w/4, cy - h/2, cx, cy - h/4);
       ctx.bezierCurveTo(cx + w/4, cy - h/2, cx + w/2, cy - h/2, cx + w/2, cy);
       ctx.bezierCurveTo(cx + w/2, cy + h/2, cx + w/4, cy + h/2, cx, cy + h/4);
       ctx.bezierCurveTo(cx - w/4, cy + h/2, cx - w/2, cy + h/2, cx - w/2, cy);
       ctx.closePath();
       ctx.stroke();
    }
  };

  const drawSticker = (x: number, y: number, sticker: string, scale: number = 1) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    
    ctx.font = `${brushSize * 4 * scale}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sticker, x, y);
  };

  const floodFill = (startX: number, startY: number, fillColor: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    const width = canvas.width;
    const height = canvas.height;

    const getPixelIdx = (x: number, y: number) => (y * width + x) * 4;

    const startIdx = getPixelIdx(startX, startY);
    const startR = data[startIdx];
    const startG = data[startIdx+1];
    const startB = data[startIdx+2];
    const startA = data[startIdx+3];

    // Handle HSL or Hex
    let r, g, b;
    if (fillColor.startsWith('hsl')) {
       // Simple version: just use the current hue to target RGB
       // For bucket it's easier to just pick a fixed color or parse HSL
       // Let's use a small hidden canvas to parse color
       const tempCtx = document.createElement('canvas').getContext('2d')!;
       tempCtx.fillStyle = fillColor;
       const hex = tempCtx.fillStyle; // browser converts to hex
       r = parseInt(hex.slice(1, 3), 16);
       g = parseInt(hex.slice(3, 5), 16);
       b = parseInt(hex.slice(5, 7), 16);
    } else {
      r = parseInt(fillColor.slice(1, 3), 16);
      g = parseInt(fillColor.slice(3, 5), 16);
      b = parseInt(fillColor.slice(5, 7), 16);
    }

    if (r === startR && g === startG && b === startB && startA === 255) return;

    const stack: [number, number][] = [[startX, startY]];
    
    while (stack.length > 0) {
      const [currX, currY] = stack.pop()!;
      const idx = getPixelIdx(currX, currY);

      if (
        data[idx] === startR &&
        data[idx+1] === startG &&
        data[idx+2] === startB &&
        data[idx+3] === startA
      ) {
        data[idx] = r;
        data[idx+1] = g;
        data[idx+2] = b;
        data[idx+3] = 255;

        if (currX > 0) stack.push([currX - 1, currY]);
        if (currX < width - 1) stack.push([currX + 1, currY]);
        if (currY > 0) stack.push([currX, currY - 1]);
        if (currY < height - 1) stack.push([currX, currY + 1]);
      }
    }

    ctx.putImageData(imageData, 0, 0);
  };

  const loadTemplate = (id: string) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    fillCanvasWhite(ctx, canvas);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    if (id === 'cat') {
      // Simple cat face
      ctx.beginPath();
      ctx.arc(centerX, centerY, 100, 0, Math.PI * 2); // Head
      ctx.stroke();
      // Ears
      ctx.beginPath();
      ctx.moveTo(centerX - 80, centerY - 60);
      ctx.lineTo(centerX - 100, centerY - 140);
      ctx.lineTo(centerX - 20, centerY - 95);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(centerX + 80, centerY - 60);
      ctx.lineTo(centerX + 100, centerY - 140);
      ctx.lineTo(centerX + 20, centerY - 95);
      ctx.stroke();
      // Eyes
      ctx.beginPath(); ctx.arc(centerX - 35, centerY - 20, 10, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(centerX + 35, centerY - 20, 10, 0, Math.PI * 2); ctx.stroke();
      // Nose
      ctx.beginPath(); ctx.moveTo(centerX, centerY + 10); ctx.lineTo(centerX - 10, centerY); ctx.lineTo(centerX + 10, centerY); ctx.closePath(); ctx.stroke();
    } else if (id === 'house') {
      ctx.beginPath();
      ctx.rect(centerX - 100, centerY, 200, 150); // Body
      ctx.moveTo(centerX - 120, centerY); ctx.lineTo(centerX, centerY - 100); ctx.lineTo(centerX + 120, centerY); ctx.closePath(); // Roof
      ctx.rect(centerX - 30, centerY + 70, 60, 80); // Door
      ctx.stroke();
    } else if (id === 'sun') {
       ctx.beginPath(); ctx.arc(centerX, centerY, 60, 0, Math.PI * 2); ctx.stroke();
       for(let i=0; i<12; i++) {
         const angle = (i * 30) * Math.PI / 180;
         ctx.moveTo(centerX + Math.cos(angle) * 70, centerY + Math.sin(angle) * 70);
         ctx.lineTo(centerX + Math.cos(angle) * 110, centerY + Math.sin(angle) * 110);
       }
       ctx.stroke();
    }
    
    saveToHistory();
    setShowTemplates(false);
  };

  const handleImageImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        
        fillCanvasWhite(ctx, canvas);
        drawImageCentered(ctx, canvas, img);
        saveToHistory();
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const saveToGallery = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = createGalleryImage(canvas);
    const newGallery = [url, ...savedArtworks].slice(0, GALLERY_LIMIT);
    setSavedArtworks(newGallery);
    setGalleryError(writeSavedArtworks(newGallery) ? null : 'Gallery storage is full. Your drawing was saved for this session only.');

    confetti({
      particleCount: 80,
      spread: 60,
      origin: { y: 0.8 }
    });
  };

  const downloadImage = (format: 'png' | 'jpeg') => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });

    const link = document.createElement('a');
    link.download = `my-drawing.${format}`;
    link.href = canvas.toDataURL(`image/${format}`, format === 'jpeg' ? 0.9 : undefined);
    link.click();
  };

  return (
    <div className="fixed inset-0 bg-[#FFF8E1] flex flex-col items-center overflow-hidden font-sans select-none">
      <input 
        type="file" 
        accept="image/*" 
        ref={fileInputRef} 
        onChange={handleImageImport} 
        className="hidden" 
      />
      {/* Header */}
      <header className="p-4 w-full flex justify-between items-center bg-white shadow-sm z-10 flex-wrap gap-2">
        <h1 className="text-xl font-black text-[#5C4033] tracking-tighter sm:text-3xl flex items-center gap-2">
          Tiny<span className="text-pink-500">Paint</span>
          <button 
            onClick={() => setShowGallery(true)}
            aria-label="Open art gallery"
            className="ml-2 sm:ml-4 p-2 sm:px-4 sm:py-2 bg-pink-100 text-pink-600 rounded-2xl hover:bg-pink-200 active:scale-95 transition-all flex items-center gap-2 text-sm sm:text-base font-bold"
          >
            <FolderOpen size={20} />
            <span className="hidden sm:inline">My Art</span>
          </button>
        </h1>
        
        <div className="flex gap-1 sm:gap-2 overflow-x-auto items-center">
          <button 
            onClick={() => fileInputRef.current?.click()}
            aria-label="Import photo"
            className="p-2 sm:p-3 bg-white border-2 border-gray-100 rounded-2xl hover:bg-gray-50 active:scale-95 transition-all text-blue-500 flex items-center gap-1 sm:gap-2"
            title="Import Photo"
          >
            <ImagePlus size={20} className="sm:w-6 sm:h-6" />
            <span className="hidden sm:inline font-bold">Photo</span>
          </button>
          
          <button 
            onClick={() => setIsSymmetry(!isSymmetry)}
            aria-label="Toggle mirror symmetry"
            aria-pressed={isSymmetry}
            className={`p-2 sm:p-3 border-2 rounded-2xl active:scale-95 transition-all flex items-center gap-1 sm:gap-2 ${
              isSymmetry ? 'bg-purple-100 border-purple-200 text-purple-600' : 'bg-white border-gray-100 hover:bg-gray-50 text-gray-700'
            }`}
            title="Magic Mirror (Symmetry)"
          >
            <FlipHorizontal size={20} className="sm:w-6 sm:h-6" />
            <span className="hidden sm:inline font-bold">Mirror</span>
          </button>

          <div className="h-full w-[1px] bg-gray-200 mx-1 hidden sm:block" />
          
          <button 
            onClick={() => setShowTemplates(true)}
            aria-label="Open coloring pages"
            className="p-2 sm:p-3 bg-white border-2 border-gray-100 rounded-2xl hover:bg-gray-50 active:scale-95 transition-all text-gray-700 flex items-center gap-1 sm:gap-2"
            title="Templates"
          >
            <Layout size={20} className="sm:w-6 sm:h-6" />
            <span className="hidden sm:inline font-bold">Pages</span>
          </button>
          <div className="h-full w-[1px] bg-gray-200 mx-1 hidden lg:block" />
          <div className="hidden lg:flex bg-gray-50 rounded-2xl p-1 gap-1">
            <button 
              onClick={() => setViewScale(prev => Math.min(prev + 0.2, 5))}
              aria-label="Zoom in"
              className="p-2 hover:bg-white rounded-xl text-gray-600 transition-colors"
              title="Zoom In"
            >
              <ZoomIn size={20} />
            </button>
            <button 
              onClick={() => setViewScale(prev => Math.max(prev - 0.2, 0.5))}
              aria-label="Zoom out"
              className="p-2 hover:bg-white rounded-xl text-gray-600 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut size={20} />
            </button>
            <button 
              onClick={() => { setViewScale(1); setViewOffset({ x: 0, y: 0 }); }}
              aria-label="Reset zoom and pan"
              className="p-2 hover:bg-white rounded-xl text-gray-600 transition-colors"
              title="Reset View"
            >
              <Maximize size={20} />
            </button>
          </div>
          <div className="h-full w-[1px] bg-gray-200 mx-1" />
          <button 
            onClick={undo}
            aria-label="Undo"
            disabled={historyIndex <= 0}
            className="p-2 sm:p-3 bg-white border-2 border-gray-100 rounded-2xl hover:bg-gray-50 active:scale-95 transition-all text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            title="Undo"
          >
            <Undo2 size={20} className="sm:w-6 sm:h-6" />
          </button>
          <button 
            onClick={redo}
            aria-label="Redo"
            disabled={historyIndex >= history.length - 1}
            className="p-2 sm:p-3 bg-white border-2 border-gray-100 rounded-2xl hover:bg-gray-50 active:scale-95 transition-all text-gray-700 disabled:cursor-not-allowed disabled:opacity-40"
            title="Redo"
          >
            <Redo2 size={20} className="sm:w-6 sm:h-6" />
          </button>
          <button 
            onClick={clearCanvas}
            aria-label="Clear canvas"
            className="p-2 sm:p-3 bg-white border-2 border-red-50 rounded-2xl hover:bg-red-50 active:scale-95 transition-all text-red-400 sm:ml-2"
            title="Clear all"
          >
            <Trash2 size={20} className="sm:w-6 sm:h-6" />
          </button>
          <div className="h-full w-[1px] bg-gray-200 mx-1" />
          <button 
            onClick={() => { saveToGallery(); downloadImage('png'); }}
            aria-label="Save drawing"
            className="p-2 sm:p-3 bg-indigo-500 text-white rounded-2xl hover:bg-indigo-600 active:scale-95 transition-all flex items-center gap-1 sm:gap-2 font-bold px-3 sm:px-5"
          >
            <Download size={20} />
            <span className="hidden sm:inline">Save</span>
          </button>
        </div>
      </header>

      {/* Main Experience */}
      <div className="flex-1 w-full flex flex-col md:flex-row relative">
        {/* Left Sidebar: Tools */}
        <aside className="w-full md:w-24 bg-white border-r border-gray-100 p-2 flex md:flex-col items-center justify-center gap-3 overflow-x-auto z-10 shrink-0">
          {TOOLS.map(tool => (
            <button
              key={tool.id}
              onClick={() => {
                setCurrentTool(tool.id);
                if (tool.id === 'sticker') setShowStickers(true);
                else setShowStickers(false);
                if (tool.id === 'shape') setShowShapes(true);
                else setShowShapes(false);
              }}
              aria-label={`Select ${tool.label.toLowerCase()} tool`}
              aria-pressed={currentTool === tool.id}
              className={`p-4 rounded-3xl transition-all relative ${
                currentTool === tool.id 
                  ? 'bg-yellow-400 text-white shadow-lg scale-110' 
                  : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
              }`}
            >
              <tool.icon size={32} />
              {currentTool === tool.id && (
                <motion.div 
                  layoutId="activeTool"
                  className="absolute -right-1 top-0 w-3 h-3 bg-red-400 rounded-full border-2 border-white"
                />
              )}
            </button>
          ))}
        </aside>

        {/* Canvas Area */}
        <main ref={containerRef} className="flex-1 relative bg-[#FFF8E1] p-4 flex items-center justify-center overflow-hidden">
          <motion.div
            animate={{ 
              scale: viewScale,
              x: viewOffset.x,
              y: viewOffset.y
            }}
            transition={{ type: 'spring', damping: 25, stiffness: 200, mass: 0.5 }}
            className="flex items-center justify-center pointer-events-none"
          >
            <canvas
              ref={canvasRef}
              aria-label="Drawing canvas"
              role="img"
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              style={{
                cursor: currentTool === 'move' ? (isPanning ? 'grabbing' : 'grab') : 'crosshair',
                pointerEvents: 'auto'
              }}
              className="bg-white rounded-[40px] shadow-2xl touch-none"
            />

          {/* Shape Placement Preview */}
            <AnimatePresence>
              {placingShape && (
                <div 
                  className="absolute pointer-events-none"
                  style={{ 
                    left: `${(placingShape.x / (canvasRef.current?.width || 1)) * 100}%`,
                    top: `${(placingShape.y / (canvasRef.current?.height || 1)) * 100}%`,
                  }}
                >
                  <svg 
                    width={Math.abs(placingShape.width) * viewScale} 
                    height={Math.abs(placingShape.height) * viewScale}
                    className="overflow-visible"
                    style={{
                      transform: `translate(${placingShape.width < 0 ? '-100%' : '0'}, ${placingShape.height < 0 ? '-100%' : '0'})`
                    }}
                  >
                     <g 
                      stroke={currentColor === 'RAINBOW' ? `hsl(${hue}, 100%, 50%)` : currentColor} 
                      strokeWidth={brushSize * viewScale} 
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {placingShape.type === 'square' && (
                        <rect x="0" y="0" width={Math.abs(placingShape.width) * viewScale} height={Math.abs(placingShape.height) * viewScale} />
                      )}
                      {placingShape.type === 'circle' && (
                        <circle cx={Math.abs(placingShape.width) * viewScale / 2} cy={Math.abs(placingShape.height) * viewScale / 2} r={Math.sqrt(placingShape.width**2 + placingShape.height**2) * viewScale / 2} />
                      )}
                      {/* Note: Simplified preview for complex shapes for now */}
                      {(placingShape.type !== 'square' && placingShape.type !== 'circle') && (
                        <rect x="0" y="0" width={Math.abs(placingShape.width) * viewScale} height={Math.abs(placingShape.height) * viewScale} strokeDasharray="4 4" />
                      )}
                    </g>
                  </svg>

                  {/* Confirmation Controls for Shape */}
                  {!isDrawing && (
                    <div className="absolute -top-16 left-1/2 -translate-x-1/2 bg-white rounded-full shadow-xl p-1 flex items-center gap-2 border border-gray-100 pointer-events-auto">
                      <button 
                        onClick={finalizeShape}
                        aria-label="Place shape"
                        className="w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center hover:bg-green-600 transition-colors"
                      >
                        ✓
                      </button>
                      <button 
                         onClick={() => setPlacingShape(null)}
                         aria-label="Cancel shape"
                         className="w-10 h-10 bg-red-400 text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              )}
            </AnimatePresence>

            {/* Sticker Placement Preview */}
            <AnimatePresence>
              {placingSticker && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  drag
                  dragMomentum={false}
                  onDragEnd={(_, info) => {
                    const canvas = canvasRef.current;
                    if (!canvas) return;
                    const rect = canvas.getBoundingClientRect();
                    
                    // Convert the screen coordinate (info.point) back to canvas-space
                    const x = (info.point.x - rect.left) * (canvas.width / rect.width);
                    const y = (info.point.y - rect.top) * (canvas.height / rect.height);
                    
                    setPlacingSticker({ ...placingSticker, x, y });
                  }}
                  className="absolute pointer-events-auto cursor-grab active:cursor-grabbing flex items-center justify-center transform -translate-x-1/2 -translate-y-1/2"
                  style={{ 
                    left: `${(placingSticker.x / (canvasRef.current?.width || 1)) * 100}%`,
                    top: `${(placingSticker.y / (canvasRef.current?.height || 1)) * 100}%`,
                  }}
                >
                  <motion.div 
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    style={{ fontSize: `${brushSize * 4 * placingSticker.scale}px` }}
                  >
                    {placingSticker.char}
                  </motion.div>
                  
                  {/* Controls Overlay for Sticker */}
                  <div className="absolute -top-32 left-1/2 -translate-x-1/2 bg-white rounded-full shadow-xl p-2 flex items-center gap-3 border border-gray-100 min-w-[200px]">
                    <div className="flex-1 px-4">
                      <input 
                        type="range"
                        aria-label="Sticker size"
                        min="0.5"
                        max="3"
                        step="0.1"
                        value={placingSticker.scale}
                        onChange={(e) => setPlacingSticker({ ...placingSticker, scale: parseFloat(e.target.value) })}
                        className="w-full accent-indigo-500"
                      />
                    </div>
                    <button 
                      onClick={finalizeSticker}
                      aria-label="Place sticker"
                      className="w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center hover:bg-green-600 transition-colors"
                    >
                      <motion.div whileHover={{ scale: 1.2 }}>✓</motion.div>
                    </button>
                    <button 
                      onClick={() => setPlacingSticker(null)}
                      aria-label="Cancel sticker"
                      className="w-10 h-10 bg-red-400 text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
                    >
                      <motion.div whileHover={{ scale: 1.2 }}>✕</motion.div>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Sticker Selection Modal */}
          <AnimatePresence>
            {showStickers && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md p-6 rounded-[32px] shadow-2xl border border-white/50 flex gap-4 max-w-[90vw] overflow-x-auto z-20"
              >
                {STICKERS.map(sticker => (
                  <button
                    key={sticker}
                    onClick={() => {
                      setSelectedSticker(sticker);
                      setShowStickers(false);
                      setCurrentTool('sticker');
                    }}
                    aria-label={`Choose ${sticker} sticker`}
                    aria-pressed={selectedSticker === sticker}
                    className={`text-4xl hover:scale-125 transition-transform flex-shrink-0 p-2 rounded-2xl ${selectedSticker === sticker ? 'bg-yellow-200' : 'hover:bg-white'}`}
                  >
                    {sticker}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Shape Selection Modal */}
          <AnimatePresence>
            {showShapes && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-md p-6 rounded-[32px] shadow-2xl border border-white/50 flex gap-4 max-w-[90vw] overflow-x-auto z-20"
              >
                {(['circle', 'square', 'triangle', 'star', 'heart', 'cloud'] as const).map(shape => {
                  const icons: Record<string, string> = {
                    circle: '⭕',
                    square: '⬜',
                    triangle: '🔺',
                    star: '⭐',
                    heart: '❤️',
                    cloud: '☁️'
                  };
                  return (
                    <button
                      key={shape}
                      onClick={() => {
                        setCurrentShape(shape);
                        setShowShapes(false);
                        setCurrentTool('shape');
                      }}
                      aria-label={`Choose ${shape} shape`}
                      aria-pressed={currentShape === shape}
                      className={`p-4 rounded-2xl hover:bg-white hover:scale-110 transition-all flex-shrink-0 ${currentShape === shape ? 'bg-yellow-100 shadow-inner' : ''}`}
                    >
                      <span className="text-4xl">{icons[shape]}</span>
                      <span className="block mt-2 font-bold text-gray-600 capitalize text-sm">{shape}</span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Template Selection Modal */}
          <AnimatePresence>
            {showTemplates && (
              <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowTemplates(false)}
                  className="absolute inset-0 bg-black/20 backdrop-blur-sm"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="templates-title"
                  className="bg-white p-8 rounded-[40px] shadow-2xl relative z-40 max-w-lg w-full"
                >
                  <h2 id="templates-title" className="text-2xl font-black mb-6 text-center text-gray-800">Pick a page to color!</h2>
                  <div className="grid grid-cols-2 gap-4">
                    {TEMPLATES.map(tmpl => (
                      <button
                        key={tmpl.id}
                        onClick={() => loadTemplate(tmpl.id)}
                        aria-label={`Load ${tmpl.label.toLowerCase()} coloring page`}
                        className="p-6 bg-gray-50 rounded-3xl hover:bg-yellow-50 hover:scale-105 transition-all flex flex-col items-center gap-3 border-2 border-transparent hover:border-yellow-200"
                      >
                        <span className="text-5xl">{tmpl.icon}</span>
                        <span className="font-bold text-gray-600">{tmpl.label}</span>
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={() => setShowTemplates(false)}
                    aria-label="Close coloring pages"
                    className="mt-8 w-full py-4 bg-gray-100 rounded-2xl font-bold text-gray-500 hover:bg-gray-200"
                  >
                    Close
                  </button>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </main>

        {/* Right Controls: Color & Size & Textures */}
        <aside className="w-full md:w-40 bg-white border-l border-gray-100 p-2 md:p-4 flex md:flex-col items-center gap-4 md:gap-6 overflow-x-auto z-10 shrink-0">
          <div className="flex flex-col gap-2 md:gap-3 items-center">
             <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest shrink-0">Colors</span>
             <div className="flex md:grid grid-cols-2 gap-2">
                {COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setCurrentColor(color)}
                    aria-label={`Choose ${getColorLabel(color)} color`}
                    aria-pressed={currentColor === color}
                    className="w-10 h-10 md:w-12 md:h-12 rounded-full transition-all border-4 shadow-sm shrink-0 relative overflow-hidden"
                    style={{ 
                      backgroundColor: color === 'RAINBOW' ? 'transparent' : color,
                      borderColor: currentColor === color ? 'white' : 'transparent',
                      transform: currentColor === color ? 'scale(1.15)' : 'scale(1)',
                      boxShadow: currentColor === color ? `0 0 10px ${color === 'RAINBOW' ? '#ff00ff' : color}88` : 'none'
                    }}
                  >
                    {color === 'RAINBOW' && (
                      <div className="absolute inset-0 bg-gradient-to-tr from-red-500 via-green-500 to-blue-500 animate-spin-slow scale-150" />
                    )}
                  </button>
                ))}
             </div>
          </div>

          <div className="flex flex-col gap-2 md:gap-3 items-center ml-4 md:ml-0">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest shrink-0">Style</span>
            <div className="flex md:grid grid-cols-2 gap-2">
              {TEXTURES.map(texture => (
                <button
                  key={texture.id}
                  onClick={() => {
                    setCurrentTexture(texture.id);
                    setCurrentTool('brush');
                  }}
                  aria-label={`Use ${texture.label} brush style`}
                  aria-pressed={currentTexture === texture.id && currentTool !== 'eraser'}
                  className={`px-3 py-2 md:p-2 rounded-xl text-xs font-bold transition-all border-2 shrink-0 md:w-full text-center ${
                    currentTexture === texture.id && currentTool !== 'eraser'
                      ? 'border-yellow-400 bg-yellow-50 text-yellow-700'
                      : 'border-gray-50 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {texture.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex md:flex-col gap-2 md:gap-4 items-center ml-4 md:ml-0 md:w-full">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest shrink-0">Size</span>
            {BRUSH_SIZES.map(size => (
              <button
                key={size}
                onClick={() => setBrushSize(size)}
                aria-label={`Set brush size to ${size}`}
                aria-pressed={brushSize === size}
                className={`transition-all rounded-full border-2 shrink-0 ${
                  brushSize === size ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100 bg-white'
                } flex items-center justify-center`}
                style={{ width: 44, height: 44 }}
              >
                <div 
                  className="rounded-full"
                  style={{ 
                    width: Math.min(size, 34), 
                    height: Math.min(size, 34), 
                    backgroundColor: currentColor === 'RAINBOW' ? '#8b5cf6' : currentColor,
                  }}
                />
              </button>
            ))}
          </div>
        </aside>
      </div>

      {/* Gallery Modal */}
      <AnimatePresence>
        {showGallery && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowGallery(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="gallery-title"
              className="bg-white p-6 md:p-8 rounded-[40px] shadow-2xl relative z-50 w-full max-w-4xl max-h-[90vh] flex flex-col"
            >
              <h2 id="gallery-title" className="text-3xl font-black mb-6 text-center text-gray-800 flex items-center justify-center gap-3">
                <FolderOpen size={32} className="text-pink-500" />
                My Magical Art Gallery
              </h2>
              {galleryError && (
                <p role="alert" className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-700">
                  {galleryError}
                </p>
              )}
              
              <div className="flex-1 overflow-y-auto min-h-[300px]">
                {savedArtworks.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-4">
                    <ImagePlus size={64} className="opacity-50" />
                    <p className="text-xl font-bold">No drawings saved yet!</p>
                    <p>Draw something amazing and tap Save to keep it here.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6">
                    {savedArtworks.map((url, i) => (
                      <div key={i} className="group relative aspect-video bg-gray-100 rounded-3xl overflow-hidden shadow-sm border-2 border-transparent hover:border-pink-300 transition-all">
                        <img src={url} alt={`Saved artwork ${i+1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <button 
                            onClick={() => {
                              const img = new Image();
                              img.onload = () => {
                                const canvas = canvasRef.current;
                                const ctx = canvas?.getContext('2d');
                                if (!canvas || !ctx) return;

                                fillCanvasWhite(ctx, canvas);
                                drawImageCentered(ctx, canvas, img);
                                saveToHistory();
                                setShowGallery(false);
                              };
                              img.src = url;
                            }}
                            aria-label={`Load saved artwork ${i + 1}`}
                            className="bg-white text-gray-800 px-6 py-3 rounded-full font-bold shadow-xl hover:scale-110 active:scale-95 transition-all"
                          >
                            Load Canvas
                          </button>
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            const newGallery = savedArtworks.filter((_, index) => index !== i);
                            setSavedArtworks(newGallery);
                            setGalleryError(writeSavedArtworks(newGallery) ? null : 'Gallery storage could not be updated.');
                          }}
                          aria-label={`Delete saved artwork ${i + 1}`}
                          className="absolute top-2 right-2 bg-white/80 p-2 rounded-full text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <button 
                onClick={() => setShowGallery(false)}
                aria-label="Close art gallery"
                className="mt-6 w-full py-4 bg-gray-100 rounded-2xl font-bold text-gray-600 hover:bg-gray-200 text-lg"
              >
                Back to Drawing
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
