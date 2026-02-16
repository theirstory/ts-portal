'use client';

import React, { useCallback } from 'react';

import { Box, IconButton } from '@mui/material';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { useSearchStore } from '@/app/stores/useSearchStore';
import usePlayerStore from '@/app/stores/usePlayerStore';

export const MatchNavigation = ({ compact = false }: { compact?: boolean }) => {
  // Semantic
  const matches = useSemanticSearchStore((s) => s.matches);
  const currentMatchIndex = useSemanticSearchStore((s) => s.currentMatchIndex);
  const nextMatch = useSemanticSearchStore((s) => s.nextMatch);
  const previousMatch = useSemanticSearchStore((s) => s.previousMatch);

  // Traditional
  const traditionalMatches = useSearchStore((s) => s.matches);
  const traditionalCurrentMatchIndex = useSearchStore((s) => s.currentMatchIndex);
  const traditionalNextMatch = useSearchStore((s) => s.nextMatch);
  const traditionalPreviousMatch = useSearchStore((s) => s.previousMatch);

  const { seekTo } = usePlayerStore();

  const hasSemantic = matches.length > 0;
  const hasTraditional = !hasSemantic && traditionalMatches.length > 0;

  const total = hasSemantic ? matches.length : traditionalMatches.length;
  const index = hasSemantic ? currentMatchIndex : traditionalCurrentMatchIndex;

  const handleNext = useCallback(() => {
    if (total === 0) return;

    if (hasSemantic) {
      const nextIndex = (currentMatchIndex + 1) % matches.length;
      const next = matches[nextIndex];

      nextMatch();

      const startTime = next?.properties?.start_time;
      if (startTime) seekTo(startTime);
      return;
    }

    traditionalNextMatch();
  }, [total, hasSemantic, currentMatchIndex, matches, nextMatch, seekTo, traditionalNextMatch]);

  const handlePrevious = useCallback(() => {
    if (total === 0) return;

    if (hasSemantic) {
      const prevIndex = (currentMatchIndex - 1 + matches.length) % matches.length;
      const prev = matches[prevIndex];

      previousMatch();

      const startTime = prev?.properties?.start_time;
      if (startTime) seekTo(startTime);
      return;
    }

    traditionalPreviousMatch();
  }, [total, hasSemantic, currentMatchIndex, matches, previousMatch, seekTo, traditionalPreviousMatch]);

  if (!hasSemantic && !hasTraditional) return null;

  return (
    <Box display="flex" alignItems="center" gap={0}>
      <IconButton onClick={handlePrevious} size="small" sx={{ p: 0.25 }}>
        <NavigateBeforeIcon fontSize="small" />
      </IconButton>

      <Box
        fontSize="12px"
        color="gray"
        minWidth={compact ? 'auto' : '40px'}
        textAlign="center"
        px={compact ? 0.25 : 0.5}
        whiteSpace="nowrap">
        {index + 1}/{total}
      </Box>

      <IconButton onClick={handleNext} size="small" sx={{ p: 0.25 }}>
        <NavigateNextIcon fontSize="small" />
      </IconButton>
    </Box>
  );
};
