import React, { useEffect, useRef, useState } from 'react';
import './ScribbleOverlay.css';

const ScribbleOverlay = ({ socketRef, roomId, onClose, participants = [], currentUser }) => {
  const [image, setImage] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [userColors, setUserColors] = useState({});
  const [strokesArray, setStrokesArray] = useState([]);
  const [tool, setTool] = useState('pen');
  const [thickness, setThickness] = useState(4);
  const [myColor, setMyColor] = useState('#2b6cb0');
  const [isDrawing, setIsDrawing] = useState(false);
  const imageRef = useRef(null);
  const canvasImageRef = useRef(null);
  const canvasDrawRef = useRef(null);
  const currentStrokeRef = useRef(null);

  // Socket bindings
  useEffect(() => {
    const socket = socketRef?.current;
    if (!socket) return;

    const onImage = (img) => {
      setImage(img);
      if (img) {
        const el = new Image();
        el.onload = () => {
          imageRef.current = el;
          drawImage();
          redrawAll();
        };
        el.onerror = () => console.error('Failed to load image');
        el.src = img;
      } else {
        imageRef.current = null;
        clearCanvas(canvasImageRef.current);
        setStrokesArray([]);
      }
    };

    const onUserColors = (colors) => {
      setUserColors(colors || {});
      const sid = socket.id;
      if (sid && colors && colors[sid]) setMyColor(colors[sid]);
    };

    const onStroke = (stroke) => {
      if (!stroke || typeof stroke !== 'object' || !stroke.id) return;

      setStrokesArray((prev) => {
        const idx = prev.findIndex((s) => s && s.id === stroke.id);
        let updated = idx >= 0 ? [...prev] : [...prev, stroke];
        if (idx >= 0) updated[idx] = { ...stroke };

        const canvas = canvasDrawRef.current;
        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
          updated.forEach((s) => s && drawStroke(s));
        }
        return updated;
      });
    };

    const onDrawings = (data) => {
      if (!Array.isArray(data)) return;
      const filtered = data.filter((s) => s && s.id);
      if (filtered.length === 0) return;

      setStrokesArray(filtered);
      const canvas = canvasDrawRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        filtered.forEach((s) => drawStroke(s));
      }
    };

    const onClearAll = () => {
      setStrokesArray([]);
      clearCanvas(canvasDrawRef.current);
    };

    socket.on('scribble:image', onImage);
    socket.on('scribble:userColors', onUserColors);
    socket.on('scribble:stroke', onStroke);
    socket.on('scribble:drawings', onDrawings);
    socket.on('scribble:clear-all', onClearAll);

    socket.emit('scribble:request-state', { roomId });

    return () => {
      socket.off('scribble:image', onImage);
      socket.off('scribble:userColors', onUserColors);
      socket.off('scribble:stroke', onStroke);
      socket.off('scribble:drawings', onDrawings);
      socket.off('scribble:clear-all', onClearAll);
    };
  }, [roomId, socketRef]);

  const clearCanvas = (canvas) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  };

  const redrawAll = () => {
    const canvas = canvasDrawRef.current;
    if (!canvas || strokesArray.length === 0) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    strokesArray.forEach((s) => s && drawStroke(s));
  };

  // Resize
  useEffect(() => {
    const resize = () => {
      const ci = canvasImageRef.current;
      const cd = canvasDrawRef.current;
      if (!ci || !cd) return;

      const dpr = window.devicePixelRatio || 1;
      const { clientWidth, clientHeight } = ci;
      ci.width = clientWidth * dpr; ci.height = clientHeight * dpr;
      cd.width = clientWidth * dpr; cd.height = clientHeight * dpr;

      const ctxI = ci.getContext('2d');
      const ctxD = cd.getContext('2d');
      ctxI.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctxD.setTransform(dpr, 0, 0, dpr, 0, 0);

      drawImage();
      redrawAll();
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [image]);

  const drawImage = () => {
    const c = canvasImageRef.current;
    const img = imageRef.current;
    if (!c || !img) return;

    const ctx = c.getContext('2d');
    const { clientWidth, clientHeight } = c;
    ctx.clearRect(0, 0, clientWidth, clientHeight);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, clientWidth, clientHeight);

    const maxW = clientWidth * 0.94;
    const maxH = clientHeight * 0.94;
    const scale = Math.min(maxW / img.width, maxH / img.height);
    const drawW = img.width * scale;
    const drawH = img.height * scale;
    const x = (clientWidth - drawW) / 2;
    const y = (clientHeight - drawH) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x, y, drawW, drawH);
  };

  const drawStroke = (s) => {
    const c = canvasDrawRef.current;
    if (!c || !s) return;
    const ctx = c.getContext('2d');

    if (s.type === 'path') {
      ctx.save();
      ctx.globalAlpha = s.alpha ?? 1;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      (s.points || []).forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.restore();
    } else if (s.type === 'shape') {
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      if (s.shape === 'rect') ctx.strokeRect(s.x, s.y, s.w, s.h);
      if (s.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  };

  // Upload or Re-upload
  const handleUploadClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = reader.result;
        // If there's already an image, clear scribbles and reset canvas
        if (image) {
          setStrokesArray([]);
          clearCanvas(canvasDrawRef.current);
          clearCanvas(canvasImageRef.current);
          imageRef.current = null;
          socketRef.current?.emit('scribble:clear-all', { roomId });
        }
        // Load new image
        const el = new Image();
        el.onload = () => {
          imageRef.current = el;
          setImage(img);
          setPendingImage(img);
          drawImage();
          redrawAll();
          socketRef.current?.emit('scribble:image', { roomId, img });
        };
        el.onerror = () => console.error('Failed to load image');
        el.src = img;
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const confirmImage = () => {
    if (!pendingImage) return;
    socketRef.current?.emit('scribble:image', { roomId, img: pendingImage });
    setPendingImage(null);
  };

  // Drawing
  const getXY = (e) => {
    const rect = canvasDrawRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e) => {
    if (!image) return;
    e.preventDefault();
    setIsDrawing(true);
    const { x, y } = getXY(e);

    if (tool === 'pen') {
      const stroke = {
        id: Date.now() + Math.random(),
        type: 'path',
        color: myColor,
        width: thickness,
        alpha: 1,
        points: [{ x, y }],
        userId: socketRef.current?.id,
      };
      currentStrokeRef.current = stroke;
      setStrokesArray((prev) => [...prev, stroke]);
      drawStroke(stroke);
      socketRef.current?.emit('scribble:stroke', { roomId, stroke });
    } else if (tool === 'rect' || tool === 'circle') {
      const stroke = {
        id: Date.now() + Math.random(),
        type: 'shape',
        shape: tool,
        color: myColor,
        width: thickness,
        userId: socketRef.current?.id,
        x, y, w: 0, h: 0, cx: x, cy: y, r: 0,
      };
      currentStrokeRef.current = stroke;
    }
  };

  const onMove = (e) => {
    if (!isDrawing || !image) return;
    e.preventDefault();
    const { x, y } = getXY(e);

    if (tool === 'pen' && currentStrokeRef.current) {
      const points = currentStrokeRef.current.points;
      points.push({ x, y });

      const ctx = canvasDrawRef.current.getContext('2d');
      const len = points.length;
      if (len >= 2) {
        const prev = points[len - 2];
        const curr = points[len - 1];
        ctx.save();
        ctx.strokeStyle = myColor;
        ctx.lineWidth = thickness;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
        ctx.restore();
      }

      if (points.length % 3 === 0) {
        socketRef.current?.emit('scribble:stroke', {
          roomId,
          stroke: { ...currentStrokeRef.current, points: [...points] },
        });
      }
    } else if ((tool === 'rect' || tool === 'circle') && currentStrokeRef.current) {
      if (tool === 'rect') {
        currentStrokeRef.current.w = x - currentStrokeRef.current.x;
        currentStrokeRef.current.h = y - currentStrokeRef.current.y;
      } else {
        currentStrokeRef.current.r = Math.hypot(x - currentStrokeRef.current.cx, y - currentStrokeRef.current.cy);
      }

      const canvas = canvasDrawRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      strokesArray.forEach((s) => drawStroke(s));
      drawStroke(currentStrokeRef.current);
    }
  };

  const onUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);

    if (tool === 'pen' && currentStrokeRef.current) {
      const finalStroke = { ...currentStrokeRef.current, points: [...currentStrokeRef.current.points] };
      setStrokesArray((prev) => {
        const idx = prev.findIndex((s) => s.id === finalStroke.id);
        const updated = idx >= 0 ? [...prev] : [...prev, finalStroke];
        if (idx >= 0) updated[idx] = finalStroke;
        return updated;
      });
      socketRef.current?.emit('scribble:stroke', { roomId, stroke: finalStroke });
      currentStrokeRef.current = null;
    } else if ((tool === 'rect' || tool === 'circle') && currentStrokeRef.current) {
      const finalShape = { ...currentStrokeRef.current };
      setStrokesArray((prev) => [...prev, finalShape]);
      socketRef.current?.emit('scribble:stroke', { roomId, stroke: finalShape });
      currentStrokeRef.current = null;
    }
  };

  // GLOBAL CLEAR
  const clearAll = () => {
    setStrokesArray([]);
    clearCanvas(canvasDrawRef.current);
    drawImage();
    socketRef.current?.emit('scribble:clear-all', { roomId });
  };

  // DOWNLOAD CANVAS
  const downloadCanvas = () => {
    const ci = canvasImageRef.current;
    const cd = canvasDrawRef.current;
    if (!ci || !cd) return;

    const exportCanvas = document.createElement('canvas');
    const ctx = exportCanvas.getContext('2d');
    exportCanvas.width = ci.width;
    exportCanvas.height = ci.height;

    ctx.drawImage(ci, 0, 0);
    ctx.drawImage(cd, 0, 0);

    exportCanvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scribble-${roomId}-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <div className="scribble-root">
      <div className="scribble-backdrop" onClick={onClose} />
      <div className="scribble-stage" onClick={(e) => e.stopPropagation()}>
        <div className="scribble-toolbar">
          {/* Pen */}
          <button
            className={`tool ${tool === 'pen' ? 'active' : ''}`}
            onClick={() => setTool('pen')}
            title="Pen"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
              <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
              <path d="M2 2l7.586 7.586"></path>
              <circle cx="11" cy="11" r="2"></circle>
            </svg>
          </button>

          {/* Rectangle */}
          <button
            className={`tool ${tool === 'rect' ? 'active' : ''}`}
            onClick={() => setTool('rect')}
            title="Rectangle"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            </svg>
          </button>

          {/* Circle */}
          <button
            className={`tool ${tool === 'circle' ? 'active' : ''}`}
            onClick={() => setTool('circle')}
            title="Circle"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
            </svg>
          </button>

          {/* Clear All */}
          <button className="tool" onClick={clearAll} title="Clear All">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>

          {/* Download */}
          <button className="tool" onClick={downloadCanvas} title="Download">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>

          {/* Re-upload Image */}
          <button 
            className="tool" 
            onClick={handleUploadClick} 
            title={image ? "Re-upload Image" : "Upload Image"}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
          </button>

          {/* Thickness */}
          <input
            type="range"
            min="1"
            max="20"
            value={thickness}
            onChange={(e) => setThickness(parseInt(e.target.value, 10))}
            className="tool-size-input"
            title={`Thickness: ${thickness}`}
          />

          {/* Confirm/Cancel */}
          {pendingImage && (
            <div className="scribble-upload-actions">
              <button onClick={() => setPendingImage(null)} className="scribble-action-btn" title="Cancel">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
              <button onClick={confirmImage} className="scribble-action-btn primary" title="Confirm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
            </div>
          )}

          {/* Close */}
          <button className="tool" onClick={onClose} title="Close">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div className="scribble-canvas-wrap">
          <canvas ref={canvasImageRef} className="scribble-canvas-image" />
          <canvas
            ref={canvasDrawRef}
            className="scribble-canvas-draw"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
            onMouseDown={onDown}
            onMouseMove={onMove}
            onMouseUp={onUp}
            onMouseLeave={onUp}
          />
        </div>

        {/* Participant Legend */}
        {Object.keys(userColors).length > 0 && (
          <div className="scribble-legend">
            <div className="scribble-legend-header">Participants</div>
            <div className="scribble-legend-items">
              {Object.entries(userColors).map(([id, color]) => {
                const p = participants.find(x => x?.userId === id);
                const name = p?.username || id.slice(0, 6);
                const isYou = currentUser?.id === id;
                return (
                  <div key={id} className={`scribble-legend-item ${isYou ? 'current-user' : ''}`}>
                    <span className="scribble-legend-dot" style={{ backgroundColor: color }} />
                    <span className="scribble-legend-name">{name} {isYou ? '(You)' : ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScribbleOverlay;