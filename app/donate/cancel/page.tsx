'use client';

import { Box, Typography, Button } from '@mui/material';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function DonateCancelPage() {
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get('embed') === 'true';
  const storyId = searchParams.get('storyId');

  const returnHref = storyId ? `/story/${storyId}` : '/';

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: isEmbed ? '300px' : '60vh',
        textAlign: 'center',
        px: 3,
      }}>
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Donation cancelled
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 500 }}>
        No worries! You can donate anytime.
      </Typography>
      {!isEmbed && (
        <Button component={Link} href={returnHref} variant="outlined" sx={{ textTransform: 'none' }}>
          Go back
        </Button>
      )}
    </Box>
  );
}
