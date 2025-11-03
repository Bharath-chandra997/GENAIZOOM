import React, { useEffect, useRef, useState } from 'react';
import './ScribbleOverlay.css';

const ScribbleOverlay = ({ socketRef, roomId, onClose, participants = [], currentUser }) => {
  const [image, setImage] = useState(null);
  const [pendingImage, setPendingImage] = useState(null);
  const [userColors, setUserColors] = useState({});
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
        };
        el.src = img;
      } else {
        imageRef.current = null;
        const c = canvasImageRef.current;
        if (c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
      }
    };

    const onUserColors = (colors) => {
      setUserColors(colors || {});
      const sid = socket.id;
      if (sid && colors && colors[sid]) setMyColor(colors[sid]);
    };

    const onStroke = (stroke) => {
      drawStroke(stroke);
    };

    socket.on('scribble:image', onImage);
    socket.on('scribble:userColors', onUserColors);
    socket.on('scribble:stroke', onStroke);
    socket.emit('scribble:request-state', { roomId });

    return () => {
      socket.off('scribble:image', onImage);
      socket.off('scribble:userColors', onUserColors);
      socket.off('scribble:stroke', onStroke);
    };
  }, [roomId, socketRef]);

  // Canvas sizing
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
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const drawImage = () => {
    const c = canvasImageRef.current;
    const img = imageRef.current;
    if (!c || !img) return;
    const ctx = c.getContext('2d');
    const { clientWidth, clientHeight } = c;
    ctx.clearRect(0, 0, clientWidth, clientHeight);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, clientWidth, clientHeight);
    // Enlarge to ~94% of container
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
      if (s.shape === 'circle') { ctx.beginPath(); ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2); ctx.stroke(); }
      if (s.shape === 'line' || s.shape === 'arrow') { ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke(); }
      ctx.restore();
    }
  };

  // Upload flow
  const handleUploadClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => setPendingImage(reader.result);
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const confirmImage = () => {
    if (!pendingImage) return;
    setImage(pendingImage);
    const socket = socketRef?.current;
    if (socket) socket.emit('scribble:image', { roomId, img: pendingImage });
    setPendingImage(null);
  };

  // Drawing handlers
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
      const stroke = { id: Date.now() + Math.random(), type: 'path', color: myColor, width: thickness, alpha: 1, points: [{ x, y }], userId: socketRef.current?.id };
      currentStrokeRef.current = stroke;
      drawStroke(stroke);
      socketRef.current?.emit('scribble:stroke', { roomId, stroke });
    }
  };
  const onMove = (e) => {
    if (!isDrawing) return;
    if (tool === 'pen' && currentStrokeRef.current) {
      const { x, y } = getXY(e);
      currentStrokeRef.current.points.push({ x, y });
      drawStroke(currentStrokeRef.current);
      if (currentStrokeRef.current.points.length % 3 === 0) {
        socketRef.current?.emit('scribble:stroke', { roomId, stroke: { ...currentStrokeRef.current } });
      }
    }
  };
  const onUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (tool === 'pen' && currentStrokeRef.current) {
      socketRef.current?.emit('scribble:stroke', { roomId, stroke: { ...currentStrokeRef.current } });
      currentStrokeRef.current = null;
    }
  };

  return (
    <div className="scribble-root">
      <div className="scribble-backdrop" onClick={onClose} />
      <div className="scribble-stage" onClick={(e) => e.stopPropagation()}>
        <div className="scribble-toolbar">
          <button className={`tool ${tool === 'pen' ? 'active' : ''}`} onClick={() => setTool('pen')} title="Pen">✏️</button>
          <input type="color" value={myColor} onChange={(e) => setMyColor(e.target.value)} className="tool-color-input" />
          <input type="range" min="1" max="20" value={thickness} onChange={(e) => setThickness(parseInt(e.target.value, 10))} className="tool-size-input" />
          {!image && (
            <button className="scribble-upload-btn" onClick={handleUploadClick}>Upload Image</button>
          )}
          {pendingImage && (
            <div className="scribble-upload-actions">
              <button onClick={() => setPendingImage(null)} className="scribble-action-btn">Cancel</button>
              <button onClick={confirmImage} className="scribble-action-btn primary">Confirm</button>
            </div>
          )}
          <button className="tool" onClick={onClose}>Close</button>
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

        {Object.keys(userColors).length > 0 && (
          <div className="scribble-legend">
            <div className="scribble-legend-header">Participants</div>
            <div className="scribble-legend-items">
              {Object.entries(userColors).map(([id, color]) => {
                const p = Array.isArray(participants) ? participants.find(x => x?.userId === id) : null;
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


