import React from 'react';

interface LogoArchiveProps extends React.SVGProps<SVGSVGElement> {
  width?: string;
  height?: string;
  color?: string;
  text?: string;
}

/**
 * Generic Archive Logo
 * A simple, professional archive/research portal icon
 */
export const LogoArchive: React.FC<LogoArchiveProps> = ({
  width = '180',
  height = '28',
  color = 'white',
  text = 'ARCHIVE',
  ...props
}) => (
  <svg width={width} height={height} viewBox="0 0 180 28" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
    {/* Book/Archive Icon */}
    <rect x="2" y="4" width="20" height="20" rx="2" stroke={color} strokeWidth="2" fill="none" />
    <line x1="12" y1="4" x2="12" y2="24" stroke={color} strokeWidth="2" />
    <line x1="6" y1="9" x2="10" y2="9" stroke={color} strokeWidth="1.5" />
    <line x1="6" y1="13" x2="10" y2="13" stroke={color} strokeWidth="1.5" />
    <line x1="14" y1="9" x2="18" y2="9" stroke={color} strokeWidth="1.5" />
    <line x1="14" y1="13" x2="18" y2="13" stroke={color} strokeWidth="1.5" />
    <line x1="14" y1="17" x2="18" y2="17" stroke={color} strokeWidth="1.5" />

    <text x="28" y="19" fontFamily="Inter, system-ui, sans-serif" fontSize="14" fontWeight="600" fill={color}>
      {text}
    </text>
  </svg>
);
