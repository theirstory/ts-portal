'use client';

import React from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useChatStore } from '@/app/stores/useChatStore';
import { SidePanelRecordingView } from './SidePanelRecordingView';
import { SidePanelSearchResults } from './SidePanelSearchResults';
import { SidePanelTranscriptView } from './SidePanelTranscriptView';
import { colors } from '@/lib/theme';

const SEARCH_TYPE_LABELS: Record<string, string> = {
  bm25: 'Keyword',
  vector: 'Thematic',
  hybrid: 'Hybrid',
};

export const SidePanel = () => {
  const sidePanelMode = useChatStore((s) => s.sidePanelMode);
  const closeSidePanel = useChatStore((s) => s.closeSidePanel);
  const activeCitation = useChatStore((s) => s.activeCitation);
  const transcriptCitation = useChatStore((s) => s.transcriptCitation);
  const selectionSearchType = useChatStore((s) => s.selectionSearchType);
  const activePromptText = useChatStore((s) => s.activePromptText);

  const getHeaderTitle = () => {
    switch (sidePanelMode) {
      case 'recording':
        return activePromptText || activeCitation?.interviewTitle || '';
      case 'transcript': {
        const citation = transcriptCitation ?? activeCitation;
        const indexPrefix = citation ? `[${citation.index}] ` : '';
        return `${indexPrefix}${citation?.interviewTitle ?? ''}`;
      }
      case 'search': {
        const typeLabel = SEARCH_TYPE_LABELS[selectionSearchType] || '';
        return `Search Results${typeLabel ? ` (${typeLabel})` : ''}`;
      }
      default:
        return '';
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        bgcolor: colors.background.paper,
        overflow: 'hidden',
      }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          minHeight: 48,
        }}>
        <Typography variant="subtitle2" fontWeight={600} noWrap>
          {getHeaderTitle()}
        </Typography>
        <IconButton size="small" onClick={closeSidePanel}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{
        flex: 1,
        overflow: (sidePanelMode === 'transcript' || sidePanelMode === 'search') ? 'hidden' : 'auto',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {sidePanelMode === 'recording' && <SidePanelRecordingView />}
        {sidePanelMode === 'search' && <SidePanelSearchResults />}
        {sidePanelMode === 'transcript' && <SidePanelTranscriptView />}
      </Box>
    </Box>
  );
};
