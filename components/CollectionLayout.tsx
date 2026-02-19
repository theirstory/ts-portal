'use client';

import React, { useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { CircularProgress } from '@mui/material';
import { WeaviateReturn } from 'weaviate-client';
import { Testimonies } from '@/types/weaviate';
import { ListView } from './ListView';
import { GridView } from './GridView';
import { SearchTable } from './SearchTable';
import { SearchBox } from './SearchBox';
import { ActiveFiltersDisplay } from './ActiveFiltersDisplay';
import { Pagination } from './Pagination';
import { NoInterviewsMessage } from './NoInterviewsMessage';
import { colors } from '@/lib/theme';

export default function CollectionLayout() {
  const { loading: semanticSearchLoading, stories, result, currentPage, hasSearched } = useSemanticSearchStore();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const storiesTestimonies = stories as WeaviateReturn<Testimonies> | null;
  const results = result?.objects || [];

  const handleViewChange = (_event: React.MouseEvent<HTMLElement>, newView: 'list' | 'grid') => {
    if (newView !== null) {
      setViewMode(newView);
    }
  };

  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
      }}
      id="collection-layout-container">
      {/* Main Layout */}
      <Box
        sx={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          maxWidth: '1600px',
          mx: 'auto',
          paddingX: { xs: 2, sm: 3, md: 4 },
          paddingTop: { xs: 1, md: 2 },
          paddingBottom: { xs: 2, md: 3 },
          width: '100%',
        }}>
        {/* Main Content */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
          id="main-content-box">
          <SearchBox viewMode={viewMode} onViewChange={handleViewChange} />

          {/* Active Filters Display */}
          <ActiveFiltersDisplay />

          {/* Loading State */}
          {semanticSearchLoading && (
            <Box display="flex" height="100%" justifyContent="center" alignItems="center" sx={{ py: { xs: 4, md: 8 } }}>
              <CircularProgress size={'50px'} />
            </Box>
          )}

          {/* Semantic Search Results */}
          {!semanticSearchLoading && hasSearched && results.length > 0 && <SearchTable />}

          {/* Show List/Grid View By Default (No Search) */}
          {!semanticSearchLoading &&
            !hasSearched &&
            storiesTestimonies?.objects &&
            storiesTestimonies?.objects.length > 0 && (
              <>
                <Box
                  sx={{
                    flex: { xs: 'unset', md: 1 },
                    minHeight: { xs: 'calc(100vh - 475px)', md: 0 },
                    overflow: 'auto',
                    pr: { xs: 0, md: 1 },
                    pb: { xs: 1, md: 2 },
                    '&::-webkit-scrollbar': {
                      width: '6px',
                    },
                    '&::-webkit-scrollbar-track': {
                      backgroundColor: colors.grey[100],
                      borderRadius: '3px',
                    },
                    '&::-webkit-scrollbar-thumb': {
                      backgroundColor: colors.grey[400],
                      borderRadius: '3px',
                      '&:hover': {
                        backgroundColor: colors.grey[500],
                      },
                    },
                  }}>
                  {viewMode === 'list' ? <ListView /> : <GridView />}
                </Box>
                <Box sx={{ mt: { xs: 1, md: 'auto' } }}>
                  <Pagination />
                </Box>
              </>
            )}

          {/* No Results Message */}
          {!semanticSearchLoading && hasSearched && results.length === 0 && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-around',
                height: '100%',
                px: { xs: 2, md: 0 },
                py: { xs: 4, md: 8 },
              }}>
              <Typography
                variant="h6"
                color="text.secondary"
                sx={{
                  mb: 2,
                  fontSize: { xs: '1rem', md: '1.25rem' },
                  textAlign: 'center',
                }}>
                {currentPage > 1 ? 'There are no more stories available.' : 'No stories available.'}
              </Typography>
            </Box>
          )}

          {/* No Interviews Loaded Message */}
          {!semanticSearchLoading &&
            !hasSearched &&
            storiesTestimonies?.objects &&
            storiesTestimonies.objects.length === 0 &&
            (currentPage > 1 ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  height: '100%',
                  px: { xs: 2, md: 0 },
                  py: { xs: 4, md: 8 },
                }}>
                <Typography
                  variant="h6"
                  color="text.secondary"
                  sx={{
                    mb: 2,
                    fontSize: { xs: '1rem', md: '1.25rem' },
                    textAlign: 'center',
                  }}>
                  There are no more stories available.
                </Typography>
              </Box>
            ) : (
              <NoInterviewsMessage />
            ))}
        </Box>
      </Box>
    </Box>
  );
}
