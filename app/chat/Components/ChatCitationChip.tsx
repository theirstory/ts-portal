'use client';

import React from 'react';
import { Box, Tooltip } from '@mui/material';
import { Citation } from '@/types/chat';
import { useChatStore } from '@/app/stores/useChatStore';
import { colors } from '@/lib/theme';

type Props = {
  citation: Citation;
  siblings?: Citation[];
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const ChatCitationChip = ({ citation, siblings }: Props) => {
  const setActiveCitation = useChatStore((s) => s.setActiveCitation);

  const tooltipContent = citation.isChapterSynopsis
    ? `Chapter Summary — "${citation.interviewTitle}" · ${citation.sectionTitle}`
    : `${citation.speaker} — "${citation.interviewTitle}" (${formatTime(citation.startTime)})`;

  return (
    <Tooltip title={tooltipContent} arrow placement="top">
      <Box
        component="span"
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          setActiveCitation(citation, siblings);
        }}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: citation.isChapterSynopsis ? colors.success.main : colors.primary.main,
          color: citation.isChapterSynopsis ? colors.success.contrastText : colors.primary.contrastText,
          fontSize: '0.7rem',
          fontWeight: 700,
          borderRadius: '4px',
          px: 0.6,
          py: 0.1,
          mx: 0.3,
          cursor: 'pointer',
          minWidth: 20,
          lineHeight: 1.4,
          verticalAlign: 'super',
          transition: 'background-color 0.15s',
          '&:hover': {
            bgcolor: citation.isChapterSynopsis ? colors.success.dark : colors.primary.dark,
          },
        }}>
        {citation.index}
      </Box>
    </Tooltip>
  );
};
