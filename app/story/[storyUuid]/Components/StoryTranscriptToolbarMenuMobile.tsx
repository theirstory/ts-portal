import MoreVertIcon from '@mui/icons-material/MoreVert';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import { Menu, MenuItem, ListItemText, IconButton } from '@mui/material';
import { useState } from 'react';
import { SearchTypeSelector } from './StoryTranscriptToolbarSearchTypeSelector';
import { StoryTranscriptToolbarFilterMenu } from './StoryTranscriptToolbarFilterMenu';
import { StorySettings } from './StorySettings';
import { StoryTranscriptToolbarNerToggle } from './StoryTranscriptToolbarNerToggle';
import SubjectIcon from '@mui/icons-material/Subject';

interface StoryTranscriptToolbarMenuMobileProps {
  toggleAllSections: () => void;
  onCiteClick?: () => void;
}

export const StoryTranscriptToolbarMenuMobile = ({ toggleAllSections, onCiteClick }: StoryTranscriptToolbarMenuMobileProps) => {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  return (
    <>
      <IconButton size="small" onClick={(e) => setAnchorEl(e.currentTarget)}>
        <MoreVertIcon fontSize="small" />
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        disableAutoFocusItem
        sx={{ mt: 1 }}>
        <MenuItem disableRipple sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ListItemText primary="Search type" />
          <SearchTypeSelector />
        </MenuItem>

        <MenuItem disableRipple sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ListItemText primary="Filters" />
          <StoryTranscriptToolbarFilterMenu />
        </MenuItem>

        <MenuItem disableRipple sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ListItemText primary="NER labels" />
          <StoryTranscriptToolbarNerToggle />
        </MenuItem>

        <MenuItem
          disableRipple
          onClick={() => {
            toggleAllSections();
            setAnchorEl(null);
          }}
          sx={{ display: 'flex', alignItems: 'center' }}>
          <ListItemText primary="Toggle sections" />
          <IconButton size="small" disableRipple sx={{ ml: 'auto', p: 0.5 }}>
            <SubjectIcon fontSize="small" />
          </IconButton>
        </MenuItem>

        {onCiteClick && (
          <MenuItem
            disableRipple
            onClick={() => {
              onCiteClick();
              setAnchorEl(null);
            }}
            sx={{ display: 'flex', alignItems: 'center' }}>
            <ListItemText primary="Cite (Chicago style)" />
            <IconButton size="small" disableRipple sx={{ ml: 'auto', p: 0.5 }}>
              <FormatQuoteIcon fontSize="small" />
            </IconButton>
          </MenuItem>
        )}
        <MenuItem disableRipple sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <ListItemText primary="Search settings" />
          <StorySettings />
        </MenuItem>
      </Menu>
    </>
  );
};
