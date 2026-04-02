'use client';

import { Box, Button, IconButton, Tooltip, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DescriptionIcon from '@mui/icons-material/Description';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import MuxPlayer from '@mux/mux-player-react';
import { Citation } from '@/types/chat';
import { colors } from '@/lib/theme';
import { muxPlayerThemeProps } from '@/lib/theme/muxPlayerTheme';
import { formatTime } from './helpers';

type FloatingChatRecordingViewProps = {
  citation: Citation;
  onBack: () => void;
  onOpenTranscript: (citation: Citation) => void;
};

export function FloatingChatRecordingView({
  citation,
  onBack,
  onOpenTranscript,
}: FloatingChatRecordingViewProps) {
  return (
    <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          px: 1,
          py: 0.5,
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
        <Button size="small" startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ textTransform: 'none' }}>
          Back
        </Button>
        <Tooltip title="Open recording in new tab">
          <IconButton
            size="small"
            onClick={() => window.open(`/story/${citation.theirstoryId}?start=${citation.startTime}`, '_blank')}>
            <OpenInNewIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      <Box sx={{ flexShrink: 0, bgcolor: colors.common.black }}>
        <MuxPlayer
          src={citation.videoUrl}
          audio={citation.isAudioFile}
          startTime={citation.startTime}
          forwardSeekOffset={10}
          backwardSeekOffset={10}
          accentColor={muxPlayerThemeProps.accentColor}
          style={{ ...muxPlayerThemeProps.style, aspectRatio: citation.isAudioFile ? 'auto' : '16/9' }}
        />
      </Box>

      <Box sx={{ px: 2, py: 2, flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: citation.isChapterSynopsis ? colors.success.main : colors.primary.main,
              color: colors.primary.contrastText,
              fontWeight: 700,
              fontSize: '0.72rem',
              borderRadius: '4px',
              minWidth: 22,
              height: 22,
              px: 0.5,
              flexShrink: 0,
            }}>
            {citation.index}
          </Box>
          <Typography variant="subtitle1" fontWeight={700}>
            {citation.interviewTitle}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          {citation.isChapterSynopsis ? 'Chapter Summary' : citation.speaker}
          {' · '}
          {citation.sectionTitle}
          {' · '}
          {formatTime(citation.startTime)}–{formatTime(citation.endTime)}
        </Typography>

        <Box
          sx={{
            borderLeft: `3px solid ${citation.isChapterSynopsis ? colors.success.main : colors.primary.main}`,
            pl: 2,
            py: 1,
            mb: 3,
          }}>
          <Typography variant="body2" sx={{ fontStyle: 'italic', lineHeight: 1.6 }}>
            &ldquo;{citation.transcription}&rdquo;
          </Typography>
        </Box>

        <Button
          variant="outlined"
          fullWidth
          startIcon={<DescriptionIcon />}
          onClick={() => onOpenTranscript(citation)}
          sx={{
            textTransform: 'none',
            borderRadius: 2,
            py: 1.25,
            mb: 1.5,
          }}>
          Open Full Transcript
        </Button>
      </Box>
    </Box>
  );
}
