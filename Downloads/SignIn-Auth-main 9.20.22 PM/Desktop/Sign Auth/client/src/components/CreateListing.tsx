import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface CreateListingForm {
  title: string;
  description: string;
  price: number;
  category: string;
  condition: 'new' | 'like-new' | 'good' | 'fair';
  images: File[];
}

const CreateListing: React.FC = () => {
  const navigate = useNavigate();
  const { user, createListing } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const [formData, setFormData] = useState<CreateListingForm>({
    title: '',
    description: '',
    price: 0,
    category: '',
    condition: 'good',
    images: []
  });

  const categories = [
    { id: 'textbooks', name: 'Textbooks', icon: '📚' },
    { id: 'electronics', name: 'Electronics', icon: '💻' },
    { id: 'dorm-essentials', name: 'Dorm Essentials', icon: '🏠' },
    { id: 'clothing', name: 'Clothing', icon: '👕' },
    { id: 'furniture', name: 'Furniture', icon: '🪑' },
    { id: 'science', name: 'Science', icon: '🔬' },
    { id: 'fitness', name: 'Fitness', icon: '💪' }
  ];

  const conditions = [
    { value: 'new', label: 'New', description: 'Brand new, never used' },
    { value: 'like-new', label: 'Like New', description: 'Used once or twice, looks new' },
    { value: 'good', label: 'Good', description: 'Used but in good condition' },
    { value: 'fair', label: 'Fair', description: 'Used with some wear' }
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'price' ? parseFloat(value) || 0 : value
    }));
  };

  // Function to convert HEIC to JPEG using canvas
  const convertHeicToJpeg = (file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      if (!file.type.includes('heic') && !file.type.includes('heif')) {
        resolve(file);
        return;
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();

      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx?.drawImage(img, 0, 0);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const jpegFile = new File([blob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), {
              type: 'image/jpeg',
              lastModified: Date.now()
            });
            resolve(jpegFile);
          } else {
            reject(new Error('Failed to convert HEIC to JPEG'));
          }
        }, 'image/jpeg', 0.8);
      };

      img.onerror = () => reject(new Error('Failed to load HEIC image'));
      
      // For HEIC files, we'll use a fallback since browser support is limited
      // We'll create a placeholder and let the backend handle conversion
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await processFiles(files);
    
    // Only reset the file input if we've reached the maximum number of images
    if (formData.images.length >= 5 && e.target) {
      e.target.value = '';
    }
  };

  const removeImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
    
    // Cleanup the preview URL
    if (previewUrls[index]) {
      try {
        URL.revokeObjectURL(previewUrls[index]);
      } catch (error) {
        console.error('Error revoking preview URL:', error);
      }
    }
    
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (formData.images.length < 5) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (formData.images.length >= 5) return;
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // Limit files to remaining slots
      const remainingSlots = 5 - formData.images.length;
      const filesToProcess = files.slice(0, remainingSlots);
      
      // Process files directly instead of creating a synthetic event
      processFiles(filesToProcess);
    }
  };

  // Extract file processing logic to a separate function
  const processFiles = async (files: File[]) => {
    console.log('📁 Files selected:', files.map(f => ({ name: f.name, type: f.type, size: f.size })));
    
    if (files.length > 0) {
      // Validate file types and sizes
      const validFiles = files.filter(file => {
        const isValidType = file.type.startsWith('image/');
        const isValidSize = file.size <= 5 * 1024 * 1024; // 5MB limit
        console.log('File validation:', { 
          name: file.name, 
          type: file.type, 
          size: file.size, 
          isValidType, 
          isValidSize 
        });
        return isValidType && isValidSize;
      });
      
      if (validFiles.length !== files.length) {
        const rejectedCount = files.length - validFiles.length;
        alert(`Some files were rejected. Please upload only image files under 5MB. ${rejectedCount} file(s) were rejected.`);
      }
      
      // Check if adding these files would exceed the 5 image limit
      const totalImagesAfterUpload = formData.images.length + validFiles.length;
      if (totalImagesAfterUpload > 5) {
        const excessCount = totalImagesAfterUpload - 5;
        alert(`You can only upload up to 5 images total. ${excessCount} image(s) will be ignored.`);
        // Only take the files that fit within the limit
        validFiles.splice(5 - formData.images.length);
      }
      
      console.log('Valid files:', validFiles);
      
      // Process files and create previews
      const processedFiles: File[] = [];
      const newPreviewUrls: string[] = [];
      
      for (const file of validFiles) {
        try {
          let processedFile = file;
          
          // Try to convert HEIC to JPEG for preview
          if (file.type.includes('heic') || file.type.includes('heif')) {
            try {
              processedFile = await convertHeicToJpeg(file);
              console.log('Successfully converted HEIC to JPEG for preview');
            } catch (error) {
              console.warn('HEIC conversion failed, using original file:', error);
              // Keep original file if conversion fails
            }
          }
          
          processedFiles.push(processedFile);
          
          // Create preview URL for the actual uploaded file
          const previewUrl = URL.createObjectURL(processedFile);
          newPreviewUrls.push(previewUrl);
          console.log('Created preview URL for uploaded file:', previewUrl, 'File:', processedFile.name);
          
        } catch (error) {
          console.error('Error processing file:', file.name, error);
        }
      }
      
      setFormData(prev => ({
        ...prev,
        images: [...prev.images, ...processedFiles].slice(0, 5) // Limit to 5 images
      }));
      
      setPreviewUrls(prev => [...prev, ...newPreviewUrls].slice(0, 5));
    }
  };



  // Cleanup object URLs when component unmounts or images change
  useEffect(() => {
    return () => {
      // Cleanup preview URLs to prevent memory leaks
      previewUrls.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          console.error('Error revoking preview URL:', error);
        }
      });
    };
  }, [previewUrls]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      console.log('🚀 Starting form submission...');
      console.log('📋 Form data:', {
        title: formData.title,
        description: formData.description,
        price: formData.price,
        category: formData.category,
        condition: formData.condition,
        imageCount: formData.images.length
      });
      
      // Create FormData for multipart/form-data submission
      const formDataToSend = new FormData();
      formDataToSend.append('title', formData.title);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('price', formData.price.toString());
      formDataToSend.append('category', formData.category);
      formDataToSend.append('condition', formData.condition);
      
      // Append images
      formData.images.forEach((image, index) => {
        console.log(`📸 Appending image ${index + 1}:`, image.name, image.type, image.size);
        formDataToSend.append('images', image);
      });

      console.log('📤 Calling createListing API...');
      // Call the API
      await createListing(formDataToSend);
      
      console.log('✅ Listing created successfully!');
      // Navigate back to seller dashboard
      navigate('/marketplace');
    } catch (error) {
      console.error('❌ Failed to create listing:', error);
      alert(`Failed to create listing: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = formData.title.trim() && 
                     formData.description.trim() && 
                     formData.price > 0 && 
                     formData.category && 
                     formData.images.length > 0;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAFAF8' }}>
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/marketplace')}
                className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 
                className="text-2xl font-bold"
                style={{ color: '#046C4E', fontFamily: 'Inter' }}
              >
                Create New Listing
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white rounded-3xl shadow-xl p-8"
        >
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Information */}
            <div>
              <h2 
                className="text-xl font-bold mb-6"
                style={{ color: '#046C4E', fontFamily: 'Inter' }}
              >
                Basic Information
              </h2>
              
              <div className="space-y-6">
                <div>
                  <label 
                    htmlFor="title"
                    className="block text-sm font-semibold mb-2"
                    style={{ color: '#046C4E', fontFamily: 'Inter' }}
                  >
                    Product Title *
                  </label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={formData.title}
                    onChange={handleInputChange}
                    placeholder="e.g., iPhone 14 Pro, Calculus Textbook"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    style={{ fontFamily: 'Inter' }}
                    required
                  />
                </div>

                <div>
                  <label 
                    htmlFor="description"
                    className="block text-sm font-semibold mb-2"
                    style={{ color: '#046C4E', fontFamily: 'Inter' }}
                  >
                    Description *
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Describe your item in detail..."
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                    style={{ fontFamily: 'Inter' }}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label 
                      htmlFor="price"
                      className="block text-sm font-semibold mb-2"
                      style={{ color: '#046C4E', fontFamily: 'Inter' }}
                    >
                      Price ($) *
                    </label>
                    <input
                      type="number"
                      id="price"
                      name="price"
                      value={formData.price}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      style={{ fontFamily: 'Inter' }}
                      required
                    />
                  </div>

                  <div>
                    <label 
                      htmlFor="category"
                      className="block text-sm font-semibold mb-2"
                      style={{ color: '#046C4E', fontFamily: 'Inter' }}
                    >
                      Category *
                    </label>
                    <select
                      id="category"
                      name="category"
                      value={formData.category}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      style={{ fontFamily: 'Inter' }}
                      required
                    >
                      <option value="">Select a category</option>
                      {categories.map(category => (
                        <option key={category.id} value={category.id}>
                          {category.icon} {category.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label 
                    className="block text-sm font-semibold mb-3"
                    style={{ color: '#046C4E', fontFamily: 'Inter' }}
                  >
                    Condition *
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {conditions.map(condition => (
                      <label
                        key={condition.value}
                        className={`relative cursor-pointer p-4 rounded-xl border-2 transition-all duration-200 ${
                          formData.condition === condition.value
                            ? 'border-green-500 bg-green-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="condition"
                          value={condition.value}
                          checked={formData.condition === condition.value}
                          onChange={handleInputChange}
                          className="sr-only"
                        />
                        <div className="text-center">
                          <div 
                            className="font-semibold mb-1"
                            style={{ color: '#046C4E', fontFamily: 'Inter' }}
                          >
                            {condition.label}
                          </div>
                          <div 
                            className="text-xs"
                            style={{ color: '#666666', fontFamily: 'Inter' }}
                          >
                            {condition.description}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Image Upload */}
            <div>
              <h2 
                className="text-xl font-bold mb-6"
                style={{ color: '#046C4E', fontFamily: 'Inter' }}
              >
                Product Images * (up to 5)
              </h2>
              
              <div className="space-y-4">
                <div
                  onClick={() => formData.images.length < 5 ? fileInputRef.current?.click() : null}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ${
                    formData.images.length < 5 
                      ? isDragOver
                        ? 'border-green-500 bg-green-50 cursor-pointer'
                        : 'border-gray-300 cursor-pointer hover:border-green-500 hover:bg-green-50' 
                      : 'border-gray-200 bg-gray-50 cursor-not-allowed'
                  }`}
                >
                  <div className="text-4xl mb-4">📸</div>
                  <p 
                    className="text-lg font-semibold mb-2"
                    style={{ color: '#046C4E', fontFamily: 'Inter' }}
                  >
                    Upload Product Images
                  </p>
                  <p 
                    className="text-sm mb-2"
                    style={{ color: '#666666', fontFamily: 'Inter' }}
                  >
                    Click to upload up to 5 images (PNG, JPG, JPEG)
                  </p>
                  <p 
                    className="text-xs"
                    style={{ color: '#999999', fontFamily: 'Inter' }}
                  >
                    {formData.images.length}/5 images selected • {5 - formData.images.length} more can be added
                  </p>
                  <p 
                    className="text-xs"
                    style={{ color: '#999999', fontFamily: 'Inter' }}
                  >
                    Click or drag & drop multiple files
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.heic,.heif"
                  onChange={handleImageUpload}
                  className="hidden"
                />

                {/* Image Preview Section */}
                {formData.images.length > 0 && (
                  <div className="space-y-4">
                    {/* Clear All Button */}
                    <div className="flex justify-between items-center">
                      <span 
                        className="text-sm font-medium"
                        style={{ color: '#046C4E', fontFamily: 'Inter' }}
                      >
                        {formData.images.length} image{formData.images.length !== 1 ? 's' : ''} selected
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          // Cleanup all preview URLs
                          previewUrls.forEach(url => {
                            try {
                              URL.revokeObjectURL(url);
                            } catch (error) {
                              console.error('Error revoking preview URL:', error);
                            }
                          });
                          setFormData(prev => ({ ...prev, images: [] }));
                          setPreviewUrls([]);
                        }}
                        className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
                        style={{ fontFamily: 'Inter' }}
                      >
                        Clear All
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-4">
                    {formData.images.map((file, idx) => {
                      console.log(`Preview ${idx + 1}:`, { 
                        fileName: file.name, 
                        fileType: file.type,
                        previewUrl: previewUrls[idx],
                        fileSize: file.size
                      });
                      
                      return (
                        <div key={idx} className="relative group">
                          <img
                            src={previewUrls[idx] || '/pictures/illustration.png'}
                            alt={`Preview ${idx + 1} - ${file.name}`}
                            className="w-24 h-24 object-cover rounded-xl border border-gray-200 shadow-sm"
                            onLoad={() => console.log(`✅ Image ${idx + 1} loaded successfully:`, file.name)}
                            onError={(e) => {
                              console.error('❌ Image failed to load:', file.name, 'URL:', previewUrls[idx]);
                              // Show a fallback for preview errors
                              e.currentTarget.src = '/pictures/illustration.png';
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(idx)}
                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow hover:bg-red-600 transition-colors"
                            title="Remove image"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex justify-end space-x-4 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={() => navigate('/marketplace')}
                className="px-6 py-3 rounded-xl font-semibold border border-gray-300 transition-all duration-200 hover:bg-gray-50"
                style={{ 
                  color: '#666666',
                  fontFamily: 'Inter'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!isFormValid || isSubmitting}
                className={`px-8 py-3 rounded-xl font-semibold text-white transition-all duration-200 ${
                  isFormValid && !isSubmitting
                    ? 'hover:shadow-lg'
                    : 'opacity-50 cursor-not-allowed'
                }`}
                style={{ 
                  backgroundColor: '#046C4E',
                  fontFamily: 'Inter'
                }}
              >
                {isSubmitting ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                    <span>Creating...</span>
                  </div>
                ) : (
                  'Create Listing'
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default CreateListing;