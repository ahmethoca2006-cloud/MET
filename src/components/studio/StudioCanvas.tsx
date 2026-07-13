import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect, Text as KonvaText, Transformer } from 'react-konva';
import type Konva from 'konva';
import type { Page } from '../../types';
import { BLEND_TO_COMPOSITE, type StudioLayer, type TextLayerData } from './studioTypes';
import { detectBubbleCenter } from './bubbleDetect';
import { swalToast } from '../../lib/swalTheme';

const MIN_SCALE = 0.1;
const MAX_SCALE = 8;

interface StudioCanvasProps {
  page: Page | null;
  showCleaned: boolean;
  activeTool: string;
  /** Bumped by the parent (e.g. toolbar "Fit" button) to force a re-fit. */
  fitSignal: number;
  /** Non-background layers stacked above the page image, bottom to top. */
  layers: StudioLayer[];
  activeLayerId: string | null;
  onSelectLayer: (id: string) => void;
  /** x/y are in page-image coordinates. */
  onAddTextLayer: (x: number, y: number) => void;
  onUpdateTextLayer: (id: string, patch: Partial<TextLayerData>) => void;
}

export interface StudioCanvasHandle {
  /** Flood-fills the page around a text layer to find its speech bubble and re-centers it there. */
  centerTextLayerInBubble: (id: string) => void;
}

export const StudioCanvas = forwardRef<StudioCanvasHandle, StudioCanvasProps>(function StudioCanvas({
  page, showCleaned, activeTool, fitSignal, layers,
  activeLayerId, onSelectLayer, onAddTextLayer, onUpdateTextLayer,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const textNodeRefs = useRef<Record<string, Konva.Text | null>>({});
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  imageRef.current = image;
  const pinchDistRef = useRef<number | null>(null);
  const [touchCount, setTouchCount] = useState(0);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    centerTextLayerInBubble(id: string) {
      const layer = layersRef.current.find(l => l.id === id);
      const img = imageRef.current;
      if (!layer?.text || !img) return;
      const lineCount = layer.text.content.split('\n').length || 1;
      const textHeight = lineCount * layer.text.fontSize * layer.text.lineHeight;
      const seedX = layer.text.x;
      const seedY = layer.text.y + textHeight / 2;
      const result = detectBubbleCenter(img, seedX, seedY);
      if (!result) {
        swalToast({ icon: 'info', title: 'No bubble detected — place the text over a light bubble first' });
        return;
      }
      onUpdateTextLayer(id, {
        x: result.x - layer.text.width / 2,
        y: result.y - textHeight / 2,
      });
      swalToast({ icon: 'success', title: 'Centered in bubble' });
    },
  }), [onUpdateTextLayer]);

  const activeSource = showCleaned && page?.cleaned ? page.cleaned : page?.original ?? null;

  // Load the active image element for Konva.
  useEffect(() => {
    if (!activeSource) { setImage(null); return; }
    const img = new window.Image();
    img.src = activeSource.dataUrl;
    img.onload = () => setImage(img);
    return () => { img.onload = null; };
  }, [activeSource]);

  // Track container size responsively.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setContainerSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitToScreen = useCallback(() => {
    if (!image || containerSize.width === 0 || containerSize.height === 0) return;
    const padding = 32;
    const scaleX = (containerSize.width - padding * 2) / image.width;
    const scaleY = (containerSize.height - padding * 2) / image.height;
    const next = Math.min(scaleX, scaleY, 1.5);
    setScale(next);
    setPos({
      x: (containerSize.width - image.width * next) / 2,
      y: (containerSize.height - image.height * next) / 2,
    });
  }, [image, containerSize]);

  useEffect(() => { fitToScreen(); }, [fitToScreen, page?.id, fitSignal]);

  // Freshly created text layers start empty — drop straight into editing mode.
  useEffect(() => {
    const layer = layersRef.current.find(l => l.id === activeLayerId);
    if (layer?.type === 'text' && layer.text?.content === '') {
      setEditingLayerId(layer.id);
    }
  }, [activeLayerId]);

  // Keep the Transformer bound to the selected text layer's node.
  useEffect(() => {
    const transformer = transformerRef.current;
    if (!transformer) return;
    const node = activeTool === 'select' && !editingLayerId && activeLayerId
      ? textNodeRefs.current[activeLayerId]
      : null;
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [activeLayerId, activeTool, editingLayerId, layers]);

  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    if (activeTool !== 'text') return;
    const targetClass = e.target.getClassName?.();
    if (e.target !== e.target.getStage() && targetClass !== 'Image' && targetClass !== 'Rect') return;
    const stage = stageRef.current;
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;
    onAddTextLayer((pointer.x - pos.x) / scale, (pointer.y - pos.y) / scale);
  };

  const editingLayer = editingLayerId ? layers.find(l => l.id === editingLayerId) ?? null : null;

  const handleWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;

    const oldScale = scale;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const zoomFactor = 1.08;
    const newScale = clampScale(direction > 0 ? oldScale * zoomFactor : oldScale / zoomFactor);

    const mousePointTo = {
      x: (pointer.x - pos.x) / oldScale,
      y: (pointer.y - pos.y) / oldScale,
    };

    setScale(newScale);
    setPos({
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    });
  };

  const handleTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const touches = e.evt.touches;
    if (touches.length !== 2) return;
    e.evt.preventDefault();

    const [t1, t2] = [touches[0], touches[1]];
    const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const center = {
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    };
    const stage = stageRef.current;
    const box = containerRef.current?.getBoundingClientRect();
    if (!stage || !box) return;
    const stagePoint = { x: center.x - box.left, y: center.y - box.top };

    if (pinchDistRef.current == null) {
      pinchDistRef.current = dist;
      return;
    }

    const oldScale = scale;
    const newScale = clampScale(oldScale * (dist / pinchDistRef.current));
    pinchDistRef.current = dist;

    const stagePointTo = {
      x: (stagePoint.x - pos.x) / oldScale,
      y: (stagePoint.y - pos.y) / oldScale,
    };
    setScale(newScale);
    setPos({
      x: stagePoint.x - stagePointTo.x * newScale,
      y: stagePoint.y - stagePointTo.y * newScale,
    });
  };

  const handleTouchEnd = (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (e.evt.touches.length < 2) pinchDistRef.current = null;
    setTouchCount(e.evt.touches.length);
  };

  const draggable = activeTool === 'pan' || activeTool === 'select';

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-[#0b0b0d] touch-none">
      {containerSize.width > 0 && (
        <Stage
          ref={stageRef}
          width={containerSize.width}
          height={containerSize.height}
          scaleX={scale}
          scaleY={scale}
          x={pos.x}
          y={pos.y}
          draggable={draggable && touchCount < 2}
          onDragEnd={(e) => setPos({ x: e.target.x(), y: e.target.y() })}
          onWheel={handleWheel}
          onTouchMove={handleTouchMove}
          onTouchStart={(e) => setTouchCount(e.evt.touches.length)}
          onTouchEnd={handleTouchEnd}
          onClick={handleStageClick}
          onTap={handleStageClick}
        >
          <Layer>
            {image && (
              <>
                <Rect
                  x={-4}
                  y={-4}
                  width={image.width + 8}
                  height={image.height + 8}
                  fill="#000000"
                  shadowColor="black"
                  shadowBlur={20}
                  shadowOpacity={0.6}
                />
                <KonvaImage image={image} width={image.width} height={image.height} />
              </>
            )}
          </Layer>

          {/* Each Studio layer (clean patches, text, bubble masks...) gets its own Konva
              layer so opacity and blend mode compose independently of the background. */}
          {layers.filter(l => !l.isBackground).map(layer => (
            <Layer
              key={layer.id}
              visible={layer.visible}
              opacity={layer.opacity}
              globalCompositeOperation={BLEND_TO_COMPOSITE[layer.blendMode]}
              listening={layer.visible && !layer.locked}
            >
              {layer.type === 'text' && layer.text && (
                <KonvaText
                  ref={(node) => { textNodeRefs.current[layer.id] = node; }}
                  visible={layer.id !== editingLayerId}
                  text={layer.text.content || ' '}
                  x={layer.text.x}
                  y={layer.text.y}
                  width={layer.text.width}
                  fontFamily={layer.text.fontFamily}
                  fontSize={layer.text.fontSize}
                  fontStyle={`${layer.text.bold ? 'bold' : ''} ${layer.text.italic ? 'italic' : ''}`.trim() || 'normal'}
                  fill={layer.text.color}
                  align={layer.text.align}
                  lineHeight={layer.text.lineHeight}
                  stroke={layer.text.strokeWidth > 0 ? layer.text.strokeColor : undefined}
                  strokeWidth={layer.text.strokeWidth}
                  rotation={layer.text.rotation}
                  draggable={activeTool === 'select' && !layer.locked}
                  onClick={() => onSelectLayer(layer.id)}
                  onTap={() => onSelectLayer(layer.id)}
                  onDblClick={() => { onSelectLayer(layer.id); setEditingLayerId(layer.id); }}
                  onDblTap={() => { onSelectLayer(layer.id); setEditingLayerId(layer.id); }}
                  onDragEnd={(e) => onUpdateTextLayer(layer.id, { x: e.target.x(), y: e.target.y() })}
                  onTransformEnd={(e) => {
                    const node = e.target as Konva.Text;
                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();
                    node.scaleX(1);
                    node.scaleY(1);
                    onUpdateTextLayer(layer.id, {
                      x: node.x(),
                      y: node.y(),
                      rotation: node.rotation(),
                      width: Math.max(20, node.width() * scaleX),
                      fontSize: Math.max(6, layer.text!.fontSize * scaleY),
                    });
                  }}
                />
              )}
            </Layer>
          ))}

          <Layer>
            <Transformer
              ref={transformerRef}
              rotateEnabled
              enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left', 'middle-right']}
              boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 ? oldBox : newBox)}
            />
          </Layer>
        </Stage>
      )}
      {editingLayer?.text && (
        <textarea
          autoFocus
          value={editingLayer.text.content}
          onChange={(e) => onUpdateTextLayer(editingLayer.id, { content: e.target.value })}
          onBlur={() => setEditingLayerId(null)}
          onKeyDown={(e) => { if (e.key === 'Escape') setEditingLayerId(null); }}
          className="absolute p-0 m-0 bg-black/20 border border-dashed border-white/50 outline-none resize-none overflow-hidden"
          style={{
            top: pos.y + editingLayer.text.y * scale,
            left: pos.x + editingLayer.text.x * scale,
            width: editingLayer.text.width * scale,
            fontSize: editingLayer.text.fontSize * scale,
            fontFamily: editingLayer.text.fontFamily,
            fontWeight: editingLayer.text.bold ? 'bold' : 'normal',
            fontStyle: editingLayer.text.italic ? 'italic' : 'normal',
            lineHeight: editingLayer.text.lineHeight,
            color: editingLayer.text.color,
            textAlign: editingLayer.text.align,
            zIndex: 20,
          }}
        />
      )}
      {!page && (
        <div className="absolute inset-0 flex items-center justify-center text-white/40 text-sm">
          Select a page to begin
        </div>
      )}
      <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg liquid-glass text-[11px] font-mono text-white/80">
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
});

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}
