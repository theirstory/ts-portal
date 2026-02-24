'use client';

import { Box, InputBase, IconButton, Paper, Divider, Tooltip, CircularProgress, Chip } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Close';
import SubjectIcon from '@mui/icons-material/Subject';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { ChangeEvent, KeyboardEvent, useState, useEffect, useCallback, useRef } from 'react';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { SearchMatch, useSearchStore } from '@/app/stores/useSearchStore';
import { useThreshold } from '@/app/stores/useThreshold';
import { useTranscriptPanelStore } from '@/app/stores/useTranscriptPanelStore';
import { SchemaTypes } from '@/types/weaviate';
import { SearchType } from '@/types/searchType';
import { NerLabel } from '@/types/ner';
import { SearchTypeSelector } from './StoryTranscriptToolbarSearchTypeSelector';
import { StoryTranscriptToolbarNerToggle } from './StoryTranscriptToolbarNerToggle';
import { StoryTranscriptToolbarFilterMenu } from './StoryTranscriptToolbarFilterMenu';
import { getNerColor, getNerDisplayName } from '@/config/organizationConfig';
import { StorySettings } from './StorySettings';
import usePlayerStore from '@/app/stores/usePlayerStore';
import { colors } from '@/lib/theme';
import { StoryTranscriptToolbarMenuMobile } from './StoryTranscriptToolbarMenuMobile';
import { MatchNavigation } from './StoryTranscriptToolbarMatchNavigation';
import { useTranscriptNavigation } from '@/app/hooks/useTranscriptNavigation';

interface StoryTranscriptToolbarProps {
  isMobile?: boolean;
}

export const StoryTranscriptToolbar = ({ isMobile = false }: StoryTranscriptToolbarProps) => {
  const [inputValue, setInputValue] = useState('');
  const [canScrollFiltersLeft, setCanScrollFiltersLeft] = useState(false);
  const [canScrollFiltersRight, setCanScrollFiltersRight] = useState(false);
  const filtersScrollRef = useRef<HTMLDivElement | null>(null);
  const previousSemanticSearchingRef = useRef(false);

  const runHybridSearchForStoryId = useSemanticSearchStore((state) => state.runHybridSearchForStoryId);
  const runVectorSearchForStoryId = useSemanticSearchStore((state) => state.runVectorSearchForStoryId);
  const run25bmSearchForStoryId = useSemanticSearchStore((state) => state.run25bmSearchForStoryId);
  const setSearchTerm = useSemanticSearchStore((state) => state.setSearchTerm);
  const setIsSemanticSearching = useSemanticSearchStore((state) => state.setIsSemanticSearching);
  const clearSearch = useSemanticSearchStore((state) => state.clearSearch);
  const allWords = useSemanticSearchStore((state) => state.allWords);
  const searchType = useSemanticSearchStore((state) => state.searchType);
  const transcript = useSemanticSearchStore((state) => state.transcript);
  const isSemanticSearching = useSemanticSearchStore((state) => state.isSemanticSearching);
  const semanticMatches = useSemanticSearchStore((state) => state.matches);
  const currentSemanticMatchIndex = useSemanticSearchStore((state) => state.currentMatchIndex);
  const setNerFilters = useSemanticSearchStore((state) => state.setNerFilters);
  const nerFilters = useSemanticSearchStore((state) => state.nerFilters);

  const {
    setSearchTerm: setTraditionalSearchTerm,
    setMatches: setTraditionalMatches,
    setIsSearching: setTraditionalIsSearching,
    runSearch,
    isSearching: isTraditionalSearching,
    clearSearch: clearTraditionalSearch,
  } = useSearchStore();

  const { expandAll, collapseAll, areAllExpanded } = useTranscriptPanelStore();
  const { minValue, maxValue } = useThreshold();
  const { isPlaying, setPlay } = usePlayerStore();
  const { seekAndScroll } = useTranscriptNavigation();

  const runNerSearch = useCallback(
    (selectedLabels: NerLabel[]) => {
      if (!transcript?.sections || !allWords) return;
      if (isPlaying) setPlay(false);

      // 1. Flatten NER
      const nerInstances: any[] = [];
      transcript.sections.forEach((section, sectionIdx) => {
        section.paragraphs?.forEach((paragraph, paraIdx) => {
          paragraph.ner?.forEach((nerItem: any) => {
            nerInstances.push({
              ...nerItem,
              section_idx: sectionIdx,
              para_idx: paraIdx,
            });
          });
        });
      });

      // 2. Filter only selected labels
      const matchingNerInstances = nerInstances.filter((ner) => selectedLabels.includes(ner.label as NerLabel));

      // 4. Map matches
      const nerMatches: SearchMatch[] = [];
      matchingNerInstances.forEach((ner) => {
        const wordsInRange: any[] = [];
        for (let i = 0; i < allWords.length; i++) {
          const w = allWords[i];
          if (w.start >= ner.start_time && w.end <= ner.end_time) {
            wordsInRange.push(w);
          }
        }

        if (wordsInRange.length > 0) {
          const firstWord = wordsInRange[0];
          nerMatches.push({
            text: wordsInRange.map((w) => w.text).join(' '),
            word_idx: firstWord.wordIndex,
            para_idx: firstWord.paragraphIndex,
            section_idx: firstWord.sectionIndex,
            start: ner.start_time,
            end: ner.end_time,
            nerMetadata: {
              start_time: ner.start_time,
              end_time: ner.end_time,
              label: ner.label,
              text: ner.text || wordsInRange.map((w) => w.text).join(' '),
            },
          });
        }
      });

      // 5. Sort & dedupe
      const sorted = nerMatches.sort((a, b) => a.start - b.start);
      const unique = sorted.filter(
        (match, idx, arr) => idx === 0 || Math.abs(match.start - arr[idx - 1].start) > 0.001,
      );

      // 6. Update state
      setIsSemanticSearching(false);
      setTraditionalSearchTerm(selectedLabels.join(' OR '));
      setTraditionalMatches(unique);
      setTraditionalIsSearching(false);

      if (unique.length > 0) {
        const firstMatch = unique[0];
        seekAndScroll(firstMatch.start);
      }
    },
    [
      transcript?.sections,
      allWords,
      setIsSemanticSearching,
      setTraditionalSearchTerm,
      setTraditionalMatches,
      setTraditionalIsSearching,
      seekAndScroll,
      isPlaying,
      setPlay,
    ],
  );

  const runTraditionalSearch = useCallback(
    (term: string) => {
      if (!transcript?.sections || !allWords) return;
      if (isPlaying) setPlay(false);

      setIsSemanticSearching(false);
      setTraditionalSearchTerm(term);
      setTraditionalMatches([]);
      setTraditionalIsSearching(true);
      setTimeout(() => {
        const matches = runSearch(allWords);
        const firstMatch = matches[0];
        if (firstMatch) {
          seekAndScroll(firstMatch.start);
        }
      }, 0);
    },
    [
      allWords,
      runSearch,
      setIsSemanticSearching,
      setTraditionalIsSearching,
      setTraditionalMatches,
      setTraditionalSearchTerm,
      seekAndScroll,
      isPlaying,
      setPlay,
      transcript?.sections,
    ],
  );

  useEffect(() => {
    const wasSemanticSearching = previousSemanticSearchingRef.current;
    if (wasSemanticSearching && !isSemanticSearching) {
      const targetMatch =
        currentSemanticMatchIndex >= 0 ? semanticMatches[currentSemanticMatchIndex] : semanticMatches[0];
      const startTime = targetMatch?.properties?.start_time;

      if (typeof startTime === 'number') {
        seekAndScroll(startTime);
      }
    }

    previousSemanticSearchingRef.current = isSemanticSearching;
  }, [isSemanticSearching, semanticMatches, currentSemanticMatchIndex, seekAndScroll]);

  useEffect(() => {
    const handleNerFilterSearch = (event: CustomEvent) => {
      const { labels } = event.detail;
      setNerFilters(labels);
      runNerSearch(labels);
    };

    window.addEventListener('nerFilterSearch', handleNerFilterSearch as EventListener);
    return () => {
      window.removeEventListener('nerFilterSearch', handleNerFilterSearch as EventListener);
    };
  }, [runNerSearch, setNerFilters]);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') runSemanticSearch();
  };

  const handleClear = () => {
    setInputValue('');
    setNerFilters([]);
    clearSearch();
    clearTraditionalSearch();
  };

  const removeFilter = (filterToRemove: NerLabel) => {
    const updatedFilters = nerFilters.filter((filter) => filter !== filterToRemove);
    setNerFilters(updatedFilters);

    if (updatedFilters.length === 0) {
      clearTraditionalSearch();
    } else {
      runNerSearch(updatedFilters);
    }
  };

  const clearAllFilters = () => {
    setNerFilters([]);
    clearTraditionalSearch();
  };

  const updateFilterScrollButtons = useCallback(() => {
    const element = filtersScrollRef.current;
    if (!element) {
      setCanScrollFiltersLeft(false);
      setCanScrollFiltersRight(false);
      return;
    }

    const maxScrollLeft = element.scrollWidth - element.clientWidth;
    setCanScrollFiltersLeft(element.scrollLeft > 0);
    setCanScrollFiltersRight(maxScrollLeft - element.scrollLeft > 1);
  }, []);

  const scrollFilters = (direction: 'left' | 'right') => {
    const element = filtersScrollRef.current;
    if (!element) return;

    element.scrollBy({
      left: direction === 'left' ? -220 : 220,
      behavior: 'smooth',
    });
  };

  const runSemanticSearch = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    if (isPlaying) setPlay(false);

    // Avoid traditional highlights overriding semantic (blue) match highlighting.
    clearTraditionalSearch();

    setSearchTerm(trimmed);
    setIsSemanticSearching(true);

    // Pass selected NER labels as filters to the search
    const selectedNerFilters = nerFilters.length > 0 ? nerFilters : undefined;
    const searchProps = [SchemaTypes.Chunks, 1000, selectedNerFilters, minValue, maxValue] as const;

    switch (searchType) {
      case SearchType.Hybrid:
        runHybridSearchForStoryId(...searchProps);
        break;
      case SearchType.Vector:
        runVectorSearchForStoryId(...searchProps);
        break;
      case SearchType.bm25:
        run25bmSearchForStoryId(...searchProps);
        break;
      default:
        runTraditionalSearch(trimmed);
    }
  };

  const toggleAllSections = () => {
    if (areAllExpanded()) {
      collapseAll();
    } else {
      expandAll();
    }
  };

  useEffect(() => {
    const element = filtersScrollRef.current;
    if (!element) return;

    updateFilterScrollButtons();

    const onScroll = () => updateFilterScrollButtons();
    element.addEventListener('scroll', onScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => updateFilterScrollButtons());
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener('scroll', onScroll);
      resizeObserver.disconnect();
    };
  }, [updateFilterScrollButtons, nerFilters.length]);

  return (
    <Box display="flex" flexDirection="column" gap={1}>
      {/* Main toolbar row */}
      <Box display="flex" alignItems="center" gap={1} flexWrap="nowrap" width="100%">
        <Paper
          sx={{
            p: '2px 8px',
            display: 'flex',
            alignItems: 'center',
            flex: 1,
            minWidth: 0,
            border: `1px solid ${colors.grey[400]}`,
            borderRadius: '8px',
            gap: 0.5,
          }}>
          <IconButton size="small" onClick={runSemanticSearch} disabled={!inputValue.trim()}>
            <SearchIcon fontSize="small" />
          </IconButton>

          <InputBase
            placeholder="Search"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            sx={{
              flex: 1,
              minWidth: 0,
              fontSize: isMobile ? '0.875rem' : '1rem',
            }}
            inputProps={{ 'aria-label': 'search' }}
          />

          {isSemanticSearching || isTraditionalSearching ? (
            <CircularProgress size={16} />
          ) : inputValue ? (
            <IconButton size="small" onClick={handleClear}>
              <ClearIcon sx={{ fontSize: 18 }} />
            </IconButton>
          ) : null}

          {isMobile ? (
            <Box display="flex" alignItems="center" gap={0.25} flexShrink={0}>
              <MatchNavigation compact />
              <StoryTranscriptToolbarMenuMobile toggleAllSections={toggleAllSections} />
            </Box>
          ) : (
            <>
              <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
              <SearchTypeSelector />
              <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
              <StoryTranscriptToolbarFilterMenu />
            </>
          )}
        </Paper>

        {!isMobile && (
          <Box display="flex" alignItems="center" gap={0.5} flexShrink={0}>
            <MatchNavigation />

            <Tooltip title="Toggle NER Labels">
              <StoryTranscriptToolbarNerToggle />
            </Tooltip>
            <Tooltip title="Toggle Section View">
              <IconButton onClick={toggleAllSections}>
                <SubjectIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <StorySettings />
          </Box>
        )}
      </Box>

      {/* Active filters row */}
      {nerFilters?.length > 0 && (
        <Box display="flex" alignItems="center" gap={0.5} width="100%" minWidth={0}>
          <Box fontSize="12px" color="text.secondary" sx={{ mr: 1 }}>
            Filtering by:
          </Box>
          {canScrollFiltersLeft && (
            <IconButton
              size="small"
              onClick={() => scrollFilters('left')}
              disabled={!canScrollFiltersLeft}
              sx={{ p: 0.25 }}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
          )}
          <Box
            ref={filtersScrollRef}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'nowrap',
              overflowX: 'auto',
              overflowY: 'hidden',
              flex: 1,
              minWidth: 0,
              scrollbarWidth: 'none',
              '&::-webkit-scrollbar': {
                display: 'none',
              },
            }}>
            <Chip
              label="Clear all"
              size="small"
              onClick={clearAllFilters}
              variant="outlined"
              sx={{
                borderColor: colors.error.main,
                color: colors.error.main,
                '&:hover': {
                  backgroundColor: colors.error.light,
                },
              }}
            />
            {nerFilters?.map((filter) => (
              <Chip
                key={filter}
                label={getNerDisplayName(filter)}
                size="small"
                onDelete={() => removeFilter(filter)}
                sx={{
                  flexShrink: 0,
                  backgroundColor: getNerColor(filter),
                  color: colors.text.primary,
                  fontSize: '11px',
                  height: '24px',
                  '& .MuiChip-deleteIcon': {
                    color: colors.text.primary,
                    fontSize: '16px',
                  },
                }}
              />
            ))}
          </Box>
          {canScrollFiltersRight && (
            <IconButton
              size="small"
              onClick={() => scrollFilters('right')}
              disabled={!canScrollFiltersRight}
              sx={{ p: 0.25 }}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      )}
    </Box>
  );
};
