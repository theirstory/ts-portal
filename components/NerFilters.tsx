'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Checkbox,
  TextField,
  Box,
  Typography,
  Button,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';

import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { getNerColor, getNerDisplayName, nerLabels } from '@/config/organizationConfig';
import { SchemaTypes } from '@/types/weaviate';
import { SearchType } from '@/types/searchType';
import { useThreshold } from '@/app/stores/useThreshold';
import { returnedFields } from './SearchBox';
import { colors } from '@/lib/theme/colors';
import { NerLabel } from '@/types/ner';

export const NerFilters = () => {
  const { setNerFilters, runVectorSearch, runHybridSearch, run25bmSearch, searchType, setCurrentPage, nerFilters } =
    useSemanticSearchStore();
  const { minValue, maxValue } = useThreshold();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [searchTerm, setSearchTermLocal] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const open = Boolean(anchorEl);

  // Source of truth: ids from config
  const nerIds = useMemo(() => {
    return (nerLabels ?? [])
      .map((l) => l?.id)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  }, []);

  const sortedNerIds = useMemo(() => {
    return [...nerIds].sort((a, b) => a.localeCompare(b));
  }, [nerIds]);

  const filteredNerIds = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return sortedNerIds;

    return sortedNerIds.filter((id) => {
      const dn = getNerDisplayName(id).toLowerCase();
      return id.toLowerCase().includes(q) || dn.includes(q);
    });
  }, [sortedNerIds, searchTerm]);

  const allVisibleSelected = useMemo(() => {
    if (filteredNerIds.length === 0) return false;
    return filteredNerIds.every((id) => selectedIds.includes(id));
  }, [filteredNerIds, selectedIds]);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const toggleId = useCallback((id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      if (filteredNerIds.length === 0) return prev;

      if (filteredNerIds.every((id) => prev.includes(id))) {
        // remove visible ones
        return prev.filter((id) => !filteredNerIds.includes(id));
      }

      // add visible ones (dedup)
      const next = new Set(prev);
      filteredNerIds.forEach((id) => next.add(id));
      return Array.from(next);
    });
  }, [filteredNerIds]);

  const handleApplyFilter = () => {
    // store expects NerLabel[] (which is basically string union); ids are the correct values
    setNerFilters(selectedIds as NerLabel[]);
    handleClose();
  };

  const handleClearFilter = () => {
    setSelectedIds([]);
    setNerFilters([]);
    handleClose();
  };

  const runSemanticSearch = () => {
    setCurrentPage(1);

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

  useEffect(() => {
    runSemanticSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nerFilters]);

  return (
    <>
      <IconButton onClick={handleClick}>
        <FilterListIcon fontSize="small" />
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        disableAutoFocusItem
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        sx={{ mt: 1, minWidth: 280 }}
        slotProps={{ list: { dense: true, disablePadding: true } }}>
        <Box
          sx={{
            padding: '16px',
            borderBottom: `1px solid ${colors.grey[200]}`,
            position: 'sticky',
            top: 0,
            bgcolor: colors.common.white,
            zIndex: 1,
          }}>
          <Typography variant="subtitle2" fontWeight="bold" sx={{ mb: 1 }}>
            Filter search by NER Labels
          </Typography>

          <TextField
            size="small"
            fullWidth
            placeholder="Search labels..."
            value={searchTerm}
            onChange={(e) => setSearchTermLocal(e.target.value)}
            inputProps={{ 'aria-label': 'search ner labels' }}
            sx={{ mb: 1 }}
          />
        </Box>

        {!searchTerm && (
          <MenuItem dense onClick={toggleSelectAllVisible} sx={{ paddingX: '16px' }}>
            <ListItemText
              primary={
                <Typography fontSize="14px" fontWeight="bold">
                  {allVisibleSelected ? 'Unselect All' : 'Select All'}
                </Typography>
              }
            />
            <Checkbox checked={allVisibleSelected} size="small" />
          </MenuItem>
        )}

        <Box sx={{ maxHeight: 250, overflowY: 'auto' }}>
          {filteredNerIds.map((id) => {
            const isChecked = selectedIds.includes(id);
            const dotColor = getNerColor(id);
            const labelText = getNerDisplayName(id);

            return (
              <MenuItem key={id} onClick={() => toggleId(id)} dense>
                <ListItemIcon sx={{ minWidth: 24 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      backgroundColor: dotColor,
                    }}
                  />
                </ListItemIcon>

                <ListItemText primary={labelText} />

                <Checkbox
                  checked={isChecked}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleId(id)}
                  size="small"
                />
              </MenuItem>
            );
          })}
        </Box>

        <Box
          sx={{
            p: 1,
            borderTop: `1px solid ${colors.grey[200]}`,
            display: 'flex',
            gap: 1,
          }}>
          <Button variant="outlined" size="small" onClick={handleClearFilter} sx={{ flex: 1, textTransform: 'none' }}>
            Clear
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleApplyFilter}
            disabled={selectedIds.length === 0}
            sx={{ flex: 1, textTransform: 'none' }}>
            Apply ({selectedIds.length})
          </Button>
        </Box>
      </Menu>
    </>
  );
};
