import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { colors } from '@/lib/theme';
import { SchemaMap, SchemaTypes } from '@/types/weaviate';
import {
  Box,
  Button,
  Divider,
  IconButton,
  InputAdornment,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';
import ViewListIcon from '@mui/icons-material/ViewList';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import React, { useState } from 'react';
import { SearchType } from '@/types/searchType';
import { SearchTypeSelector } from './SearchTypeSelector';
import { StorySettings } from '@/app/story/[storyUuid]/Components/StorySettings';
import { QueryProperty } from 'weaviate-client';
import { useThreshold } from '@/app/stores/useThreshold';
import { NerFilters } from './NerFilters';
import useLayoutState from '@/app/stores/useLayout';
import { CollectionsDropdown } from './CollectionsDropdown';

export const returnedFields: QueryProperty<SchemaMap[SchemaTypes]>[] | undefined = [
  'interview_title',
  'interview_duration',
  'start_time',
  'end_time',
  'speaker',
  'transcription',
  'theirstory_id',
  'ner_labels',
  'ner_text',
  'section_title',
  'video_url',
  'isAudioFile',
];

export const SearchBox = ({
  viewMode,
  onViewChange,
}: {
  viewMode: 'list' | 'grid';
  onViewChange: (event: React.MouseEvent<HTMLElement>, newView: 'list' | 'grid') => void;
}) => {
  const [inputValue, setInputValue] = useState<string>('');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const {
    searchTerm,
    setSearchTerm,
    runVectorSearch,
    clearSearch,
    runHybridSearch,
    run25bmSearch,
    searchType,
    setCurrentPage,
    nerFilters,
    setHasSearched,
    hasSearched,
    stories,
    collections,
  } = useSemanticSearchStore();
  const { minValue, maxValue } = useThreshold();
  const { isTopBarCollapsed, setTopBarCollapsed } = useLayoutState();
  const hasMultipleCollections = collections.length > 1;
  const mobilePrimaryFlex = hasMultipleCollections ? 5.5 : 7.5;
  const mobileSecondaryFlex = hasMultipleCollections ? 1.5 : 1.25;

  const runSemanticSearch = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;

    setCurrentPage(1);
    clearSearch();
    setTopBarCollapsed(true);
    setSearchTerm(inputValue);
    setHasSearched(true);

    switch (searchType) {
      case SearchType.Hybrid:
        runHybridSearch(SchemaTypes.Chunks, 1000, 0, nerFilters, returnedFields, minValue, maxValue);
        break;
      case SearchType.Vector:
        runVectorSearch(SchemaTypes.Chunks, 1000, 0, nerFilters, returnedFields, minValue, maxValue);
        break;
      case SearchType.bm25:
        run25bmSearch(SchemaTypes.Chunks, 1000, 0, nerFilters, returnedFields, minValue, maxValue);
        break;
    }
  };

  const handleClearSearch = () => {
    setHasSearched(false);
    setTopBarCollapsed(false);
    setSearchTerm('');
    setInputValue('');
    clearSearch();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      setSearchTerm(inputValue);
      setHasSearched(true);
      setTopBarCollapsed(true);
      runSemanticSearch();
    }
  };

  const handleSearchChange = (value: string) => {
    setInputValue(value);
  };

  if (!stories?.objects.length) {
    return null;
  }

  return (
    <>
      {/* Mobile Layout */}
      {isMobile ? (
        <Box sx={{ mb: 1 }}>
          {/* Search Input - Full Width */}
          <TextField
            fullWidth
            placeholder="Search..."
            size="medium"
            variant="outlined"
            value={inputValue}
            autoComplete="off"
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            sx={{
              mb: 1,
              '& .MuiOutlinedInput-root': {
                fontSize: '16px',
              },
            }}
            InputProps={{
              style: {
                backgroundColor: colors.background.default,
              },
              endAdornment: (
                <InputAdornment position="end">
                  {searchTerm && (
                    <IconButton
                      aria-label="clear search"
                      onClick={handleClearSearch}
                      edge="end"
                      size="small"
                      sx={{ minWidth: 44, minHeight: 44 }}>
                      <ClearIcon />
                    </IconButton>
                  )}
                  <IconButton
                    aria-label="search"
                    onClick={runSemanticSearch}
                    edge="end"
                    sx={{ minWidth: 44, minHeight: 44 }}>
                    <SearchIcon />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          {/* Controls - In One Row */}
          <Box
            sx={{
              backgroundColor: colors.background.default,
              borderRadius: 2,
              border: `1px solid ${colors.common.border}`,
              p: 0.5,
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 0.25,
              '& .MuiIconButton-root': {
                p: 0.5,
              },
            }}>
            <Box sx={{ flex: mobilePrimaryFlex, minWidth: 0, display: 'flex', justifyContent: 'flex-start' }}>
              <SearchTypeSelector compact />
            </Box>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
            <Box sx={{ flex: mobileSecondaryFlex, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
              <NerFilters />
            </Box>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
            <Box sx={{ flex: mobileSecondaryFlex, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
              <StorySettings />
            </Box>
            {hasMultipleCollections && (
              <>
                <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
                <Box sx={{ flex: mobileSecondaryFlex, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
                  <CollectionsDropdown compact />
                </Box>
              </>
            )}
          </Box>
        </Box>
      ) : (
        /* Desktop Layout */
        <Box display="flex" flexDirection="column" gap={1}>
          {hasSearched && (
            <Box display="flex" gap={2} alignItems="center">
              <Typography color={colors.text.primary} fontWeight={500} fontSize="18px">
                Search Results for "{searchTerm}"
              </Typography>
              <Button
                variant="text"
                onClick={handleClearSearch}
                sx={{
                  textTransform: 'none',
                  color: colors.text.secondary,
                  fontSize: '14px',
                  fontWeight: 600,
                }}>
                Clear Search
              </Button>
            </Box>
          )}
          <Box sx={{ mb: 1 }} display="flex" justifyContent="space-between">
            <Box display="flex" gap={1}>
              <TextField
                fullWidth
                placeholder="Search..."
                size="small"
                variant="outlined"
                value={inputValue}
                autoComplete="off"
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={handleKeyDown}
                sx={{
                  bgcolor: colors.background.default,
                  width: hasMultipleCollections ? { md: '380px', lg: '440px' } : { md: '460px', lg: '560px' },
                  borderRadius: '8px',
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      {searchTerm && (
                        <IconButton aria-label="clear search" onClick={handleClearSearch} edge="end" size="small">
                          <ClearIcon />
                        </IconButton>
                      )}
                      <IconButton aria-label="search" onClick={runSemanticSearch} edge="end">
                        <SearchIcon />
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              <Box
                sx={{
                  backgroundColor: colors.background.default,
                  borderRadius: 1,
                  border: `1px solid ${colors.common.border}`,
                  paddingRight: 1,
                }}
                display="flex"
                justifyContent="space-between"
                alignItems="center">
                <SearchTypeSelector />
                <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                <NerFilters />
                <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                <StorySettings />
                {hasMultipleCollections && (
                  <>
                    <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                    <CollectionsDropdown />
                  </>
                )}
              </Box>
            </Box>
            {!isTopBarCollapsed && (
              <ToggleButtonGroup value={viewMode} exclusive onChange={onViewChange} aria-label="view mode" size="small">
                <ToggleButton value="list" aria-label="list view">
                  <ViewListIcon />
                </ToggleButton>
                <ToggleButton value="grid" aria-label="grid view">
                  <ViewModuleIcon />
                </ToggleButton>
              </ToggleButtonGroup>
            )}
          </Box>
        </Box>
      )}
    </>
  );
};
