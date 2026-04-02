'use client';
import React, { useEffect } from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Link from 'next/link';
import { Box, Typography, IconButton, Tooltip } from '@mui/material';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { LogoArchive } from '@/app/assets/svg/LogoArchive';
import { CarouselTopBar } from '../CarouselTopBar/CarouselTopBar';
import useLayoutState from '@/app/stores/useLayout';
import { usePathname, useSearchParams } from 'next/navigation';
import { config, organizationConfig, isChatEnabled } from '@/config/organizationConfig';
import { useSemanticSearchStore } from '@/app/stores/useSemanticSearchStore';
import { colors } from '@/lib/theme';

export interface NavLink {
  name: string;
  href: string;
  icon?: React.ReactElement;
}

export const AppTopBar = () => {
  const { setTopBarCollapsedAuto, setTopBarCollapsedManual, resetTopBarPreference, isTopBarCollapsed } =
    useLayoutState();
  const { collections, loadCollections } = useSemanticSearchStore();

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get('embed') === 'true';

  if (isEmbed) return null;
  const isStoryPage = pathname.startsWith('/story/');
  const isChatPage = pathname.startsWith('/discover');
  const isIndexPage = pathname.startsWith('/indexes');
  const isFullScreenPage = isStoryPage || isChatPage;
  const isAutoCollapsePage = isStoryPage || isChatPage || isIndexPage;
  const isHeaderOverlayEnabled = config?.ui?.portalHeaderOverlay?.enabled ?? true;
  const organizationLogoPath = config.organization.logo?.path?.trim();
  const shouldUseCustomLogo = Boolean(organizationLogoPath);
  const logoAlt = config.organization.logo?.alt?.trim() || `${config.organization.displayName} logo`;

  const handleTopBarCollapseToggle = () => {
    setTopBarCollapsedManual(!isTopBarCollapsed);
  };

  useEffect(() => {
    resetTopBarPreference();
  }, [pathname, resetTopBarPreference]);

  useEffect(() => {
    if (isAutoCollapsePage) {
      setTopBarCollapsedAuto(true);
      return;
    }
    setTopBarCollapsedAuto(false);
  }, [isAutoCollapsePage, setTopBarCollapsedAuto]);

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
              <Box
                sx={{
                  display: { xs: 'flex', md: 'none' },
                  alignItems: 'center',
                  gap: 1,
                  '& a': {
                    color: config.theme.colors.primary.contrastText,
                    textDecoration: 'none',
                    fontSize: '11px',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    minHeight: 0,
                    opacity: 0.85,
                    transition: 'opacity 0.15s',
                    '&:hover': { opacity: 1 },
                  },
                }}>
                <Link href="/">RECORDINGS</Link>
                <Link href="/indexes">INDEXES</Link>
                {shouldShowCollectionsLink && <Link href="/collections">COLLECTIONS</Link>}
                {!isFullScreenPage && (
                  <Tooltip title={isTopBarCollapsed ? 'Expand' : 'Collapse'}>
                    <IconButton
                      onClick={handleTopBarCollapseToggle}
                      size="small"
                      aria-label={isTopBarCollapsed ? 'Expand banner' : 'Collapse banner'}
                      sx={{
                        color: config.theme.colors.primary.contrastText,
                        bgcolor: 'transparent',
                        border: `1.5px solid ${config.theme.colors.primary.contrastText}`,
                        width: 30,
                        height: 30,
                        '&:hover': {
                          color: config.theme.colors.primary.main,
                          borderColor: config.theme.colors.primary.main,
                          bgcolor: 'action.hover',
                        },
                      }}>
                      {isTopBarCollapsed ? <KeyboardArrowDownIcon /> : <KeyboardArrowUpIcon />}
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
              <Box
                sx={{
                  display: { xs: 'none', md: 'flex' },
                  alignItems: 'center',
                  gap: 3,
                  '& a': {
                    color: config.theme.colors.primary.contrastText,
                    textDecoration: 'none',
                    fontSize: '12px',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    opacity: 0.85,
                    transition: 'opacity 0.15s',
                    '&:hover': { opacity: 1 },
                  },
                }}>
                <Link href="/">RECORDINGS</Link>
                <Link href="/indexes">INDEXES</Link>
                {shouldShowCollectionsLink && <Link href="/collections">COLLECTIONS</Link>}
                {isChatEnabled && (
                  <Box
                    component={Link}
                    href="/discover"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      border: `1.5px solid ${config.theme.colors.primary.contrastText}`,
                      borderRadius: '6px',
                      padding: '4px 12px',
                      opacity: '0.85 !important',
                      '&:hover': { opacity: '1 !important', bgcolor: 'rgba(255,255,255,0.1)' },
                    }}>
                    <AutoAwesomeIcon sx={{ fontSize: 16 }} />
                    DISCOVER
                  </Box>
                )}
              </Box>
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
              {!isFullScreenPage && (
                <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center' }}>
                  <Tooltip title={isTopBarCollapsed ? 'Expand' : 'Collapse'}>
                    <IconButton
                      onClick={handleTopBarCollapseToggle}
                      size="small"
                      aria-label={isTopBarCollapsed ? 'Expand' : 'Collapse'}
                      sx={{
                        color: config.theme.colors.primary.contrastText,
                        bgcolor: 'transparent',
                        border: `1.5px solid ${config.theme.colors.primary.contrastText}`,
                        width: 30,
                        height: 30,
                        '&:hover': {
                          color: config.theme.colors.primary.main,
                          borderColor: config.theme.colors.primary.main,
                          bgcolor: 'action.hover',
                        },
                      }}>
                      {isTopBarCollapsed ? <KeyboardArrowDownIcon /> : <KeyboardArrowUpIcon />}
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
            </Box>
          </Box>
          <Box
            id="top-bar-info"
            display="flex"
            justifyContent="space-between"
            alignItems="flex-end"
            aria-hidden={isTopBarCollapsed}
            sx={{
              maxHeight: isTopBarCollapsed ? 0 : { xs: 220, md: 260 },
              opacity: isTopBarCollapsed ? 0 : 1,
              transform: isTopBarCollapsed ? 'translateY(-10px)' : 'translateY(0)',
              overflow: 'hidden',
              pointerEvents: isTopBarCollapsed ? 'none' : 'auto',
              transition: 'max-height 0.65s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.35s ease, transform 0.45s ease',
            }}>
            <Box
              sx={
                isHeaderOverlayEnabled
                  ? {
                      display: 'inline-flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      width: 'fit-content',
                      maxWidth: 'min(100%, 980px)',
                      backgroundColor: colors.common.overlay,
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
                  fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' },
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
        </CarouselTopBar>
      </Toolbar>
    </AppBar>
  );
};
