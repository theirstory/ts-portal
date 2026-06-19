'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  Box, 
  Button, 
  Container, 
  TextField, 
  Typography, 
  Paper, 
  Alert, 
  CircularProgress 
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { organizationConfig } from '@/config/organizationConfig';

function GatekeeperContent() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';

  const orgName = organizationConfig.displayName || organizationConfig.name || 'Protected Portal';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/gatekeeper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok) {
        window.location.href = callbackUrl;
      } else {
        setError(data.error || 'Invalid password');
        setLoading(false);
      }
    } catch (_err) {
      console.error(_err);
      setError('An error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999, // High z-index to cover everything including TopBar
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'rgba(0, 0, 0, 0.85)', // Black transparent overlay
        backdropFilter: 'blur(8px)', // Modern frosted glass effect
      }}>
      <Container component="main" maxWidth="xs">
        <Paper
          elevation={24}
          sx={{
            p: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            borderRadius: 3,
            width: '100%',
            bgcolor: 'background.paper',
            position: 'relative',
            overflow: 'hidden',
          }}>
          {/* Subtle branding line at the top using primary color */}
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              bgcolor: 'primary.main',
            }}
          />

          <Box
            sx={{
              m: 2,
              bgcolor: 'primary.main',
              color: 'white',
              p: 2,
              borderRadius: '50%',
              display: 'flex',
              boxShadow: (theme) => `0 0 20px ${theme.palette.primary.main}44`,
            }}>
            <LockOutlinedIcon fontSize="large" />
          </Box>

          <Typography
            component="h1"
            variant="h4"
            sx={{
              mb: 1,
              fontWeight: 800,
              textAlign: 'center',
              letterSpacing: '-0.5px',
            }}>
            {orgName}
          </Typography>

          <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4, px: 2 }}>
            This portal is private. Please enter the site password to gain access.
          </Typography>

          {error && (
            <Alert severity="error" variant="filled" sx={{ width: '100%', mb: 3, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate sx={{ width: '100%' }}>
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Site Password"
              type="password"
              id="password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 2,
                },
              }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              sx={{
                mt: 3,
                mb: 1,
                py: 1.5,
                borderRadius: 2,
                fontWeight: 'bold',
                textTransform: 'none',
                fontSize: '1.1rem',
              }}
              disabled={loading || !password}>
              {loading ? <CircularProgress size={26} color="inherit" /> : 'Unlock Portal'}
            </Button>
          </Box>
        </Paper>

        <Typography variant="caption" color="rgba(255,255,255,0.5)" align="center" sx={{ mt: 4, display: 'block' }}>
          &copy; {new Date().getFullYear()} {orgName}. All rights reserved.
        </Typography>
      </Container>
    </Box>
  );
}

export default function GatekeeperPage() {
  return (
    <Suspense fallback={
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'black' }}>
        <CircularProgress />
      </Box>
    }>
      <GatekeeperContent />
    </Suspense>
  );
}
