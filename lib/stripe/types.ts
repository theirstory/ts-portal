export type SplitRecipient = {
  label: string;
  accountId: string;
  percent: number;
};

export type DonationsConfig = {
  enabled?: boolean;
  currency?: string;
  presetAmounts?: number[];
  popularAmount?: number;
  presetLabels?: Record<string, string>;
  recurringEnabled?: boolean;
  taxDeductible?: boolean;
  defaultSplit?: SplitRecipient[];
  collectionSplits?: Record<string, SplitRecipient[]>;
  recordingSplits?: Record<string, SplitRecipient[]>;
};

export type DonationFrequency = 'one-time' | 'monthly';

export type CheckoutRequest = {
  amount: number; // in dollars
  frequency?: DonationFrequency;
  storyId?: string;
  collectionId?: string;
  interviewTitle?: string;
  storytellerName?: string;
  inHonorOf?: string;
  isEmbed?: boolean;
  returnUrl?: string;
};

export type CheckoutResponse = {
  url: string;
};
