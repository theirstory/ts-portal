'use client';

import { useEffect, useCallback, useState } from 'react';
import { Button, Popover, Box, Typography, IconButton, Tooltip, CircularProgress } from '@mui/material';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import { useZoteroStore } from '@/app/stores/useZoteroStore';
import { colors } from '@/lib/theme';
import { ZoteroIcon } from './ZoteroIcon';

export const ZoteroAuthButton = () => {
  const { isAuthenticated, username, isCheckingAuth, checkAuthStatus, logout } = useZoteroStore();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  // Check auth on mount
  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  // Listen for postMessage from the OAuth popup
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.data?.type === 'zotero-auth' && event.data.status === 'connected') {
        checkAuthStatus();
      }
    },
    [checkAuthStatus],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  const handleConnect = async () => {
    try {
      const res = await fetch('/api/zotero/auth/request-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTo: window.location.pathname + window.location.search }),
      });
      const data = await res.json();
      if (data.authorizationUrl) {
        // Open in a centered popup
        const w = 600;
        const h = 700;
        const left = window.screenX + (window.outerWidth - w) / 2;
        const top = window.screenY + (window.outerHeight - h) / 2;
        window.open(
          data.authorizationUrl,
          'zotero-auth',
          `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no`,
        );
      } else {
        console.error('No authorization URL returned:', data.error);
      }
    } catch (error) {
      console.error('Failed to start Zotero OAuth:', error);
    }
  };

  const handleDisconnect = async () => {
    setAnchorEl(null);
    await logout();
  };

  if (isCheckingAuth) {
    return <CircularProgress size={16} sx={{ color: colors.primary.contrastText, mx: 1 }} />;
  }

  if (!isAuthenticated) {
    return (
      <Tooltip title="Connect your Zotero account to save citations">
        <Button
          onClick={handleConnect}
          size="small"
          variant="outlined"
          startIcon={<ZoteroIcon size={16} />}
          sx={{
            textTransform: 'none',
            fontSize: '0.75rem',
            color: colors.primary.contrastText,
            borderColor: 'rgba(255,255,255,0.4)',
            '&:hover': {
              borderColor: colors.primary.contrastText,
              backgroundColor: 'rgba(255,255,255,0.08)',
            },
          }}>
          Connect Zotero
        </Button>
      </Tooltip>
    );
  }

  return (
    <>
      <Tooltip title={`Zotero: ${username || 'Connected'}`}>
        <IconButton
          size="small"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          sx={{
            color: colors.primary.contrastText,
            border: '1px solid rgba(255,255,255,0.4)',
            borderRadius: '6px',
            px: 1,
            gap: 0.5,
            fontSize: '0.75rem',
          }}>
          <ZoteroIcon size={16} />
          <Box component="span" sx={{ display: { xs: 'none', md: 'inline' }, fontSize: '0.75rem' }}>
            {username || 'Zotero'}
          </Box>
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Box sx={{ p: 2, minWidth: 200 }}>
          <Typography variant="body2" fontWeight="bold" sx={{ mb: 0.5 }}>
            Zotero Connected
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
            {username || 'Unknown user'}
          </Typography>
          <Button
            onClick={handleDisconnect}
            size="small"
            variant="outlined"
            color="error"
            fullWidth
            startIcon={<LinkOffIcon fontSize="small" />}
            sx={{ textTransform: 'none' }}>
            Disconnect
          </Button>
        </Box>
      </Popover>
    </>
  );
};
