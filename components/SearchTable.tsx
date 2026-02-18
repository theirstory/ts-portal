import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { colors } from '@/lib/theme';
import { Chunks } from '@/types/weaviate';
import { Box, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import React from 'react';
import { WeaviateReturn } from 'weaviate-client';
import { PaginationSearch } from './PaginationSearch';
import { SearchTableRow } from './SearchTableRow';

export const SearchTable = () => {
  const { result } = useSemanticSearchStore();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const results = result as WeaviateReturn<Chunks> | null;
  const resultsArray = results?.objects || [];

  if (isMobile) {
    // Mobile Card Layout
    return (
      <Box id="search-table-mobile">
        <Box
          sx={{
            height: 'calc(100vh - 240px)',
            minHeight: '300px',
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
