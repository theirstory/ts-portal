'use client';

import { useState } from 'react';
import { Tooltip, Fab } from '@mui/material';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { isDonationsEnabled } from '@/config/organizationConfig';
import { DonateModal } from './DonateModal';
import { getPresetAmounts, getCurrency, resolveSplit } from '@/lib/stripe/config';
import { colors } from '@/lib/theme';

type FloatingDonateButtonProps = {
  interviewTitle?: string;
  storyId?: string;
  collectionId?: string;
  isEmbed?: boolean;
};

export const FloatingDonateButton = ({
  interviewTitle,
  storyId,
  collectionId,
  isEmbed,
}: FloatingDonateButtonProps) => {
  const [modalOpen, setModalOpen] = useState(false);

  if (!isDonationsEnabled) return null;

  const split = resolveSplit(storyId, collectionId);
  const splitRecipients = split.map(({ label, percent }) => ({ label, percent }));

  return (
    <>
      <Tooltip title="Support this recording" placement="left">
        <Fab
          size="small"
          onClick={() => setModalOpen(true)}
          sx={{
            position: 'fixed',
            bottom: 90,
            right: 24,
            zIndex: 1100,
            bgcolor: colors.error.main,
            color: colors.common.white,
            '&:hover': {
              bgcolor: '#b71c1c',
            },
          }}>
          <FavoriteIcon fontSize="small" />
        </Fab>
      </Tooltip>
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
