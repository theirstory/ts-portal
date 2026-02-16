'use client';
import { Typography, Box } from '@mui/material';
import { useState } from 'react';

interface ExpandableTextProps {
  text: string;
  maxLines: number;
  sxBox?: React.CSSProperties;
  sxTypography?: React.CSSProperties;
}

const ExpandableText = ({ text, maxLines, sxBox, sxTypography }: ExpandableTextProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <Box display="inline" sx={sxBox} onClick={handleToggle}>
      <Typography
        aria-label={text}
        display="inline"
        sx={{
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: isExpanded ? 'none' : maxLines,
          WebkitBoxOrient: 'vertical',
          ...sxTypography,
        }}>
        {text}
      </Typography>
    </Box>
  );
};

export default ExpandableText;
