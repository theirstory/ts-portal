'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  IconButton,
  TextField,
  InputAdornment,
  CircularProgress,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { colors } from '@/lib/theme';

export type DonateModalProps = {
  open: boolean;
  onClose: () => void;
  presetAmounts: number[];
  currency: string;
  splitRecipients?: Array<{ label: string; percent: number }>;
  interviewTitle?: string;
  storyId?: string;
  collectionId?: string;
  isEmbed?: boolean;
};

export const DonateModal = ({
  open,
  onClose,
  presetAmounts,
  currency,
  splitRecipients,
  interviewTitle,
  storyId,
  collectionId,
  isEmbed,
}: DonateModalProps) => {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveAmount = selectedAmount ?? (customAmount ? parseFloat(customAmount) : null);
  const isValidAmount = effectiveAmount !== null && effectiveAmount >= 1 && effectiveAmount <= 10000;

  const currencySymbol = currency === 'usd' ? '$' : currency.toUpperCase() + ' ';

  const handlePresetClick = (amount: number) => {
    setSelectedAmount(amount);
    setCustomAmount('');
    setError(null);
  };

  const handleCustomChange = (value: string) => {
    setCustomAmount(value);
    setSelectedAmount(null);
    setError(null);
  };

  const handleDonate = async () => {
    if (!isValidAmount || !effectiveAmount) return;
    setIsLoading(true);
    setError(null);

    try {
      const returnUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: effectiveAmount,
          storyId,
          collectionId,
          interviewTitle,
          isEmbed,
          returnUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start checkout');

      // Redirect to Stripe Checkout
      if (isEmbed) {
        window.open(data.url, '_blank');
      } else {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setSelectedAmount(null);
      setCustomAmount('');
      setError(null);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FavoriteIcon sx={{ color: colors.error.main, fontSize: 20 }} />
          Support{interviewTitle ? ' this recording' : ' the archive'}
        </Box>
        <IconButton aria-label="Close" onClick={handleClose} size="small" disabled={isLoading}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {interviewTitle && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {interviewTitle}
          </Typography>
        )}

        {/* Preset amounts */}
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          {presetAmounts.map((amount) => (
            <Chip
              key={amount}
              label={`${currencySymbol}${amount}`}
              onClick={() => handlePresetClick(amount)}
              variant={selectedAmount === amount ? 'filled' : 'outlined'}
              color={selectedAmount === amount ? 'primary' : 'default'}
              sx={{ fontSize: '0.95rem', px: 1, fontWeight: selectedAmount === amount ? 700 : 400 }}
            />
          ))}
        </Box>

        {/* Custom amount */}
        <TextField
          label="Custom amount"
          type="number"
          size="small"
          fullWidth
          value={customAmount}
          onChange={(e) => handleCustomChange(e.target.value)}
          InputProps={{
            startAdornment: <InputAdornment position="start">{currencySymbol}</InputAdornment>,
          }}
          inputProps={{ min: 1, max: 10000, step: 1 }}
          sx={{ mb: 2 }}
        />

        {/* Split transparency */}
        {splitRecipients && splitRecipients.length > 0 && effectiveAmount && isValidAmount && (
          <Box
            sx={{
              p: 1.5,
              bgcolor: colors.background.subtle,
              borderRadius: 1,
              mb: 1,
            }}>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Your donation supports:
            </Typography>
            {splitRecipients.map((r) => (
              <Box key={r.label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" fontSize="0.8rem">
                  {r.label}
                </Typography>
                <Typography variant="body2" fontSize="0.8rem" fontWeight={600}>
                  {currencySymbol}
                  {((effectiveAmount * r.percent) / 100).toFixed(2)} ({r.percent}%)
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {error && (
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={isLoading} sx={{ textTransform: 'none' }}>
          Cancel
        </Button>
        <Button
          onClick={handleDonate}
          variant="contained"
          disabled={!isValidAmount || isLoading}
          startIcon={isLoading ? <CircularProgress size={16} /> : <FavoriteIcon fontSize="small" />}
          sx={{ textTransform: 'none' }}>
          {isLoading
            ? 'Redirecting...'
            : effectiveAmount
              ? `Donate ${currencySymbol}${effectiveAmount.toFixed(2)}`
              : 'Select an amount'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
