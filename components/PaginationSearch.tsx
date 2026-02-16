'use client';

import React from 'react';
import { Box, Pagination as MuiPagination } from '@mui/material';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { SchemaTypes } from '@/types/weaviate';
import { PAGINATION_ITEMS_PER_PAGE } from '@/app/constants';
import { SearchType } from '@/types/searchType';
import { returnedFields } from './SearchBox';
import { useThreshold } from '@/app/stores/useThreshold';

export const PaginationSearch = () => {
  const {
    currentPage,
    result,
    setCurrentPage,
    runVectorSearch,
    searchType,
    run25bmSearch,
    runHybridSearch,
    nerFilters,
  } = useSemanticSearchStore();
  const { minValue, maxValue } = useThreshold();

  const currentResults = result?.objects || [];

  const hasMoreResults = currentResults.length === PAGINATION_ITEMS_PER_PAGE;
  const totalPages = hasMoreResults ? currentPage + 1 : currentPage;

  const runSemanticSearch = (page: number) => {
    switch (searchType) {
      case SearchType.Hybrid:
        runHybridSearch(
          SchemaTypes.Chunks,
          PAGINATION_ITEMS_PER_PAGE,
          (page - 1) * PAGINATION_ITEMS_PER_PAGE,
          nerFilters,
          returnedFields,
          minValue,
          maxValue,
        );
        break;
      case SearchType.Vector:
        runVectorSearch(
          SchemaTypes.Chunks,
          PAGINATION_ITEMS_PER_PAGE,
          (page - 1) * PAGINATION_ITEMS_PER_PAGE,
          nerFilters,
          returnedFields,
          minValue,
          maxValue,
        );
        break;
      case SearchType.bm25:
        run25bmSearch(
          SchemaTypes.Chunks,
          PAGINATION_ITEMS_PER_PAGE,
          (page - 1) * PAGINATION_ITEMS_PER_PAGE,
          nerFilters,
          returnedFields,
          minValue,
          maxValue,
        );
        break;
    }
  };

  const handlePageChange = (_: React.ChangeEvent<unknown>, page: number) => {
    if (page === currentPage) return;

    setCurrentPage(page);
    runSemanticSearch(page);
  };

  if (totalPages <= 1) return null;

  return (
    <Box display="flex" justifyContent="center" alignItems="center" mt={2} mb={4}>
      <MuiPagination
        count={totalPages}
        page={currentPage}
        onChange={handlePageChange}
        color="primary"
        shape="rounded"
        siblingCount={1}
        boundaryCount={1}
      />
    </Box>
  );
};
