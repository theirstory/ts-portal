'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { SchemaTypes } from '@/types/weaviate';
import { PAGINATION_ITEMS_PER_PAGE } from '@/app/constants';
import CollectionLayout from './CollectionLayout';

const STORIES_RETURN_PROPERTIES = [
  'interview_title',
  'interview_description',
  'interview_duration',
  'ner_labels',
  'isAudioFile',
  'video_url',
  'collection_id',
  'collection_name',
  'collection_description',
] as const;

export const RecordingsPage = () => {
  const searchParams = useSearchParams();
  const collectionId = searchParams.get('collection');

  const {
    getAllStories,
    loadCollections,
    loadFolders,
    setSelectedCollectionIds,
    setSelectedFolderIds,
    setCurrentPage,
    clearSearch,
    setHasSearched,
    setSearchTerm,
  } = useSemanticSearchStore();

  useEffect(() => {
    loadCollections();
    loadFolders();
  }, [loadCollections, loadFolders]);

  useEffect(() => {
    clearSearch();
    setHasSearched(false);
    setSearchTerm('');
    setCurrentPage(1);
    setSelectedFolderIds([]);
    setSelectedCollectionIds(collectionId ? [collectionId] : []);
    getAllStories(SchemaTypes.Testimonies, [...STORIES_RETURN_PROPERTIES], PAGINATION_ITEMS_PER_PAGE, 0);
  }, [
    collectionId,
    clearSearch,
    getAllStories,
    setCurrentPage,
    setHasSearched,
    setSearchTerm,
    setSelectedCollectionIds,
    setSelectedFolderIds,
  ]);

  return <CollectionLayout />;
};
