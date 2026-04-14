import { Box } from '@mui/material';
import React, { useEffect, useMemo, useState } from 'react';
import { colors } from '@/lib/theme';
import { config } from '@/config/organizationConfig';

export const CarouselTopBar = ({ children, isCollapsed }: { children: React.ReactNode; isCollapsed: boolean }) => {
  const [carouselIndex, setCarouselIndex] = useState(0);
  const collapsedHeight = { xs: 72, md: 88 };
  const expandedHeight = { xs: '25vh', md: '30vh' };

  const { images: configImages = [], intervalMs = 5000, backgroundColor } = config?.ui?.carouselTopBar ?? {};

  const carouselImages = useMemo(() => {
    return configImages.length > 0 ? configImages : [];
  }, [configImages]);

  useEffect(() => {
    if (isCollapsed) return;
    if (carouselImages.length <= 1) return;

    const interval = setInterval(() => {
      setCarouselIndex((prev) => (prev + 1) % carouselImages.length);
    }, intervalMs);

    return () => clearInterval(interval);
  }, [carouselImages, intervalMs, isCollapsed]);

  useEffect(() => {
    if (carouselIndex >= carouselImages.length) setCarouselIndex(0);
  }, [carouselIndex, carouselImages.length]);

  return (
    <Box
      id="background-box"
      display="flex"
      flexDirection="column"
      gap={2}
      py={isCollapsed ? { xs: 1, md: 1.5 } : 3}
      px={{ xs: 2, md: 3 }}
      borderRadius="0px 0px 8px 8px"
      width="100%"
      position="relative"
      height={isCollapsed ? collapsedHeight : expandedHeight}
      sx={{
        backgroundColor: backgroundColor || colors.common.black,
        backgroundImage: carouselImages.length > 0 ? `url("${carouselImages[carouselIndex]}")` : 'none',
        backgroundSize: '100%',
        backgroundRepeat: 'no-repeat',
        transition: `${isCollapsed ? 'background 0s linear,' : 'background 0.8s ease-in-out,'} height 0.65s cubic-bezier(0.22, 1, 0.36, 1), padding 0.65s cubic-bezier(0.22, 1, 0.36, 1)`,
        backgroundPosition: '50% 20%',
        overflow: 'hidden',
        '&::after': {
          content: '""',
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: '100%',
          height: isCollapsed ? '100%' : '50%',
          pointerEvents: 'none',
          background: colors.gradients.overlay,
          backdropFilter: 'blur(2px)',
          zIndex: 1,
          transition: 'height 0.65s cubic-bezier(0.22, 1, 0.36, 1)',
        },
      }}>
      <Box
        height="100%"
        display="flex"
        flexDirection="column"
        justifyContent="space-between"
        sx={{ position: 'relative', zIndex: 2 }}>
        {children}
      </Box>
    </Box>
  );
};
