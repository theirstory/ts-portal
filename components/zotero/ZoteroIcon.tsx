'use client';

import { Box, BoxProps } from '@mui/material';

interface ZoteroIconProps extends Omit<BoxProps, 'component'> {
  size?: number;
}

export const ZoteroIcon = ({ size = 24, ...props }: ZoteroIconProps) => (
  <Box
    component="img"
    src="/images/zotero-icon.png"
    alt="Zotero"
    {...props}
    sx={{
      width: size,
      height: size,
      objectFit: 'contain',
      display: 'inline-block',
      verticalAlign: 'middle',
      ...props.sx,
    }}
  />
);
