'use client';

import { SvgIcon, SvgIconProps } from '@mui/material';

interface ZoteroIconProps extends SvgIconProps {
  size?: number;
}

export const ZoteroIcon = ({ size = 24, ...props }: ZoteroIconProps) => (
  <SvgIcon {...props} sx={{ width: size, height: size, ...props.sx }}>
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M21.231 2H16.07l-5.08 7.18L5.93 2H2.769l-.439.62v.82l8.19 11.56H4.389l-.439.62v.82L4.389 16h5.4l5.021-7.1L19.831 16h3.169l.439-.62v-.82L15.249 3h6.421l.439-.62V2.38L21.231 2z" />
    </svg>
  </SvgIcon>
);
