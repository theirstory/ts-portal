/**
 * TheirStory Portals - MUI Theme Configuration
 *
 * This file creates a complete Material-UI theme based on our design system colors.
 * Import this theme in the ThemeProvider to apply consistent styling across the app.
 */

import { createTheme, type ThemeOptions } from '@mui/material/styles';
import { colors } from './colors';

/**
 * Theme configuration options
 */
const themeOptions: ThemeOptions = {
  // ==========================================
  // TYPOGRAPHY
  // ==========================================
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    h1: { fontWeight: 700 },
    h2: { fontWeight: 600 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 500 },
    h6: { fontWeight: 500 },
    button: {
      textTransform: 'none',
      fontWeight: 500,
    },
  },

  // ==========================================
  // COLOR PALETTE
  // ==========================================
  palette: {
    mode: 'light',
    primary: {
      main: colors.primary.main,
      light: colors.primary.light,
      dark: colors.primary.dark,
      contrastText: colors.primary.contrastText,
    },
    secondary: {
      main: colors.secondary.main,
      light: colors.secondary.light,
      dark: colors.secondary.dark,
      contrastText: colors.secondary.contrastText,
    },
    error: {
      main: colors.error.main,
      light: colors.error.light,
    },
    warning: {
      main: colors.warning.main,
      dark: colors.warning.dark,
    },
    success: {
      main: colors.success.main,
      light: colors.success.light,
    },
    info: {
      main: colors.info.main,
      light: colors.info.light,
    },
    grey: colors.grey,
    text: {
      primary: colors.text.primary,
      secondary: colors.text.secondary,
      disabled: colors.text.disabled,
    },
    background: {
      default: colors.background.default,
      paper: colors.background.paper,
    },
    divider: colors.common.border,
    action: {
      active: colors.primary.main,
      hover: colors.grey[100],
      selected: colors.primary.light,
      disabled: colors.grey[400],
      disabledBackground: colors.grey[200],
    },
  },

  // ==========================================
  // COMPONENT OVERRIDES
  // ==========================================
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 8,
          textTransform: 'none',
          fontWeight: 500,
        },
        contained: {
          '&:hover': {
            boxShadow: 'none',
          },
        },
        containedPrimary: {
          backgroundColor: colors.primary.main,
          '&:hover': {
            backgroundColor: colors.primary.dark,
          },
        },
        containedSecondary: {
          backgroundColor: colors.secondary.main,
          '&:hover': {
            backgroundColor: colors.secondary.dark,
          },
        },
        outlinedPrimary: {
          borderColor: colors.primary.main,
          color: colors.primary.main,
          '&:hover': {
            backgroundColor: colors.primary.light + '20',
            borderColor: colors.primary.dark,
          },
        },
        outlinedSecondary: {
          borderColor: colors.secondary.main,
          color: colors.secondary.main,
          '&:hover': {
            backgroundColor: colors.secondary.light + '20',
            borderColor: colors.secondary.dark,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          color: colors.text.secondary,
          '&:hover': {
            backgroundColor: colors.grey[100],
          },
        },
        colorPrimary: {
          color: colors.primary.main,
          '&:hover': {
            backgroundColor: colors.primary.light + '20',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          boxShadow: `0 1px 3px ${colors.common.shadow}`,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 6,
        },
        colorPrimary: {
          backgroundColor: colors.primary.main,
          color: colors.primary.contrastText,
        },
        colorSecondary: {
          backgroundColor: colors.secondary.main,
          color: colors.secondary.contrastText,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 8,
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: colors.primary.main,
            },
          },
          '& .MuiInputLabel-root.Mui-focused': {
            color: colors.primary.main,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiLink: {
      styleOverrides: {
        root: {
          color: colors.primary.main,
          '&:hover': {
            color: colors.primary.dark,
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          backgroundColor: colors.primary.main,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          '&.Mui-selected': {
            color: colors.primary.main,
          },
        },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: colors.grey[500],
          '&.Mui-checked': {
            color: colors.primary.main,
          },
        },
      },
    },
    MuiRadio: {
      styleOverrides: {
        root: {
          color: colors.grey[500],
          '&.Mui-checked': {
            color: colors.primary.main,
          },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked': {
            color: colors.primary.main,
            '& + .MuiSwitch-track': {
              backgroundColor: colors.primary.main,
            },
          },
        },
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        root: {
          color: colors.primary.main,
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          backgroundColor: colors.grey[200],
        },
        bar: {
          backgroundColor: colors.primary.main,
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: colors.primary.main,
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: colors.background.paper,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 12,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: colors.grey[800],
          color: colors.common.white,
          fontSize: '0.75rem',
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          boxShadow: 'none',
          '&:before': {
            display: 'none',
          },
          '&.Mui-expanded': {
            margin: 0,
          },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: colors.common.divider,
        },
      },
    },
  },

  // ==========================================
  // SHAPE
  // ==========================================
  shape: { borderRadius: 8 },
};

/**
 * Main application theme
 */
export const theme = createTheme(themeOptions);

export type AppTheme = typeof theme;

export default theme;
