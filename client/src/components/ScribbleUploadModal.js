import React, { useRef, useState } from 'react';

const ScribbleUploadModal = ({ isOpen, onClose, onConfirm }) => {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [isReading, setIsReading] = useState(false);

  if (!isOpen) return null;

  const handleSelect = (e) => {
    const f = e.target.files?.[0];
    if (f && f.type.startsWith('image/')) {
      setFile(f);
    } else {
      setFile(null);
    }
  };

  const handleConfirm = () => {
    if (!file) return;
    setIsReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      onConfirm?.(dataUrl);
      setIsReading(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 3000,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        width: 'min(92vw, 560px)', borderRadius: 16, background: '#fff',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden'
      }}>
        <div style={{ padding: 20, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>Upload an image to start Scribbling</h3>
          <p style={{ margin: '6px 0 0 0', color: '#6b7280', fontSize: 13 }}>
            Choose a PNG or JPEG. Everyone will see it and can scribble together.
          </p>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div
            onClick={() => inputRef.current?.click()}
            style={{
              border: '2px dashed rgba(0,0,0,0.1)', borderRadius: 12,
              padding: 24, textAlign: 'center', cursor: 'pointer',
              background: 'linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0))'
            }}
          >
            <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 8 }}>🖼️</div>
            <div style={{ fontWeight: 600 }}>Click to select image</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>PNG or JPEG up to ~5 MB</div>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleSelect}
            />
          </div>
          {file && (
            <div style={{ fontSize: 13, color: '#374151' }}>
              Selected: <strong>{file.name}</strong>
            </div>
          )}
        </div>
        <div style={{
          display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 16,
          borderTop: '1px solid rgba(0,0,0,0.08)'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 16px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.1)',
              background: '#fff', cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            disabled={!file || isReading}
            onClick={handleConfirm}
            style={{
              padding: '10px 16px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: '#fff', cursor: file && !isReading ? 'pointer' : 'not-allowed',
              boxShadow: '0 10px 24px rgba(102, 126, 234, 0.35)'
            }}
          >
            {isReading ? 'Loading…' : 'Use this image'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScribbleUploadModal;
