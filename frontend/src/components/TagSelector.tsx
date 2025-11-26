import React, { useState, useEffect } from 'react';
import {
  Autocomplete,
  TextField,
  Chip,
  Box,
  createFilterOptions,
} from '@mui/material';
import api from '../services/apiConfig';
import { PositionTag } from '../types/api';

interface TagSelectorProps {
  selectedTags: PositionTag[];
  onChange: (tags: PositionTag[]) => void;
}

const filter = createFilterOptions<PositionTag>();

export default function TagSelector({ selectedTags, onChange }: TagSelectorProps) {
  const [availableTags, setAvailableTags] = useState<PositionTag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/tags/tags/')
      .then(res => {
        setAvailableTags(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleCreateTag = async (name: string) => {
    const res = await api.post('/api/tags/tags/', { name, color: '#1976d2' });
    const newTag = res.data;
    setAvailableTags(prev => [...prev, newTag]);
    return newTag;
  };

  return (
    <Autocomplete
      multiple
      freeSolo
      loading={loading}
      options={availableTags}
      value={selectedTags}
      onChange={async (_e, newValue) => {
        const last = newValue[newValue.length - 1];
        if (typeof last === 'string' && last.trim()) {
          const created = await handleCreateTag(last.trim());
          onChange([...selectedTags, created]);
        } else {
          onChange(newValue.filter((v): v is PositionTag => typeof v !== 'string'));
        }
      }}
      filterOptions={(options, params) => {
        const filtered = filter(options, params);
        const { inputValue } = params;
        if (inputValue && inputValue.trim()) {
          const exists = availableTags.some(t => t.name.toLowerCase() === inputValue.trim().toLowerCase());
          if (!exists) {
            filtered.push({
              id: -Date.now(),
              name: inputValue.trim(),
              color: '#1976d2',
            } as PositionTag);
          }
        }
        return filtered;
      }}
      getOptionLabel={(option) => typeof option === 'string' ? option : option.name}
      isOptionEqualToValue={(o, v) => o.id === v.id}
      renderTags={(tags) => 
        tags.map(tag => (
          <Chip
            key={typeof tag === 'string' ? tag : tag.id}
            label={typeof tag === 'string' ? tag : tag.name}
            size="small"
            sx={{
              backgroundColor: typeof tag === 'object' ? tag.color : '#1976d2',
              color: 'white',
            }}
          />
        ))
      }
      renderInput={(params) => (
        <TextField {...params} label="Tags" placeholder="Add tags..." />
      )}
      renderOption={(props, option) => {
        const isNew = typeof option !== 'string' && option.id < 0;
        return (
          <Box component="li" {...props} key={typeof option === 'string' ? option : option.id}>
            {isNew ? `Add "${typeof option === 'string' ? option : option.name}"` : (typeof option === 'string' ? option : option.name)}
          </Box>
        );
      }}
    />
  );
}