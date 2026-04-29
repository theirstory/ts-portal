'use client';

import { useState } from 'react';
import { Box, Typography, Button, Stack, Snackbar } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import IosShareIcon from '@mui/icons-material/IosShare';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { colors } from '@/lib/theme';
import { organizationConfig } from '@/config/organizationConfig';

export default function DonateSuccessPage() {
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get('embed') === 'true';
  const storyId = searchParams.get('storyId');
  const storytellerName = searchParams.get('storytellerName');
  const interviewTitle = searchParams.get('interviewTitle');
  const [copyOpen, setCopyOpen] = useState(false);

  const shareUrl =
    typeof window !== 'undefined'
      ? storyId
        ? `${window.location.origin}/story/${storyId}`
        : window.location.origin
      : '';

  const subject = storytellerName
    ? `${storytellerName}'s story is worth preserving`
    : interviewTitle
      ? `${interviewTitle} — ${organizationConfig.displayName}`
      : `${organizationConfig.displayName}`;

  const shareText = storytellerName
    ? `I just supported ${storytellerName}'s story at ${organizationConfig.displayName}. Listen and consider giving:`
    : `I just supported ${organizationConfig.displayName}. Listen and consider giving:`;

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: subject, text: shareText, url: shareUrl });
      } catch {
        /* user cancelled */
      }
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      setCopyOpen(true);
    } catch {
      /* clipboard unavailable */
    }
  };

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;
  const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
  const hasNativeShare = typeof navigator !== 'undefined' && Boolean((navigator as Navigator).share);

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
        {storytellerName
          ? `Your support helps preserve ${storytellerName}'s story — and many more like it — for future generations.`
          : 'Your support helps preserve and share oral histories for future generations.'}
      </Typography>

      <Box sx={{ mb: 3, maxWidth: 500 }}>
        <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
          Help others discover this archive
        </Typography>
        <Stack direction="row" spacing={1} justifyContent="center" flexWrap="wrap" useFlexGap>
          {hasNativeShare && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<IosShareIcon />}
              onClick={handleNativeShare}
              sx={{ textTransform: 'none' }}>
              Share
            </Button>
          )}
          <Button
            size="small"
            variant="outlined"
            component="a"
            href={xUrl}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ textTransform: 'none' }}>
            Share on X
          </Button>
          <Button
            size="small"
            variant="outlined"
            component="a"
            href={fbUrl}
            target="_blank"
            rel="noopener noreferrer"
            sx={{ textTransform: 'none' }}>
            Share on Facebook
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ContentCopyIcon />}
            onClick={handleCopy}
            sx={{ textTransform: 'none' }}>
            Copy link
          </Button>
        </Stack>
      </Box>

      {!isEmbed && (
        <Stack direction="row" spacing={1.5}>
          {storyId && (
            <Button component={Link} href={`/story/${storyId}`} variant="contained" sx={{ textTransform: 'none' }}>
              Back to recording
            </Button>
          )}
          <Button component={Link} href="/" variant="outlined" sx={{ textTransform: 'none' }}>
            Return to archive
          </Button>
        </Stack>
      )}

      <Snackbar
        open={copyOpen}
        autoHideDuration={2500}
        onClose={() => setCopyOpen(false)}
        message="Link copied"
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}
