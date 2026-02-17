'use client';

import React, { useState, useMemo } from 'react';
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
import { groupBy } from 'lodash';
import { NerLabel } from '@/types/ner';
import { getNerColor, getNerDisplayName } from '@/config/organizationConfig';
import { colors } from '@/lib/theme';

export const StoryTranscriptToolbarFilterMenu = () => {
  /**
   * store
   */
  const { storyHubPage, setSearchTerm, selected_ner_labels, setUpdateSelectedNerLabel, nerFilters } =
    useSemanticSearchStore();

  /**
   * state
   */
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [searchTerm, setSearchTermLocal] = useState('');
  const [selectedLabels, setSelectedLabels] = useState<NerLabel[]>([]);

  /**
   * variables
   */
  const open = Boolean(anchorEl);
  const nerData = useMemo(() => storyHubPage?.properties?.ner_data ?? [], [storyHubPage]);

  // Deduplicate NER data by label and start_time to get accurate counts
  const deduplicatedNerData = useMemo(() => {
    const labelGroups = groupBy(nerData, (item) => item.label);
    const deduplicated: any[] = [];

    Object.entries(labelGroups).forEach(([, instances]) => {
      // Sort by start_time and filter out duplicates within 0.001 seconds
      const sorted = instances.sort((a, b) => a.start_time - b.start_time);
      const unique = sorted.filter(
        (instance, index, arr) => index === 0 || Math.abs(instance.start_time - arr[index - 1].start_time) > 0.001,
      );
      deduplicated.push(...unique);
    });

    return deduplicated;
  }, [nerData]);

  const grouped = groupBy(deduplicatedNerData, (item) => item.label);
  const sortedEntries = useMemo(() => Object.entries(grouped).sort(([, a], [, b]) => b.length - a.length), [grouped]);

  const filteredEntries = useMemo(() => {
    const lowerSearch = searchTerm.toLowerCase();
    return sortedEntries.filter(([label]) => label.toLowerCase().includes(lowerSearch));
  }, [sortedEntries, searchTerm]);

  const allVisibleSelected = filteredEntries.every(([key]) => selectedLabels.includes(key as NerLabel));

  /**
   * helpers
   */
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setSelectedLabels(nerFilters as NerLabel[]);
    setAnchorEl(event.currentTarget);
  };
  const handleClose = () => setAnchorEl(null);

  const handleToggleLabel = (label: NerLabel) => {
    setSelectedLabels((prev) => (prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]));
  };

  const handleToggleSelectAll = () => {
    if (allVisibleSelected) {
      const labelsToRemove = filteredEntries.map(([key]) => key as NerLabel);
      setSelectedLabels((prev) => prev.filter((label) => !labelsToRemove.includes(label)));
    } else {
      const labelsToAdd = filteredEntries
        .map(([key]) => key as NerLabel)
        .filter((label) => !selectedLabels.includes(label));
      setSelectedLabels((prev) => [...prev, ...labelsToAdd]);
    }
  };

  const handleApplyFilter = () => {
    const searchQuery = selectedLabels.join(' OR ');
    setSearchTerm(searchQuery);

    // Also toggle on the transcript display for each selected label
    selectedLabels.forEach((label) => {
      if (!selected_ner_labels.includes(label)) {
        setUpdateSelectedNerLabel(label);
      }
    });

    // Trigger a traditional search for NER instances (or clear if empty)
    const event = new CustomEvent('nerFilterSearch', {
      detail: { labels: selectedLabels, searchQuery },
    });
    window.dispatchEvent(event);

    handleClose();
  };

  const handleClearFilter = () => {
    setSelectedLabels([]);
    setSearchTerm('');
    const event = new CustomEvent('nerFilterSearch', {
      detail: { labels: [], searchQuery: '' },
    });
    window.dispatchEvent(event);
    handleClose();
  };

  /**
   * render
   */
  return (
    <>
      <IconButton onClick={handleClick} size="small" disableRipple sx={{ ml: 'auto', p: 0.5 }}>
        <FilterListIcon />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        disableAutoFocusItem
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        sx={{ mt: 1, minWidth: 280 }}
        slotProps={{
          list: {
            dense: true,
            disablePadding: true,
          },
        }}>
        {/* Header */}
        <Box>
          <Box
            sx={{
              paddingX: '16px',
              paddingY: '8px',
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
            <MenuItem dense onClick={handleToggleSelectAll} sx={{ paddingX: '16px' }}>
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
        </Box>

        {/* List of Filtered Items */}
        <Box sx={{ maxHeight: 250, overflowY: 'auto' }}>
          {filteredEntries.map(([key, values]) => {
            const isChecked = selectedLabels.includes(key as NerLabel);
            const count = values.length;
            const dotColor = getNerColor(key);
            const labelText = getNerDisplayName(key);

            return (
              <MenuItem key={key} onClick={() => handleToggleLabel(key as NerLabel)} dense>
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
                <ListItemText primary={`${labelText} (${count})`} />
                <Checkbox
                  checked={isChecked}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => handleToggleLabel(key as NerLabel)}
                  size="small"
                />
              </MenuItem>
            );
          })}
        </Box>

        {/* Action Buttons */}
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
          <Button variant="contained" size="small" onClick={handleApplyFilter} sx={{ flex: 1, textTransform: 'none' }}>
            Apply ({selectedLabels.length})
          </Button>
        </Box>
      </Menu>
    </>
  );
};
