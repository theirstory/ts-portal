import { config } from '@/config/organizationConfig';
import type { SplitRecipient, DonationsConfig } from './types';

function getDonationsConfig(): DonationsConfig {
  return (config.features as Record<string, unknown>)?.donations as DonationsConfig ?? {};
}

export function isDonationsFeatureEnabled(): boolean {
  return getDonationsConfig().enabled ?? false;
}

export function getCurrency(): string {
  return getDonationsConfig().currency ?? 'usd';
}

export function getPresetAmounts(): number[] {
  return getDonationsConfig().presetAmounts ?? [5, 10, 25, 50];
}

/**
 * Resolve the donation split for a given recording.
 * Priority: recording override → collection override → portal default
 */
export function resolveSplit(storyId?: string, collectionId?: string): SplitRecipient[] {
  const cfg = getDonationsConfig();

  // 1. Recording-level override
  if (storyId && cfg.recordingSplits?.[storyId]) {
    return cfg.recordingSplits[storyId];
  }

  // 2. Collection-level override
  if (collectionId && cfg.collectionSplits?.[collectionId]) {
    return cfg.collectionSplits[collectionId];
  }

  // 3. Portal default
  return cfg.defaultSplit ?? [];
}

/**
 * Validate that a split config adds up to 100% and has valid account IDs.
 */
export function validateSplit(split: SplitRecipient[]): { valid: boolean; error?: string } {
  if (!split.length) {
    return { valid: false, error: 'No split recipients configured' };
  }

  const total = split.reduce((sum, r) => sum + r.percent, 0);
  if (Math.abs(total - 100) > 0.01) {
    return { valid: false, error: `Split percentages total ${total}%, must equal 100%` };
  }

  for (const r of split) {
    if (!r.accountId || !r.accountId.startsWith('acct_')) {
      return { valid: false, error: `Invalid Stripe account ID for "${r.label}": ${r.accountId}` };
    }
    if (r.percent <= 0) {
      return { valid: false, error: `Percent must be positive for "${r.label}"` };
    }
  }

  return { valid: true };
}
