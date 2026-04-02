'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Box, Typography, Button, TextField, InputAdornment, Tooltip, ToggleButtonGroup, ToggleButton } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArticleIcon from '@mui/icons-material/Article';
import SearchIcon from '@mui/icons-material/Search';
import FolderIcon from '@mui/icons-material/Folder';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import MuxPlayer from '@mux/mux-player-react';
import MuxPlayerElement from '@mux/mux-player';
import { useChatStore } from '@/app/stores/useChatStore';
import { Citation } from '@/types/chat';
import { colors } from '@/lib/theme';
import { muxPlayerThemeProps } from '@/lib/theme/muxPlayerTheme';
import { CitationBadge, GroupedSourcesView, NumberedSourcesView } from './recording/RecordingSourcesViews';
import { CHAPTER_COLOR, CLIP_COLOR, formatTime } from './recording/recordingViewShared';

export const SidePanelRecordingView = () => {
  const activeCitation = useChatStore((s) => s.activeCitation);
  const previousMode = useChatStore((s) => s.previousMode);
  const activeCitationSiblings = useChatStore((s) => s.activeCitationSiblings);
  const sidePanelDetailView = useChatStore((s) => s.sidePanelDetailView);
  const setSidePanelDetailView = useChatStore((s) => s.setSidePanelDetailView);
  const goBack = useChatStore((s) => s.goBack);
  const openTranscript = useChatStore((s) => s.openTranscript);
  const setActiveCitation = useChatStore((s) => s.setActiveCitation);
  const videoRef = useRef<MuxPlayerElement>(null);
  const hasSiblings = activeCitationSiblings.length > 1;
  const [filterTerm, setFilterTerm] = useState('');
  const [listMode, setListMode] = useState<'recording' | 'number'>('recording');

  // Sync video time when active citation changes
  useEffect(() => {
    if (videoRef.current && activeCitation) {
      videoRef.current.currentTime = activeCitation.startTime;
    }
  }, [activeCitation]);

  // Reset filter when switching to list
  useEffect(() => {
    if (!sidePanelDetailView) {
      setFilterTerm('');
    }
  }, [sidePanelDetailView]);

  const filteredCitations = useMemo(() => {
    const q = filterTerm.trim().toLowerCase();
    if (!q) return activeCitationSiblings;
    return activeCitationSiblings.filter(
      (c) =>
        c.interviewTitle.toLowerCase().includes(q) ||
        c.sectionTitle.toLowerCase().includes(q) ||
        c.transcription.toLowerCase().includes(q) ||
        c.speaker.toLowerCase().includes(q),
    );
  }, [activeCitationSiblings, filterTerm]);

  if (!activeCitation) return null;

  const accentColor = activeCitation.isChapterSynopsis ? CHAPTER_COLOR : CLIP_COLOR;

  const handleSelectCitation = (citation: Citation) => {
    setActiveCitation(citation, activeCitationSiblings);
    setSidePanelDetailView(true);
  };

  const handleBackToSources = () => {
    setSidePanelDetailView(false);
  };

  // Detail view — single source with video player
  if (sidePanelDetailView) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {previousMode === 'search' ? (
          <Button
            size="small"
            startIcon={<ArrowBackIcon />}
            onClick={goBack}
            sx={{ textTransform: 'none', justifyContent: 'flex-start', px: 2, py: 1 }}>
            Back to results
          </Button>
        ) : hasSiblings ? (
          <Button
            size="small"
            startIcon={<ArrowBackIcon />}
            onClick={handleBackToSources}
            sx={{ textTransform: 'none', justifyContent: 'flex-start', px: 2, py: 1 }}>
            Back to sources ({activeCitationSiblings.length})
          </Button>
        ) : null}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2 }}>
          <Box sx={{ borderRadius: 2, overflow: 'hidden', bgcolor: colors.common.black }}>
            <MuxPlayer
              ref={videoRef}
              src={activeCitation.videoUrl}
              audio={activeCitation.isAudioFile}
              startTime={activeCitation.startTime}
              forwardSeekOffset={10}
              backwardSeekOffset={10}
              accentColor={muxPlayerThemeProps.accentColor}
              style={{ ...muxPlayerThemeProps.style, aspectRatio: activeCitation.isAudioFile ? 'auto' : '16/9' }}
            />
          </Box>

          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
              <CitationBadge index={activeCitation.index} isChapter={Boolean(activeCitation.isChapterSynopsis)} />
              <Typography variant="subtitle2" fontWeight={700}>
                {activeCitation.interviewTitle}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              {activeCitation.isChapterSynopsis ? (
                <>
                  Chapter Summary &middot; {activeCitation.sectionTitle} &middot; {formatTime(activeCitation.startTime)}
                  –{formatTime(activeCitation.endTime)}
                </>
              ) : (
                <>
                  {activeCitation.speaker} &middot; {activeCitation.sectionTitle} &middot;{' '}
                  {formatTime(activeCitation.startTime)}–{formatTime(activeCitation.endTime)}
                </>
              )}
            </Typography>
          </Box>

          <Box
            sx={{
              bgcolor: colors.grey[50],
              borderRadius: 1,
              p: 2,
              borderLeft: `3px solid ${accentColor}`,
            }}>
            <Typography variant="body2" sx={{ fontStyle: 'italic', lineHeight: 1.6, color: colors.text.primary }}>
              &ldquo;{activeCitation.transcription}&rdquo;
            </Typography>
          </Box>

          <Button
            variant="outlined"
            size="small"
            fullWidth
            startIcon={<ArticleIcon />}
            onClick={() => openTranscript(activeCitation)}
            sx={{ textTransform: 'none' }}>
            Open Full Transcript
          </Button>
        </Box>
      </Box>
    );
  }

  // List view — all sources with filter
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Fixed header — outside scroll container */}
      <Box
        sx={{
          px: 2,
          pt: 1.5,
          pb: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: colors.background.paper,
          flexShrink: 0,
        }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="subtitle2" fontWeight={600}>
            Sources ({activeCitationSiblings.length})
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={listMode}
            onChange={(_, val) => {
              if (val) setListMode(val);
            }}
            sx={{ height: 28 }}>
            <ToggleButton value="recording" sx={{ px: 1, py: 0, textTransform: 'none', fontSize: '0.7rem' }}>
              <Tooltip title="Group by recording">
                <FolderIcon sx={{ fontSize: 16 }} />
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="number" sx={{ px: 1, py: 0, textTransform: 'none', fontSize: '0.7rem' }}>
              <Tooltip title="Sort by citation number">
                <FormatListNumberedIcon sx={{ fontSize: 16 }} />
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
        <TextField
          size="small"
          fullWidth
          placeholder="Filter sources..."
          value={filterTerm}
          onChange={(e) => setFilterTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
          sx={{ bgcolor: colors.background.default, borderRadius: '8px' }}
        />
      </Box>
      {/* Scrollable content — recording headers stick within this */}
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {listMode === 'recording' ? (
          <GroupedSourcesView citations={filteredCitations} filterTerm={filterTerm} onSelectCitation={handleSelectCitation} />
        ) : (
          <NumberedSourcesView citations={filteredCitations} filterTerm={filterTerm} onSelectCitation={handleSelectCitation} />
        )}
      </Box>
    </Box>
  );
};
