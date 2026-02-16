'use client';

import React, { useState } from 'react';
import { IconButton, Popover, Box, Typography, TextField, Divider, Button, Tooltip } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import { useThreshold } from '@/app/stores/useThreshold';

export const StorySettings = () => {
  const { minValue, maxValue, setMinValue, setMaxValue, resetRange } = useThreshold();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleReset = () => {
    resetRange();
  };

  const open = Boolean(anchorEl);
  const id = open ? 'settings-popover' : undefined;

  return (
    <>
      <Tooltip title="Search Settings">
        <IconButton onClick={handleClick}>
          <SettingsIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        sx={{ mt: 1 }}>
        <Box sx={{ p: 3, minWidth: 280 }}>
          <Typography variant="h6" gutterBottom>
            Search Settings
          </Typography>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Adjust the threshold for semantic search results
          </Typography>

          <Box sx={{ mb: 1 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Threshold Search Score
            </Typography>

            <Box display="flex" alignItems="center" gap={2}>
              <Box flex={1}>
                <TextField
                  label="Minimum"
                  variant="outlined"
                  size="small"
                  type="number"
                  value={minValue}
                  fullWidth
                  inputProps={{
                    min: 0,
                    max: 1,
                    step: 0.01,
                    style: { fontSize: 14 },
                  }}
                  onChange={(e) => setMinValue(Number(e.target.value))}
                  helperText="0.0 - 1.0"
                />
              </Box>

              <Box flex={1}>
                <TextField
                  label="Maximum"
                  variant="outlined"
                  size="small"
                  type="number"
                  value={maxValue}
                  fullWidth
                  inputProps={{
                    min: 0,
                    max: 1,
                    step: 0.01,
                    style: { fontSize: 14 },
                  }}
                  onChange={(e) => setMaxValue(Number(e.target.value))}
                  helperText="0.0 - 1.0"
                />
              </Box>
            </Box>

            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Higher values show more relevant results. Lower values include more diverse results.
            </Typography>
          </Box>

          <Divider sx={{ marginBottom: 2 }} />

          <Box display="flex" justifyContent="space-between" gap={1}>
            <Button variant="outlined" size="small" onClick={handleReset} sx={{ textTransform: 'none' }}>
              Reset to Default
            </Button>
            <Button variant="contained" size="small" onClick={handleClose} sx={{ textTransform: 'none' }}>
              Done
            </Button>
          </Box>
        </Box>
      </Popover>
    </>
  );
};
