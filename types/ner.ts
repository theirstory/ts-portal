import type { NerLabelConfig } from '@/config/organizationConfig';

export type NerLabel = NerLabelConfig['id'];

export type NerGroupedEntities = Record<string, string[]>;
