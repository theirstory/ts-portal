'use client';

import React from 'react';
import { Box, Tooltip } from '@mui/material';
import { darken } from '@mui/material/styles';
import { Citation } from '@/types/chat';
import { useChatStore } from '@/app/stores/useChatStore';
import { useChatInteraction } from '@/app/discover/ChatInteractionContext';
import { colors } from '@/lib/theme';

type Props = {
  citation: Citation;
  siblings?: Citation[];
  messageId?: string;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const ChatCitationChip = ({ citation, siblings, messageId }: Props) => {
  const setActiveCitation = useChatStore((s) => s.setActiveCitation);
  const setHoveredCitationIndex = useChatStore((s) => s.setHoveredCitationIndex);
  const hoveredCitationIndex = useChatStore((s) => s.hoveredCitationIndex);
  const activeAssistantMessageId = useChatStore((s) => s.activeAssistantMessageId);
  const { onCitationClick } = useChatInteraction();

  // Only highlight if this chip belongs to the active assistant message (or no scoping)
  const isHighlighted = hoveredCitationIndex === citation.index &&
    (!activeAssistantMessageId || !messageId || activeAssistantMessageId === messageId);

  const tooltipContent = citation.isChapterSynopsis
    ? `Chapter Summary — "${citation.interviewTitle}" · ${citation.sectionTitle}`
    : `${citation.speaker} — "${citation.interviewTitle}" (${formatTime(citation.startTime)})`;

  return (
    <Tooltip title={tooltipContent} arrow placement="top">
      <Box
        component="span"
        data-citation-index={citation.index}
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          if (onCitationClick) {
            onCitationClick(citation);
          } else {
            setActiveCitation(citation, siblings);
          }
        }}
        onMouseEnter={() => setHoveredCitationIndex(citation.index)}
        onMouseLeave={() => setHoveredCitationIndex(null)}
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: citation.isChapterSynopsis ? colors.success.main : colors.primary.main,
          color: colors.primary.contrastText,
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
          transition: 'all 0.15s',
          ...(isHighlighted && {
            transform: 'scale(1.3)',
            boxShadow: `0 0 0 2px ${colors.background.paper}, 0 0 0 4px ${citation.isChapterSynopsis ? colors.success.main : colors.primary.main}`,
          }),
          '&:hover': {
            bgcolor: citation.isChapterSynopsis ? darken(colors.success.main, 0.12) : colors.primary.dark,
          },
        }}>
        {citation.index}
      </Box>
    </Tooltip>
  );
};
