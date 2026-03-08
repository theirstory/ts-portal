'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useChatStore } from '@/app/stores/useChatStore';
import { Citation } from '@/types/chat';
import { getMuxPlaybackId } from '@/app/utils/converters';
import { colors } from '@/lib/theme';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const ExpandableText = ({ text }: { text: string }) => {
  const [expanded, setExpanded] = useState(false);
  const textRef = useRef<HTMLElement>(null);
  const [isClamped, setIsClamped] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (el) {
      setIsClamped(el.scrollHeight > el.clientHeight + 1);
    }
  }, [text]);

  return (
    <>
      <Typography
        ref={textRef}
        variant="body2"
        color="text.primary"
        sx={{
          mt: 0.5,
          lineHeight: 1.5,
          ...(!expanded && {
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }),
        }}>
        {text}
      </Typography>
      {(isClamped || expanded) && (
        <Typography
          component="span"
          variant="caption"
          color="primary"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            setExpanded((prev) => !prev);
          }}
          sx={{ cursor: 'pointer', fontWeight: 600, mt: 0.25, display: 'inline-block' }}>
          {expanded ? 'Show less' : 'Show more'}
        </Typography>
      )}
    </>
  );
};

const SearchResultCard = ({ citation }: { citation: Citation }) => {
  const selectSearchResult = useChatStore((s) => s.selectSearchResult);
  const playbackId = getMuxPlaybackId(citation.videoUrl);
  const thumbnailUrl = playbackId && !citation.isAudioFile
    ? `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${Math.floor(citation.startTime)}&width=320&height=180&fit_mode=crop`
    : null;

  return (
    <Box
      onClick={() => selectSearchResult(citation)}
      sx={{
        p: 2,
        cursor: 'pointer',
        borderBottom: '1px solid',
        borderColor: 'divider',
        '&:hover': { bgcolor: colors.grey[50] },
        transition: 'background-color 0.15s',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 1.5,
      }}>
      <Box sx={{ width: 100, flexShrink: 0 }}>
        {thumbnailUrl ? (
          <Box
            component="img"
            src={thumbnailUrl}
            alt={citation.interviewTitle}
            sx={{
              width: '100%',
              aspectRatio: '16/9',
              objectFit: 'cover',
              borderRadius: 1,
              bgcolor: colors.grey[200],
            }}
          />
        ) : (
          <Box
            sx={{
              width: '100%',
              aspectRatio: '16/9',
              bgcolor: colors.grey[200],
              borderRadius: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Typography variant="caption" color="text.secondary">
              {citation.isAudioFile ? 'Audio' : ''}
            </Typography>
          </Box>
        )}
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="subtitle2" fontWeight={600} noWrap>
          {citation.interviewTitle}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {citation.speaker} &middot; {formatTime(citation.startTime)}–
          {formatTime(citation.endTime)}
        </Typography>
        <ExpandableText text={citation.transcription} />
      </Box>
    </Box>
  );
};

export const SidePanelSearchResults = () => {
  const searchResults = useChatStore((s) => s.searchResults);
  const selectionSearchQuery = useChatStore((s) => s.selectionSearchQuery);

  if (searchResults.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          No results found
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1.5,
          bgcolor: colors.primary.main,
          color: colors.primary.contrastText,
        }}>
        <SearchIcon sx={{ fontSize: 18 }} />
        <Typography variant="body2" fontWeight={500}>
          &ldquo;{selectionSearchQuery}&rdquo;
        </Typography>
        <Typography variant="caption" sx={{ ml: 'auto', opacity: 0.85 }}>
          {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
        </Typography>
      </Box>
      {searchResults.map((citation, idx) => (
        <SearchResultCard key={`${citation.theirstoryId}-${citation.startTime}-${idx}`} citation={citation} />
      ))}
    </Box>
  );
};
