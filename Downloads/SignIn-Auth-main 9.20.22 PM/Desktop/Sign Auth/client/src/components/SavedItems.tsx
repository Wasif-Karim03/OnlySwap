import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

interface SavedProduct {
  _id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  seller: {
    name: string;
    university: string;
  };
  category: string;
  condition: string;
  savedBy: string[];
  createdAt: string;
}

const SavedItems: React.FC = () => {
  const { user, getSavedItems, saveItem } = useAuth();
  const navigate = useNavigate();
  const [savedItems, setSavedItems] = useState<SavedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchSavedItems();
  }, []);

  const fetchSavedItems = async () => {
    try {
      const items = await getSavedItems();
      setSavedItems(items);
    } catch (error) {
      setMessage('Failed to load saved items');
    } finally {
      setLoading(false);
    }
  };

  const handleUnsave = async (productId: string) => {
    try {
      await saveItem(productId);
      // Remove the item from the list
      setSavedItems(prev => prev.filter(item => item._id !== productId));
      setMessage('Item removed from saved items');
      setTimeout(() => setMessage(''), 2000);
    } catch (error) {
      setMessage('Failed to remove item');
    }
  };

  const handleChat = (product: SavedProduct) => {
    // TODO: Implement chat functionality
    console.log('Chat with seller:', product.seller.name);
  };

  const handleBuyNow = (product: SavedProduct) => {
    // TODO: Implement buy functionality
    console.log('Buy item:', product.title);
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#FAFAF8' }}>
        <div className="flex items-center justify-center h-screen">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAFAF8' }}>
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
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
                Saved Items
              </h1>
            </div>
          </div>
        </div>
      </header>

      {/* Message */}
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-6xl mx-auto px-4 py-2"
        >
          <div className="bg-green-50 text-green-700 p-3 rounded-lg text-center">
            {message}
          </div>
        </motion.div>
      )}

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {savedItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-12"
          >
            <div className="w-24 h-24 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
            </div>
            <h3 
              className="text-xl font-semibold mb-2"
              style={{ color: '#046C4E', fontFamily: 'Inter' }}
            >
              No saved items yet
            </h3>
            <p 
              className="text-gray-600 mb-6"
              style={{ fontFamily: 'Inter' }}
            >
              Start saving items you're interested in from the marketplace
            </p>
            <button
              onClick={() => navigate('/marketplace')}
              className="px-6 py-3 rounded-lg font-medium text-white transition-colors"
              style={{ 
                backgroundColor: '#046C4E',
                fontFamily: 'Inter'
              }}
            >
              Browse Marketplace
            </button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {savedItems.map((product, index) => (
              <motion.div
                key={product._id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white rounded-2xl shadow-lg overflow-hidden"
              >
                {/* Product Image */}
                <div className="h-48 bg-gray-100 relative">
                  <img
                    src="/pictures/illustration.png"
                    alt={product.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-3 right-3">
                    <div 
                      className="px-3 py-1.5 rounded-lg text-base font-bold text-white shadow-md"
                      style={{ 
                        backgroundColor: '#046C4E',
                        fontFamily: 'Inter',
                        boxShadow: '0 2px 8px 0 rgba(4, 108, 78, 0.3)'
                      }}
                    >
                      ${product.price}
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnsave(product._id)}
                    className="absolute top-3 left-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                  </button>
                </div>

                {/* Product Info */}
                <div className="p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                      <span className="text-xs font-semibold" style={{ color: '#046C4E' }}>O</span>
                    </div>
                    <span className="text-sm font-medium" style={{ color: '#046C4E', fontFamily: 'Inter' }}>
                      {product.seller.name}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2" style={{ fontFamily: 'Inter' }}>
                    {product.seller.university}
                  </p>
                  
                  <h3 
                    className="font-semibold mb-2"
                    style={{ color: '#046C4E', fontFamily: 'Inter' }}
                  >
                    {product.title}
                  </h3>
                  <p 
                    className="text-sm text-gray-600 mb-3"
                    style={{ fontFamily: 'Inter' }}
                  >
                    {product.description}
                  </p>
                  
                  <div className="mb-4">
                    <span 
                      className="px-2 py-1 rounded-full text-xs text-white"
                      style={{ backgroundColor: '#10B981' }}
                    >
                      {product.condition}
                    </span>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleChat(product)}
                      className="flex-1 px-4 py-2 border-2 rounded-lg font-medium transition-colors"
                      style={{ 
                        borderColor: '#046C4E', 
                        color: '#046C4E',
                        fontFamily: 'Inter'
                      }}
                    >
                      Chat
                    </button>
                    <button
                      onClick={() => handleBuyNow(product)}
                      className="flex-1 px-4 py-2 rounded-lg font-medium text-white transition-colors"
                      style={{ 
                        backgroundColor: '#046C4E',
                        fontFamily: 'Inter'
                      }}
                    >
                      Buy Now
                    </button>
                  </div>

                  {/* Save Count */}
                  <div className="flex items-center justify-end mt-3">
                    <svg className="w-4 h-4 text-red-500 mr-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    <span className="text-xs text-gray-500" style={{ fontFamily: 'Inter' }}>
                      {product.savedBy.length} saved
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SavedItems; 