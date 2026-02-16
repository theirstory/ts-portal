import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

export function NoInterviewsMessage() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        px: { xs: 2, md: 4 },
        py: { xs: 4, md: 8 },
        textAlign: 'center',
      }}>
      <Typography
        variant="h5"
        color="primary"
        sx={{
          mb: 2,
          fontSize: { xs: '1.25rem', md: '1.5rem' },
          fontWeight: 600,
        }}>
        ✓ Installation Successful
      </Typography>
      <Typography
        variant="body1"
        color="text.secondary"
        sx={{
          mb: 1,
          fontSize: { xs: '0.95rem', md: '1.1rem' },
        }}>
        No interviews have been loaded yet.
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          fontSize: { xs: '0.875rem', md: '1rem' },
        }}>
        Please refer to the <strong>Import Interviews</strong> section in the README to get started.
      </Typography>
    </Box>
  );
}
