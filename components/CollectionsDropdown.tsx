'use client';

import React, { useMemo, useState } from 'react';
import { Badge, Box, Button, Checkbox, Divider, IconButton, Menu, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { SchemaTypes } from '@/types/weaviate';
import { returnedFields } from './SearchBox';
import { useThreshold } from '@/app/stores/useThreshold';
import { PAGINATION_ITEMS_PER_PAGE } from '@/app/constants';
import { SearchType } from '@/types/searchType';

export const CollectionsDropdown = ({ compact = false }: { compact?: boolean }) => {
  const {
    collections,
    selectedCollectionIds,
    setSelectedCollectionIds,
    getAllStories,
    searchType,
    hasSearched,
    runHybridSearch,
    runVectorSearch,
    run25bmSearch,
    nerFilters,
    setCurrentPage,
  } = useSemanticSearchStore();
  const { minValue, maxValue } = useThreshold();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingIds, setPendingIds] = useState<string[]>(selectedCollectionIds);

  const open = Boolean(anchorEl);
  const activeCount = selectedCollectionIds.length;

  const filteredCollections = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return collections;
    return collections.filter((collection) => {
      const haystack = `${collection.name} ${collection.description} ${collection.id}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [collections, searchTerm]);

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setPendingIds(selectedCollectionIds);
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setSearchTerm('');
  };

  const applyFilters = (collectionIds: string[]) => {
    setSelectedCollectionIds(collectionIds);
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

  const handleToggle = (collectionId: string) => {
    setPendingIds((prev) =>
      prev.includes(collectionId) ? prev.filter((id) => id !== collectionId) : [...prev, collectionId],
    );
  };

  const handleApply = () => {
    applyFilters(pendingIds);
    handleClose();
  };

  const handleClear = () => {
    setPendingIds([]);
    applyFilters([]);
    handleClose();
  };

  return (
    <>
      {compact ? (
        <Tooltip title="Collections">
          <IconButton onClick={handleOpen} aria-label="open collections filters" size="small">
            <Badge color="primary" badgeContent={activeCount} invisible={activeCount === 0}>
              <FolderOutlinedIcon fontSize="small" />
            </Badge>
          </IconButton>
        </Tooltip>
      ) : (
        <Button
          size="small"
          onClick={handleOpen}
          aria-label="open collections filters"
          endIcon={<KeyboardArrowDownIcon />}
          sx={{
            textTransform: 'none',
            minWidth: '150px',
            px: 1.5,
          }}>
          {`Collections ${activeCount > 0 ? `(${activeCount})` : ''}`}
        </Button>
      )}

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        disableAutoFocusItem
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ list: { dense: true, disablePadding: true } }}
        sx={{
          mt: 1,
          '& .MuiPaper-root': {
            width: { xs: '95vw', md: '400px' },
            maxWidth: '95vw',
          },
        }}>
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" fontSize="1.1rem" fontWeight={700} mb={1.5}>
            Filter by Collection
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Search collections..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </Box>

        <Divider />

        <Box sx={{ maxHeight: '330px', overflowY: 'auto', p: 1 }}>
          {filteredCollections.map((collection) => {
            const checked = pendingIds.includes(collection.id);
            return (
              <MenuItem key={collection.id} onClick={() => handleToggle(collection.id)} sx={{ alignItems: 'flex-start', py: 1.2 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontWeight={600} fontSize="1rem" sx={{ wordBreak: 'break-word' }}>
                    {collection.name}
                  </Typography>
                  {collection.description ? (
                    <Typography
                      color="text.secondary"
                      fontSize="0.95rem"
                      sx={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                      {collection.description}
                    </Typography>
                  ) : (
                    <Typography color="text.disabled" fontSize="0.9rem">
                      No description
                    </Typography>
                  )}
                </Box>
                <Checkbox
                  checked={checked}
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  onChange={() => handleToggle(collection.id)}
                />
              </MenuItem>
            );
          })}

          {filteredCollections.length === 0 && (
            <Box sx={{ p: 2 }}>
              <Typography color="text.secondary">No collections found.</Typography>
            </Box>
          )}
        </Box>

        <Divider />

        <Box sx={{ p: 1.5, display: 'flex', gap: 1 }}>
          <Button variant="outlined" onClick={handleClear} sx={{ flex: 1, textTransform: 'none' }}>
            Clear
          </Button>
          <Button variant="contained" onClick={handleApply} sx={{ flex: 1, textTransform: 'none' }}>
            Apply ({pendingIds.length})
          </Button>
        </Box>
      </Menu>
    </>
  );
};
