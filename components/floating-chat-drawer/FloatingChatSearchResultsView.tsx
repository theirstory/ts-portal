'use client';

import { Box, Button, InputAdornment, TextField, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import { Citation } from '@/types/chat';
import { colors } from '@/lib/theme';
import { getMuxPlaybackId } from '@/app/utils/converters';
import { highlightSearchText } from '@/app/indexes/highlightSearch';
import { groupByRecording, SEARCH_TYPE_LABELS, SearchType, formatTime } from './helpers';

type FloatingChatSearchResultsViewProps = {
  results: Citation[];
  query: string;
  searchType: SearchType;
  filterTerm: string;
  collapsed: Set<string>;
  onFilterChange: (value: string) => void;
  onToggleCollapse: (id: string) => void;
  onBack: () => void;
  onSelectCitation: (citation: Citation) => void;
};

export function FloatingChatSearchResultsView({
  results,
  query,
  searchType,
  filterTerm,
  collapsed,
  onFilterChange,
  onToggleCollapse,
  onBack,
  onSelectCitation,
}: FloatingChatSearchResultsViewProps) {
  const filteredResults = (() => {
    const normalized = filterTerm.trim().toLowerCase();
    if (!normalized) return results;
    return results.filter(
      (citation) =>
        citation.interviewTitle.toLowerCase().includes(normalized) ||
        citation.sectionTitle.toLowerCase().includes(normalized) ||
        citation.transcription.toLowerCase().includes(normalized) ||
        citation.speaker.toLowerCase().includes(normalized),
    );
  })();

  const searchHighlight = filterTerm.trim() || query;
  const groups = groupByRecording(filteredResults);

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
          bgcolor: colors.primary.main,
          color: colors.primary.contrastText,
          flexShrink: 0,
        }}>
        <SearchIcon sx={{ fontSize: 18 }} />
        <Typography variant="body2" fontWeight={500}>
          &ldquo;{query}&rdquo;
        </Typography>
        <Typography variant="caption" sx={{ ml: 'auto', opacity: 0.85 }}>
          {results.length} result{results.length !== 1 ? 's' : ''}
          {' · '}
          {SEARCH_TYPE_LABELS[searchType] || ''}
        </Typography>
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
          placeholder="Filter results..."
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
        {filteredResults.length === 0 ? (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No results found
            </Typography>
          </Box>
        ) : (
          groups.map((group) => {
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
                      {highlightSearchText(group.interviewTitle, searchHighlight)}
                    </Typography>
                    {isCollapsed && (
                      <Typography variant="caption" color="text.secondary">
                        {group.results.length} result{group.results.length !== 1 ? 's' : ''}
                      </Typography>
                    )}
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
                        borderLeft: `3px solid ${colors.primary.main}`,
                        '&:hover': { bgcolor: colors.grey[50] },
                        transition: 'background-color 0.15s',
                      }}>
                      <Typography variant="caption" color="text.secondary">
                        {highlightSearchText(citation.speaker, searchHighlight)} &middot;{' '}
                        {highlightSearchText(citation.sectionTitle, searchHighlight)} &middot;{' '}
                        {formatTime(citation.startTime)}–{formatTime(citation.endTime)}
                      </Typography>
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
                        {highlightSearchText(citation.transcription, searchHighlight)}
                      </Typography>
                    </Box>
                  ))}
              </Box>
            );
          })
        )}
      </Box>
    </Box>
  );
}
