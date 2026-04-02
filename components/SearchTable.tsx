import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import useLayoutState from '@/app/stores/useLayout';
import { colors } from '@/lib/theme';
import { Chunks } from '@/types/weaviate';
import { Box, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import React, { useCallback } from 'react';
import { WeaviateReturn } from 'weaviate-client';
import { PaginationSearch } from './PaginationSearch';
import { SearchTableRow } from './SearchTableRow';

export const SearchTable = () => {
  const { result, hasSearched } = useSemanticSearchStore();
  const { setTopBarCollapsedAuto } = useLayoutState();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const results = result as WeaviateReturn<Chunks, any> | null;
  const resultsArray = results?.objects || [];

  const handleResultsScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (hasSearched) {
        setTopBarCollapsedAuto(true);
        return;
      }

      setTopBarCollapsedAuto(event.currentTarget.scrollTop > 8);
    },
    [hasSearched, setTopBarCollapsedAuto],
  );

  if (isMobile) {
    // Mobile Card Layout
    return (
      <Box
        id="search-table-mobile"
        sx={{
          mt: 1,
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}>
        <Box
          onScroll={handleResultsScroll}
          sx={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            pb: 2,
          }}>
          {resultsArray.map((result, index) => (
            <SearchTableRow key={`mobile-${result.uuid}-${index}`} result={result} index={index} isMobile={true} />
          ))}
        </Box>
        <PaginationSearch />
      </Box>
    );
  }

  // --- Desktop: Grid List ---
  return (
    <Box
      sx={{
        mt: 2,
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
      id="search-list-desktop">
      {/* Header */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: '120px 200px 200px 1fr 150px',
          alignItems: 'start',
          gap: 2,
          p: 2.5,
          bgcolor: colors.grey[100],
          borderRadius: 1,
          fontWeight: 600,
          fontSize: '0.875rem',
          color: colors.text.primary,
        }}>
        <Box>Thumbnail</Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Recording</Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>Section</Box>
        <Box>Excerpt</Box>
        <Box>Speaker</Box>
      </Box>

      {/* Body scrollable */}
      <Box
        onScroll={handleResultsScroll}
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 1,
          marginTop: 1,
          paddingBottom: 2,
          '&::-webkit-scrollbar': { width: '6px' },
          '&::-webkit-scrollbar-track': {
            backgroundColor: colors.grey[100],
            borderRadius: '3px',
          },
          '&::-webkit-scrollbar-thumb': {
            backgroundColor: colors.grey[400],
            borderRadius: '3px',
            '&:hover': { backgroundColor: colors.grey[500] },
          },
        }}>
        {resultsArray.map((res, index) => (
          <SearchTableRow key={`list-${res.uuid}-${index}`} result={res} index={index} />
        ))}
      </Box>

      <Box sx={{ mt: 'auto' }}>
        <PaginationSearch />
      </Box>
    </Box>
  );
};
