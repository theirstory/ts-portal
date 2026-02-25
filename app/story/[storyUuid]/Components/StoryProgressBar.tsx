'use client';

import React, { useState, useRef, useMemo } from 'react';
import { Box, Skeleton, Tooltip, useMediaQuery } from '@mui/material';

import usePlayerStore from '@/app/stores/usePlayerStore';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { getNerColor } from '@/config/organizationConfig';
import { NerLabel } from '@/types/ner';
import { colors, theme } from '@/lib/theme';
import { useTranscriptNavigation } from '@/app/hooks/useTranscriptNavigation';
import { formatTime } from '@/app/utils/util';

interface ChapterMarker {
  time: number;
  title: string;
  percentage: number;
}

interface NerMarker {
  startTime: number;
  endTime: number;
  label: string;
  text: string;
  color: string;
  startPercentage: number;
  endPercentage: number;
}

export const StoryProgressBar = () => {
  const { currentTime, duration } = usePlayerStore();
  const { transcript, storyHubPage, selected_ner_labels } = useSemanticSearchStore();
  const { seekOnly, seekAndScroll } = useTranscriptNavigation();
  const [hoveredTime, setHoveredTime] = useState<number | null>(null);
  const [hoveredNer, setHoveredNer] = useState<NerMarker | null>(null);
  const [hoveredChapter, setHoveredChapter] = useState<ChapterMarker | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const isLoadingProgressBar = duration === 0 || !transcript;
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));

  // Calculate progress percentage
  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Get chapter markers
  const chapterMarkers: ChapterMarker[] = useMemo(() => {
    const sections = transcript?.sections || [];
    return sections?.map((section: any) => ({
      time: section.start,
      title: section.title,
      percentage: duration > 0 ? (section.start / duration) * 100 : 0,
    }));
  }, [transcript, duration]);

  // Get NER markers for selected labels
  const nerMarkers: NerMarker[] = React.useMemo(() => {
    if (!storyHubPage?.properties?.ner_data || selected_ner_labels.length === 0) {
      return [];
    }

    return storyHubPage.properties.ner_data
      .filter((ner: any) => selected_ner_labels.includes(ner.label as NerLabel))
      .map((ner: any) => ({
        startTime: ner.start_time,
        endTime: ner.end_time,
        label: ner.label,
        text: ner.text || '',
        color: getNerColor(ner.label),
        startPercentage: duration > 0 ? (ner.start_time / duration) * 100 : 0,
        endPercentage: duration > 0 ? (ner.end_time / duration) * 100 : 0,
      }));
  }, [storyHubPage, selected_ner_labels, duration]);

  // Handle click to seek
  const handleProgressBarClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isLoadingProgressBar) return;
    if (!progressBarRef.current || duration === 0) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = (clickX / rect.width) * 100;
    const newTime = (percentage / 100) * duration;
    const boundedTime = Math.max(0, Math.min(newTime, duration));

    seekAndScroll(boundedTime);
  };

  // Handle mouse move for hover time
  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isLoadingProgressBar) return;
    if (!progressBarRef.current || duration === 0) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const hoverX = event.clientX - rect.left;
    const percentage = (hoverX / rect.width) * 100;
    const hoverTime = (percentage / 100) * duration;

    setHoveredTime(Math.max(0, Math.min(hoverTime, duration)));

    if (!hoveredNer) {
      let foundNer: NerMarker | null = null;
      for (const ner of nerMarkers) {
        if (percentage >= ner.startPercentage && percentage <= ner.endPercentage) {
          foundNer = ner;
          break;
        }
      }
      setHoveredNer(foundNer);
    }
    if (!hoveredChapter) {
      let foundChapter: ChapterMarker | null = null;
      for (const chapter of chapterMarkers) {
        if (Math.abs(percentage - chapter.percentage) < 1) {
          foundChapter = chapter;
          break;
        }
      }
      setHoveredChapter(foundChapter);
    }
  };

  const handleMouseLeave = () => {
    setHoveredTime(null);
    setHoveredNer(null);
    setHoveredChapter(null);
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        bgcolor: 'background.paper',
        borderTop: '1px solid',
        borderColor: 'divider',
        height: { xs: '60px', lg: 'fit-content' },
      }}>
      <Box
        id="progress-bar-container"
        sx={{
          width: '100%',
          padding: '8px 0px',
          backgroundColor: colors.grey[100],
          borderBottom: `1px solid ${colors.common.border}`,
          position: 'relative',
          zIndex: 1000,
        }}>
        {/* Time display */}
        <Box
          id="time-display"
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={1}
          fontSize="12px"
          color="text.secondary"
          px={2}>
          <Box>{formatTime(currentTime)}</Box>
          {hoveredTime !== null && (
            <Box>
              {hoveredNer ? (
                <>
                  <b>{hoveredNer.label}</b>: {hoveredNer.text} ({formatTime(hoveredNer.startTime)})
                </>
              ) : hoveredChapter ? (
                <>
                  <b>{hoveredChapter.title}</b> ({formatTime(hoveredChapter.time)})
                </>
              ) : (
                <>Hover: {formatTime(hoveredTime)}</>
              )}
            </Box>
          )}
          <Box>{formatTime(duration)}</Box>
        </Box>

        {/* Progress bar container */}
        <Box
          id="progress-bar"
          ref={progressBarRef}
          onClick={handleProgressBarClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          sx={{
            position: 'relative',
            height: '12px',
            backgroundColor: colors.grey[300],
            borderRadius: '6px',
            cursor: isLoadingProgressBar ? 'default' : 'pointer',
            overflow: 'visible',
            width: '100%',
            margin: 0,
            pointerEvents: isLoadingProgressBar ? 'none' : 'auto',
          }}>
          {isLoadingProgressBar && (
            <Skeleton
              variant="rounded"
              animation="wave"
              sx={{
                position: 'absolute',
                inset: 0,
                borderRadius: '6px',
                zIndex: 10,
                height: '12px',
              }}
            />
          )}

          {/* Chapter markers */}
          {chapterMarkers.map((chapter, index) => (
            <Tooltip key={`chapter-${index}`} title={`${chapter.title} (${formatTime(chapter.time)})`} placement="top">
              <Box
                sx={{
                  position: 'absolute',
                  left: `${chapter.percentage}%`,
                  top: '-3px',
                  width: '3px',
                  height: '18px',
                  backgroundColor: colors.text.primary,
                  borderRadius: '2px',
                  zIndex: 3,
                  cursor: 'pointer',
                  boxShadow: `0 1px 4px ${colors.common.shadow}`,
                  transition: 'background-color 0.2s',
                  '&:hover': { backgroundColor: colors.common.black },
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  seekOnly(chapter.time);
                }}
                onMouseEnter={() => setHoveredChapter(chapter)}
                onMouseLeave={() => setHoveredChapter(null)}
              />
            </Tooltip>
          ))}

          {/* NER markers */}
          {nerMarkers.map((ner, index) => (
            <Tooltip
              key={`ner-${index}`}
              title={`${ner.label}: ${ner.text} (${formatTime(ner.startTime)} - ${formatTime(ner.endTime)})`}
              placement="top">
              <Box
                sx={{
                  position: 'absolute',
                  left: `${ner.startPercentage}%`,
                  width: `${Math.max(0.5, ner.endPercentage - ner.startPercentage)}%`,
                  top: '2px',
                  height: '8px',
                  backgroundColor: ner.color,
                  borderRadius: '4px',
                  zIndex: 2,
                  cursor: 'pointer',
                  opacity: 0.8,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  seekOnly(ner.startTime);
                }}
                onMouseEnter={() => setHoveredNer(ner)}
                onMouseLeave={() => setHoveredNer(null)}
              />
            </Tooltip>
          ))}

          {/* Progress fill */}
          <Box
            id="progress-fill"
            sx={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: `${progressPercentage}%`,
              height: '100%',
              backgroundColor: colors.secondary.main,
              borderRadius: '6px',
              zIndex: 1,
            }}
          />

          {/* Current time indicator */}
          <Box
            id="current-time-indicator"
            sx={{
              position: 'absolute',
              left: `${progressPercentage}%`,
              top: '-3px',
              width: '6px',
              height: '18px',
              backgroundColor: colors.secondary.main,
              borderRadius: '3px',
              transform: 'translateX(-50%)',
              zIndex: 4,
              border: `2px solid ${colors.common.white}`,
              boxShadow: `0 2px 4px ${colors.common.shadow}`,
            }}
          />

          {/* Hover indicator */}
          {hoveredTime !== null && (
            <Box
              id="hover-indicator"
              sx={{
                position: 'absolute',
                left: `${(hoveredTime / duration) * 100}%`,
                top: '-2px',
                width: '2px',
                height: '16px',
                backgroundColor: colors.warning.main,
                transform: 'translateX(-50%)',
                zIndex: 5,
                opacity: 0.7,
              }}
            />
          )}
        </Box>

        {/* Legend */}
        <Box
          display={isMobile ? 'none' : 'flex'}
          alignItems="center"
          justifyContent="center"
          gap={isMobile ? 1 : 3}
          mt={1}
          fontSize="11px"
          color="text.secondary"
          width="100%">
          <Box display="flex" alignItems="center" gap={0.5}>
            <Box sx={{ width: '8px', height: '8px', backgroundColor: colors.text.primary, borderRadius: '1px' }} />
            <span>Chapters</span>
          </Box>
          {selected_ner_labels.length > 0 && (
            <Box display="flex" alignItems="center" gap={0.5}>
              <Box sx={{ width: '8px', height: '8px', backgroundColor: colors.grey[600], borderRadius: '4px' }} />
              <span>NER Labels ({selected_ner_labels.length} types)</span>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};
