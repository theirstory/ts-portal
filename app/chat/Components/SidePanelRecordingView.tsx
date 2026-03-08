'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import { Box, Typography, Button, Tab, Tabs, TextField, InputAdornment } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArticleIcon from '@mui/icons-material/Article';
import SearchIcon from '@mui/icons-material/Search';
import MuxPlayer from '@mux/mux-player-react';
import MuxPlayerElement from '@mux/mux-player';
import { useChatStore } from '@/app/stores/useChatStore';
import { Citation } from '@/types/chat';
import { getMuxPlaybackId } from '@/app/utils/converters';
import { colors } from '@/lib/theme';

// Chapter synopses use a teal/green accent; transcript clips use primary blue
const CHAPTER_COLOR = colors.success.main;
const CLIP_COLOR = colors.primary.main;

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

const AllSourcesCard = ({
  citation,
  siblings,
  onSelect,
}: {
  citation: Citation;
  siblings: Citation[];
  onSelect: () => void;
}) => {
  const setActiveCitation = useChatStore((s) => s.setActiveCitation);
  const playbackId = getMuxPlaybackId(citation.videoUrl);
  const thumbnailUrl = playbackId && !citation.isAudioFile
    ? `https://image.mux.com/${playbackId}/thumbnail.jpg?time=${Math.floor(citation.startTime)}&width=320&height=180&fit_mode=crop`
    : null;
  const accentColor = citation.isChapterSynopsis ? CHAPTER_COLOR : CLIP_COLOR;

  const handleClick = () => {
    setActiveCitation(citation, siblings);
    onSelect();
  };

  return (
    <Box
      onClick={handleClick}
      sx={{
        p: 2,
        cursor: 'pointer',
        borderBottom: '1px solid',
        borderColor: 'divider',
        borderLeft: `3px solid ${accentColor}`,
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: accentColor,
              color: colors.primary.contrastText,
              fontWeight: 700,
              fontSize: '0.7rem',
              borderRadius: '4px',
              minWidth: 20,
              height: 20,
              flexShrink: 0,
            }}>
            {citation.index}
          </Box>
          <Typography variant="subtitle2" fontWeight={600} noWrap sx={{ flex: 1, minWidth: 0 }}>
            {citation.interviewTitle}
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {citation.isChapterSynopsis ? (
            <>Chapter Summary &middot; {citation.sectionTitle}</>
          ) : (
            <>{citation.speaker} &middot; {formatTime(citation.startTime)}</>
          )}
        </Typography>
        <ExpandableText text={citation.transcription} />
      </Box>
    </Box>
  );
};

export const SidePanelRecordingView = () => {
  const activeCitation = useChatStore((s) => s.activeCitation);
  const previousMode = useChatStore((s) => s.previousMode);
  const activeCitationSiblings = useChatStore((s) => s.activeCitationSiblings);
  const goBack = useChatStore((s) => s.goBack);
  const openTranscript = useChatStore((s) => s.openTranscript);
  const videoRef = useRef<MuxPlayerElement>(null);
  const hasSiblings = activeCitationSiblings.length > 1;
  const [tabIndex, setTabIndex] = useState(hasSiblings ? 1 : 0);
  const [filterTerm, setFilterTerm] = useState('');
  const prevCitationRef = useRef<Citation | null>(null);

  useEffect(() => {
    if (videoRef.current && activeCitation) {
      videoRef.current.currentTime = activeCitation.startTime;
    }
    // If the citation changed (user clicked a specific chip), go to Source tab
    // But not on initial mount (when prevCitationRef is null — that's the auto-open)
    if (prevCitationRef.current !== null && activeCitation !== prevCitationRef.current) {
      setTabIndex(0);
    }
    prevCitationRef.current = activeCitation;
  }, [activeCitation]);

  // Reset filter when switching tabs
  useEffect(() => {
    setFilterTerm('');
  }, [tabIndex]);

  const { clips, chapters, filteredClips, filteredChapters } = useMemo(() => {
    const allClips = activeCitationSiblings.filter((c) => !c.isChapterSynopsis);
    const allChapters = activeCitationSiblings.filter((c) => c.isChapterSynopsis);
    const q = filterTerm.trim().toLowerCase();
    if (!q) {
      return { clips: allClips, chapters: allChapters, filteredClips: allClips, filteredChapters: allChapters };
    }
    const match = (c: Citation) =>
      c.interviewTitle.toLowerCase().includes(q) ||
      c.sectionTitle.toLowerCase().includes(q) ||
      c.transcription.toLowerCase().includes(q) ||
      c.speaker.toLowerCase().includes(q);
    return {
      clips: allClips,
      chapters: allChapters,
      filteredClips: allClips.filter(match),
      filteredChapters: allChapters.filter(match),
    };
  }, [activeCitationSiblings, filterTerm]);

  if (!activeCitation) return null;

  const accentColor = activeCitation.isChapterSynopsis ? CHAPTER_COLOR : CLIP_COLOR;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {previousMode === 'search' && (
        <Button
          size="small"
          startIcon={<ArrowBackIcon />}
          onClick={goBack}
          sx={{ textTransform: 'none', justifyContent: 'flex-start', px: 2, py: 1 }}>
          Back to results
        </Button>
      )}

      {hasSiblings && (
        <Tabs
          value={tabIndex}
          onChange={(_, v) => setTabIndex(v)}
          sx={{ px: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Tab label="Source" sx={{ textTransform: 'none', minHeight: 40, py: 0 }} />
          <Tab
            label={`All Sources (${activeCitationSiblings.length})`}
            sx={{ textTransform: 'none', minHeight: 40, py: 0 }}
          />
        </Tabs>
      )}

      {tabIndex === 0 && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2 }}>
          <Box sx={{ borderRadius: 2, overflow: 'hidden', bgcolor: colors.common.black }}>
            <MuxPlayer
              ref={videoRef}
              src={activeCitation.videoUrl}
              audio={activeCitation.isAudioFile}
              startTime={activeCitation.startTime}
              forwardSeekOffset={10}
              backwardSeekOffset={10}
              accentColor={colors.secondary.main}
              style={{ width: '100%', aspectRatio: activeCitation.isAudioFile ? 'auto' : '16/9' }}
            />
          </Box>

          <Box>
            <Typography variant="subtitle2" fontWeight={700}>
              {activeCitation.interviewTitle}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {activeCitation.isChapterSynopsis ? (
                <>Chapter Summary &middot; {activeCitation.sectionTitle} &middot;{' '}
                  {formatTime(activeCitation.startTime)}–{formatTime(activeCitation.endTime)}</>
              ) : (
                <>{activeCitation.speaker} &middot; {activeCitation.sectionTitle} &middot;{' '}
                  {formatTime(activeCitation.startTime)}–{formatTime(activeCitation.endTime)}</>
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
            <Typography
              variant="body2"
              sx={{ fontStyle: 'italic', lineHeight: 1.6, color: colors.text.primary }}>
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
      )}

      {tabIndex === 1 && hasSiblings && (
        <Box>
          <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
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

          {filteredClips.length > 0 && (
            <>
              <Typography
                variant="overline"
                fontWeight={700}
                sx={{
                  px: 2,
                  pt: 1.5,
                  pb: 0.5,
                  display: 'block',
                  color: CLIP_COLOR,
                  letterSpacing: 1,
                }}>
                Clips ({filteredClips.length})
              </Typography>
              {filteredClips.map((citation, idx) => (
                <AllSourcesCard
                  key={`clip-${citation.theirstoryId}-${citation.startTime}-${idx}`}
                  citation={citation}
                  siblings={activeCitationSiblings}
                  onSelect={() => setTabIndex(0)}
                />
              ))}
            </>
          )}

          {filteredChapters.length > 0 && (
            <>
              <Typography
                variant="overline"
                fontWeight={700}
                sx={{
                  px: 2,
                  pt: 2,
                  pb: 0.5,
                  display: 'block',
                  color: CHAPTER_COLOR,
                  letterSpacing: 1,
                }}>
                Chapters ({filteredChapters.length})
              </Typography>
              {filteredChapters.map((citation, idx) => (
                <AllSourcesCard
                  key={`chapter-${citation.theirstoryId}-${citation.startTime}-${idx}`}
                  citation={citation}
                  siblings={activeCitationSiblings}
                  onSelect={() => setTabIndex(0)}
                />
              ))}
            </>
          )}

          {filteredClips.length === 0 && filteredChapters.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ px: 2, py: 3, textAlign: 'center' }}>
              No sources match your filter.
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};
