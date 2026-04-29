'use client';

import { useState } from 'react';
import { Button, type SxProps, type Theme } from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { isDonationsEnabled } from '@/config/organizationConfig';
import { DonateModal } from './DonateModal';
import { getPresetAmounts, getCurrency, resolveSplit } from '@/lib/stripe/config';

type DonateButtonProps = {
  interviewTitle?: string;
  storytellerName?: string;
  storyId?: string;
  collectionId?: string;
  isEmbed?: boolean;
  sx?: SxProps<Theme>;
};

export const DonateButton = ({
  interviewTitle,
  storytellerName,
  storyId,
  collectionId,
  isEmbed,
  sx,
}: DonateButtonProps) => {
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
        sx={[{ textTransform: 'none', fontSize: '0.8rem' }, ...(Array.isArray(sx) ? sx : [sx])]}>
        Donate
      </Button>
      <DonateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        presetAmounts={getPresetAmounts()}
        currency={getCurrency()}
        splitRecipients={splitRecipients}
        interviewTitle={interviewTitle}
        storytellerName={storytellerName}
        storyId={storyId}
        collectionId={collectionId}
        isEmbed={isEmbed}
      />
    </>
  );
};
