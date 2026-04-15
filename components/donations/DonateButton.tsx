'use client';

import { useState } from 'react';
import { Button } from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { isDonationsEnabled } from '@/config/organizationConfig';
import { DonateModal } from './DonateModal';
import { getPresetAmounts, getCurrency, resolveSplit } from '@/lib/stripe/config';

type DonateButtonProps = {
  interviewTitle?: string;
  storyId?: string;
  collectionId?: string;
  isEmbed?: boolean;
};

export const DonateButton = ({ interviewTitle, storyId, collectionId, isEmbed }: DonateButtonProps) => {
  const [modalOpen, setModalOpen] = useState(false);

  if (!isDonationsEnabled) return null;

  const split = resolveSplit(storyId, collectionId);
  const splitRecipients = split.map(({ label, percent }) => ({ label, percent }));

  return (
    <>
      <Button
        onClick={() => setModalOpen(true)}
        size="small"
        variant="outlined"
        startIcon={<FavoriteIcon fontSize="small" />}
        sx={{ textTransform: 'none', fontSize: '0.8rem' }}>
        Support
      </Button>
      <DonateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        presetAmounts={getPresetAmounts()}
        currency={getCurrency()}
        splitRecipients={splitRecipients}
        interviewTitle={interviewTitle}
        storyId={storyId}
        collectionId={collectionId}
        isEmbed={isEmbed}
      />
    </>
  );
};
