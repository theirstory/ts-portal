'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Box, Typography, TextField, InputAdornment } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import { useChatStore } from '@/app/stores/useChatStore';
import { Citation } from '@/types/chat';
import { getMuxPlaybackId } from '@/app/utils/converters';
import { colors } from '@/lib/theme';
import { highlightSearchText } from '@/app/indexes/highlightSearch';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const ExpandableText = ({ text, highlight = '' }: { text: string; highlight?: string }) => {
  const [expanded, setExpanded] = useState(false);
  const textRef = useRef<HTMLElement>(null);
  const [isClamped, setIsClamped] = useState(false);

  useEffect(() => {
    const el = textRef.current;
    if (el) {
      setIsClamped(el.scrollHeight > el.clientHeight + 1);
    }
  }, [text, expanded]);

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
        {highlightSearchText(text, highlight)}
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

type RecordingGroup = {
  theirstoryId: string;
  interviewTitle: string;
  videoUrl: string;
  isAudioFile: boolean;
  results: Citation[];
};

function groupSearchByRecording(citations: Citation[]): RecordingGroup[] {
  const map = new Map<string, Citation[]>();
  const order: string[] = [];
  const meta = new Map<string, { interviewTitle: string; videoUrl: string; isAudioFile: boolean }>();

  for (const c of citations) {
    const id = c.theirstoryId;
    if (!map.has(id)) {
      map.set(id, []);
      order.push(id);
      meta.set(id, { interviewTitle: c.interviewTitle, videoUrl: c.videoUrl, isAudioFile: c.isAudioFile ?? false });
    }
    map.get(id)!.push(c);
  }

  return order.map((id) => ({
    theirstoryId: id,
    ...meta.get(id)!,
    results: map.get(id)!.sort((a, b) => a.startTime - b.startTime),
  }));
}

export const SidePanelSearchResults = () => {
  const searchResults = useChatStore((s) => s.searchResults);
  const selectionSearchQuery = useChatStore((s) => s.selectionSearchQuery);
  const openTranscript = useChatStore((s) => s.openTranscript);
  const [filterTerm, setFilterTerm] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleCollapse = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredResults = useMemo(() => {
    const q = filterTerm.trim().toLowerCase();
    if (!q) return searchResults;
    return searchResults.filter((c) =>
      c.interviewTitle.toLowerCase().includes(q) ||
      c.sectionTitle.toLowerCase().includes(q) ||
      c.transcription.toLowerCase().includes(q) ||
      c.speaker.toLowerCase().includes(q),
    );
  }, [searchResults, filterTerm]);

  const groups = useMemo(() => groupSearchByRecording(filteredResults), [filteredResults]);

  // Combine search query and filter for highlighting
  const highlightQuery = filterTerm.trim() || selectionSearchQuery;

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
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sticky search header + filter */}
      <Box sx={{ position: 'sticky', top: 0, zIndex: 3, flexShrink: 0 }}>
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

        <Box sx={{ px: 2, pt: 1.5, pb: 1, bgcolor: colors.background.paper }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Filter results..."
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
      </Box>

      {/* Scrollable results */}
      <Box sx={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
      {groups.map((group) => {
        const playbackId = getMuxPlaybackId(group.videoUrl);
        const thumbnailUrl = playbackId && !group.isAudioFile
          ? `https://image.mux.com/${playbackId}/thumbnail.jpg?width=320&height=180&fit_mode=crop`
          : null;
        const isCollapsed = collapsed.has(group.theirstoryId);

        return (
          <Box key={group.theirstoryId} sx={{ borderBottom: '2px solid', borderColor: 'divider' }}>
            {/* Recording header — sticky + collapsible */}
            <Box
              onClick={() => toggleCollapse(group.theirstoryId)}
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
                  sx={{ width: 64, aspectRatio: '16/9', objectFit: 'cover', borderRadius: 1, bgcolor: colors.grey[200], flexShrink: 0 }}
                />
              ) : (
                <Box sx={{ width: 64, aspectRatio: '16/9', bgcolor: colors.grey[200], borderRadius: 1, flexShrink: 0 }} />
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle2" fontWeight={700} sx={{ lineHeight: 1.3 }}>
                  {highlightSearchText(group.interviewTitle, highlightQuery)}
                </Typography>
                {isCollapsed && (
                  <Typography variant="caption" color="text.secondary">
                    {group.results.length} result{group.results.length !== 1 ? 's' : ''}
                  </Typography>
                )}
              </Box>
            </Box>

            {/* Results within recording */}
            {!isCollapsed && group.results.map((citation, idx) => (
              <Box
                key={`${citation.startTime}-${idx}`}
                onClick={() => openTranscript(citation)}
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
                  {highlightSearchText(citation.speaker, highlightQuery)} &middot;{' '}
                  {highlightSearchText(citation.sectionTitle, highlightQuery)} &middot;{' '}
                  {formatTime(citation.startTime)}–{formatTime(citation.endTime)}
                </Typography>
                <ExpandableText text={citation.transcription} highlight={highlightQuery} />
              </Box>
            ))}
          </Box>
        );
      })}

      {filteredResults.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 3, textAlign: 'center' }}>
          No results match your filter.
        </Typography>
      )}
      </Box>
    </Box>
  );
};
