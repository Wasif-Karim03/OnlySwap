import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

const UserTypeSelection: React.FC = () => {
  const [selectedType, setSelectedType] = useState<'buyer' | 'seller' | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, updateProfile } = useAuth();

  const handleTypeSelection = async (type: 'buyer' | 'seller') => {
    setSelectedType(type);
    setLoading(true);

    try {
      // Update user profile with selected type
      await updateProfile({ userType: type });
      
      // Navigate based on selection
      if (type === 'buyer') {
        navigate('/marketplace');
      } else {
        navigate('/seller-dashboard');
      }
    } catch (error) {
      console.error('Error updating user type:', error);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ backgroundColor: '#FAFAF8' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md mx-auto text-center"
      >
        {/* Brand Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-8"
        >
          <img 
            src="/pictures/logo.png"
            alt="OnlySwap Logo"
            className="h-32 mx-auto"
            style={{ width: 'auto' }}
          />
        </motion.div>

        {/* Welcome Message */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-8"
        >
          <h2 
            className="text-3xl font-bold mb-3"
            style={{ color: '#046C4E', fontFamily: 'Inter' }}
          >
            Welcome, {user?.name}!
          </h2>
          <p 
            className="text-lg"
            style={{ color: '#046C4E', fontFamily: 'Inter' }}
          >
            How would you like to use OnlySwap?
          </p>
        </motion.div>

        {/* Selection Cards */}
        <div className="space-y-6">
          {/* Buyer Card */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className={`relative cursor-pointer transition-all duration-300 transform hover:scale-105 ${
              selectedType === 'buyer' ? 'ring-4 ring-green-300' : ''
            }`}
            onClick={() => handleTypeSelection('buyer')}
          >
            <div 
              className="p-8 rounded-2xl shadow-lg border-2 transition-all duration-300"
              style={{ 
                backgroundColor: selectedType === 'buyer' ? '#F1F3EB' : 'white',
                borderColor: selectedType === 'buyer' ? '#046C4E' : '#F1F3EB'
              }}
            >
              <div className="mb-6">
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: '#046C4E' }}
                >
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                  </svg>
                </div>
                <h3 
                  className="text-2xl font-bold mb-2"
                  style={{ color: '#046C4E', fontFamily: 'Inter' }}
                >
                  I'm a Buyer
                </h3>
                <p 
                  className="text-base leading-relaxed"
                  style={{ color: '#666666', fontFamily: 'Inter' }}
                >
                  Browse and discover amazing items from your campus community. Find textbooks, electronics, and more at great prices.
                </p>
              </div>
              
              <div className="flex items-center justify-center space-x-2 text-sm">
                <span style={{ color: '#046C4E', fontFamily: 'Inter' }}>✓</span>
                <span style={{ color: '#666666', fontFamily: 'Inter' }}>Browse listings</span>
                <span style={{ color: '#046C4E', fontFamily: 'Inter' }}>✓</span>
                <span style={{ color: '#666666', fontFamily: 'Inter' }}>Chat with sellers</span>
                <span style={{ color: '#046C4E', fontFamily: 'Inter' }}>✓</span>
                <span style={{ color: '#666666', fontFamily: 'Inter' }}>Make purchases</span>
              </div>
            </div>
          </motion.div>

          {/* Seller Card */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className={`relative cursor-pointer transition-all duration-300 transform hover:scale-105 ${
              selectedType === 'seller' ? 'ring-4 ring-green-300' : ''
            }`}
            onClick={() => handleTypeSelection('seller')}
          >
            <div 
              className="p-8 rounded-2xl shadow-lg border-2 transition-all duration-300"
              style={{ 
                backgroundColor: selectedType === 'seller' ? '#F1F3EB' : 'white',
                borderColor: selectedType === 'seller' ? '#046C4E' : '#F1F3EB'
              }}
            >
              <div className="mb-6">
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ backgroundColor: '#046C4E' }}
                >
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M19 13H5v-2h14v2z"/>
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                  </svg>
                </div>
                <h3 
                  className="text-2xl font-bold mb-2"
                  style={{ color: '#046C4E', fontFamily: 'Inter' }}
                >
                  I'm a Seller
                </h3>
                <p 
                  className="text-base leading-relaxed"
                  style={{ color: '#666666', fontFamily: 'Inter' }}
                >
                  List your items and reach students on your campus. Sell textbooks, electronics, dorm essentials, and more.
                </p>
              </div>
              
              <div className="flex items-center justify-center space-x-2 text-sm">
                <span style={{ color: '#046C4E', fontFamily: 'Inter' }}>✓</span>
                <span style={{ color: '#666666', fontFamily: 'Inter' }}>Create listings</span>
                <span style={{ color: '#046C4E', fontFamily: 'Inter' }}>✓</span>
                <span style={{ color: '#666666', fontFamily: 'Inter' }}>Manage inventory</span>
                <span style={{ color: '#046C4E', fontFamily: 'Inter' }}>✓</span>
                <span style={{ color: '#666666', fontFamily: 'Inter' }}>Connect with buyers</span>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Loading State */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-8"
          >
            <div className="flex items-center justify-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full"
              />
              <span 
                className="ml-3 text-lg"
                style={{ color: '#046C4E', fontFamily: 'Inter' }}
              >
                Setting up your experience...
              </span>
            </div>
          </motion.div>
        )}

        {/* Skip Option */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-8"
        >
          <button
            onClick={() => navigate('/marketplace')}
            className="text-sm underline transition-colors hover:text-green-600"
            style={{ color: '#666666', fontFamily: 'Inter' }}
          >
            Skip for now, I'll decide later
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default UserTypeSelection; 