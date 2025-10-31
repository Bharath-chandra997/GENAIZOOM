import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FiX, FiEdit3, FiRotateCcw, FiRotateCw, FiTrash2, FiMinusCircle, FiSquare, FiCircle, FiArrowUpRight, FiZoomIn, FiMove } from 'react-icons/fi';
import './ScribbleOverlay.css';

const generateRandomColor = () => `#${Math.random().toString(16).slice(2, 8)}`;

const ScribbleOverlay = ({
  socketRef,
  roomId,
  onClose,
  initialColor,
  participants = [],
  currentUser,
}) => {
  const [image, setImage] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [drawings, setDrawings] = useState([]);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(initialColor || generateRandomColor());
  const [thickness, setThickness] = useState(4);
  const [isDrawing, setIsDrawing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const lastPointRef = useRef(null);
  const [uploadLocked, setUploadLocked] = useState(false);
  const [lockedBy, setLockedBy] = useState(null);
  const imageRef = useRef(null);
  const previewRef = useRef(null); // temporary shape/text preview state
  const redoStackRef = useRef([]);

  // Socket subscriptions
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;

    const onImage = (img) => setImage(img);
    const onDrawings = (data) => setDrawings(Array.isArray(data) ? data : []);
    const onLock = ({ locked, by }) => { setUploadLocked(locked); setLockedBy(by || null); };
    const onRemoveImage = () => { setImage(null); setDrawings([]); setUploadLocked(false); setLockedBy(null); };

    socket.on('scribble:image', onImage);
    socket.on('scribble:drawings', onDrawings);
    socket.on('scribble:lock', onLock);
    socket.on('scribble:removeImage', onRemoveImage);

    // Request current state immediately
    socket.emit('scribble:request-state', { roomId });

    return () => {
      socket.off('scribble:image', onImage);
      socket.off('scribble:drawings', onDrawings);
      socket.off('scribble:lock', onLock);
      socket.off('scribble:removeImage', onRemoveImage);
    };
  }, [socketRef, roomId]);

  // Load image only when source changes
  useEffect(() => {
    if (!image) { imageRef.current = null; redraw(); return; }
    const img = new Image();
    img.onload = () => { imageRef.current = img; redraw(); };
    img.src = image;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  // Redraw when drawings/zoom/preview change
  useEffect(() => { redraw(); }, [drawings, zoom]);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = canvas;
    if (canvas.width !== clientWidth * dpr || canvas.height !== clientHeight * dpr) {
      canvas.width = clientWidth * dpr;
      canvas.height = clientHeight * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, clientWidth, clientHeight);

    // Draw image centered at 70% viewport width
    if (imageRef.current) {
      const img = imageRef.current;
      const maxW = clientWidth * 0.7;
      const scale = Math.min(maxW / img.width, (clientHeight * 0.7) / img.height);
      const drawW = img.width * scale * zoom;
      const drawH = img.height * scale * zoom;
      const x = (clientWidth - drawW) / 2;
      const y = (clientHeight - drawH) / 2;
      ctx.drawImage(img, x, y, drawW, drawH);
    }
    drawAllStrokes(ctx);
    drawPreview(ctx);
  };

  const drawAllStrokes = (context) => {
    drawings.forEach((s) => {
      if (s.type === 'path') {
        context.save();
        context.globalAlpha = s.alpha ?? 1;
        context.strokeStyle = s.color;
        context.lineWidth = s.width;
        context.lineJoin = 'round';
        context.lineCap = 'round';
        context.beginPath();
        s.points.forEach((p, idx) => {
          if (idx === 0) context.moveTo(p.x, p.y);
          else context.lineTo(p.x, p.y);
        });
        context.stroke();
        context.restore();
      } else if (s.type === 'shape') {
        context.strokeStyle = s.color;
        context.lineWidth = s.width;
        if (s.shape === 'rect') {
          context.strokeRect(s.x, s.y, s.w, s.h);
        } else if (s.shape === 'circle') {
          context.beginPath();
          context.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
          context.stroke();
        } else if (s.shape === 'arrow' || s.shape === 'line') {
          context.beginPath();
          context.moveTo(s.x1, s.y1);
          context.lineTo(s.x2, s.y2);
          context.stroke();
        }
      } else if (s.type === 'text') {
        context.fillStyle = s.color;
        context.font = `${s.size || 18}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
        context.fillText(s.text, s.x, s.y);
      }
    });
  };

  const drawPreview = (context) => {
    const p = previewRef.current;
    if (!p) return;
    context.save();
    context.strokeStyle = p.color;
    context.lineWidth = p.width;
    if (p.shape === 'rect') context.strokeRect(p.x, p.y, p.w, p.h);
    if (p.shape === 'circle') { context.beginPath(); context.arc(p.cx, p.cy, p.r, 0, Math.PI * 2); context.stroke(); }
    if (p.shape === 'arrow' || p.shape === 'line') { context.beginPath(); context.moveTo(p.x1, p.y1); context.lineTo(p.x2, p.y2); context.stroke(); }
    context.restore();
  };

  const emitDrawings = (updated) => {
    setDrawings(updated);
    const socket = socketRef?.current;
    if (socket) socket.emit('scribble:drawings', { roomId, data: updated });
  };

  const handlePointerDown = (e) => {
    if (!image) return;
    setIsDrawing(true);
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    lastPointRef.current = { x, y };

    if (tool === 'pen' || tool === 'highlighter') {
      const stroke = { type: 'path', color, width: thickness, points: [{ x, y }], alpha: tool === 'highlighter' ? 0.35 : 1 };
      emitDrawings([...drawings, stroke]);
    } else if (tool === 'eraser') {
      // Simple eraser: remove last stroke
      emitDrawings(drawings.slice(0, -1));
      redoStackRef.current = [];
    } else if (['rect','circle','arrow','line'].includes(tool)) {
      previewRef.current = { shape: tool, color, width: thickness, x, y, x1:x, y1:y };
      redraw();
    } else if (tool === 'text') {
      const text = window.prompt('Enter text');
      if (text && text.trim()) {
        const stroke = { type: 'text', text, x, y, color, size: Math.max(14, thickness * 3) };
        emitDrawings([...drawings, stroke]);
        redoStackRef.current = [];
      }
    }
  };

  const handlePointerMove = (e) => {
    if (!isDrawing) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (tool === 'pen' || tool === 'highlighter') {
      const updated = [...drawings];
      const last = updated[updated.length - 1];
      if (last && last.type === 'path') {
        last.points.push({ x, y });
        emitDrawings(updated);
      }
    } else if (['rect','circle','arrow','line'].includes(tool)) {
      const p = previewRef.current;
      if (!p) return;
      if (tool === 'rect') { p.w = x - p.x; p.h = y - p.y; }
      if (tool === 'circle') { const dx = x - p.x; const dy = y - p.y; p.cx = p.x; p.cy = p.y; p.r = Math.sqrt(dx*dx + dy*dy); }
      if (tool === 'arrow' || tool === 'line') { p.x2 = x; p.y2 = y; }
      redraw();
    }
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
    lastPointRef.current = null;
    if (previewRef.current) {
      const p = previewRef.current;
      previewRef.current = null;
      if (p.shape === 'rect') emitDrawings([...drawings, { type:'shape', shape:'rect', x:p.x, y:p.y, w:p.w, h:p.h, color, width: thickness }]);
      if (p.shape === 'circle') emitDrawings([...drawings, { type:'shape', shape:'circle', cx:p.cx, cy:p.cy, r:p.r, color, width: thickness }]);
      if (p.shape === 'arrow') emitDrawings([...drawings, { type:'shape', shape:'arrow', x1:p.x1, y1:p.y1, x2:p.x2, y2:p.y2, color, width: thickness }]);
      if (p.shape === 'line') emitDrawings([...drawings, { type:'shape', shape:'line', x1:p.x1, y1:p.y1, x2:p.x2, y2:p.y2, color, width: thickness }]);
      redoStackRef.current = [];
    }
  };

  const handleUpload = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      setPendingImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const confirmImage = () => {
    const img = pendingImage;
    setPendingImage(null);
    setImage(img);
    const socket = socketRef?.current;
    if (socket) socket.emit('scribble:image', { roomId, img });
    // New image clears drawings
    emitDrawings([]);
  };

  const removeConfirmedImage = () => {
    const socket = socketRef?.current;
    if (socket) socket.emit('scribble:removeImage', { roomId });
    setImage(null);
    emitDrawings([]);
  };

  const savePng = () => {
    const canvas = document.createElement('canvas');
    const w = canvasRef.current.clientWidth;
    const h = canvasRef.current.clientHeight;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    // Render current overlay to export (basic: image + strokes)
    // For brevity, we use current canvas draw pass
    const exportCanvas = canvasRef.current;
    const data = exportCanvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = data; a.download = `scribble-${Date.now()}.png`;
    a.click();
  };

  return (
    <div className="scribble-root">
      <div className="scribble-backdrop" />
      <div className="scribble-stage" ref={containerRef}>
        <canvas
          ref={canvasRef}
          className="scribble-canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      </div>
      <button className="scribble-close" onClick={onClose} title="Close">×</button>

      {!image && (
        <motion.div
          className="scribble-modal"
          initial={{ opacity: 0, scale: 0.8, y: 50 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        >
          <div className="scribble-dropzone">
            <div style={{ color:'#fff', fontFamily:'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', fontSize:20, marginBottom:12 }}>
              Upload an image to start Scribbling
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
              style={{ display:'block', margin:'0 auto', color:'#fff' }}
            />
          </div>
          {pendingImage && (
            <div className="scribble-actions">
              <button onClick={() => setPendingImage(null)}>Remove</button>
              <button disabled={uploadLocked && lockedBy && lockedBy !== currentUser?.id} onClick={confirmImage}>Confirm</button>
            </div>
          )}
        </motion.div>
      )}

      {image && (
        <motion.div
          className="scribble-toolbar"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        >
          <div className="scribble-row">
            <button className={`tool ${tool === 'pen' ? 'active' : ''}`} onClick={() => setTool('pen')} title="Pen"><FiEdit3 /></button>
            <button className={`tool ${tool === 'eraser' ? 'active' : ''}`} onClick={() => setTool('eraser')} title="Eraser"><FiMinusCircle /></button>
            <button className={`tool ${tool === 'highlighter' ? 'active' : ''}`} onClick={() => setTool('highlighter')} title="Highlighter">H</button>
            <button className={`tool ${tool === 'rect' ? 'active' : ''}`} onClick={() => setTool('rect')} title="Rectangle"><FiSquare /></button>
            <button className={`tool ${tool === 'circle' ? 'active' : ''}`} onClick={() => setTool('circle')} title="Circle"><FiCircle /></button>
            <button className={`tool ${tool === 'arrow' ? 'active' : ''}`} onClick={() => setTool('arrow')} title="Arrow"><FiArrowUpRight /></button>
            <button className={`tool ${tool === 'line' ? 'active' : ''}`} onClick={() => setTool('line')} title="Line">/</button>
            <button className="tool" onClick={() => { if (drawings.length) emitDrawings(drawings.slice(0, -1)); }} title="Undo"><FiRotateCcw /></button>
            <button className="tool" onClick={() => emitDrawings([])} title="Clear All"><FiTrash2 /></button>
            <button className="tool" onClick={() => setZoom(Math.min(2, zoom + 0.1))} title="Zoom In"><FiZoomIn /></button>
            <button className="tool" onClick={() => setTool('move')} title="Move"><FiMove /></button>
            <button className="tool" onClick={savePng} title="Save PNG">⬇️</button>
            <button className="tool danger" onClick={onClose} title="Close"><FiX /></button>
          </div>
          <div className="scribble-row">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            <input type="range" min="1" max="20" value={thickness} onChange={(e) => setThickness(parseInt(e.target.value, 10))} />
            <div className="scribble-user" title="Your color">
              <span className="dot" style={{ backgroundColor: color }} />
            </div>
            {lockedBy === currentUser?.id && (
              <button className="tool" onClick={removeConfirmedImage} title="Remove Image"><FiTrash2 /></button>
            )}
          </div>
        </motion.div>
      )}

      {/* Legend */}
      <div className="scribble-legend">
        {participants.map((p) => (
          <div key={p.userId} className="scribble-legend-item">
            <span className="scribble-legend-dot" style={{ backgroundColor: p.color }} />
            <span>{p.username}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ScribbleOverlay;


