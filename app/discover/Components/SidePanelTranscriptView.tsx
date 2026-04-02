'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  Box,
  Button,
  IconButton,
  Tooltip,
  Typography,
  CircularProgress,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import MuxPlayer from '@mux/mux-player-react';
import MuxPlayerElement from '@mux/mux-player';
import { useChatStore } from '@/app/stores/useChatStore';
import { useChatInteraction } from '@/app/discover/ChatInteractionContext';
import { colors } from '@/lib/theme';
import { muxPlayerThemeProps } from '@/lib/theme/muxPlayerTheme';
import { TextSelectionPopover } from './TextSelectionPopover';
import { TranscriptSection } from './transcript/TranscriptSection';
import { TranscriptSearchBar } from './transcript/TranscriptSearchBar';
import { SearchMode, ThematicMatch, TranscriptData } from './transcript/transcriptTypes';

/** Merge overlapping / near-adjacent thematic matches so researchers see distinct passages. */
function mergeThematicMatches(matches: ThematicMatch[], gapSeconds = 2): ThematicMatch[] {
  if (matches.length === 0) return [];
  const sorted = [...matches].sort((a, b) => a.startTime - b.startTime);
  const merged: ThematicMatch[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const cur = sorted[i];
    // Overlap or close enough to merge
    if (cur.startTime <= prev.endTime + gapSeconds) {
      prev.endTime = Math.max(prev.endTime, cur.endTime);
      // Keep the higher-scoring transcription text
      if (cur.score > prev.score) {
        prev.transcription = cur.transcription;
        prev.speaker = cur.speaker;
        prev.sectionTitle = cur.sectionTitle;
        prev.score = cur.score;
      }
    } else {
      merged.push({ ...cur });
    }
  }
  return merged;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const SidePanelTranscriptView = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const transcriptCitation = useChatStore((s) => s.transcriptCitation);
  const previousMode = useChatStore((s) => s.previousMode);
  const storeGoBack = useChatStore((s) => s.goBack);
  const { onGoBack } = useChatInteraction();
  const goBack = onGoBack ?? storeGoBack;

  const [data, setData] = useState<TranscriptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode | null>(null);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [thematicResults, setThematicResults] = useState<ThematicMatch[]>([]);
  const [thematicLoading, setThematicLoading] = useState(false);
  const [thematicSearched, setThematicSearched] = useState(false);
  const [activeThematicIndex, setActiveThematicIndex] = useState(0);
  const videoRef = useRef<MuxPlayerElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  const storyId = transcriptCitation?.theirstoryId;
  const highlightStart = transcriptCitation?.startTime ?? 0;
  const highlightEnd = transcriptCitation?.endTime ?? 0;

  // Fetch transcript data
  useEffect(() => {
    if (!storyId) return;
    setLoading(true);
    setError(null);
    hasScrolledRef.current = false;

    fetch(`/api/transcript?storyId=${encodeURIComponent(storyId)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch transcript');
        return res.json();
      })
      .then((d: TranscriptData) => {
        setData(d);
        const allSections = new Set<number>(d.transcription.sections.map((_, i) => i));
        setExpandedSections(allSections);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [storyId, highlightStart]);

  // Scroll to the active word after data loads
  useEffect(() => {
    if (!data || hasScrolledRef.current) return;
    hasScrolledRef.current = true;

    let attempts = 0;
    const tryScroll = () => {
      const container = transcriptContainerRef.current;
      if (!container) return;

      const words = container.querySelectorAll('[data-start]');
      let closest: Element | null = null;
      let closestDist = Infinity;

      for (const el of words) {
        const start = parseFloat(el.getAttribute('data-start') || '0');
        const dist = Math.abs(start - highlightStart);
        if (dist < closestDist) {
          closestDist = dist;
          closest = el;
        }
        if (start > highlightStart + 1) break;
      }

      if (closest) {
        closest.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (attempts < 5) {
        attempts++;
        setTimeout(tryScroll, 200);
      }
    };

    setTimeout(tryScroll, 300);
  }, [data, highlightStart]);

  const handleTimeUpdate = useCallback(() => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  }, []);

  const handleWordClick = useCallback((time: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      videoRef.current.play();
    }
  }, []);

  const toggleSection = useCallback((index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  // --- Text search matches ---
  const textSearchMatches = useMemo(() => {
    if (searchMode !== 'text') return [];
    const q = searchTerm.trim().toLowerCase();
    if (!q || !data) return [];
    const matches: string[] = [];
    data.transcription.sections.forEach((section, sIdx) => {
      section.paragraphs.forEach((para, pIdx) => {
        para.words.forEach((word, wIdx) => {
          if (word.text.toLowerCase().includes(q)) {
            matches.push(`${sIdx}-${pIdx}-${wIdx}`);
          }
        });
      });
    });
    return matches;
  }, [searchTerm, data, searchMode]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [searchTerm, searchMode]);

  const textMatchCount = textSearchMatches.length;
  const activeTextMatchKey = textSearchMatches[activeMatchIndex] ?? null;

  // Scroll to active text match
  useEffect(() => {
    if (searchMode !== 'text' || !activeTextMatchKey || !transcriptContainerRef.current) return;
    const sectionIdx = parseInt(activeTextMatchKey.split('-')[0], 10);
    setExpandedSections((prev) => {
      if (prev.has(sectionIdx)) return prev;
      const next = new Set(prev);
      next.add(sectionIdx);
      return next;
    });
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = transcriptContainerRef.current?.querySelector(`[data-match-key="${activeTextMatchKey}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    });
  }, [activeTextMatchKey, searchMode]);

  // --- Thematic search ---
  const runThematicSearch = useCallback(async () => {
    const q = searchTerm.trim();
    if (!q || !storyId) return;
    setThematicLoading(true);
    setThematicResults([]);
    setActiveThematicIndex(0);
    try {
      const res = await fetch('/api/transcript/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId, query: q }),
      });
      if (!res.ok) throw new Error('Search failed');
      const data = (await res.json()) as { matches: ThematicMatch[] };
      setThematicResults(mergeThematicMatches(data.matches));
    } catch (err) {
      console.error('Thematic search error:', err);
    } finally {
      setThematicLoading(false);
      setThematicSearched(true);
    }
  }, [searchTerm, storyId]);

  // Scroll to active thematic match
  useEffect(() => {
    if (searchMode !== 'thematic' || thematicResults.length === 0 || !transcriptContainerRef.current) return;
    const matchKey = `t-${activeThematicIndex}`;
    // Expand the section containing the thematic match
    const range = thematicResults[activeThematicIndex];
    if (range && data) {
      const sIdx = data.transcription.sections.findIndex((s) => range.startTime >= s.start && range.startTime < s.end);
      if (sIdx >= 0) {
        setExpandedSections((prev) => {
          if (prev.has(sIdx)) return prev;
          const next = new Set(prev);
          next.add(sIdx);
          return next;
        });
      }
    }
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = transcriptContainerRef.current?.querySelector(`[data-match-key="${matchKey}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          // Fallback: find the closest word by time
          if (range) {
            const words = transcriptContainerRef.current?.querySelectorAll('[data-start]');
            if (words) {
              for (const w of words) {
                const start = parseFloat(w.getAttribute('data-start') || '0');
                if (start >= range.startTime) {
                  w.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  break;
                }
              }
            }
          }
        }
      }, 100);
    });
  }, [activeThematicIndex, thematicResults, searchMode, data]);

  // Handle mode switches
  useEffect(() => {
    if (searchMode === 'text') {
      setThematicResults([]);
      setActiveThematicIndex(0);
    } else if (searchMode === 'thematic' && searchTerm.trim()) {
      runThematicSearch();
    }
  }, [searchMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Unified navigation ---
  const isThematic = searchMode === 'thematic';
  const totalMatches = isThematic ? thematicResults.length : textMatchCount;
  const currentMatchIndex = isThematic ? activeThematicIndex : activeMatchIndex;

  const goToNextMatch = useCallback(() => {
    if (isThematic) {
      if (thematicResults.length === 0) return;
      setActiveThematicIndex((prev) => (prev + 1) % thematicResults.length);
    } else {
      if (textMatchCount === 0) return;
      setActiveMatchIndex((prev) => (prev + 1) % textMatchCount);
    }
  }, [isThematic, thematicResults.length, textMatchCount]);

  const goToPrevMatch = useCallback(() => {
    if (isThematic) {
      if (thematicResults.length === 0) return;
      setActiveThematicIndex((prev) => (prev - 1 + thematicResults.length) % thematicResults.length);
    } else {
      if (textMatchCount === 0) return;
      setActiveMatchIndex((prev) => (prev - 1 + textMatchCount) % textMatchCount);
    }
  }, [isThematic, thematicResults.length, textMatchCount]);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
    setSearchMode(null);
    setPickerOpen(true);
    setThematicResults([]);
    setActiveThematicIndex(0);
    setThematicSearched(false);
    setActiveMatchIndex(0);
  }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && searchMode !== null) {
      e.preventDefault();
      if (isThematic) {
        if (thematicResults.length > 0) {
          // Navigate if results exist
          if (e.shiftKey) goToPrevMatch();
          else goToNextMatch();
        } else {
          // Run search
          runThematicSearch();
        }
      } else {
        if (e.shiftKey) goToPrevMatch();
        else goToNextMatch();
      }
    }
  };

  if (!transcriptCitation) return null;

  const backLabel = previousMode === 'search' ? 'Back to results' : 'Back to source';
  const hasResults = totalMatches > 0;
  const showMatchNavigation = !!searchTerm.trim() && hasResults;
  const placeholder =
    searchMode === null
      ? 'Select a search type...'
      : isThematic
        ? 'Search by concept (press Enter)...'
        : 'Search transcript...';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          bgcolor: isMobile ? colors.background.paper : colors.grey[100],
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid',
          borderColor: isMobile ? 'divider' : colors.grey[300],
          px: 1,
          py: 0.5,
        }}>
        <Button size="small" startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ textTransform: 'none' }}>
          {backLabel}
        </Button>
        {storyId && (
          <Tooltip title="Open in new tab">
            <IconButton
              size="small"
              onClick={() => window.open(`/story/${storyId}?start=${highlightStart}`, '_blank')}
              sx={{ ml: 'auto' }}>
              <OpenInNewIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      )}

      {error && (
        <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
          <Typography variant="body2" color="error">
            {error}
          </Typography>
        </Box>
      )}

      {data && (
        <>
          {/* Video player — compact */}
          <Box sx={{ flexShrink: 0, bgcolor: colors.common.black }}>
            <MuxPlayer
              ref={videoRef}
              src={data.videoUrl}
              audio={data.isAudioFile}
              startTime={highlightStart}
              forwardSeekOffset={10}
              backwardSeekOffset={10}
              accentColor={muxPlayerThemeProps.accentColor}
              onTimeUpdate={handleTimeUpdate}
              style={{ ...muxPlayerThemeProps.style, aspectRatio: data.isAudioFile ? 'auto' : '21/9' }}
            />
          </Box>

          <TranscriptSearchBar
            placeholder={placeholder}
            searchTerm={searchTerm}
            searchMode={searchMode}
            pickerOpen={pickerOpen}
            thematicLoading={thematicLoading}
            hasResults={hasResults}
            isThematic={isThematic}
            thematicSearched={thematicSearched}
            totalMatches={totalMatches}
            currentMatchIndex={currentMatchIndex}
            showMatchNavigation={showMatchNavigation}
            onSearchTermChange={(value) => {
              setSearchTerm(value);
              if (searchMode === null) {
                setSearchMode('text');
                setPickerOpen(false);
              }
              if (isThematic) {
                setThematicResults([]);
                setActiveThematicIndex(0);
                setThematicSearched(false);
              }
            }}
            onSearchModeChange={setSearchMode}
            onPickerOpenChange={setPickerOpen}
            onSearchKeyDown={handleSearchKeyDown}
            onClearSearch={clearSearch}
            onPrevMatch={goToPrevMatch}
            onNextMatch={goToNextMatch}
          />

          {/* Thematic results summary */}
          {isThematic && thematicResults.length > 0 && (
            <Box
              sx={{
                px: 1.5,
                py: 0.75,
                bgcolor: `${colors.success.main}10`,
                borderBottom: '1px solid',
                borderColor: 'divider',
                flexShrink: 0,
              }}>
              <Typography variant="caption" color="text.secondary">
                {thematicResults.length} thematic match{thematicResults.length !== 1 ? 'es' : ''} —{' '}
                {thematicResults[activeThematicIndex]?.speaker && `${thematicResults[activeThematicIndex].speaker} · `}
                {thematicResults[activeThematicIndex]?.sectionTitle} ·{' '}
                {formatTimestamp(thematicResults[activeThematicIndex]?.startTime ?? 0)}
              </Typography>
            </Box>
          )}

          {/* Transcript */}
          <Box ref={transcriptContainerRef} sx={{ flex: 1, overflow: 'auto', minHeight: 0, position: 'relative' }}>
            <TextSelectionPopover containerRef={transcriptContainerRef} />
            {data.transcription.sections.map((section, idx) => (
              <TranscriptSection
                key={idx}
                section={section}
                sectionIndex={idx}
                currentTime={currentTime}
                highlightStart={highlightStart}
                highlightEnd={highlightEnd}
                searchTerm={searchTerm}
                searchMode={searchMode}
                thematicRanges={thematicResults}
                activeThematicIndex={activeThematicIndex}
                activeMatchKey={searchMode === 'text' ? activeTextMatchKey : `t-${activeThematicIndex}`}
                isExpanded={expandedSections.has(idx)}
                onToggle={() => toggleSection(idx)}
                onWordClick={handleWordClick}
              />
            ))}
          </Box>
        </>
      )}
    </Box>
  );
};
