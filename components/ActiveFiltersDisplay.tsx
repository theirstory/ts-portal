import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Chip, Typography, IconButton } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { getNerColor, getNerDisplayName } from '@/config/organizationConfig';
import { colors } from '@/lib/theme';
import { SearchType } from '@/types/searchType';
import { SchemaTypes } from '@/types/weaviate';
import { PAGINATION_ITEMS_PER_PAGE } from '@/app/constants';
import { returnedFields } from './SearchBox';
import { useThreshold } from '@/app/stores/useThreshold';

export const ActiveFiltersDisplay: React.FC = () => {
  const [canScrollFiltersLeft, setCanScrollFiltersLeft] = useState(false);
  const [canScrollFiltersRight, setCanScrollFiltersRight] = useState(false);
  const filtersScrollRef = useRef<HTMLDivElement | null>(null);

  const {
    nerFilters,
    setNerFilters,
    collections,
    selectedCollectionIds,
    setSelectedCollectionIds,
    hasSearched,
    searchType,
    runHybridSearch,
    runVectorSearch,
    run25bmSearch,
    getAllStories,
    setCurrentPage,
  } = useSemanticSearchStore();
  const { minValue, maxValue } = useThreshold();

  const selectedCollectionMap = new Map(collections.map((collection) => [collection.id, collection.name]));

  const refreshCollectionQueries = () => {
    setCurrentPage(1);

    if (!hasSearched) {
      getAllStories(
        SchemaTypes.Testimonies,
        [
          'interview_title',
          'interview_description',
          'interview_duration',
          'ner_labels',
          'isAudioFile',
          'video_url',
          'collection_id',
          'collection_name',
          'collection_description',
        ],
        PAGINATION_ITEMS_PER_PAGE,
        0,
      );
      return;
    }

    switch (searchType) {
      case SearchType.Hybrid:
        runHybridSearch(SchemaTypes.Chunks, 1000, 0, nerFilters, returnedFields, minValue, maxValue);
        break;
      case SearchType.Vector:
        runVectorSearch(SchemaTypes.Chunks, 1000, 0, nerFilters, returnedFields, minValue, maxValue);
        break;
      case SearchType.bm25:
      default:
        run25bmSearch(SchemaTypes.Chunks, 1000, 0, nerFilters, returnedFields, minValue, maxValue);
        break;
    }
  };

  const handleRemoveFilter = (filterToRemove: string) => {
    const updatedFilters = nerFilters.filter((filter) => filter !== filterToRemove);
    setNerFilters(updatedFilters);
  };

  const handleClearAllFilters = () => {
    setNerFilters([]);
    if (selectedCollectionIds.length > 0) {
      setSelectedCollectionIds([]);
      refreshCollectionQueries();
    }
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
  }, [updateFilterScrollButtons, nerFilters.length, selectedCollectionIds.length]);

  if (nerFilters.length === 0 && selectedCollectionIds.length === 0) {
    return null;
  }

  return (
    <Box
      sx={{
        mb: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
      }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: '100%', minWidth: 0 }}>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            fontWeight: 500,
            minWidth: 'fit-content',
            mr: 0.5,
          }}>
          Active filters:
        </Typography>

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
          {(nerFilters.length + selectedCollectionIds.length) > 0 && (
            <Chip
              label="Clear all"
              size="small"
              variant="outlined"
              onClick={handleClearAllFilters}
              sx={{
                flexShrink: 0,
                borderColor: colors.error.main,
                color: colors.error.main,
                '&:hover': {
                  backgroundColor: colors.error.light,
                },
              }}
            />
          )}

          {nerFilters.map((filter) => (
            <Chip
              key={filter}
              label={getNerDisplayName(filter)}
              size="small"
              onDelete={() => handleRemoveFilter(filter)}
              sx={{
                flexShrink: 0,
                backgroundColor: getNerColor(filter),
                color: colors.text.secondary,
                fontWeight: 500,
                '& .MuiChip-deleteIcon': {
                  color: colors.text.primary,
                  '&:hover': {
                    color: colors.text.secondary,
                  },
                },
              }}
            />
          ))}

          {selectedCollectionIds.map((collectionId) => (
            <Chip
              key={collectionId}
              label={selectedCollectionMap.get(collectionId) ?? collectionId}
              size="small"
              onDelete={() => {
                setSelectedCollectionIds(selectedCollectionIds.filter((selectedId) => selectedId !== collectionId));
                refreshCollectionQueries();
              }}
              sx={{
                flexShrink: 0,
                backgroundColor: colors.primary.light,
                color: colors.primary.contrastText,
                fontWeight: 500,
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
    </Box>
  );
};
