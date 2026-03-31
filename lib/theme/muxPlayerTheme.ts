import type React from 'react';
import { colors } from './colors';

export const muxPlayerThemeProps = {
  accentColor: colors.primary.light,
  style: {
    '--controls-backdrop-color': colors.common.overlay,
    '--media-control-background': colors.primary.light,
    '--media-control-hover-background': colors.primary.dark,
    '--media-control-color': colors.primary.contrastText,
    '--media-range-bar-color': colors.primary.light,
    '--media-range-track-color': `${colors.common.white}55`,
    width: '100%',
  } as React.CSSProperties,
};
