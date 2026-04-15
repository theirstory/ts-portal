export type SplitRecipient = {
  label: string;
  accountId: string;
  percent: number;
};

export type DonationsConfig = {
  enabled?: boolean;
  currency?: string;
  presetAmounts?: number[];
  defaultSplit?: SplitRecipient[];
  collectionSplits?: Record<string, SplitRecipient[]>;
  recordingSplits?: Record<string, SplitRecipient[]>;
};

export type CheckoutRequest = {
  amount: number; // in dollars
  storyId?: string;
  collectionId?: string;
  interviewTitle?: string;
  isEmbed?: boolean;
  returnUrl?: string;
};

export type CheckoutResponse = {
  url: string;
};
