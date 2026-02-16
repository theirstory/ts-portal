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
  Tooltip,
  Badge,
} from '@mui/material';
import LabelIcon from '@mui/icons-material/Label';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { groupBy } from 'lodash';
import { NerLabel } from '@/types/ner';
import { getNerColor, getNerDisplayName } from '@/config/organizationConfig';
import { colors } from '@/lib/theme';

export const StoryTranscriptToolbarNerToggle = () => {
  /**
   * store
   */
  const { storyHubPage, selected_ner_labels, setUpdateSelectedNerLabel } = useSemanticSearchStore();

  /**
   * state
   */
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [searchTerm, setSearchTerm] = useState('');

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
    return sortedEntries.filter(([label]) => {
      const dn = getNerDisplayName(label).toLowerCase();
      return label.toLowerCase().includes(lowerSearch) || dn.includes(lowerSearch);
    });
  }, [sortedEntries, searchTerm]);

  const allVisibleSelected = filteredEntries.every(([key]) => selected_ner_labels.includes(key as NerLabel));

  /**
   * helpers
   */
  const handleClick = (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);

  const handleToggleSelectAll = () => {
    if (allVisibleSelected) {
      filteredEntries.forEach(([key]) => setUpdateSelectedNerLabel(key as NerLabel));
    } else {
      filteredEntries.forEach(([key]) => {
        if (!selected_ner_labels.includes(key as NerLabel)) {
          setUpdateSelectedNerLabel(key as NerLabel);
        }
      });
    }
  };

  /**
   * render
   */
  return (
    <>
      <Tooltip title="Toggle NER Labels">
        <IconButton onClick={handleClick} disableRipple>
          <Badge
            badgeContent={selected_ner_labels.length}
            color="primary"
            max={99}
            invisible={selected_ner_labels.length === 0}
            sx={{
              '& .MuiBadge-badge': {
                fontSize: '10px',
                minWidth: '16px',
                height: '16px',
              },
            }}>
            <LabelIcon fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        disableAutoFocusItem
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ mt: 1, minWidth: 250 }}
        slotProps={{
          list: {
            dense: true,
            disablePadding: true,
          },
        }}>
        {/* Search and Select All Header */}
        <Box
          sx={{
            p: 1,
            borderBottom: `1px solid ${colors.grey[200]}`,
            position: 'sticky',
            top: 0,
            bgcolor: colors.common.white,
            zIndex: 1,
          }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Search NER..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            inputProps={{ 'aria-label': 'search ner' }}
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

        {/* List of Filtered Items */}
        <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
          {filteredEntries.map(([key, values]) => {
            const isChecked = selected_ner_labels.includes(key as NerLabel);
            const count = values.length;
            const labelText = getNerDisplayName(key);
            const dotColor = getNerColor(key);

            return (
              <MenuItem key={key} onClick={() => setUpdateSelectedNerLabel(key as NerLabel)} dense>
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
                  onChange={() => setUpdateSelectedNerLabel(key as NerLabel)}
                  size="small"
                />
              </MenuItem>
            );
          })}
        </Box>
      </Menu>
    </>
  );
};
