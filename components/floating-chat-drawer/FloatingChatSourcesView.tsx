'use client';

import { Box, Button, InputAdornment, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderIcon from '@mui/icons-material/Folder';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import SearchIcon from '@mui/icons-material/Search';
import { Citation } from '@/types/chat';
import { colors } from '@/lib/theme';
import { getMuxPlaybackId } from '@/app/utils/converters';
import { highlightSearchText } from '@/app/indexes/highlightSearch';
import { formatTime, groupByRecording } from './helpers';

type SourcesListMode = 'recording' | 'number';

type FloatingChatSourcesViewProps = {
  citations: Citation[];
  filterTerm: string;
  listMode: SourcesListMode;
  collapsed: Set<string>;
  onBack: () => void;
  onFilterChange: (value: string) => void;
  onListModeChange: (mode: SourcesListMode) => void;
  onToggleCollapse: (id: string) => void;
  onSelectCitation: (citation: Citation) => void;
};

export function FloatingChatSourcesView({
  citations,
  filterTerm,
  listMode,
  collapsed,
  onBack,
  onFilterChange,
  onListModeChange,
  onToggleCollapse,
  onSelectCitation,
}: FloatingChatSourcesViewProps) {
  const filteredCitations = (() => {
    const normalized = filterTerm.trim().toLowerCase();
    if (!normalized) return citations;
    return citations.filter(
      (citation) =>
        citation.interviewTitle.toLowerCase().includes(normalized) ||
        citation.sectionTitle.toLowerCase().includes(normalized) ||
        citation.transcription.toLowerCase().includes(normalized) ||
        citation.speaker.toLowerCase().includes(normalized),
    );
  })();

  return (
    <Box sx={{ flex: 1, overflow: 'hidden', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ px: 1, py: 0.5, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Button size="small" startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ textTransform: 'none' }}>
          Back to chat
        </Button>
      </Box>

      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 2,
          py: 1.5,
          bgcolor: colors.grey[100],
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
        }}>
        <FormatListBulletedIcon sx={{ fontSize: 18, color: colors.text.secondary }} />
        <Typography variant="body2" fontWeight={600} sx={{ flex: 1 }}>
          {citations.length} source{citations.length !== 1 ? 's' : ''}
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={listMode}
          onChange={(_, val) => {
            if (val) onListModeChange(val);
          }}
          sx={{ height: 26 }}>
          <ToggleButton value="number" sx={{ px: 0.75, py: 0, textTransform: 'none' }}>
            <Tooltip title="Sort by citation number">
              <FormatListNumberedIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="recording" sx={{ px: 0.75, py: 0, textTransform: 'none' }}>
            <Tooltip title="Group by recording">
              <FolderIcon sx={{ fontSize: 16 }} />
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Box
        sx={{
          px: 2,
          pt: 1.5,
          pb: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexShrink: 0,
          bgcolor: colors.background.paper,
        }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Filter sources..."
          value={filterTerm}
          onChange={(e) => onFilterChange(e.target.value)}
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

      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {listMode === 'number'
          ? [...filteredCitations].sort((a, b) => a.index - b.index).map((citation) => {
              const playbackId = getMuxPlaybackId(citation.videoUrl);
              const thumbnailUrl =
                playbackId && !citation.isAudioFile
                  ? `https://image.mux.com/${playbackId}/thumbnail.jpg?width=320&height=180&fit_mode=crop&time=${Math.floor(citation.startTime)}`
                  : null;

              return (
                <Box
                  key={`num-${citation.index}`}
                  onClick={() => onSelectCitation(citation)}
                  sx={{
                    display: 'flex',
                    gap: 1.5,
                    px: 2,
                    py: 1.25,
                    cursor: 'pointer',
                    borderBottom: '1px solid',
                    borderColor: 'divider',
                    borderLeft: `3px solid ${citation.isChapterSynopsis ? colors.success.main : colors.primary.main}`,
                    '&:hover': { bgcolor: colors.grey[50] },
                    transition: 'background-color 0.15s',
                  }}>
                  {thumbnailUrl ? (
                    <Box
                      component="img"
                      src={thumbnailUrl}
                      alt={citation.interviewTitle}
                      sx={{
                        width: 48,
                        aspectRatio: '16/9',
                        objectFit: 'cover',
                        borderRadius: 1,
                        bgcolor: colors.grey[200],
                        flexShrink: 0,
                        alignSelf: 'flex-start',
                        mt: 0.25,
                      }}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: 48,
                        aspectRatio: '16/9',
                        bgcolor: colors.grey[200],
                        borderRadius: 1,
                        flexShrink: 0,
                        alignSelf: 'flex-start',
                        mt: 0.25,
                      }}
                    />
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                      <Box
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          bgcolor: citation.isChapterSynopsis ? colors.success.main : colors.primary.main,
                          color: colors.primary.contrastText,
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          borderRadius: '4px',
                          px: 0.5,
                          minWidth: 18,
                          lineHeight: 1.4,
                        }}>
                        {citation.index}
                      </Box>
                      <Typography variant="caption" color="text.secondary" sx={{ flex: 1, minWidth: 0 }} noWrap>
                        {citation.isChapterSynopsis ? (
                          <>
                            {citation.interviewTitle} &middot; {citation.sectionTitle}
                          </>
                        ) : (
                          <>
                            {citation.speaker} &middot; {citation.sectionTitle}
                          </>
                        )}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                        {formatTime(citation.startTime)}–{formatTime(citation.endTime)}
                      </Typography>
                    </Box>
                    <Typography
                      variant="body2"
                      color="text.primary"
                      sx={{
                        mt: 0.5,
                        lineHeight: 1.5,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                      &ldquo;{citation.transcription}&rdquo;
                    </Typography>
                  </Box>
                </Box>
              );
            })
          : groupByRecording(filteredCitations).map((group) => {
              const playbackId = getMuxPlaybackId(group.videoUrl);
              const thumbnailUrl =
                playbackId && !group.isAudioFile
                  ? `https://image.mux.com/${playbackId}/thumbnail.jpg?width=320&height=180&fit_mode=crop`
                  : null;
              const isCollapsed = collapsed.has(group.theirstoryId);

              return (
                <Box key={group.theirstoryId} sx={{ borderBottom: '2px solid', borderColor: 'divider' }}>
                  <Box
                    onClick={() => onToggleCollapse(group.theirstoryId)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      px: 2,
                      py: 1.5,
                      bgcolor: colors.grey[50],
                      position: 'sticky',
                      top: 0,
                      zIndex: 2,
                      cursor: 'pointer',
                      borderBottom: '1px solid',
                      borderColor: 'divider',
                      '&:hover': { bgcolor: colors.grey[100] },
                    }}>
                    <ExpandMoreIcon
                      sx={{
                        fontSize: 20,
                        transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s',
                        flexShrink: 0,
                      }}
                    />
                    {thumbnailUrl ? (
                      <Box
                        component="img"
                        src={thumbnailUrl}
                        alt={group.interviewTitle}
                        sx={{
                          width: 48,
                          aspectRatio: '16/9',
                          objectFit: 'cover',
                          borderRadius: 1,
                          bgcolor: colors.grey[200],
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <Box
                        sx={{
                          width: 48,
                          aspectRatio: '16/9',
                          bgcolor: colors.grey[200],
                          borderRadius: 1,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.3, fontSize: '0.8rem' }}>
                        {highlightSearchText(group.interviewTitle, filterTerm)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {group.results.length} source{group.results.length !== 1 ? 's' : ''}
                      </Typography>
                    </Box>
                  </Box>

                  {!isCollapsed &&
                    group.results.map((citation, idx) => (
                      <Box
                        key={`${citation.startTime}-${idx}`}
                        onClick={() => onSelectCitation(citation)}
                        sx={{
                          pl: 2,
                          pr: 2,
                          py: 1.25,
                          cursor: 'pointer',
                          borderLeft: `3px solid ${citation.isChapterSynopsis ? colors.success.main : colors.primary.main}`,
                          '&:hover': { bgcolor: colors.grey[50] },
                          transition: 'background-color 0.15s',
                        }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              bgcolor: citation.isChapterSynopsis ? colors.success.main : colors.primary.main,
                              color: colors.primary.contrastText,
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              borderRadius: '4px',
                              px: 0.5,
                              minWidth: 18,
                              lineHeight: 1.4,
                            }}>
                            {citation.index}
                          </Box>
                          <Typography variant="caption" color="text.secondary">
                            {citation.isChapterSynopsis ? 'Chapter Summary' : citation.speaker}
                            {' · '}
                            {citation.sectionTitle}
                            {' · '}
                            {formatTime(citation.startTime)}–{formatTime(citation.endTime)}
                          </Typography>
                        </Box>
                        <Typography
                          variant="body2"
                          color="text.primary"
                          sx={{
                            mt: 0.5,
                            lineHeight: 1.5,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}>
                          &ldquo;{citation.transcription}&rdquo;
                        </Typography>
                      </Box>
                    ))}
                </Box>
              );
            })}
      </Box>
    </Box>
  );
}
