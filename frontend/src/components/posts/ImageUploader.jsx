import React, { useState, useRef } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';
import { postService } from '../../services/postService';
import { useToast } from '../../context/ToastContext';

export const ImageUploader = ({ postId, onUploadSuccess, className = '' }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);
  const { showToast } = useToast();

  const handleFile = async (file) => {
    if (!file) return;

    // Validate type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      showToast('Please upload a valid image (JPEG, PNG, or WebP).', 'error');
      return;
    }

    // Validate 5MB limit
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size exceeds 5MB limit.', 'error');
      return;
    }

    setIsUploading(true);
    try {
      const updatedPost = await postService.uploadImage(postId, file);
      showToast('Custom image uploaded successfully! (0 credits)', 'success');
      if (onUploadSuccess) onUploadSuccess(updatedPost);
    } catch (err) {
      showToast(err.message || 'Failed to upload image.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
          }
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
          dragOver
            ? 'border-brand bg-brand-soft'
            : 'border-border-warm hover:border-brand/60 bg-surface/60 hover:bg-surface'
        } ${isUploading ? 'pointer-events-none opacity-60' : ''}`}
      >
        {isUploading ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <Loader2 className="w-6 h-6 animate-spin text-brand" />
            <span className="text-xs font-semibold text-ink">Uploading custom visual...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center gap-1.5 py-1">
            <UploadCloud className="w-6 h-6 text-brand" />
            <div className="text-xs font-semibold text-ink">
              Click to upload or drag & drop
            </div>
            <p className="text-[10px] text-ink-muted">PNG, JPG, or WebP up to 5MB (Free)</p>
          </div>
        )}
      </div>
    </div>
  );
};
