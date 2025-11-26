import { Chip } from '@mui/material';
import { PositionTag } from '../types/api';

interface TagChipProps {
  tag: PositionTag;
  onDelete?: () => void;
  size?: 'small' | 'medium';
}

export default function TagChip({ tag, onDelete, size = 'small' }: TagChipProps) {
  return (
    <Chip
      label={tag.name}
      size={size}
      onDelete={onDelete}
      sx={{
        backgroundColor: `${tag.color}22`,
        color: tag.color,
        border: `1px solid ${tag.color}`,
        fontWeight: 600,
        '& .MuiChip-deleteIcon': {
          color: tag.color,
          opacity: 0.7,
          '&:hover': { opacity: 1 },
        },
      }}
    />
  );
}