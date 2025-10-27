import React, { useRef, useEffect, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import './DrawingCanvas.css';

const DrawingCanvas = ({ 
  isVisible, 
  currentTool, 
  currentColor, 
  userId,
  socketRef,
  onDrawingChange,
  canvasHistoryRef
}) => {
  const canvasRef = useRef(null);
  const fabricCanvasRef = useRef(null);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isDrawing = useRef(false);
  const [startPoint, setStartPoint] = useState(null);

  // Initialize Fabric.js canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      isDrawingMode: false,
      width: canvasRef.current.offsetWidth,
      height: canvasRef.current.offsetHeight,
      backgroundColor: 'transparent',
      selection: false,
      preserveObjectStacking: true
    });

    fabricCanvasRef.current = canvas;

    // Handle canvas ready
    canvas.on('after:render', () => {
      const canvasData = canvas.toJSON();
      onDrawingChange(canvasData);
    });

    return () => {
      canvas.dispose();
    };
  }, [onDrawingChange]);

  // Save to history on any object change
  useEffect(() => {
    if (!fabricCanvasRef.current) return;

    const canvas = fabricCanvasRef.current;
    const handler = () => {
      const state = JSON.stringify(canvas.toJSON());
      setHistory(prev => [...prev.slice(0, historyIndex + 1), state]);
      setHistoryIndex(prev => prev + 1);
    };

    canvas.on('object:added', handler);
    canvas.on('object:removed', handler);
    canvas.on('object:modified', handler);

    return () => {
      canvas.off('object:added', handler);
      canvas.off('object:removed', handler);
      canvas.off('object:modified', handler);
    };
  }, [historyIndex]);

  // Listen for drawing events from socket
  useEffect(() => {
    if (!socketRef?.current) return;

    const socket = socketRef.current;

    const handleDrawing = (data) => {
      if (data.userId === userId) return; // Ignore own drawings
      
      applyDrawingData(data);
    };

    socket.on('drawing-event', handleDrawing);

    return () => {
      socket.off('drawing-event', handleDrawing);
    };
  }, [socketRef, userId]);

  const applyDrawingData = useCallback((data) => {
    if (!fabricCanvasRef.current) return;

    try {
      const canvas = fabricCanvasRef.current;
      
      switch (data.type) {
        case 'path':
          if (data.path) {
            const path = new fabric.Path(data.path, {
              stroke: data.color,
              strokeWidth: data.width,
              fill: '',
              left: data.x,
              top: data.y,
              selectable: false,
              evented: false
            });
            canvas.add(path);
          }
          break;
        case 'clear':
          canvas.clear();
          break;
        case 'clear-colors':
          canvas.getObjects().forEach(obj => {
            if (obj.userId === data.userId) {
              canvas.remove(obj);
            }
          });
          break;
        default:
          if (data.objects) {
            canvas.loadFromJSON(data.objects, () => {
              canvas.renderAll();
            });
          }
      }
    } catch (error) {
      console.error('Error applying drawing data:', error);
    }
  }, []);

  // Handle different drawing tools
  useEffect(() => {
    if (!fabricCanvasRef.current) return;

    const canvas = fabricCanvasRef.current;
    
    const handleMouseDown = (e) => {
      const pointer = canvas.getPointer(e.e);
      setStartPoint(pointer);
      isDrawing.current = true;

      if (currentTool === 'pen' || currentTool === 'highlighter') {
        canvas.isDrawingMode = true;
        canvas.freeDrawingBrush.width = currentTool === 'highlighter' ? 20 : 5;
        canvas.freeDrawingBrush.color = currentColor;
        canvas.renderAll();
      }
    };

    const handleMouseMove = (e) => {
      if (!isDrawing.current) return;
      
      const pointer = canvas.getPointer(e.e);
      
      if (currentTool !== 'pen' && currentTool !== 'highlighter') {
        canvas.isDrawingMode = false;
      }
    };

    const handleMouseUp = (e) => {
      const pointer = canvas.getPointer(e.e);

      if (currentTool === 'rectangle') {
        const rect = new fabric.Rect({
          left: Math.min(startPoint.x, pointer.x),
          top: Math.min(startPoint.y, pointer.y),
          width: Math.abs(pointer.x - startPoint.x),
          height: Math.abs(pointer.y - startPoint.y),
          fill: '',
          stroke: currentColor,
          strokeWidth: 2,
          selectable: false,
          evented: false
        });
        canvas.add(rect);
      } else if (currentTool === 'circle') {
        const radius = Math.sqrt(
          Math.pow(pointer.x - startPoint.x, 2) + 
          Math.pow(pointer.y - startPoint.y, 2)
        );
        const circle = new fabric.Circle({
          left: startPoint.x,
          top: startPoint.y,
          radius: radius / 2,
          fill: '',
          stroke: currentColor,
          strokeWidth: 2,
          selectable: false,
          evented: false
        });
        canvas.add(circle);
      } else if (currentTool === 'line') {
        const line = new fabric.Line(
          [startPoint.x, startPoint.y, pointer.x, pointer.y],
          {
            stroke: currentColor,
            strokeWidth: 2,
            selectable: false,
            evented: false
          }
        );
        canvas.add(line);
      } else if (currentTool === 'arrow') {
        const arrow = new fabric.Group([
          new fabric.Line([startPoint.x, startPoint.y, pointer.x, pointer.y], {
            stroke: currentColor,
            strokeWidth: 2
          }),
          new fabric.Polygon([
            {x: pointer.x, y: pointer.y},
            {x: pointer.x - 10, y: pointer.y - 5},
            {x: pointer.x - 10, y: pointer.y + 5}
          ], {
            fill: currentColor,
            stroke: currentColor
          })
        ], {
          left: 0,
          top: 0,
          selectable: false,
          evented: false
        });
        canvas.add(arrow);
      } else if (currentTool === 'eraser') {
        const clickedObject = canvas.findTarget(e.e, false);
        if (clickedObject) {
          canvas.remove(clickedObject);
        }
      }

      // Emit drawing event to socket
      emitDrawingEvent();
      
      isDrawing.current = false;
      setStartPoint(null);
      canvas.isDrawingMode = false;
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [currentTool, currentColor, startPoint]);

  const emitDrawingEvent = useCallback(() => {
    if (!socketRef?.current) return;

    const canvas = fabricCanvasRef.current;
    const canvasData = canvas.toJSON();
    
    socketRef.current.emit('drawing-event', {
      type: 'update',
      userId,
      objects: canvasData,
      timestamp: Date.now()
    });
  }, [socketRef, userId]);

  const clearCanvas = useCallback(() => {
    if (!fabricCanvasRef.current) return;
    
    fabricCanvasRef.current.clear();
    
    if (socketRef?.current) {
      socketRef.current.emit('drawing-event', {
        type: 'clear',
        userId,
        timestamp: Date.now()
      });
    }
  }, [socketRef, userId]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    
    if (history[newIndex]) {
      const canvas = fabricCanvasRef.current;
      canvas.loadFromJSON(JSON.parse(history[newIndex]), () => {
        canvas.renderAll();
      });
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    
    if (history[newIndex]) {
      const canvas = fabricCanvasRef.current;
      canvas.loadFromJSON(JSON.parse(history[newIndex]), () => {
        canvas.renderAll();
      });
    }
  }, [history, historyIndex]);

  const saveCanvas = useCallback(() => {
    if (!fabricCanvasRef.current) return;

    const dataURL = fabricCanvasRef.current.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `drawing-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
  }, []);

  // Expose methods to parent
  useEffect(() => {
    if (canvasHistoryRef) {
      canvasHistoryRef.current = {
        undo,
        redo,
        clear: clearCanvas,
        save: saveCanvas,
        canUndo: historyIndex > 0,
        canRedo: historyIndex < history.length - 1
      };
    }
  }, [undo, redo, clearCanvas, saveCanvas, historyIndex, history.length, canvasHistoryRef]);

  if (!isVisible) return null;

  return (
    <div className="drawing-canvas-container">
      <canvas ref={canvasRef} className="drawing-canvas" />
    </div>
  );
};

export default DrawingCanvas;

