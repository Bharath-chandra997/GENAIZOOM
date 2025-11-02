// import React, { useRef, useEffect, useState, useCallback } from 'react';
// import { fabric } from 'fabric';
// import './DrawingCanvas.css';

// const DrawingCanvas = ({ 
//   isVisible, 
//   currentTool, 
//   currentColor, 
//   userId,
//   socketRef,
//   onDrawingChange,
//   canvasHistoryRef,
//   isLocalOnly = false,
//   brushSize = 5
// }) => {
//   const canvasRef = useRef(null);
//   const fabricCanvasRef = useRef(null);
//   const [history, setHistory] = useState([]);
//   const [historyIndex, setHistoryIndex] = useState(-1);
//   const isDrawing = useRef(false);
//   const [startPoint, setStartPoint] = useState(null);

//   // Initialize Fabric.js canvas
//   useEffect(() => {
//     if (!canvasRef.current) return;

//     const canvas = new fabric.Canvas(canvasRef.current, {
//       isDrawingMode: false,
//       width: canvasRef.current.offsetWidth,
//       height: canvasRef.current.offsetHeight,
//       backgroundColor: 'transparent',
//       selection: false,
//       preserveObjectStacking: true
//     });

//     fabricCanvasRef.current = canvas;

//     // Handle canvas ready
//     canvas.on('after:render', () => {
//       const canvasData = canvas.toJSON();
//       onDrawingChange(canvasData);
//     });

//     return () => {
//       canvas.dispose();
//     };
//   }, [onDrawingChange]);

//   // Save to history on any object change
//   useEffect(() => {
//     if (!fabricCanvasRef.current) return;

//     const canvas = fabricCanvasRef.current;
//     const handler = () => {
//       const state = JSON.stringify(canvas.toJSON());
//       setHistory(prev => [...prev.slice(0, historyIndex + 1), state]);
//       setHistoryIndex(prev => prev + 1);
//     };

//     canvas.on('object:added', handler);
//     canvas.on('object:removed', handler);
//     canvas.on('object:modified', handler);

//     return () => {
//       canvas.off('object:added', handler);
//       canvas.off('object:removed', handler);
//       canvas.off('object:modified', handler);
//     };
//   }, [historyIndex]);

//   // Listen for drawing events from socket (disabled in local-only mode)
//   useEffect(() => {
//     if (isLocalOnly) return;
//     if (!socketRef?.current) return;

//     const socket = socketRef.current;

//     const handleDrawing = (data) => {
//       if (data.userId === userId) return; // Ignore own drawings
      
//       applyDrawingData(data);
//     };

//     socket.on('drawing-event', handleDrawing);

//     return () => {
//       socket.off('drawing-event', handleDrawing);
//     };
//   }, [socketRef, userId, isLocalOnly]);

//   const applyDrawingData = useCallback((data) => {
//     if (!fabricCanvasRef.current) return;

//     try {
//       const canvas = fabricCanvasRef.current;
      
//       switch (data.type) {
//         case 'path':
//           if (data.path) {
//             const path = new fabric.Path(data.path, {
//               stroke: data.color,
//               strokeWidth: data.width,
//               fill: '',
//               left: data.x,
//               top: data.y,
//               selectable: false,
//               evented: false
//             });
//             canvas.add(path);
//           }
//           break;
//         case 'clear':
//           canvas.clear();
//           break;
//         case 'clear-colors':
//           canvas.getObjects().forEach(obj => {
//             if (obj.userId === data.userId) {
//               canvas.remove(obj);
//             }
//           });
//           break;
//         default:
//           if (data.objects) {
//             canvas.loadFromJSON(data.objects, () => {
//               canvas.renderAll();
//             });
//           }
//       }
//     } catch (error) {
//       console.error('Error applying drawing data:', error);
//     }
//   }, []);

//   // Handle different drawing tools
//   useEffect(() => {
//     if (!fabricCanvasRef.current) return;

//     const canvas = fabricCanvasRef.current;
    
//     const handleMouseDown = (e) => {
//       const pointer = canvas.getPointer(e.e);
//       setStartPoint(pointer);
//       isDrawing.current = true;

//       if (currentTool === 'pen' || currentTool === 'highlighter') {
//         canvas.isDrawingMode = true;
//         canvas.freeDrawingBrush.width = currentTool === 'highlighter' ? Math.max(brushSize * 2, 10) : brushSize;
//         canvas.freeDrawingBrush.color = currentColor;
//         canvas.renderAll();
//       }
//     };

//     const handleMouseMove = (e) => {
//       if (!isDrawing.current) return;
      
//       const pointer = canvas.getPointer(e.e);
      
//       if (currentTool !== 'pen' && currentTool !== 'highlighter') {
//         canvas.isDrawingMode = false;
//       }
//     };

//     const handleMouseUp = (e) => {
//       const pointer = canvas.getPointer(e.e);

//       if (currentTool === 'rectangle') {
//         const rect = new fabric.Rect({
//           left: Math.min(startPoint.x, pointer.x),
//           top: Math.min(startPoint.y, pointer.y),
//           width: Math.abs(pointer.x - startPoint.x),
//           height: Math.abs(pointer.y - startPoint.y),
//           fill: '',
//           stroke: currentColor,
//           strokeWidth: 2,
//           selectable: false,
//           evented: false
//         });
//         canvas.add(rect);
//       } else if (currentTool === 'circle') {
//         const radius = Math.sqrt(
//           Math.pow(pointer.x - startPoint.x, 2) + 
//           Math.pow(pointer.y - startPoint.y, 2)
//         );
//         const circle = new fabric.Circle({
//           left: startPoint.x,
//           top: startPoint.y,
//           radius: radius / 2,
//           fill: '',
//           stroke: currentColor,
//           strokeWidth: 2,
//           selectable: false,
//           evented: false
//         });
//         canvas.add(circle);
//       } else if (currentTool === 'line') {
//         const line = new fabric.Line(
//           [startPoint.x, startPoint.y, pointer.x, pointer.y],
//           {
//             stroke: currentColor,
//             strokeWidth: 2,
//             selectable: false,
//             evented: false
//           }
//         );
//         canvas.add(line);
//       } else if (currentTool === 'arrow') {
//         const arrow = new fabric.Group([
//           new fabric.Line([startPoint.x, startPoint.y, pointer.x, pointer.y], {
//             stroke: currentColor,
//             strokeWidth: 2
//           }),
//           new fabric.Polygon([
//             {x: pointer.x, y: pointer.y},
//             {x: pointer.x - 10, y: pointer.y - 5},
//             {x: pointer.x - 10, y: pointer.y + 5}
//           ], {
//             fill: currentColor,
//             stroke: currentColor
//           })
//         ], {
//           left: 0,
//           top: 0,
//           selectable: false,
//           evented: false
//         });
//         canvas.add(arrow);
//       } else if (currentTool === 'eraser') {
//         const clickedObject = canvas.findTarget(e.e, false);
//         if (clickedObject) {
//           canvas.remove(clickedObject);
//         }
//       }

//       // Emit drawing event to socket
//       emitDrawingEvent();
      
//       isDrawing.current = false;
//       setStartPoint(null);
//       canvas.isDrawingMode = false;
//     };

//     canvas.on('mouse:down', handleMouseDown);
//     canvas.on('mouse:move', handleMouseMove);
//     canvas.on('mouse:up', handleMouseUp);

//     return () => {
//       canvas.off('mouse:down', handleMouseDown);
//       canvas.off('mouse:move', handleMouseMove);
//       canvas.off('mouse:up', handleMouseUp);
//     };
//   }, [currentTool, currentColor, startPoint]);

//   const emitDrawingEvent = useCallback(() => {
//     if (isLocalOnly) return;
//     if (!socketRef?.current) return;

//     const canvas = fabricCanvasRef.current;
//     const canvasData = canvas.toJSON();
    
//     socketRef.current.emit('drawing-event', {
//       type: 'update',
//       userId,
//       objects: canvasData,
//       timestamp: Date.now()
//     });
//   }, [socketRef, userId, isLocalOnly]);

//   const clearCanvas = useCallback(() => {
//     if (!fabricCanvasRef.current) return;
    
//     fabricCanvasRef.current.clear();
    
//     if (!isLocalOnly && socketRef?.current) {
//       socketRef.current.emit('drawing-event', {
//         type: 'clear',
//         userId,
//         timestamp: Date.now()
//       });
//     }
//   }, [socketRef, userId, isLocalOnly]);

//   const undo = useCallback(() => {
//     if (historyIndex <= 0) return;
    
//     const newIndex = historyIndex - 1;
//     setHistoryIndex(newIndex);
    
//     if (history[newIndex]) {
//       const canvas = fabricCanvasRef.current;
//       canvas.loadFromJSON(JSON.parse(history[newIndex]), () => {
//         canvas.renderAll();
//       });
//     }
//   }, [history, historyIndex]);

//   const redo = useCallback(() => {
//     if (historyIndex >= history.length - 1) return;
    
//     const newIndex = historyIndex + 1;
//     setHistoryIndex(newIndex);
    
//     if (history[newIndex]) {
//       const canvas = fabricCanvasRef.current;
//       canvas.loadFromJSON(JSON.parse(history[newIndex]), () => {
//         canvas.renderAll();
//       });
//     }
//   }, [history, historyIndex]);

//   const saveCanvas = useCallback(() => {
//     if (!fabricCanvasRef.current) return;

//     const dataURL = fabricCanvasRef.current.toDataURL('image/png');
//     const link = document.createElement('a');
//     link.download = `drawing-${Date.now()}.png`;
//     link.href = dataURL;
//     link.click();
//   }, []);

//   // Expose methods to parent
//   useEffect(() => {
//     if (canvasHistoryRef) {
//       canvasHistoryRef.current = {
//         undo,
//         redo,
//         clear: clearCanvas,
//         save: saveCanvas,
//         canUndo: historyIndex > 0,
//         canRedo: historyIndex < history.length - 1
//       };
//     }
//   }, [undo, redo, clearCanvas, saveCanvas, historyIndex, history.length, canvasHistoryRef]);

//   if (!isVisible) return null;

//   return (
//     <div className="drawing-canvas-container">
//       <canvas ref={canvasRef} className="drawing-canvas" />
//     </div>
//   );
// };

// export default DrawingCanvas;

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { fabric } from 'fabric';
import './DrawingCanvas.css';

const DrawingCanvas = ({
  isVisible,
  currentTool,
  currentColor,
  userId,
  socketRef,
  onDrawingChange, // Still useful for parent to know state
  canvasHistoryRef, // Ref to expose functions like clear, save
  onHistoryChange, // NEW: Callback to report canUndo/canRedo
  isLocalOnly = false,
  brushSize = 5,
}) => {
  const canvasRef = useRef(null);
  const fabricCanvasRef = useRef(null);
  const redoStackRef = useRef([]);
  const isDrawing = useRef(false);
  const [startPoint, setStartPoint] = useState(null);

  // Initialize Fabric.js canvas
  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: canvasRef.current.offsetWidth,
      height: canvasRef.current.offsetHeight,
      backgroundColor: 'transparent',
      selection: false,
      preserveObjectStacking: true,
    });
    fabricCanvasRef.current = canvas;

    // Report state changes to parent (e.g., for saving)
    const handleStateChange = () => {
      onDrawingChange(canvas.toJSON());
    };
    canvas.on('after:render', handleStateChange);

    return () => {
      canvas.off('after:render', handleStateChange);
      canvas.dispose();
    };
  }, [onDrawingChange]);

  // Helper to emit socket events
  const emitEvent = useCallback(
    (eventName, data) => {
      if (isLocalOnly || !socketRef?.current) return;
      socketRef.current.emit(eventName, { ...data, userId });
    },
    [socketRef, userId, isLocalOnly]
  );

  // Helper to tag objects with ID and UserID
  const prepObject = (obj) => {
    obj.id = fabric.util.getRandomInt(1, 10000000); // Simple unique ID
    obj.userId = userId; // Tag with user ID
    obj.selectable = false; // Make unselectable by default
    obj.evented = false;
    return obj;
  };

  // Listen for drawing events from socket
  useEffect(() => {
    if (isLocalOnly || !socketRef?.current) return;
    const socket = socketRef.current;
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Listen for a full canvas load (e.g., on join)
    const handleLoadCanvas = (data) => {
      canvas.loadFromJSON(data.objects, () => {
        canvas.renderAll();
        // Make all remote objects unselectable
        canvas.forEachObject((obj) =>
          obj.set({ selectable: false, evented: false })
        );
      });
    };

    // Listen for a single new object
    const handleObjectAdded = (data) => {
      if (data.userId === userId) return; // Ignore own echoes
      fabric.util.enlivenObjects(
        [data.obj],
        (objects) => {
          if (objects[0]) {
            const obj = objects[0];
            obj.set({ selectable: false, evented: false }); // Make remote objects unselectable
            canvas.add(obj);
            canvas.renderAll();
          }
        },
        'fabric'
      );
    };

    // Listen for a single removed object
    const handleObjectRemoved = (data) => {
      if (data.userId === userId) return; // Ignore own echoes
      const objToRemove = canvas.getObjects().find((o) => o.id === data.objId);
      if (objToRemove) {
        canvas.remove(objToRemove);
        canvas.renderAll();
      }
    };

    // Listen for a full clear
    const handleClear = () => {
      canvas.clear();
      redoStackRef.current = [];
    };

    socket.on('drawing:load', handleLoadCanvas);
    socket.on('drawing:object:added', handleObjectAdded);
    socket.on('drawing:object:removed', handleObjectRemoved);
    socket.on('drawing:clear', handleClear);

    return () => {
      socket.off('drawing:load', handleLoadCanvas);
      socket.off('drawing:object:added', handleObjectAdded);
      socket.off('drawing:object:removed', handleObjectRemoved);
      socket.off('drawing:clear', handleClear);
    };
  }, [socketRef, userId, isLocalOnly, emitEvent]);

  // Handle different drawing tools
  useEffect(() => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;

    // --- TOOL CONFIGURATION ---
    canvas.isDrawingMode = false;
    canvas.selection = false;
    canvas.defaultCursor = 'crosshair';
    canvas.forEachObject((obj) => obj.set({ selectable: false, evented: false }));

    if (currentTool === 'pen' || currentTool === 'highlighter') {
      canvas.isDrawingMode = true;
      let brushColor = currentColor;
      if (currentTool === 'highlighter') {
        // Add 50% opacity (hex '80')
        brushColor =
          currentColor.length === 7 ? `${currentColor}80` : currentColor;
      }
      canvas.freeDrawingBrush.color = brushColor;
      canvas.freeDrawingBrush.width = brushSize;
    } else if (currentTool === 'eraser') {
      canvas.selection = true; // Enable selection *only* for eraser
      canvas.defaultCursor = 'pointer';
      canvas.forEachObject((obj) => {
        // Only allow erasing user's *own* objects
        if (obj.userId === userId) {
          obj.set({ selectable: true, evented: true });
        }
      });
    }

    // --- EVENT LISTENERS ---
    const handleMouseDown = (e) => {
      if (currentTool === 'eraser' && e.target) {
        // Eraser logic: click to remove
        if (e.target.userId === userId) {
          // Double-check it's our object
          emitEvent('drawing:object:removed', { objId: e.target.id });
          canvas.remove(e.target);
          canvas.renderAll();
          redoStackRef.current = []; // Clear redo stack after erasing
        }
        return;
      }

      if (
        currentTool === 'pen' ||
        currentTool === 'highlighter' ||
        currentTool === 'eraser'
      ) {
        return;
      }

      // Shape drawing logic
      const pointer = canvas.getPointer(e.e);
      setStartPoint(pointer);
      isDrawing.current = true;
    };

    const handleMouseUp = (e) => {
      if (!isDrawing.current || !startPoint) return;

      const pointer = canvas.getPointer(e.e);
      let newObj = null;
      const strokeProps = {
        stroke: currentColor,
        strokeWidth: brushSize,
        fill: 'transparent',
      };

      if (currentTool === 'rectangle') {
        newObj = new fabric.Rect({
          left: Math.min(startPoint.x, pointer.x),
          top: Math.min(startPoint.y, pointer.y),
          width: Math.abs(pointer.x - startPoint.x),
          height: Math.abs(pointer.y - startPoint.y),
          ...strokeProps,
        });
      } else if (currentTool === 'circle') {
        const radius =
          Math.sqrt(
            Math.pow(pointer.x - startPoint.x, 2) +
              Math.pow(pointer.y - startPoint.y, 2)
          ) / 2;
        newObj = new fabric.Circle({
          left: startPoint.x - radius,
          top: startPoint.y - radius,
          radius: radius,
          ...strokeProps,
        });
      } else if (currentTool === 'line') {
        newObj = new fabric.Line(
          [startPoint.x, startPoint.y, pointer.x, pointer.y],
          strokeProps
        );
      } else if (currentTool === 'arrow') {
        const dx = pointer.x - startPoint.x;
        const dy = pointer.y - startPoint.y;
        const angle = Math.atan2(dy, dx);
        const headLength = Math.min(brushSize * 5, 20);

        const line = new fabric.Line(
          [startPoint.x, startPoint.y, pointer.x, pointer.y],
          strokeProps
        );

        const head = new fabric.Triangle({
          width: headLength,
          height: headLength,
          fill: currentColor,
          left: pointer.x,
          top: pointer.y,
          originX: 'center',
          originY: 'center',
          angle: angle * (180 / Math.PI) + 90,
        });
        newObj = new fabric.Group([line, head]);
      }

      if (newObj) {
        prepObject(newObj); // Add ID and userId
        canvas.add(newObj);
        emitEvent('drawing:object:added', { obj: newObj.toJSON(['id', 'userId']) });
        redoStackRef.current = []; // Clear redo on new action
      }

      isDrawing.current = false;
      setStartPoint(null);
    };

    // Handle freehand drawing (pen/highlighter)
    const handlePathCreated = (e) => {
      const path = e.path;
      prepObject(path);
      // Ensure highlighter color (with alpha) is set correctly
      path.stroke = canvas.freeDrawingBrush.color;
      emitEvent('drawing:object:added', { obj: path.toJSON(['id', 'userId']) });
      redoStackRef.current = []; // Clear redo on new action
    };

    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:up', handleMouseUp);
    canvas.on('path:created', handlePathCreated);

    return () => {
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:up', handleMouseUp);
      canvas.off('path:created', handlePathCreated);
      if (fabricCanvasRef.current) {
        fabricCanvasRef.current.isDrawingMode = false;
      }
    };
  }, [currentTool, currentColor, brushSize, startPoint, userId, emitEvent]);

  // --- ACTIONS ---

  const clearCanvas = useCallback(() => {
    if (!fabricCanvasRef.current) return;
    fabricCanvasRef.current.clear();
    emitEvent('drawing:clear', {});
    redoStackRef.current = [];
  }, [emitEvent]);

  const undo = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    // Find the last object added by this user
    const objects = canvas.getObjects();
    const myLastObject = objects
      .slice()
      .reverse()
      .find((obj) => obj.userId === userId);

    if (myLastObject) {
      canvas.remove(myLastObject);
      redoStackRef.current.push(myLastObject); // Add to local redo stack
      emitEvent('drawing:object:removed', { objId: myLastObject.id });
      canvas.renderAll();
    }
  }, [userId, emitEvent]);

  const redo = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || redoStackRef.current.length === 0) return;

    const objToRedo = redoStackRef.current.pop();
    if (objToRedo) {
      canvas.add(objToRedo);
      emitEvent('drawing:object:added', {
        obj: objToRedo.toJSON(['id', 'userId']),
      });
      canvas.renderAll();
    }
  }, [emitEvent]);

  const saveCanvas = useCallback(() => {
    if (!fabricCanvasRef.current) return;
    const dataURL = fabricCanvasRef.current.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `drawing-${Date.now()}.png`;
    link.href = dataURL;
    link.click();
  }, []);

  // Expose actions to parent component
  useEffect(() => {
    if (canvasHistoryRef) {
      canvasHistoryRef.current = {
        undo,
        redo,
        clear: clearCanvas,
        save: saveCanvas,
      };
    }
  }, [undo, redo, clearCanvas, saveCanvas, canvasHistoryRef]);

  // Report history status (canUndo/canRedo) up to parent
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !onHistoryChange) return;

    const updateHistoryStatus = () => {
      const canUndo = canvas.getObjects().some((obj) => obj.userId === userId);
      const canRedo = redoStackRef.current.length > 0;
      onHistoryChange({ canUndo, canRedo });
    };

    updateHistoryStatus(); // Initial check
    canvas.on('object:added', updateHistoryStatus);
    canvas.on('object:removed', updateHistoryStatus);

    return () => {
      canvas.off('object:added', updateHistoryStatus);
      canvas.off('object:removed', updateHistoryStatus);
    };
  }, [onHistoryChange, userId]);

  if (!isVisible) return null;

  return (
    <div className="drawing-canvas-container">
      <canvas ref={canvasRef} className="drawing-canvas" />
    </div>
  );
};

export default DrawingCanvas;