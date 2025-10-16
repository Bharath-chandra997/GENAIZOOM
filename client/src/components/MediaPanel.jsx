import React, { useRef, useEffect, useState } from 'react';

const MediaPanel = ({
	imageUrl,
	audioUrl,
	uploaderUsername,
	isProcessing,
	onProcess,
	onRemove,
	output,
}) => {
	const audioRef = useRef(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [audioError, setAudioError] = useState(false);

	const handlePlayPause = async () => {
		if (!audioRef.current) return;
		try {
			if (isPlaying) {
				audioRef.current.pause();
				setIsPlaying(false);
			} else {
				await audioRef.current.play();
				setIsPlaying(true);
			}
		} catch (_) {
			setAudioError(true);
			setIsPlaying(false);
		}
	};

	useEffect(() => {
		const a = audioRef.current;
		if (!a) return;
		const onEnded = () => setIsPlaying(false);
		const onError = () => { setAudioError(true); setIsPlaying(false); };
		a.addEventListener('ended', onEnded);
		a.addEventListener('error', onError);
		return () => {
			a.removeEventListener('ended', onEnded);
			a.removeEventListener('error', onError);
		};
	}, [audioUrl]);

	return (
		<div className="h-full flex flex-col bg-gray-900 border-l border-gray-700">
			<div className="p-3 border-b border-gray-700 flex items-center justify-between">
				<div className="text-sm text-gray-300">Uploaded by <span className="text-purple-300">{uploaderUsername || 'Someone'}</span></div>
				<button onClick={onRemove} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded">Remove</button>
			</div>

			<div className="p-3 space-y-3 overflow-auto">
				<div>
					<label className="text-xs text-gray-400">Image</label>
					{imageUrl ? (
						<img src={imageUrl} alt="uploaded" className="w-full max-h-56 object-contain bg-black rounded" />
					) : (
						<div className="h-40 bg-black/60 rounded flex items-center justify-center text-gray-500">No Image</div>
					)}
				</div>
				<div>
					<label className="text-xs text-gray-400">Audio</label>
					<div className="bg-black/60 rounded p-3 flex items-center justify-between">
						<button
							onClick={handlePlayPause}
							disabled={!audioUrl || audioError}
							className={`px-3 py-2 rounded ${audioUrl && !audioError ? (isPlaying ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500') : 'bg-gray-600'} text-white`}
						>
							{isPlaying ? 'Pause' : 'Play'}
						</button>
						{audioError && <span className="text-xs text-red-400">Audio error</span>}
					</div>
					<audio ref={audioRef} src={audioUrl || ''} preload="metadata" />
				</div>
				<div className="pt-2">
					<button
						onClick={onProcess}
						disabled={!imageUrl || !audioUrl || isProcessing}
						className={`w-full p-2 rounded ${imageUrl && audioUrl && !isProcessing ? 'bg-purple-600 hover:bg-purple-500' : 'bg-gray-700 text-gray-300 cursor-not-allowed'} text-white`}
					>
						{isProcessing ? 'Processing…' : 'Process with AI'}
					</button>
				</div>
				<div className="mt-2">
					<label className="text-xs text-gray-400">AI response</label>
					<div className="mt-1 bg-gray-950/60 rounded p-3 text-sm text-gray-100 whitespace-pre-wrap overflow-y-auto max-h-[250px]">
						{output || 'AI response will appear here…'}
					</div>
				</div>
			</div>
		</div>
	);
};

export default MediaPanel;


