'use client';
import React, { useEffect } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Link from 'next/link';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { LogoArchive } from '@/app/assets/svg/LogoArchive';
import { CarouselTopBar } from '../CarouselTopBar/CarouselTopBar';
import useLayoutState from '@/app/stores/useLayout';
import { usePathname } from 'next/navigation';
import { config, organizationConfig } from '@/config/organizationConfig';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';

export interface NavLink {
  name: string;
  href: string;
  icon?: React.ReactElement;
}

export const AppTopBar = () => {
  const { setIsTopBarCollapsed, isTopBarCollapsed } = useLayoutState();
  const { collections, loadCollections } = useSemanticSearchStore();

  const pathname = usePathname();
  const isStoryPage = pathname.startsWith('/story/');
  const isHeaderOverlayEnabled = config?.ui?.portalHeaderOverlay?.enabled ?? true;
  const organizationLogoPath = config.organization.logo?.path?.trim();
  const shouldUseCustomLogo = Boolean(organizationLogoPath);
  const logoAlt = config.organization.logo?.alt?.trim() || `${config.organization.displayName} logo`;

  const handleTopBarCollapseToggle = () => {
    setIsTopBarCollapsed(!isTopBarCollapsed);
  };

  useEffect(() => {
    if (isStoryPage) {
      setIsTopBarCollapsed(true);
      return;
    }
    setIsTopBarCollapsed(false);
  }, [isStoryPage, setIsTopBarCollapsed]);

  useEffect(() => {
    if (collections.length === 0) {
      loadCollections();
    }
  }, [collections.length, loadCollections]);

  const shouldShowCollectionsLink = collections.length > 1;

  return (
    <AppBar
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        boxShadow: 'none',
        backgroundColor: 'transparent',
      }}
      elevation={0}>
      <Toolbar
        disableGutters
        sx={{
          justifyContent: 'space-between',
          backgroundColor: 'transparent',
          boxShadow: 'none',
          paddingLeft: 0,
          paddingRight: 0,
        }}>
        <CarouselTopBar isCollapsed={isTopBarCollapsed}>
          <Box display="flex" justifyContent="space-between">
            <Link
              href="/"
              style={{ textDecoration: 'none', cursor: 'pointer' }}
              onClick={(e) => {
                e.preventDefault();
                window.location.href = '/';
              }}>
              <Box sx={{ display: 'flex', alignItems: 'center', height: 40 }}>
                {shouldUseCustomLogo ? (
                  <Box
                    component="img"
                    src={organizationLogoPath}
                    alt={logoAlt}
                    sx={{ maxHeight: 40, maxWidth: { xs: 140, md: 220 }, width: 'auto', objectFit: 'contain' }}
                  />
                ) : (
                  <LogoArchive
                    color={config.theme.colors.primary.contrastText}
                    text={config.organization.displayName}
                  />
                )}
              </Box>
            </Link>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1 }}>
                <Link
                  href="/"
                  style={{
                    color: config.theme.colors.primary.contrastText,
                    textDecoration: 'none',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    minHeight: 0,
                  }}>
                  RECORDINGS
                </Link>
                {shouldShowCollectionsLink && (
                  <Link
                    href="/collections"
                    style={{
                      color: config.theme.colors.primary.contrastText,
                      textDecoration: 'none',
                      fontSize: '11px',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      minHeight: 0,
                    }}>
                    COLLECTIONS
                  </Link>
                )}
                {!isStoryPage && (
                  <Tooltip title={isTopBarCollapsed ? 'Expand' : 'Collapse'}>
                    <IconButton
                      onClick={handleTopBarCollapseToggle}
                      size="small"
                      aria-label={isTopBarCollapsed ? 'Expand banner' : 'Collapse banner'}
                      sx={{ color: config.theme.colors.primary.main }}>
                      {isTopBarCollapsed ? <KeyboardArrowDownIcon /> : <KeyboardArrowUpIcon />}
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
              {!isStoryPage && (
                <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center' }}>
                  <Tooltip title={isTopBarCollapsed ? 'Expand' : 'Collapse'}>
                    <IconButton
                      onClick={handleTopBarCollapseToggle}
                      size="small"
                      aria-label={isTopBarCollapsed ? 'Expand' : 'Collapse'}
                      sx={{ color: config.theme.colors.primary.main }}>
                      {isTopBarCollapsed ? <KeyboardArrowDownIcon /> : <KeyboardArrowUpIcon />}
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
              <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                <Link
                  href="/"
                  style={{
                    color: config.theme.colors.primary.contrastText,
                    textDecoration: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                  }}>
                  RECORDINGS
                </Link>
              </Box>
              {shouldShowCollectionsLink && (
                <Box sx={{ display: { xs: 'none', md: 'block' } }}>
                  <Link
                    href="/collections"
                    style={{
                      color: config.theme.colors.primary.contrastText,
                      textDecoration: 'none',
                      fontSize: '12px',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                    }}>
                    COLLECTIONS
                  </Link>
                </Box>
              )}
              <Typography
                variant="caption"
                color={config.theme.colors.primary.contrastText}
                sx={{
                  fontWeight: 500,
                  display: { xs: 'none', md: 'block' },
                }}>
                Powered by{' '}
                <a
                  href="https://theirstory.io/welcome"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'inherit', textDecoration: 'underline' }}>
                  TheirStory
                </a>
              </Typography>
            </Box>
          </Box>
          {!isTopBarCollapsed && (
            <Box id="top-bar-info" display="flex" justifyContent="space-between" alignItems="flex-end">
              <Box
                sx={
                  isHeaderOverlayEnabled
                    ? {
                        display: 'inline-flex',
                        flexDirection: 'column',
                        alignItems: 'flex-start',
                        width: 'fit-content',
                        maxWidth: 'min(100%, 980px)',
                        backgroundColor: 'rgba(0, 0, 0, 0.35)',
                        backdropFilter: 'blur(2px)',
                        borderRadius: '8px',
                        px: '14px',
                        py: '10px',
                      }
                    : undefined
                }>
                <Typography
                  variant="h4"
                  fontWeight={700}
                  color={config.theme.colors.primary.contrastText}
                  sx={{
                    mb: 1,
                    fontSize: { xs: '1.75rem', sm: '2rem', md: '2.125rem' },
                    lineHeight: { xs: 1.2, md: 1.167 },
                  }}>
                  {organizationConfig.displayName}
                </Typography>
                <Typography
                  variant="body1"
                  color={config.theme.colors.primary.contrastText}
                  sx={{
                    maxWidth: 700,
                    fontSize: { xs: '0.875rem', md: '1rem' },
                    lineHeight: { xs: 1.4, md: 1.5 },
                  }}>
                  {organizationConfig.description}
                </Typography>
              </Box>
              <Typography
                fontSize="11px"
                fontWeight={500}
                variant="body1"
                color={config.theme.colors.primary.contrastText}
                sx={{ display: { xs: 'none', md: 'block' }, ml: 2 }}>
                {organizationConfig.name}
              </Typography>
            </Box>
          )}
        </CarouselTopBar>
      </Toolbar>
    </AppBar>
  );
};
