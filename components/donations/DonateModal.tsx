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
  ToggleButton,
  ToggleButtonGroup,
  Collapse,
  Link as MuiLink,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { colors } from '@/lib/theme';
import { getPopularAmount, getPresetLabel, isRecurringEnabled, isTaxDeductible } from '@/lib/stripe/config';
import type { DonationFrequency } from '@/lib/stripe/types';

export type DonateModalProps = {
  open: boolean;
  onClose: () => void;
  presetAmounts: number[];
  currency: string;
  splitRecipients?: Array<{ label: string; percent: number }>;
  interviewTitle?: string;
  storytellerName?: string;
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
  storytellerName,
  storyId,
  collectionId,
  isEmbed,
}: DonateModalProps) => {
  const popularAmount = getPopularAmount();
  const recurringEnabled = isRecurringEnabled();
  const taxDeductible = isTaxDeductible();
  const defaultSelectedAmount = popularAmount && presetAmounts.includes(popularAmount) ? popularAmount : null;

  const [selectedAmount, setSelectedAmount] = useState<number | null>(defaultSelectedAmount);
  const [customAmount, setCustomAmount] = useState('');
  const [frequency, setFrequency] = useState<DonationFrequency>('one-time');
  const [tributeOpen, setTributeOpen] = useState(false);
  const [inHonorOf, setInHonorOf] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveAmount = selectedAmount ?? (customAmount ? parseFloat(customAmount) : null);
  const isValidAmount = effectiveAmount !== null && effectiveAmount >= 1 && effectiveAmount <= 10000;

  const currencySymbol = currency === 'usd' ? '$' : currency.toUpperCase() + ' ';

  const titleText = interviewTitle ? 'Help preserve this recording' : 'Donate to the archive';

  const activePresetLabel = effectiveAmount && isValidAmount ? getPresetLabel(effectiveAmount) : undefined;

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
          frequency,
          storyId,
          collectionId,
          interviewTitle,
          storytellerName,
          inHonorOf: inHonorOf.trim() || undefined,
          isEmbed,
          returnUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start checkout');

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
      setSelectedAmount(defaultSelectedAmount);
      setCustomAmount('');
      setFrequency('one-time');
      setTributeOpen(false);
      setInHonorOf('');
      setError(null);
      onClose();
    }
  };

  const donateLabel = isLoading
    ? 'Redirecting...'
    : effectiveAmount
      ? `Donate ${currencySymbol}${effectiveAmount.toFixed(2)}${frequency === 'monthly' ? ' / month' : ''}`
      : 'Select an amount';

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 2 }}>
          <FavoriteIcon sx={{ color: colors.error.main, fontSize: 20 }} />
          <Typography component="span" sx={{ fontWeight: 600, fontSize: '1rem', lineHeight: 1.3 }}>
            {titleText}
          </Typography>
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

        {recurringEnabled && (
          <ToggleButtonGroup
            value={frequency}
            exclusive
            size="small"
            fullWidth
            onChange={(_e, val) => val && setFrequency(val as DonationFrequency)}
            sx={{ mb: 2 }}>
            <ToggleButton value="one-time" sx={{ textTransform: 'none' }}>
              One-time
            </ToggleButton>
            <ToggleButton value="monthly" sx={{ textTransform: 'none' }}>
              Monthly
            </ToggleButton>
          </ToggleButtonGroup>
        )}

        {/* Preset amounts */}
        <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
          {presetAmounts.map((amount) => {
            const isSelected = selectedAmount === amount;
            const isPopular = popularAmount === amount;
            return (
              <Box key={amount} sx={{ position: 'relative', display: 'inline-flex' }}>
                <Chip
                  label={`${currencySymbol}${amount}`}
                  onClick={() => handlePresetClick(amount)}
                  variant={isSelected ? 'filled' : 'outlined'}
                  color={isSelected ? 'primary' : 'default'}
                  sx={{
                    fontSize: '0.95rem',
                    px: 1,
                    fontWeight: isSelected ? 700 : 400,
                    ...(isPopular && !isSelected
                      ? {
                          borderColor: colors.primary.main,
                          borderWidth: 2,
                        }
                      : {}),
                  }}
                />
                {isPopular && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: -8,
                      right: -8,
                      bgcolor: colors.primary.main,
                      color: colors.primary.contrastText,
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      px: 0.6,
                      py: 0.1,
                      borderRadius: 1,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      lineHeight: 1.2,
                    }}>
                    Popular
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>

        {activePresetLabel && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, fontStyle: 'italic' }}>
            {activePresetLabel}
          </Typography>
        )}

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

        {/* Tribute giving */}
        <Box sx={{ mb: 2 }}>
          {!tributeOpen ? (
            <MuiLink
              component="button"
              type="button"
              variant="caption"
              onClick={() => setTributeOpen(true)}
              sx={{ cursor: 'pointer', textDecoration: 'underline' }}>
              Make this a tribute gift
            </MuiLink>
          ) : (
            <Collapse in={tributeOpen}>
              <TextField
                label="In honor / memory of (optional)"
                size="small"
                fullWidth
                value={inHonorOf}
                onChange={(e) => setInHonorOf(e.target.value)}
                placeholder="Name of person or group"
                inputProps={{ maxLength: 120 }}
              />
            </Collapse>
          )}
        </Box>

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

        {taxDeductible && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
            Your donation is tax-deductible to the extent allowed by law.
          </Typography>
        )}

        {error && (
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            {error}
          </Typography>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        <MuiLink
          component="button"
          type="button"
          variant="caption"
          onClick={handleClose}
          disabled={isLoading}
          sx={{
            cursor: isLoading ? 'not-allowed' : 'pointer',
            color: 'text.secondary',
            textDecoration: 'underline',
            opacity: isLoading ? 0.5 : 1,
          }}>
          Cancel
        </MuiLink>
        <Button
          onClick={handleDonate}
          variant="contained"
          disabled={!isValidAmount || isLoading}
          startIcon={isLoading ? <CircularProgress size={16} /> : <FavoriteIcon fontSize="small" />}
          sx={{ textTransform: 'none' }}>
          {donateLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
