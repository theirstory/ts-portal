'use client';

import React, { useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import SourceOutlinedIcon from '@mui/icons-material/SourceOutlined';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { SchemaTypes } from '@/types/weaviate';
import { returnedFields } from './SearchBox';
import { useThreshold } from '@/app/stores/useThreshold';
import { PAGINATION_ITEMS_PER_PAGE } from '@/app/constants';
import { SearchType } from '@/types/searchType';

export const FoldersDropdown = ({ compact = false }: { compact?: boolean }) => {
  const store = useSemanticSearchStore();
  const {
    folders,
    selectedFolderIds,
    setSelectedFolderIds,
    getAllStories,
    searchType,
    hasSearched,
    runHybridSearch,
    runVectorSearch,
    run25bmSearch,
    nerFilters,
    setCurrentPage,
  } = store;
  const { minValue, maxValue } = useThreshold();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingIds, setPendingIds] = useState<string[]>(selectedFolderIds);

  const open = Boolean(anchorEl);
  const activeCount = selectedFolderIds.length;

  const filteredFolders = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return folders;
    return folders.filter((folder) => {
      const haystack = `${folder.name} ${folder.path} ${folder.collectionName} ${folder.id}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [folders, searchTerm]);

  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    setPendingIds(selectedFolderIds);
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setSearchTerm('');
  };

  const applyFilters = (folderIds: string[]) => {
    setSelectedFolderIds(folderIds);
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
          'folder_id',
          'folder_name',
          'folder_path',
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

  const handleToggle = (folderId: string) => {
    setPendingIds((prev) => (prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]));
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
        <Tooltip title="Folders">
          <IconButton onClick={handleOpen} aria-label="open folder filters" size="small">
            <Badge color="primary" badgeContent={activeCount} invisible={activeCount === 0}>
              <SourceOutlinedIcon fontSize="small" />
            </Badge>
          </IconButton>
        </Tooltip>
      ) : (
        <Button
          size="small"
          onClick={handleOpen}
          aria-label="open folder filters"
          endIcon={<KeyboardArrowDownIcon />}
          sx={{
            textTransform: 'none',
            minWidth: '130px',
            px: 1.5,
          }}>
          {`Folders ${activeCount > 0 ? `(${activeCount})` : ''}`}
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
            width: { xs: '95vw', md: '420px' },
            maxWidth: '95vw',
          },
        }}>
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" fontSize="1.1rem" fontWeight={700} mb={1.5}>
            Filter by Folder
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Search folders..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </Box>

        <Divider />

        <Box sx={{ maxHeight: '330px', overflowY: 'auto', p: 1 }}>
          {filteredFolders.map((folder) => {
            const checked = pendingIds.includes(folder.id);
            return (
              <MenuItem
                key={folder.id}
                onClick={() => handleToggle(folder.id)}
                sx={{ alignItems: 'flex-start', py: 1.2, gap: 1.5 }}>
                <Box sx={{ flex: 1, minWidth: 0, pr: 1 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{
                      lineHeight: 1.35,
                      wordBreak: 'break-word',
                      whiteSpace: 'normal',
                    }}>
                    {folder.collectionName}
                  </Typography>
                  <Typography
                    variant="body2"
                    fontWeight={600}
                    sx={{
                      mt: 0.15,
                      lineHeight: 1.35,
                      wordBreak: 'break-word',
                      whiteSpace: 'normal',
                    }}>
                    {folder.name}
                  </Typography>
                </Box>
                <Checkbox
                  checked={checked}
                  sx={{ mt: 0.25, flexShrink: 0 }}
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  onChange={() => handleToggle(folder.id)}
                />
              </MenuItem>
            );
          })}

          {filteredFolders.length === 0 && (
            <Box sx={{ p: 2 }}>
              <Typography color="text.secondary">No folders found.</Typography>
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
