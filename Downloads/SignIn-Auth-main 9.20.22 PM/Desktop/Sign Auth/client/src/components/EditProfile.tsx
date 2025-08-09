import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

const EditProfile: React.FC = () => {
  const { user, updateProfile, uploadProfilePicture } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(user?.name || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
    setLoading(true);
    setMessage('');

    try {
      await updateProfile({ name, bio });
      setMessage('Profile updated successfully!');
      setTimeout(() => {
        navigate('/marketplace');
      }, 1500);
    } catch (error) {
      setMessage('Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleProfilePictureUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setMessage('Please select an image file.');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setMessage('File size must be less than 5MB.');
      return;
    }

    setUploading(true);
    setMessage('');

    try {
      await uploadProfilePicture(file);
      setMessage('Profile picture updated successfully!');
    } catch (error) {
      setMessage('Failed to upload profile picture. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAFAF8' }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/marketplace')}
                className="p-2 rounded-full hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 
                className="text-2xl font-bold"
                style={{ color: '#046C4E', fontFamily: 'Inter' }}
              >
                Edit Profile
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="bg-white rounded-2xl shadow-lg p-8"
        >
          {/* Profile Photo Section */}
          <div className="text-center mb-8">
            <div className="relative inline-block">
              {user?.profilePicture ? (
                <div className="w-24 h-24 rounded-full mx-auto mb-4 overflow-hidden">
                  <img 
                    src={`http://localhost:5001${user.profilePicture}`}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <span 
                    className="text-3xl font-semibold"
                    style={{ color: '#046C4E', fontFamily: 'Inter' }}
                  >
                    {user?.name?.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <button 
                onClick={triggerFileInput}
                disabled={uploading}
                className="absolute bottom-0 right-0 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                  />
                ) : (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                )}
              </button>
            </div>
            <p 
              className="text-sm"
              style={{ color: '#666666', fontFamily: 'Inter' }}
            >
              {uploading ? 'Uploading...' : 'Click to add or change photo'}
            </p>
            
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleProfilePictureUpload}
              className="hidden"
            />
          </div>

          {/* Form Fields */}
          <div className="space-y-6">
            {/* Name Field */}
            <div>
              <label 
                className="block text-sm font-medium mb-2"
                style={{ color: '#046C4E', fontFamily: 'Inter' }}
              >
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Enter your full name"
                style={{ fontFamily: 'Inter' }}
              />
            </div>

            {/* Email Field (Read-only) */}
            <div>
              <label 
                className="block text-sm font-medium mb-2"
                style={{ color: '#046C4E', fontFamily: 'Inter' }}
              >
                Email Address
              </label>
              <input
                type="email"
                value={user?.email || ''}
                disabled
                className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                style={{ fontFamily: 'Inter' }}
              />
              <p 
                className="text-xs mt-1"
                style={{ color: '#666666', fontFamily: 'Inter' }}
              >
                Email cannot be changed
              </p>
            </div>

            {/* Bio Field */}
            <div>
              <label 
                className="block text-sm font-medium mb-2"
                style={{ color: '#046C4E', fontFamily: 'Inter' }}
              >
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                placeholder="Tell us about yourself..."
                style={{ fontFamily: 'Inter' }}
              />
              <p 
                className="text-xs mt-1"
                style={{ color: '#666666', fontFamily: 'Inter' }}
              >
                {bio.length}/200 characters
              </p>
            </div>

            {/* University Field (Read-only) */}
            <div>
              <label 
                className="block text-sm font-medium mb-2"
                style={{ color: '#046C4E', fontFamily: 'Inter' }}
              >
                University
              </label>
              <input
                type="text"
                value={user?.university || ''}
                disabled
                className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-500"
                style={{ fontFamily: 'Inter' }}
              />
              <p 
                className="text-xs mt-1"
                style={{ color: '#666666', fontFamily: 'Inter' }}
              >
                University cannot be changed
              </p>
            </div>
          </div>

          {/* Message */}
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mt-6 p-4 rounded-lg text-center ${
                message.includes('successfully') 
                  ? 'bg-green-50 text-green-700' 
                  : 'bg-red-50 text-red-700'
              }`}
              style={{ fontFamily: 'Inter' }}
            >
              {message}
            </motion.div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-4 mt-8">
            <button
              onClick={() => navigate('/marketplace')}
              className="flex-1 px-6 py-3 border-2 rounded-lg font-medium transition-colors"
              style={{ 
                borderColor: '#046C4E', 
                color: '#046C4E',
                fontFamily: 'Inter'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading || !name.trim()}
              className="flex-1 px-6 py-3 rounded-lg font-medium text-white transition-colors disabled:opacity-50"
              style={{ 
                backgroundColor: '#046C4E',
                fontFamily: 'Inter'
              }}
            >
              {loading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full mx-auto"
                />
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default EditProfile; 