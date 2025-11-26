import React from 'react';
import {
  Autocomplete,
  TextField,
  createFilterOptions,
  Box,
} from '@mui/material';
import {
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import api from '../services/apiConfig';
import TagChip from './TagChip';
import { PositionTag } from '../types/api';

interface TagSelectorProps {
  selectedTags: PositionTag[];
  onChange: (tags: PositionTag[]) => void;
}

const filter = createFilterOptions<PositionTag>();

export default function TagSelector({ selectedTags, onChange }: TagSelectorProps) {
  const queryClient = useQueryClient();

  const { data: availableTags = [] } = useQuery<PositionTag[]>({
    queryKey: ['tags'],
    queryFn: async () => {
      const res = await api.get('/tags');
      return res.data;
    },
  });

  const createTagMutation = useMutation({
    mutationFn: async (name: string): Promise<PositionTag> => {
      const res = await api.post('/tags', { name, color: '#1976d2' });
      return res.data;
    },
    onSuccess: (newTag) => {
      queryClient.setQueryData<PositionTag[]>(['tags'], (old = []) => [...old, newTag]);
    },
  });

  return (
    <Autocomplete
      multiple
      freeSolo
      options={availableTags}
      value={selectedTags}
      onChange={async (_event, newValue) => {
        const last = newValue[newValue.length - 1];

        if (typeof last === 'string' && last.trim()) {
          const created = await createTagMutation.mutateAsync(last.trim());
          onChange([...selectedTags, created]);
        } else {
          onChange(newValue.filter((v): v is PositionTag => typeof v !== 'string'));
        }
      }}
      filterOptions={(options, params) => {
        const filtered = filter(options, params);
        const { inputValue } = params;

        if (inputValue && inputValue.trim()) {
          const exists = availableTags.some(
            (t) => t.name.toLowerCase() === inputValue.trim().toLowerCase()
          );
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
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
      isOptionEqualToValue={(option, value) => option.id === value.id}
      renderTags={(tags, getTagProps) =>
        tags.map((tag, index) => {
          const { key, ...tagProps } = getTagProps({ index });
          return (
            <TagChip
              key={typeof tag === 'string' ? tag : tag.id}
              tag={tag as PositionTag}
              onDelete={tagProps.onDelete as () => void}
            />
          );
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label="Tags"
          placeholder="Type to add or create tags..."
          variant="outlined"
        />
      )}
      renderOption={(props, option) => {
        const isNew = typeof option !== 'string' && option.id < 0;
        return (
          <Box component="li" {...props} key={typeof option === 'string' ? option : option.id}>
            {isNew ? (
              <em style={{ color: '#666' }}>Add "{typeof option === 'string' ? option : option.name}"</em>
            ) : (
              <TagChip tag={option as PositionTag} size="small" />
            )}
          </Box>
        );
      }}
    />
  );
}