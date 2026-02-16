/**
 * TheirStory Portals - Design System Colors
 *
 * Colors are loaded from the central configuration file (config.json).
 * To customize colors for your organization, edit config.json in the root directory.
 *
 * Usage:
 * - Import directly: import { colors } from '@/lib/theme/colors'
 * - Or use via MUI theme: theme.palette.primary.main
 */

import { themeColors } from '@/config/organizationConfig';

export const colors = {
  primary: themeColors.primary,
  secondary: themeColors.secondary,
  grey: themeColors.grey,
  text: themeColors.text,
  background: themeColors.background,
  error: themeColors.error,
  warning: themeColors.warning,
  success: themeColors.success,
  info: themeColors.info,
  common: themeColors.common,

  // ==========================================
  // GRADIENTS
  // ==========================================
  gradients: {
    body: 'linear-gradient(0deg, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0.2) 100%), linear-gradient(111deg, #6481a2 0.34%, #7a8796 100%)',
    overlay:
      'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.02) 20%, rgba(0,0,0,0.07) 40%, rgba(0,0,0,0.35) 70%, rgba(0,0,0,0.5) 100%)',
  },
} as const;

export type Colors = typeof colors;
