'use client';

import MuxPlayerElement from '@mux/mux-player';
import React, { useEffect, useRef } from 'react';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import MuxPlayer from '@mux/mux-player-react';
import usePlayerStore from '@/app/stores/usePlayerStore';
import { Box } from '@mui/material';
import { throttle } from 'lodash';
import { colors } from '@/lib/theme';
import { AudioFileWave } from '@/app/assets/svg/AudioFileWave';

export const StoryVideo = () => {
  const { storyHubPage } = useSemanticSearchStore();
  const { setIsPlaying, setPlayerRef, isPlaying, setCurrentTime, setDuration } = usePlayerStore();

  const videoRef = useRef<MuxPlayerElement>(null);
  const hasStartedPlaying = useRef(false);
  const videoSrc = storyHubPage?.properties.video_url;
  const isAudioFile = storyHubPage?.properties.isAudioFile || false;

  // Throttle the setCurrentTime to avoid performance issues
  const throttledSetCurrentTime = useRef(
    throttle((time: number) => {
      setCurrentTime(time);
    }, 500), // 500 ms
  ).current;

  useEffect(() => {
    if (videoRef.current) {
      setPlayerRef(videoRef.current);
    }
  }, [setPlayerRef]);

  return (
    <Box position="relative" height="100%" borderRadius={2} overflow="hidden">
      {isAudioFile && (
        <Box
          id="audio-file-wave-container"
          width="100%"
          height="calc(100% - 48px)"
          display="flex"
          justifyContent="center"
          alignItems="center"
          onClick={() => {
            if (videoRef.current) {
              if (isPlaying) {
                videoRef.current.pause();
                setIsPlaying(false);
              } else {
                videoRef.current.play();
                setIsPlaying(true);
              }
            }
          }}
          sx={{ cursor: 'pointer', backgroundColor: colors.common.black }}>
          <AudioFileWave width="50%" height="auto" style={{ paddingTop: '20px' }} />
        </Box>
      )}
      <Box
        position={isAudioFile ? 'relative' : 'absolute'}
        bottom={0}
        left={0}
        width="100%"
        height={isAudioFile ? '48px' : '100%'}
        zIndex={2}
        sx={{ background: 'transparent' }}>
        <MuxPlayer
          ref={videoRef}
          src={videoSrc}
          audio={isAudioFile}
          onPlay={() => {
            if (!hasStartedPlaying.current) {
              hasStartedPlaying.current = true;
              setIsPlaying(true);
            }
          }}
          onTimeUpdate={() => {
            const time = videoRef.current?.currentTime;
            if (time != null) {
              throttledSetCurrentTime(time);
            }
          }}
          onLoadedMetadata={() => {
            if (videoRef.current?.duration) {
              setDuration(videoRef.current.duration);
            }
          }}
          onDurationChange={() => {
            if (videoRef.current?.duration) {
              setDuration(videoRef.current.duration);
            }
          }}
          onPause={() => setIsPlaying(false)}
          onError={(error) => {
            console.warn('Mux Player Error (handled):', error);
            // Attempt to recover from HLS errors
            if (videoRef.current) {
              try {
                videoRef.current.load(); // Reload the video
              } catch (e) {
                console.log('Recovery attempt failed:', e);
              }
            }
          }}
          forwardSeekOffset={10}
          backwardSeekOffset={10}
          accentColor={colors.secondary.main}
          style={{ width: '100%', height: '100%' }}
          // Add HLS-specific configuration to handle streaming errors
          _hlsConfig={{
            maxBufferLength: 20, // Reduced buffer length
            maxMaxBufferLength: 40, // Reduced max buffer
            maxBufferSize: 30 * 1000 * 1000, // 30MB (reduced)
            maxBufferHole: 0.3, // Smaller buffer holes
            lowLatencyMode: false, // Disable for stability
            backBufferLength: 30, // Reduced back buffer
            enableWorker: true, // Enable web worker
            fragLoadingTimeOut: 20000, // 20s timeout
            manifestLoadingTimeOut: 10000, // 10s timeout
          }}
        />
      </Box>
    </Box>
  );
};
