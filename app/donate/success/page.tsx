'use client';

import { Box, Typography, Button } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { colors } from '@/lib/theme';

export default function DonateSuccessPage() {
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get('embed') === 'true';

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
      <CheckCircleIcon sx={{ fontSize: 64, color: colors.success.main, mb: 2 }} />
      <Typography variant="h5" fontWeight="bold" gutterBottom>
        Thank you for your donation!
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 3, maxWidth: 500 }}>
        Your support helps preserve and share oral histories for future generations.
      </Typography>
      {!isEmbed && (
        <Button component={Link} href="/" variant="outlined" sx={{ textTransform: 'none' }}>
          Return to archive
        </Button>
      )}
    </Box>
  );
}
