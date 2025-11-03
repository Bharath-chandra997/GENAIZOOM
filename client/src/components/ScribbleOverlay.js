import React, { useRef, useEffect, useState, useCallback } from 'react';
import './ScribbleOverlay.css';

const TOOLS = {
  PEN: 'pen',
  RECT: 'rect',
  CIRCLE: 'circle',
  ERASER: 'eraser',
};

const ScribbleOverlay = ({
  socketRef,
  roomId,
  onClose,
  participants,
  currentUser,
  aiResponse,
}) => {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState(TOOLS.PEN);
  const [color, setColor] = useState('#FF0000');
  const [brushSize, setBrushSize] = useState(5);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState(null);
  const [currentShape, setCurrentShape] = useState(null);

  const [strokes, setStrokes] = useState([]); // { type, data, userId, color, size }
  const [imageUrl, setImageUrl] = useState(null);
  const [userColors, setUserColors] = useState({});

  // Assign unique color per user
  useEffect(() => {
    const colors = {};
    participants.forEach(p => {
      if (!colors[p.socketId]) {
        const hue = (p.socketId.charCodeAt(0) * 37) % 360;
        colors[p.socketId] = `hsl(${hue}, 80%, 55%)`;
      }
    });
    setUserColors(colors);
    socketRef.current?.emit('scribble:userColors', { roomId, colors });
  }, [participants, socketRef, roomId]);

  const myColor = userColors[currentUser.id] || '#FF0000';

  // === SOCKET: Sync image & strokes ===
  useEffect(() => {
    const handleImage = (url) => setImageUrl(url);
    const handleStrokes = (all) => setStrokes(all);
    const handleNewStroke = (stroke) => {
      setStrokes(prev => [...prev.filter(s => s.id !== stroke.id), stroke]);
    };
    const handleColors = (colors) => setUserColors(colors);
    const handleClear = () => {
      setStrokes([]);
      setImageUrl(null);
      onClose();
    };

    socketRef.current?.on('scribble:image', handleImage);
    socketRef.current?.on('scribble:strokes', handleStrokes);
    socketRef.current?.on('scribble:stroke', handleNewStroke);
    socketRef.current?.on('scribble:userColors', handleColors);
    socketRef.current?.on('scribble:clear', handleClear);

    return () => {
      socketRef.current?.off('scribble:image');
      socketRef.current?.off('scribble:strokes');
      socketRef.current?.off('scribble:stroke');
      socketRef.current?.off('scribble:userColors');
      socketRef.current?.off('scribble:clear');
    };
  }, [socketRef, onClose]);

  // === CANVAS RESIZE + REDRAW ===
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Enlarged image
    if (imageUrl) {
      const img = new Image();
      img.src = imageUrl;
      img.onload = () => {
        const scale = Math.max(canvas.width / img.width, canvas.height / img.height) * 1.1;
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (canvas.width - w) / 2;
        const y = (canvas.height - h) / 2;
        ctx.drawImage(img, x, y, w, h);
        drawAllStrokes(ctx);
      };
    } else {
      drawAllStrokes(ctx);
    }
  }, [strokes, imageUrl]);

  const drawAllStrokes = (ctx) => {
    strokes.forEach(s => {
      ctx.strokeStyle = s.color || userColors[s.userId] || '#000';
      ctx.lineWidth = s.size || 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (s.type === 'pen' || s.type === 'eraser') {
        ctx.globalCompositeOperation = s.type === 'eraser' ? 'destination-out' : 'source-over';
        ctx.beginPath();
        s.points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();
      } else if (s.type === 'rect') {
        ctx.strokeRect(s.x, s.y, s.w, s.h);
      } else if (s.type === 'circle') {
        ctx.beginPath();
        ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const resize = () => {
      canvas.width = window.innerWidth * 0.9;
      canvas.height = window.innerHeight * 0.8;
      redraw();
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [redraw]);

  // === DRAWING LOGIC ===
  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const clientY = e.clientY || e.touches?.[0]?.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const start = (e) => {
    const pos = getPos(e);
    setIsDrawing(true);
    setStartPos(pos);

    const stroke = {
      id: `${Date.now()}-${Math.random()}`,
      userId: currentUser.id,
      color: tool === TOOLS.ERASER ? null : myColor,
      size: brushSize,
      type: tool,
    };

    if (tool === TOOLS.PEN || tool === TOOLS.ERASER) {
      stroke.points = [pos];
      setCurrentShape(stroke);
    } else {
      setCurrentShape({ ...stroke, x: pos.x, y: pos.y, w: 0, h: 0 });
    }
  };

  const move = (e) => {
    if (!isDrawing) return;
    const pos = getPos(e);

    if (tool === TOOLS.PEN || tool === TOOLS.ERASER) {
      const updated = { ...currentShape, points: [...currentShape.points, pos] };
      setCurrentShape(updated);
      socketRef.current?.emit('scribble:stroke', { roomId, stroke: updated });
    } else if (tool === TOOLS.RECT) {
      const w = pos.x - startPos.x;
      const h = pos.y - startPos.y;
      const updated = { ...currentShape, w, h };
      setCurrentShape(updated);
      socketRef.current?.emit('scribble:stroke', { roomId, stroke: updated });
    } else if (tool === TOOLS.CIRCLE) {
      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      const updated = { ...currentShape, cx: startPos.x, cy: startPos.y, r };
      setCurrentShape(updated);
      socketRef.current?.emit('scribble:stroke', { roomId, stroke: updated });
    }
  };

  const end = () => {
    if (!currentShape) return;
    setStrokes(prev => [...prev, currentShape]);
    socketRef.current?.emit('scribble:strokes', { roomId, strokes: [...strokes, currentShape] });
    setCurrentShape(null);
    setIsDrawing(false);
  };

  // === UPLOAD IMAGE ===
  const uploadImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target.result;
      setImageUrl(url);
      setStrokes([]);
      socketRef.current?.emit('scribble:image', { roomId, url });
    };
    reader.readAsDataURL(file);
  };

  const clearAll = () => {
    socketRef.current?.emit('scribble:clear', { roomId });
  };

  return (
    <div className="scribble-overlay">
      <div className="scribble-toolbar">
        <button onClick={onClose} className="scribble-btn close">✕</button>

        <div className="tool-group">
          <button onClick={() => setTool(TOOLS.PEN)} className={tool === TOOLS.PEN ? 'active' : ''}>✏️</button>
          <button onClick={() => setTool(TOOLS.RECT)} className={tool === TOOLS.RECT ? 'active' : ''}>□</button>
          <button onClick={() => setTool(TOOLS.CIRCLE)} className={tool === TOOLS.CIRCLE ? 'active' : ''}>○</button>
          <button onClick={() => setTool(TOOLS.ERASER)} className={tool === TOOLS.ERASER ? 'active' : ''}>Eraser</button>
        </div>

        <div className="tool-group">
          <input type="color" value={myColor} disabled />
          <input
            type="range"
            min="1"
            max="30"
            value={brushSize}
            onChange={(e) => setBrushSize(+e.target.value)}
          />
          <label>Upload
            <input type="file" accept="image/*" onChange={uploadImage} />
          </label>
          <button onClick={clearAll} className="scribble-btn danger">Clear</button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        className="scribble-canvas"
        onMouseDown={start}
        onMouseMove={move}
        onMouseUp={end}
        onMouseLeave={end}
        onTouchStart={start}
        onTouchMove={move}
        onTouchEnd={end}
      />

      {aiResponse && (
        <div className="ai-banner">
          <strong>AI:</strong> {aiResponse}
        </div>
      )}
    </div>
  );
};

export default ScribbleOverlay;