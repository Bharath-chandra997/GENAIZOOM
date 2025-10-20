import React from 'react';
import VideoPlayer from './VideoPlayer';

const VideoGrid = ({ participants, isMediaDisplayed, gridPage, totalGridPages, handleSwipe, handleParticipantClick, isMirroringBrowser, socketId }) => {
  const renderVideoPlayer = (participant, isLocal, className = "mx-auto") => (
    <VideoPlayer
      participant={participant}
      isLocal={isLocal}
      isMirroringBrowser={isMirroringBrowser}
      socketId={socketId}
      className={className}
    />
  );

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
          <div
            key={p.userId}
            className="w-full h-full flex items-center justify-center"
            onClick={() => handleParticipantClick(p.userId)}
          >
            {renderVideoPlayer(p, p.isLocal, "w-full h-auto")}
          </div>
        ))}
      </div>
      {totalGridPages > 1 && (
        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2">
          <button
            onClick={() => handleSwipe(-1)}
            className="px-2 py-1 bg-gray-700 rounded"
          >
            ‹
          </button>
          {Array.from({ length: totalGridPages }, (_, i) => (
            <button
              key={i}
              onClick={() => handleSwipe(0, i)}
              className={`w-2.5 h-2.5 rounded-full ${gridPage === i ? 'bg-white' : 'bg-gray-500'}`}
            />
          ))}
          <button
            onClick={() => handleSwipe(1)}
            className="px-2 py-1 bg-gray-700 rounded"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
};

export default VideoGrid;