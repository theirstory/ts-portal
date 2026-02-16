'use client';

import React from 'react';
import { Box, Pagination as MuiPagination } from '@mui/material';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { SchemaTypes } from '@/types/weaviate';
import { PAGINATION_ITEMS_PER_PAGE } from '@/app/constants';

export const Pagination = () => {
  const { currentPage, stories, setCurrentPage, getAllStories, clearSearch } = useSemanticSearchStore();

  const totalItems = stories?.objects.length ?? 0;
  const hasMoreResults = totalItems === PAGINATION_ITEMS_PER_PAGE;
  const totalPages = hasMoreResults ? currentPage + 1 : currentPage;

  const handlePageChange = (_: React.ChangeEvent<unknown>, page: number) => {
    if (page === currentPage) return;
    clearSearch();
    setCurrentPage(page);
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
      (page - 1) * PAGINATION_ITEMS_PER_PAGE,
    );
  };

  return (
    <Box display="flex" justifyContent="center" alignItems="center" marginTop="auto" pt={2} pb={2}>
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
