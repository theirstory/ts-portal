/**
 * NER Entity Color Palette
 *
 * This palette is now loaded from the central configuration file.
 * To customize NER colors for your organization, edit config.json
 */

import { getNerColorPalette } from '@/config/organizationConfig';

export const nerColorPalette = getNerColorPalette();
