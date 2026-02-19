'use client';

import React from 'react';
import { Box, Pagination as MuiPagination } from '@mui/material';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { SchemaTypes } from '@/types/weaviate';
import { PAGINATION_ITEMS_PER_PAGE } from '@/app/constants';

export const Pagination = () => {
  const { currentPage, hasNextStoriesPage, setCurrentPage, getAllStories } = useSemanticSearchStore();

  const totalPages = hasNextStoriesPage ? currentPage + 1 : currentPage;

  const handlePageChange = (_: React.ChangeEvent<unknown>, page: number) => {
    if (page === currentPage) return;
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
    <Box display="flex" justifyContent="center" alignItems="center" pt={1.5} pb={{ xs: 1, md: 0.5 }}>
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
