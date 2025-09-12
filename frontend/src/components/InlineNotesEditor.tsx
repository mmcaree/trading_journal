import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  TextField,
  Typography,
  IconButton,
  Button,
  Card,
  CardMedia,
  Grid,
  Dialog,
  DialogContent,
  DialogActions,
  DialogTitle,
  CircularProgress,
  Alert,
  Fab,
  Tooltip,
  Divider
} from '@mui/material';
import {
  PhotoCamera,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Close as CloseIcon,
  CloudUpload as CloudUploadIcon,
  ContentPaste as ContentPasteIcon,
  Screenshot as ScreenshotIcon
} from '@mui/icons-material';

interface InlineNotesEditorProps {
  tradeId: number;
  initialNotes: string;
  imageUrls?: string[];
  onNotesUpdate: (notes: string) => void;
  onImagesUpdate?: (imageUrls: string[]) => void;
}

const InlineNotesEditor: React.FC<InlineNotesEditorProps> = ({
  tradeId,
  initialNotes,
  imageUrls = [],
  onNotesUpdate,
  onImagesUpdate
}) => {
  const [notes, setNotes] = useState(initialNotes);
  const [isEditing, setIsEditing] = useState(false);
  const [images, setImages] = useState<string[]>(imageUrls);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showPasteHint, setShowPasteHint] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notesContainerRef = useRef<HTMLDivElement>(null);

  // Add clipboard paste listener
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      // Only handle paste when focused on our component area
      if (!notesContainerRef.current?.contains(event.target as Node)) {
        return;
      }

      const items = event.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          event.preventDefault();
          const file = item.getAsFile();
          if (file) {
            await handleImageFile(file, 'clipboard');
          }
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [images]);

  const handleImageFile = async (file: File, source: 'upload' | 'clipboard') => {
    setIsUploading(true);
    setUploadError(null);

    try {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setUploadError('Please select only image files');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setUploadError('Image file size must be less than 5MB');
        return;
      }

      // Create a more descriptive filename for clipboard images
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = source === 'clipboard' 
        ? `screenshot-${timestamp}.png`
        : file.name;

      // For now, create a local URL for preview
      // TODO: Replace with actual upload to server/cloud storage
      const imageUrl = URL.createObjectURL(file);
      const newImages = [...images, imageUrl];
      setImages(newImages);
      
      if (onImagesUpdate) {
        onImagesUpdate(newImages);
      }

      // Show success message for clipboard pastes
      if (source === 'clipboard') {
        console.log('Screenshot pasted successfully');
      }
    } catch (error) {
      console.error('Error processing image:', error);
      setUploadError('Failed to process image. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      // TODO: Replace with actual API call to update trade notes
      console.log('Saving notes for trade', tradeId, ':', notes);
      onNotesUpdate(notes);
      setIsEditing(false);
    } catch (error) {
      console.error('Error saving notes:', error);
    }
  };

  const handleCancelEdit = () => {
    setNotes(initialNotes);
    setIsEditing(false);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      await handleImageFile(file, 'upload');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read();
      
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const file = new File([blob], `screenshot-${Date.now()}.png`, { type });
            await handleImageFile(file, 'clipboard');
            return;
          }
        }
      }
      
      setUploadError('No image found in clipboard');
    } catch (error) {
      console.error('Error accessing clipboard:', error);
      setUploadError('Unable to access clipboard. Try using Ctrl+V instead.');
    }
  };

  const handleDeleteImage = (indexToDelete: number) => {
    const newImages = images.filter((_, index) => index !== indexToDelete);
    setImages(newImages);
    
    if (onImagesUpdate) {
      onImagesUpdate(newImages);
    }
  };

  const handleImageClick = (imageUrl: string) => {
    setSelectedImage(imageUrl);
  };

  const closeImageDialog = () => {
    setSelectedImage(null);
  };

  return (
    <Box ref={notesContainerRef}>
      {/* Notes Section */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Trade Notes
          </Typography>
          {!isEditing && (
            <IconButton onClick={() => setIsEditing(true)} size="small">
              <EditIcon />
            </IconButton>
          )}
        </Box>

        {isEditing ? (
          <Box>
            <TextField
              fullWidth
              multiline
              minRows={4}
              maxRows={12}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add your trade notes here... You can include your analysis, reasoning, lessons learned, etc."
              variant="outlined"
              sx={{ mb: 2 }}
            />
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                variant="contained"
                startIcon={<SaveIcon />}
                onClick={handleSaveNotes}
                size="small"
              >
                Save
              </Button>
              <Button
                variant="outlined"
                onClick={handleCancelEdit}
                size="small"
              >
                Cancel
              </Button>
            </Box>
          </Box>
        ) : (
          <Box
            onClick={() => setIsEditing(true)}
            sx={{
              minHeight: '100px',
              padding: 2,
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              cursor: 'text',
              '&:hover': {
                borderColor: 'primary.main',
                backgroundColor: 'action.hover'
              }
            }}
          >
            <Typography 
              variant="body1" 
              whiteSpace="pre-wrap"
              color={notes ? 'textPrimary' : 'textSecondary'}
            >
              {notes || 'Click to add trade notes...'}
            </Typography>
          </Box>
        )}
      </Box>

      {/* Images Section */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            Trade Images
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              multiple
              style={{ display: 'none' }}
            />
            <Tooltip title="Upload from Files">
              <IconButton 
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                size="small"
              >
                {isUploading ? <CircularProgress size={20} /> : <PhotoCamera />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Paste from Clipboard (Ctrl+V)">
              <IconButton 
                onClick={handlePasteFromClipboard}
                disabled={isUploading}
                size="small"
                color="primary"
              >
                <ContentPasteIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {uploadError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setUploadError(null)}>
            {uploadError}
          </Alert>
        )}

        {/* Paste Instructions */}
        <Alert severity="info" sx={{ mb: 2 }}>
          <Typography variant="body2">
            <strong>💡 Pro Tip:</strong> Take a screenshot (Windows Key + Shift + S) then paste it here with <strong>Ctrl+V</strong>, 
            or click the paste button above. No need to save files to your PC!
          </Typography>
        </Alert>

        {images.length > 0 ? (
          <Grid container spacing={2}>
            {images.map((imageUrl, index) => (
              <Grid item xs={12} sm={6} md={4} key={index}>
                <Card 
                  sx={{ 
                    position: 'relative',
                    '&:hover .delete-button': {
                      opacity: 1
                    }
                  }}
                >
                  <CardMedia
                    component="img"
                    height="200"
                    image={imageUrl}
                    alt={`Trade image ${index + 1}`}
                    sx={{ cursor: 'pointer' }}
                    onClick={() => handleImageClick(imageUrl)}
                  />
                  <IconButton
                    className="delete-button"
                    onClick={() => handleDeleteImage(index)}
                    sx={{
                      position: 'absolute',
                      top: 8,
                      right: 8,
                      opacity: 0,
                      transition: 'opacity 0.2s',
                      backgroundColor: 'rgba(0,0,0,0.6)',
                      color: 'white',
                      '&:hover': {
                        backgroundColor: 'rgba(0,0,0,0.8)'
                      }
                    }}
                    size="small"
                  >
                    <DeleteIcon />
                  </IconButton>
                </Card>
              </Grid>
            ))}
          </Grid>
        ) : (
          <Box
            onClick={() => fileInputRef.current?.click()}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '150px',
              border: '2px dashed',
              borderColor: 'divider',
              borderRadius: 1,
              cursor: 'pointer',
              '&:hover': {
                borderColor: 'primary.main',
                backgroundColor: 'action.hover'
              }
            }}
          >
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
              <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary' }} />
              <ScreenshotIcon sx={{ fontSize: 48, color: 'primary.main' }} />
            </Box>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 1 }}>
              Click to upload files or paste screenshots
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              Supports JPG, PNG, GIF (max 5MB each)<br />
              Use <strong>Windows Key + Shift + S</strong> then <strong>Ctrl+V</strong> to paste screenshots
            </Typography>
          </Box>
        )}
      </Box>

      {/* Image Preview Dialog */}
      <Dialog
        open={!!selectedImage}
        onClose={closeImageDialog}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Trade Image
          <IconButton onClick={closeImageDialog}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {selectedImage && (
            <img
              src={selectedImage}
              alt="Trade image"
              style={{
                width: '100%',
                height: 'auto',
                maxHeight: '80vh',
                objectFit: 'contain'
              }}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeImageDialog}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default InlineNotesEditor;