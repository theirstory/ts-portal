import { AudioFileWave } from '@/app/assets/svg/AudioFileWave';
import { getMuxPlaybackId } from '@/app/utils/converters';
import { durationFormatHandler } from '@/app/utils/util';
import { colors } from '@/lib/theme';
import { Chunks, Testimonies } from '@/types/weaviate';
import { Box, Skeleton } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { WeaviateGenericObject } from 'weaviate-client';

export const VideoThumbnail = ({
  story,
  aspectRatio = 16 / 9,
  fontSize,
  audioFileSize,
  startTime,
}: {
  story: WeaviateGenericObject<Testimonies> | WeaviateGenericObject<Chunks>;
  aspectRatio?: number;
  fontSize: number;
  audioFileSize: { width: string; height: string };
  startTime?: number;
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [gifLoaded, setGifLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [gifError, setGifError] = useState(false);
  const [thumbnailRetryCount, setThumbnailRetryCount] = useState(0);
  const [gifRetryCount, setGifRetryCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const thumbnailRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const gifRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const MAX_RETRIES = 3;

  const { thumbnailUrl, gifUrl } = useMemo(() => {
    const playbackId = getMuxPlaybackId(story.properties.video_url);

    const targetWidth = 320;
    const targetHeight = Math.round(targetWidth / aspectRatio);

    const gifStart = startTime || 3;
    const gifEnd = gifStart + 2;

    return {
      thumbnailUrl: `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${startTime || 5}&width=${targetWidth}&height=${targetHeight}&fit_mode=crop`,
      gifUrl: `https://image.mux.com/${playbackId}/animated.gif?start=${gifStart}&end=${gifEnd}&width=${targetWidth}&height=${targetHeight}&fps=10&fit_mode=crop`,
    };
  }, [aspectRatio, startTime, story.properties.video_url]);

  // Lazy loading with IntersectionObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: '100px',
      },
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  // We preload the GIF on hover to ensure it's ready when the user wants to see it, but only if it's not an audio file and if it's in view.
  useEffect(() => {
    if (!story.properties.isAudioFile && isInView && !gifError) {
      const img = new Image();

      img.onload = () => setGifLoaded(true);
      img.onerror = () => {
        console.warn(`Failed to preload GIF (attempt ${gifRetryCount + 1}/${MAX_RETRIES}):`, gifUrl);

        if (gifRetryCount < MAX_RETRIES - 1) {
          const delay = Math.pow(2, gifRetryCount) * 1000; // 1s, 2s, 4s
          gifRetryTimeoutRef.current = setTimeout(() => {
            setGifRetryCount((prev: number) => prev + 1);
          }, delay);
        } else {
          setGifError(true);
        }
      };

      img.src = gifUrl;

      return () => {
        img.onload = null;
        img.onerror = null;
        if (gifRetryTimeoutRef.current) {
          clearTimeout(gifRetryTimeoutRef.current);
        }
      };
    }
  }, [gifUrl, story.properties.isAudioFile, isInView, gifError, gifRetryCount]);

  useEffect(() => {
    return () => {
      if (thumbnailRetryTimeoutRef.current) {
        clearTimeout(thumbnailRetryTimeoutRef.current);
      }
      if (gifRetryTimeoutRef.current) {
        clearTimeout(gifRetryTimeoutRef.current);
      }
    };
  }, []);

  const handleThumbnailError = () => {
    console.warn(`Thumbnail load failed (attempt ${thumbnailRetryCount + 1}/${MAX_RETRIES}):`, thumbnailUrl);

    if (thumbnailRetryCount < MAX_RETRIES - 1) {
      const delay = Math.pow(2, thumbnailRetryCount) * 1000; // 1s, 2s, 4s
      thumbnailRetryTimeoutRef.current = setTimeout(() => {
        setThumbnailRetryCount((prev: number) => prev + 1);
      }, delay);
    } else {
      setThumbnailError(true);
    }
  };

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => setIsHovered(false);

  if (story.properties.isAudioFile) {
    return (
      <Box
        ref={containerRef}
        sx={{
          position: 'relative',
          width: '100%',
          aspectRatio: `${aspectRatio}`,
          bgcolor: colors.grey[200],
          borderRadius: 1,
          overflow: 'hidden',
          boxShadow: `0 1px 3px ${colors.common.shadow}`,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
        }}>
        <AudioFileWave width={audioFileSize?.width} height={audioFileSize?.height} color={colors.grey[600]} />
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      sx={{
        position: 'relative',
        width: '100%',
        aspectRatio: `${aspectRatio}`,
        bgcolor: colors.grey[200],
        borderRadius: 1,
        overflow: 'hidden',
        boxShadow: `0 1px 3px ${colors.common.shadow}`,
        flexShrink: 0,
      }}>
      {/* Skeleton while loading */}
      {isInView && !thumbnailLoaded && !thumbnailError && (
        <Skeleton
          variant="rectangular"
          width="100%"
          height="100%"
          sx={{
            position: 'absolute',
            inset: 0,
          }}
        />
      )}

      {/* thumbnail */}
      {isInView && !thumbnailError && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={thumbnailRetryCount} // Force re-render en retry
          src={thumbnailUrl}
          alt="Video thumbnail"
          onLoad={() => setThumbnailLoaded(true)}
          onError={handleThumbnailError}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            position: 'absolute',
            inset: 0,
            opacity: thumbnailLoaded ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        />
      )}

      {/* Fallback if thumbnail fails to load */}
      {thumbnailError && (
        <Skeleton
          variant="rectangular"
          width="100%"
          height="100%"
          sx={{
            position: 'absolute',
            inset: 0,
            bgcolor: colors.grey[300],
          }}
        />
      )}

      {/* gif preview */}
      {isHovered && !gifError && gifLoaded && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={gifRetryCount} // Force re-render en retry
          src={gifUrl}
          alt="Video preview"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            position: 'absolute',
            inset: 0,
            opacity: 1,
            transition: 'opacity 0.3s ease',
            zIndex: 1,
          }}
        />
      )}

      <Box
        sx={{
          position: 'absolute',
          bottom: 4,
          right: 4,
          bgcolor: colors.common.overlay,
          color: colors.common.white,
          px: 0.5,
          borderRadius: 0.5,
          fontSize,
          zIndex: 3,
        }}>
        {durationFormatHandler(story.properties.interview_duration)}
      </Box>
    </Box>
  );
};
