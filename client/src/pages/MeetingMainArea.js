import React, { useRef, useEffect } from 'react';
import VideoPlayer from '../../components/VideoPlayer';
import AnnotationToolbar from '../../components/AnnotationToolbar';
import UploadControls from '../../components/UploadControls';
import ImageAudioSection from '../../components/ImageAudioSection';

const MeetingMainArea = ({
  participants,
  isMediaDisplayed,
  imageUrl,
  audioUrl,
  output,
  uploaderUsername,
  isProcessing,
  handleProcessWithAI,
  isBotLocked,
  currentUploader,
  socketId,
  isSomeoneScreenSharing,
  toolbarPosition,
  currentTool,
  currentBrushSize,
  handleToolbarMouseDown,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleSwipe,
  gridPage,
  totalGridPages,
  pinnedParticipantId,
  isMirroringBrowser,
  socketRef,
  user,
  roomId,
  selectedImage,
  setSelectedImage,
  selectedAudio,
  setSelectedAudio,
  handleExitRoom,
}) => {
  const mainVideoContainerRef = useRef(null);
  const annotationCanvasRef = useRef(null);
  const touchStartXRef = useRef(0);
  const touchDeltaRef = useRef(0);

  const renderVideoPlayer = (participant, isLocal, className = "mx-auto") => (
    <VideoPlayer
      participant={participant}
      isLocal={isLocal}
      isMirroringBrowser={isMirroringBrowser}
      socketId={socketRef.current?.id}
      className={className}
    />
  );

  useEffect(() => {
    const canvas = annotationCanvasRef.current;
    const container = mainVideoContainerRef.current;
    if (!container || !canvas) return;
    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resizeCanvas();
    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const handleTouchStart = (e) => { touchStartXRef.current = e.touches[0].clientX; touchDeltaRef.current = 0; };
  const handleTouchMove = (e) => { touchDeltaRef.current = e.touches[0].clientX - touchStartXRef.current; };
  const handleTouchEnd = () => {
    if (Math.abs(touchDeltaRef.current) > 50) {
      handleSwipe(touchDeltaRef.current > 0 ? -1 : 1);
    }
  };

  return (
    <div className="flex-1 flex relative overflow-hidden">
      <div
        className={`flex-1 ${isMediaDisplayed ? 'grid grid-cols-[60%_40%] xl:grid-cols-[65%_35%] 2xl:grid-cols-[70%_30%]' : 'flex flex-col'} relative overflow-hidden`}
        onWheel={(e) => {
          if (e.deltaX !== 0 && totalGridPages > 1) {
            e.preventDefault();
            handleSwipe(e.deltaX > 0 ? 1 : -1);
          }
        }}
      >
        <div className="flex flex-col min-h-0 w-full">
          <div className="bg-gray-800 border-b border-gray-700 p-3">
            <UploadControls
              canUpload={!isMediaDisplayed}
              selectedImage={selectedImage}
              setSelectedImage={setSelectedImage}
              selectedAudio={selectedAudio}
              setSelectedAudio={setSelectedAudio}
              hasImageUrl={!!imageUrl}
              hasAudioUrl={!!audioUrl}
              isMediaDisplayed={isMediaDisplayed}
              onDisplay={async () => {
                if (!selectedImage || !selectedAudio) { toast.error('Please upload both image and audio first.'); return; }
                setIsMediaDisplayed(true);
                const convertFileToBase64 = (file) => new Promise((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result);
                  reader.onerror = reject;
                  reader.readAsDataURL(file);
                });
                try {
                  const [imageBase64, audioBase64] = await Promise.all([
                    convertFileToBase64(selectedImage),
                    convertFileToBase64(selectedAudio),
                  ]);
                  socketRef.current?.emit('shared-media-display', {
                    imageUrl: imageBase64,
                    audioUrl: audioBase64,
                    username: user.username,
                    roomId,
                  });
                } catch (error) {
                  console.error('Error converting files to base64:', error);
                  toast.error('Failed to prepare media for sharing.');
                }
              }}
              onRemove={() => {
                setIsMediaDisplayed(false);
                if (imageUrl) try { URL.revokeObjectURL(imageUrl); } catch {}
                if (audioUrl) try { URL.revokeObjectURL(audioUrl); } catch {}
                setSelectedImage(null);
                setSelectedAudio(null);
                setImageUrl('');
                setAudioUrl('');
                setOutput('');
                setCurrentUploader(null);
                setUploaderUsername('');
                setIsProcessing(false);
                setIsBotLocked(false);
                socketRef.current?.emit('shared-media-removal', { username: user.username, roomId });
              }}
              onAnalyze={handleProcessWithAI}
              isProcessing={isProcessing}
            />
          </div>
          {isSomeoneScreenSharing && (
            <div style={{ position: 'absolute', top: toolbarPosition.y, left: toolbarPosition.x, zIndex: 50 }}>
              <AnnotationToolbar
                onMouseDown={handleToolbarMouseDown}
                currentTool={currentTool}
                setCurrentTool={setCurrentTool}
                currentBrushSize={currentBrushSize}
                setCurrentBrushSize={setCurrentBrushSize}
                clearCanvas={() => {
                  const canvas = annotationCanvasRef.current;
                  if (!canvas) return;
                  const ctx = canvas.getContext('2d');
                  ctx.clearRect(0, 0, canvas.width, canvas.height);
                  socketRef.current?.emit('clear-canvas');
                }}
              />
            </div>
          )}
          <div
            className="flex-1 min-h-0 relative overflow-hidden h-full"
            ref={mainVideoContainerRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {(() => {
              const count = participants.length;
              const pageStart = gridPage * 4;
              const pageItems = participants.slice(pageStart, pageStart + 4);

              if (count === 1) {
                const p = participants[0];
                return (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className={`w-full ${isMediaDisplayed ? 'max-w-2xl' : 'max-w-3xl'}`}>
                      {renderVideoPlayer(p, p.isLocal, "w-full h-auto")}
                    </div>
                  </div>
                );
              }

              if (count === 2) {
                return (
                  <div className={`flex h-full w-full ${isMediaDisplayed ? 'gap-1' : 'gap-2'}`}>
                    <div className="flex-1 h-full flex items-center justify-center p-1">
                      {renderVideoPlayer(participants[0], participants[0].isLocal, "w-full h-full object-cover")}
                    </div>
                    <div className="flex-1 h-full flex items-center justify-center p-1">
                      {renderVideoPlayer(participants[1], participants[1].isLocal, "w-full h-full object-cover")}
                    </div>
                  </div>
                );
              }

              if (count === 3) {
                const [a, b, c] = participants;
                return (
                  <div className={`grid grid-cols-1 md:grid-cols-2 w-full h-full ${isMediaDisplayed ? 'gap-1' : 'gap-2'} p-1`}>
                    <div className="w-full h-full flex items-center justify-center">
                      {renderVideoPlayer(a, a.isLocal, "w-full h-auto")}
                    </div>
                    <div className="w-full h-full flex items-center justify-center">
                      {renderVideoPlayer(b, b.isLocal, "w-full h-auto")}
                    </div>
                    <div className="md:col-span-2 h-full flex justify-center items-center">
                      <div className={`w-full md:w-1/2 min-w-[200px] ${isMediaDisplayed ? 'max-w-xs' : 'max-w-sm'}`}>
                        {renderVideoPlayer(c, c.isLocal, "w-full h-auto")}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div className="w-full h-full p-1">
                  <div className={`grid grid-cols-1 md:grid-cols-2 w-full h-full ${isMediaDisplayed ? 'gap-1' : 'gap-2'}`}>
                    {pageItems.map((p) => (
                      <div key={p.userId} className="w-full h-full flex items-center justify-center">
                        {renderVideoPlayer(p, p.isLocal, "w-full h-auto")}
                      </div>
                    ))}
                  </div>
                  {totalGridPages > 1 && (
                    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2">
                      <button
                        onClick={() => gridPage > 0 && setGridPage(gridPage - 1)}
                        className="px-2 py-1 bg-gray-700 rounded"
                      >
                        ‹
                      </button>
                      {Array.from({ length: totalGridPages }, (_, i) => (
                        <button
                          key={i}
                          onClick={() => setGridPage(i)}
                          className={`w-2.5 h-2.5 rounded-full ${gridPage === i ? 'bg-white' : 'bg-gray-500'}`}
                        />
                      ))}
                      <button
                        onClick={() => gridPage < totalGridPages - 1 && setGridPage(gridPage + 1)}
                        className="px-2 py-1 bg-gray-700 rounded"
                      >
                        ›
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
            <canvas
              ref={annotationCanvasRef}
              className="absolute top-0 left-0"
              style={{ pointerEvents: isSomeoneScreenSharing ? 'auto' : 'none', zIndex: 10, touchAction: 'none' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
          </div>
        </div>
        {isMediaDisplayed && (
          <div className="h-full min-w-0">
            <ImageAudioSection
              imageUrl={imageUrl}
              audioUrl={audioUrl}
              uploaderUsername={uploaderUsername}
              isProcessing={isProcessing}
              onProcessWithAI={handleProcessWithAI}
              isBotLocked={isBotLocked}
              currentUploader={currentUploader}
              socketId={socketId}
              output={output} // Pass output to display AI results
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default MeetingMainArea;