import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  seller: {
    name: string;
    university: string;
    avatar: string;
  };
  category: string;
  condition: 'new' | 'like-new' | 'good' | 'fair';
  createdAt: string;
  savedBy: string[];
  isSaved?: boolean;
  isActive?: boolean;
}

const Marketplace: React.FC = () => {
  const { user, signOut, saveItem, getProducts, getSavedItems } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showChat, setShowChat] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isSellerMode, setIsSellerMode] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showSavedItems, setShowSavedItems] = useState(false);
  const [savedItems, setSavedItems] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [displayCount, setDisplayCount] = useState(12); // Limit initial render
  const savedItemsRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  // Image gallery state for each product
  const [imageIndices, setImageIndices] = useState<{ [productId: string]: number }>({});
  // Seller dashboard state
  const [sellerStats, setSellerStats] = useState({
    activeListings: 0,
    totalMessages: 0,
    totalSales: 0,
    userListings: [] as Product[]
  });
  // Per-listing action menu (kebab) state
  const [openListingMenuId, setOpenListingMenuId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState([
    { id: 1, type: 'chat', message: 'Sarah replied to your message about Calculus Textbook', time: '2 min ago', read: false },
    { id: 2, type: 'chat', message: 'Mike sent you a message about MacBook Air', time: '5 min ago', read: false },
    { id: 3, type: 'system', message: 'Welcome to OnlySwap! Start exploring items.', time: '1 hour ago', read: true }
  ]);
  // Delete confirmation modal state
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Saved items fetcher (memoized for stable dependency in effects)
  const fetchSavedItems = useCallback(async () => {
    try {
      const items = await getSavedItems();
      setSavedItems(items);
    } catch (error) {
      console.error('Failed to fetch saved items:', error);
    }
  }, [getSavedItems]);

  // Fetch seller-specific data (memoized). Defined before effects that depend on it.
  const fetchSellerData = useCallback(async () => {
    try {
      console.log('🔍 Fetching seller data for user:', user?._id);
      console.log('🔑 Auth token:', localStorage.getItem('token'));
      
      // Get user's listings with proper headers
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/auth/seller/listings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('📡 API Response:', response.data);
      const userListings = response.data.listings || [];
      
      // Calculate statistics
      const activeListings = userListings.filter((listing: any) => listing.isActive !== false).length;
      const totalMessages = 0; // TODO: Implement message counting
      const totalSales = userListings.reduce((sum: number, listing: any) => {
        return sum + (listing.soldAt ? listing.price : 0);
      }, 0);
      
      console.log('📊 Seller stats calculated:', {
        activeListings,
        totalMessages,
        totalSales,
        totalListings: userListings.length,
        listings: userListings
      });
      
      setSellerStats({
        activeListings,
        totalMessages,
        totalSales,
        userListings: userListings.map((listing: any) => ({
          id: String(listing._id),
          title: listing.title,
          description: listing.description,
          price: listing.price,
          images: listing.images?.map((img: any) => `http://localhost:5001/uploads/${img.filePath}`) || [],
          seller: {
            name: listing.seller?.name || user?.name || '',
            university: listing.seller?.university || user?.university || '',
            avatar: '/pictures/logo.png'
          },
          category: listing.category,
          condition: listing.condition,
          createdAt: listing.createdAt,
          savedBy: listing.savedBy || [],
          isActive: listing.isActive !== false
        }))
      });
    } catch (error: any) {
      console.error('❌ Error fetching seller data:', error);
      console.error('❌ Error details:', error.response?.data);
      console.error('❌ Error status:', error.response?.status);
      
      // Set default values if API fails
      setSellerStats({
        activeListings: 0,
        totalMessages: 0,
        totalSales: 0,
        userListings: []
      });
    }
  }, [user?._id, user?.name, user?.university]);

  // Fetch products from database
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const productsData = await getProducts();
        console.log('📦 Raw products data from backend:', productsData);
        
        // Transform the data to match our Product interface
        const transformedProducts = productsData.map((product: any) => {
          // Construct full image URLs from new image structure
          const imageUrls = product.images && product.images.length > 0 ? 
            product.images.map((img: any) => {
              if (img.filePath) {
                // Construct the correct URL for uploaded images
                let imageUrl = `http://localhost:5001/uploads/${img.filePath}`;
                
                // If the file is HEIC, try to get the JPEG version
                if (img.filePath.toLowerCase().endsWith('.heic') || img.filePath.toLowerCase().endsWith('.heif')) {
                  const jpgPath = img.filePath.replace(/\.(heic|heif)$/i, '.jpg');
                  imageUrl = `http://localhost:5001/uploads/${jpgPath}`;
                  console.log('🔄 HEIC detected, trying JPEG version:', imageUrl);
                }
                
                console.log('🔍 Constructed image URL:', imageUrl, 'from filePath:', img.filePath, 'mimeType:', img.mimeType);
                return imageUrl;
              }
              console.log('⚠️ No filePath found, using default image');
              return '/pictures/illustration.png';
            }) : 
            ['/pictures/illustration.png'];
          
          return {
            id: String(product._id),
            title: product.title,
            description: product.description,
            price: product.price,
            images: imageUrls,
            seller: {
              name: product.seller.name,
              university: product.seller.university,
              avatar: '/pictures/logo.png'
            },
            category: product.category,
            condition: product.condition,
            createdAt: product.createdAt,
            savedBy: product.savedBy || [],
            isSaved: product.savedBy?.includes(user?._id) || false
          };
        });
        setProducts(transformedProducts);
      } catch (error) {
        console.error('Failed to fetch products:', error);
        // If no products exist, show empty state
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
    fetchSavedItems();
  }, [getProducts, user?._id, fetchSavedItems]);

  // Fetch seller data when in seller mode
  useEffect(() => {
    if (isSellerMode && user) {
      fetchSellerData();
    }
  }, [isSellerMode, user, fetchSellerData]);

  // Add a refresh function that can be called from other components
  const refreshProducts = useCallback(async () => {
    try {
      const productsData = await getProducts();
      console.log('📦 Raw products data from backend:', productsData);
      
      // Transform the data to match our Product interface
      const transformedProducts = productsData.map((product: any) => {
        // Construct full image URLs from new image structure
        const imageUrls = product.images && product.images.length > 0 ? 
          product.images.map((img: any) => {
            if (img.filePath) {
              // Construct the correct URL for uploaded images
              let imageUrl = `http://localhost:5001/uploads/${img.filePath}`;
              
              // If the file is HEIC, try to get the JPEG version
              if (img.filePath.toLowerCase().endsWith('.heic') || img.filePath.toLowerCase().endsWith('.heif')) {
                const jpgPath = img.filePath.replace(/\.(heic|heif)$/i, '.jpg');
                imageUrl = `http://localhost:5001/uploads/${jpgPath}`;
                console.log('🔄 HEIC detected, trying JPEG version:', imageUrl);
              }
              
              console.log('🔍 Constructed image URL:', imageUrl, 'from filePath:', img.filePath, 'mimeType:', img.mimeType);
              return imageUrl;
            }
            console.log('⚠️ No filePath found, using default image');
            return '/pictures/illustration.png';
          }) : 
          ['/pictures/illustration.png'];
        
        return {
          id: String(product._id),
          title: product.title,
          description: product.description,
          price: product.price,
          images: imageUrls,
          seller: {
            name: product.seller.name,
            university: product.seller.university,
            avatar: '/pictures/logo.png'
          },
          category: product.category,
          condition: product.condition,
          createdAt: product.createdAt,
          savedBy: product.savedBy || [],
          isSaved: product.savedBy?.includes(user?._id) || false
        };
      });
      setProducts(transformedProducts);
    } catch (error) {
      console.error('Failed to fetch products:', error);
      // If no products exist, show empty state
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [getProducts, user?._id]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close saved items dropdown
      if (savedItemsRef.current && !savedItemsRef.current.contains(event.target as Node)) {
        setShowSavedItems(false);
      }
      
      // Close notifications dropdown
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
      
      // Close profile menu dropdown
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setShowProfileMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const categories = [
    { id: 'all', name: 'All', icon: '🏠' },
    { id: 'textbooks', name: 'Textbooks', icon: '📚' },
    { id: 'electronics', name: 'Electronics', icon: '💻' },
    { id: 'dorm-essentials', name: 'Dorm Essentials', icon: '🏠' },
    { id: 'clothing', name: 'Clothing', icon: '👕' },
    { id: 'furniture', name: 'Furniture', icon: '🪑' },
    { id: 'science', name: 'Science', icon: '🔬' },
    { id: 'fitness', name: 'Fitness', icon: '💪' }
  ];

  // Optimize product filtering with useMemo to prevent unnecessary re-renders
  const filteredProducts = React.useMemo(() => {
    let displayProducts = products;
    
    // Apply search filter first
    if (searchQuery.trim()) {
      displayProducts = searchResults;
    }
    
    // Then apply category filter
    if (selectedCategory !== 'all') {
      displayProducts = displayProducts.filter(product => product.category === selectedCategory);
    }
    
    return displayProducts;
  }, [products, searchQuery, searchResults, selectedCategory]);

  const handleBuyNow = (product: Product) => {
    setSelectedProduct(product);
    // TODO: Implement purchase flow
    alert(`Purchase initiated for ${product.title}`);
  };

  const handleChat = (product: Product) => {
    setSelectedProduct(product);
    setShowChat(true);
  };

  // Image gallery navigation functions
  const nextImage = (productId: string, totalImages: number) => {
    setImageIndices(prev => ({
      ...prev,
      [productId]: ((prev[productId] || 0) + 1) % totalImages
    }));
  };

  const prevImage = (productId: string, totalImages: number) => {
    setImageIndices(prev => ({
      ...prev,
      [productId]: (prev[productId] || 0) === 0 ? totalImages - 1 : (prev[productId] || 0) - 1
    }));
  };

  const goToImage = (productId: string, index: number) => {
    setImageIndices(prev => ({
      ...prev,
      [productId]: index
    }));
  };

  // (fetchSellerData is defined above)

  // Single refresh handler for header refresh icon
  const handleRefreshClick = async () => {
    if (isSellerMode) {
      await fetchSellerData();
    } else {
      await refreshProducts();
    }
  };

  const confirmDelete = (listingId: string) => {
    setOpenListingMenuId(null);
    setDeleteTargetId(listingId);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      setIsDeleting(true);
      const token = localStorage.getItem('token');
      await axios.request({
        url: `http://localhost:5001/api/auth/seller/listings/${deleteTargetId}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      setDeleteTargetId(null);
      // Refresh seller data so both count and grid update
      await fetchSellerData();
      // Also refresh buyer products in case the user switches
      await refreshProducts();
    } catch (err: any) {
      console.error('Failed to delete listing:', err);
      if (err?.response) {
        console.error('Delete error status:', err.response.status);
        console.error('Delete error data:', err.response.data);
        alert(err.response.data?.message || 'Failed to delete listing. Please try again.');
      } else {
        alert('Failed to delete listing. Please try again.');
      }
    } finally {
      setIsDeleting(false);
    }
  };
  const handleCancelDelete = () => setDeleteTargetId(null);

  // fetchSavedItems moved above and memoized

  const handleSave = async (productId: string) => {
    try {
      const result = await saveItem(productId);
      setProducts(prev => prev.map(product => 
        product.id === productId 
          ? { ...product, isSaved: result.isSaved, savedBy: Array.from({ length: result.savedCount }, (_, i) => `user${i}`) }
          : product
      ));
      // Refresh saved items list
      await fetchSavedItems();
    } catch (error) {
      console.error('Failed to save item:', error);
    }
  };

  const markNotificationAsRead = (notificationId: number) => {
    setNotifications(prev => prev.map(notification => 
      notification.id === notificationId 
        ? { ...notification, read: true }
        : notification
    ));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // Advanced search algorithm
  const performSearch = (query: string, products: Product[]): Product[] => {
    if (!query.trim()) return products;
    
    const searchTerms = query.toLowerCase().trim().split(/\s+/);
    const results: Array<{ product: Product; score: number }> = [];
    
    products.forEach(product => {
      let score = 0;
      const title = product.title.toLowerCase();
      const description = product.description.toLowerCase();
      const category = product.category.toLowerCase();
      const sellerName = product.seller.name.toLowerCase();
      const condition = product.condition.toLowerCase();
      
      searchTerms.forEach(term => {
        // Exact matches get highest scores
        if (title.includes(term)) score += 10;
        if (description.includes(term)) score += 5;
        if (category.includes(term)) score += 8;
        if (sellerName.includes(term)) score += 3;
        if (condition.includes(term)) score += 4;
        
        // Partial word matches
        const titleWords = title.split(/\s+/);
        const descWords = description.split(/\s+/);
        
        titleWords.forEach(word => {
          if (word.startsWith(term) || word.endsWith(term)) score += 3;
          if (word.includes(term)) score += 2;
        });
        
        descWords.forEach(word => {
          if (word.startsWith(term) || word.endsWith(term)) score += 2;
          if (word.includes(term)) score += 1;
        });
        
        // Price range search (e.g., "under 100", "cheap", "expensive")
        if (term === 'cheap' && product.price < 50) score += 5;
        if (term === 'expensive' && product.price > 200) score += 5;
        if (term === 'under' || term === 'below') {
          const nextTerm = searchTerms[searchTerms.indexOf(term) + 1];
          if (nextTerm && !isNaN(Number(nextTerm))) {
            if (product.price < Number(nextTerm)) score += 6;
          }
        }
        if (term === 'over' || term === 'above') {
          const nextTerm = searchTerms[searchTerms.indexOf(term) + 1];
          if (nextTerm && !isNaN(Number(nextTerm))) {
            if (product.price > Number(nextTerm)) score += 6;
          }
        }
      });
      
      if (score > 0) {
        results.push({ product, score });
      }
    });
    
    // Sort by score (highest first) and return products
    return results
      .sort((a, b) => b.score - a.score)
      .map(result => result.product);
  };

  // Optimize search with debouncing to prevent excessive re-renders
  const handleSearchChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setSearchQuery(query);
    
    if (query.trim()) {
      setIsSearching(true);
      // Use setTimeout to debounce the search
      const timeoutId = setTimeout(() => {
        const results = performSearch(query, products);
        setSearchResults(results);
        setIsSearching(false);
      }, 150); // 150ms debounce delay
      
      return () => clearTimeout(timeoutId);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [products]);

  // Clear search
  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FAFAF8' }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full"
        />
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen" 
      style={{ 
        backgroundColor: '#FAFAF8',
        willChange: 'scroll-position',
        transform: 'translateZ(0)'
      }}
    >
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center">
              <h1 
                className="text-2xl font-bold"
                style={{ color: '#046C4E', fontFamily: 'Inter' }}
              >
                OnlySwap
              </h1>
            </div>

            {/* Search Bar */}
            <div className="flex-1 max-w-md mx-8">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Search items, categories, sellers..."
                  className="w-full px-4 py-2 pl-10 pr-10 rounded-full border border-gray-300 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  style={{ fontFamily: 'Inter' }}
                />
                <svg className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button
                    onClick={clearSearch}
                    className="absolute right-3 top-2.5 h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                {isSearching && (
                  <div className="absolute right-3 top-2.5">
                    <div className="animate-spin h-5 w-5 border-2 border-green-500 border-t-transparent rounded-full"></div>
                  </div>
                )}
              </div>
            </div>

            {/* Refresh Button */}
            <button
              onClick={handleRefreshClick}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              title="Refresh marketplace"
            >
              <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>

            {/* User Menu */}
            <div className="flex items-center space-x-4">
              {/* Buyer/Seller Toggle */}
              <div className="flex items-center space-x-3 bg-gray-100 rounded-full p-1">
                <button
                  onClick={() => setIsSellerMode(false)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    !isSellerMode
                      ? 'bg-white text-green-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                  style={{ fontFamily: 'Inter' }}
                >
                  Buyer
                </button>
                <button
                  onClick={() => setIsSellerMode(true)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    isSellerMode
                      ? 'bg-white text-green-700 shadow-sm'
                      : 'text-gray-600 hover:text-gray-800'
                  }`}
                  style={{ fontFamily: 'Inter' }}
                >
                  Seller
                </button>
              </div>
              
              {/* Saved Items */}
              <div className="relative" ref={savedItemsRef}>
                <button 
                  onClick={() => setShowSavedItems(!showSavedItems)}
                  className="p-2 rounded-full hover:bg-gray-100 relative"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  {savedItems.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {savedItems.length}
                    </span>
                  )}
                </button>
                
                {/* Saved Items Dropdown */}
                {showSavedItems && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute right-0 mt-3 w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 max-h-[500px] overflow-hidden backdrop-blur-sm"
                    style={{ boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}
                  >
                    {/* Header */}
                    <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-green-50 to-emerald-50">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" style={{ color: '#046C4E' }}>
                              <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                            </svg>
                          </div>
                          <div>
                            <h3 
                              className="font-bold text-lg"
                              style={{ color: '#046C4E', fontFamily: 'Inter' }}
                            >
                              Saved Items
                            </h3>
                            <p 
                              className="text-sm"
                              style={{ color: '#666666', fontFamily: 'Inter' }}
                            >
                              {savedItems.length} item{savedItems.length !== 1 ? 's' : ''} saved
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => setShowSavedItems(false)}
                          className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors"
                        >
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    
                    {/* Content */}
                    <div className="overflow-y-auto max-h-[400px]">
                      {savedItems.length === 0 ? (
                        <div className="px-6 py-12 text-center">
                          <div className="w-20 h-20 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                            </svg>
                          </div>
                          <h4 
                            className="text-lg font-semibold mb-2"
                            style={{ color: '#046C4E', fontFamily: 'Inter' }}
                          >
                            No saved items yet
                          </h4>
                          <p 
                            className="text-sm text-gray-500 mb-6"
                            style={{ fontFamily: 'Inter' }}
                          >
                            Start saving items you're interested in from the marketplace
                          </p>
                          <button
                            onClick={() => {
                              setShowSavedItems(false);
                              navigate('/marketplace');
                            }}
                            className="px-6 py-3 rounded-xl font-medium text-white transition-all duration-200 hover:scale-105"
                            style={{ 
                              backgroundColor: '#046C4E',
                              fontFamily: 'Inter',
                              boxShadow: '0 4px 14px 0 rgba(4, 108, 78, 0.3)'
                            }}
                          >
                            Browse Marketplace
                          </button>
                        </div>
                      ) : (
                        <div className="p-4 space-y-3">
                          {savedItems.map((item, index) => (
                            <motion.div
                              key={item._id}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: index * 0.1 }}
                              className="group bg-white rounded-xl border border-gray-100 hover:border-green-200 hover:shadow-lg transition-all duration-200 p-4 cursor-pointer"
                              onClick={() => {
                                setShowSavedItems(false);
                                navigate('/saved-items');
                              }}
                            >
                              <div className="flex items-center space-x-4">
                                <div className="w-16 h-16 bg-gray-100 rounded-xl flex-shrink-0 overflow-hidden">
                                  <img 
                                    src="/pictures/illustration.png"
                                    alt={item.title}
                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-200"
                                  />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 
                                    className="text-sm font-semibold truncate mb-1 group-hover:text-green-700 transition-colors"
                                    style={{ color: '#046C4E', fontFamily: 'Inter' }}
                                  >
                                    {item.title}
                                  </h4>
                                  <p 
                                    className="text-xs text-gray-500 mb-2"
                                    style={{ fontFamily: 'Inter' }}
                                  >
                                    {item.seller?.name} • {item.seller?.university}
                                  </p>
                                  <div className="flex items-center justify-between">
                                    <span 
                                      className="text-sm font-bold"
                                      style={{ color: '#046C4E', fontFamily: 'Inter' }}
                                    >
                                      ${item.price}
                                    </span>
                                    <span 
                                      className="text-xs px-2 py-1 rounded-full"
                                      style={{ 
                                        backgroundColor: '#F1F3EB', 
                                        color: '#046C4E',
                                        fontFamily: 'Inter'
                                      }}
                                    >
                                      {item.condition}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex-shrink-0">
                                  <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                  </svg>
                                </div>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Footer */}
                    {savedItems.length > 0 && (
                      <div className="p-4 border-t border-gray-100 bg-gray-50">
                        <button
                          onClick={() => {
                            setShowSavedItems(false);
                            navigate('/saved-items');
                          }}
                          className="w-full py-3 rounded-xl font-medium text-white transition-all duration-200 hover:scale-105"
                          style={{ 
                            backgroundColor: '#046C4E',
                            fontFamily: 'Inter',
                            boxShadow: '0 4px 14px 0 rgba(4, 108, 78, 0.3)'
                          }}
                        >
                          View All Saved Items ({savedItems.length})
                        </button>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>

              {/* Notifications */}
              <div className="relative" ref={notificationsRef}>
                <button 
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="p-2 rounded-full hover:bg-gray-100 relative"
                >
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.73 21a2 2 0 01-3.46 0" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>
                
                {/* Notifications Dropdown */}
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="p-4 border-b border-gray-200">
                      <h3 
                        className="text-lg font-semibold"
                        style={{ color: '#046C4E', fontFamily: 'Inter' }}
                      >
                        Notifications
                      </h3>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.length > 0 ? (
                        notifications.map((notification) => (
                          <div
                            key={notification.id}
                            onClick={() => markNotificationAsRead(notification.id)}
                            className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${
                              !notification.read ? 'bg-blue-50' : ''
                            }`}
                          >
                            <div className="flex items-start space-x-3">
                              <div className={`w-2 h-2 rounded-full mt-2 ${
                                notification.type === 'chat' ? 'bg-green-500' : 'bg-blue-500'
                              }`} />
                              <div className="flex-1">
                                <p 
                                  className={`text-sm ${!notification.read ? 'font-semibold' : ''}`}
                                  style={{ color: '#046C4E', fontFamily: 'Inter' }}
                                >
                                  {notification.message}
                                </p>
                                <p 
                                  className="text-xs mt-1"
                                  style={{ color: '#666666', fontFamily: 'Inter' }}
                                >
                                  {notification.time}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-center">
                          <p 
                            className="text-sm"
                            style={{ color: '#666666', fontFamily: 'Inter' }}
                          >
                            No notifications
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Button */}
              <button 
                onClick={() => setShowChat(true)}
                className="p-2 rounded-full hover:bg-gray-100"
              >
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </button>
              
              {/* Profile Menu */}
              <div className="relative" ref={profileMenuRef}>
                <button 
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  {user?.profilePicture ? (
                    <div className="w-8 h-8 rounded-full overflow-hidden">
                      <img 
                        src={`http://localhost:5001${user.profilePicture}`}
                        alt="Profile"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <span 
                        className="text-sm font-semibold"
                        style={{ color: '#046C4E', fontFamily: 'Inter' }}
                      >
                        {user?.name?.charAt(0).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <span 
                    className="text-sm font-medium"
                    style={{ color: '#046C4E', fontFamily: 'Inter' }}
                  >
                    {user?.name}
                  </span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {/* Profile Dropdown Menu */}
                {showProfileMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="p-4 border-b border-gray-200">
                      <div className="flex items-center space-x-3">
                        {user?.profilePicture ? (
                          <div className="w-12 h-12 rounded-full overflow-hidden">
                            <img 
                              src={`http://localhost:5001${user.profilePicture}`}
                              alt="Profile"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                            <span 
                              className="text-lg font-semibold"
                              style={{ color: '#046C4E', fontFamily: 'Inter' }}
                            >
                              {user?.name?.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div>
                          <p 
                            className="font-semibold"
                            style={{ color: '#046C4E', fontFamily: 'Inter' }}
                          >
                            {user?.name}
                          </p>
                          <p 
                            className="text-sm"
                            style={{ color: '#666666', fontFamily: 'Inter' }}
                          >
                            {user?.email}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="py-2">
                      <button 
                        onClick={() => {
                          setShowProfileMenu(false);
                          navigate('/edit-profile');
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors flex items-center space-x-3"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <span 
                          className="text-sm"
                          style={{ color: '#046C4E', fontFamily: 'Inter' }}
                        >
                          Edit Profile
                        </span>
                      </button>
                      
                      <button 
                        onClick={() => {
                          setShowProfileMenu(false);
                          navigate('/saved-items');
                        }}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors flex items-center space-x-3"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                        <span 
                          className="text-sm"
                          style={{ color: '#046C4E', fontFamily: 'Inter' }}
                        >
                          Saved Items
                        </span>
                      </button>
                      
                      <div className="border-t border-gray-200 my-2"></div>
                      
                      <button 
                        onClick={() => signOut()}
                        className="w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors flex items-center space-x-3"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        <span 
                          className="text-sm"
                          style={{ color: '#DC2626', fontFamily: 'Inter' }}
                        >
                          Sign Out
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Categories */}
      <div className="bg-gradient-to-r from-green-50 via-white to-emerald-50 border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex space-x-4 overflow-x-auto scrollbar-hide">
            {categories.map((category) => (
              <motion.button
                key={category.id}
                onClick={() => setSelectedCategory(category.id)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`flex items-center space-x-3 px-6 py-3 rounded-2xl whitespace-nowrap transition-all duration-200 shadow-sm ${
                  selectedCategory === category.id
                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-200'
                    : 'bg-white/80 text-gray-600 hover:bg-white hover:shadow-md hover:text-green-700 backdrop-blur-sm'
                }`}
                style={{ fontFamily: 'Inter' }}
              >
                <span className="text-xl filter drop-shadow-sm">{category.icon}</span>
                <span className="font-semibold">{category.name}</span>
              </motion.button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div 
        className="max-w-6xl mx-auto px-4 py-6"
        style={{ 
          willChange: 'scroll-position',
          transform: 'translateZ(0)'
        }}
      >
        {isSellerMode ? (
          // Seller Dashboard Content
          <div className="text-center py-12">
            <div className="mb-8">
              <h2 
                className="text-3xl font-bold mb-4"
                style={{ color: '#046C4E', fontFamily: 'Inter' }}
              >
                Seller Dashboard
              </h2>
              <p 
                className="text-lg"
                style={{ color: '#666666', fontFamily: 'Inter' }}
              >
                Manage your listings and connect with buyers
              </p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-6 rounded-2xl shadow-lg">
                <div className="text-3xl mb-2">📦</div>
                <h3 
                  className="text-xl font-bold mb-2"
                  style={{ color: '#046C4E', fontFamily: 'Inter' }}
                >
                  Active Listings
                </h3>
                <p 
                  className="text-2xl font-bold"
                  style={{ color: '#046C4E', fontFamily: 'Inter' }}
                >
                  {sellerStats.activeListings}
                </p>
              </div>
              
              <div className="bg-white p-6 rounded-2xl shadow-lg">
                <div className="text-3xl mb-2">💬</div>
                <h3 
                  className="text-xl font-bold mb-2"
                  style={{ color: '#046C4E', fontFamily: 'Inter' }}
                >
                  Messages
                </h3>
                <p 
                  className="text-2xl font-bold"
                  style={{ color: '#046C4E', fontFamily: 'Inter' }}
                >
                  {sellerStats.totalMessages}
                </p>
              </div>
              
              <div className="bg-white p-6 rounded-2xl shadow-lg">
                <div className="text-3xl mb-2">💰</div>
                <h3 
                  className="text-xl font-bold mb-2"
                  style={{ color: '#046C4E', fontFamily: 'Inter' }}
                >
                  Total Sales
                </h3>
                <p 
                  className="text-2xl font-bold"
                  style={{ color: '#046C4E', fontFamily: 'Inter' }}
                >
                  ${sellerStats.totalSales}
                </p>
              </div>
            </div>
            
            <div className="flex space-x-4 justify-center">
              <button
                onClick={() => navigate('/create-listing')}
                className="px-8 py-3 rounded-xl font-semibold text-white transition-all duration-300 hover:shadow-lg"
                style={{ 
                  backgroundColor: '#046C4E',
                  fontFamily: 'Inter'
                }}
              >
                + Create New Listing
              </button>
              
              {/* Removed Refresh Data button as requested */}
            </div>
            
            {/* User's Listings */}
            {sellerStats.userListings.length > 0 && (
              <div className="mt-12">
                <h3 
                  className="text-2xl font-bold mb-6 text-center"
                  style={{ color: '#046C4E', fontFamily: 'Inter' }}
                >
                  Your Listings
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sellerStats.userListings.map((listing, index) => (
                    <motion.div
                      key={listing.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: index * 0.1 }}
                      className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300"
                    >
                      {/* Listing Image */}
                      <div className="relative h-48 overflow-hidden">
                        <img
                          src={listing.images[0] || '/pictures/illustration.png'}
                          alt={listing.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.src = '/pictures/illustration.png';
                          }}
                        />
                        <div className="absolute top-2 left-2">
                          <span 
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              listing.isActive 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {listing.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </div>
                      
                      {/* Listing Info */}
                      <div className="p-4 relative">
                        <h4 
                          className="font-bold text-lg mb-2"
                          style={{ color: '#046C4E', fontFamily: 'Inter' }}
                        >
                          {listing.title}
                        </h4>
                        <p 
                          className="text-sm mb-3 line-clamp-2"
                          style={{ color: '#666666', fontFamily: 'Inter' }}
                        >
                          {listing.description}
                        </p>
                        <div className="flex items-center justify-between">
                          <span 
                            className="text-lg font-bold"
                            style={{ color: '#046C4E', fontFamily: 'Inter' }}
                          >
                            ${listing.price}
                          </span>
                          <div className="flex items-center space-x-2">
                            <span 
                              className="text-xs px-2 py-1 rounded-full"
                              style={{ 
                                background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)', 
                                color: '#046C4E',
                                fontFamily: 'Inter'
                              }}
                            >
                              {listing.condition}
                            </span>
                            <button
                              onClick={() => setOpenListingMenuId(prev => prev === listing.id ? null : listing.id)}
                              className="p-1.5 rounded-md hover:bg-gray-100"
                              title="More actions"
                            >
                              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.75a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 7.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm0 7.5a1.5 1.5 0 110-3 1.5 1.5 0 010 3z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        {openListingMenuId === listing.id && (
                          <div className="absolute right-4 top-14 w-40 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                            <button
                              onClick={() => confirmDelete(listing.id)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-600 rounded-t-lg"
                            >
                              Delete Listing
                            </button>
                            <button
                              onClick={() => setOpenListingMenuId(null)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded-b-lg"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                          <span>{listing.savedBy.length} saved</span>
                          <span>{new Date(listing.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Empty State */}
            {sellerStats.userListings.length === 0 && (
              <div className="mt-12 text-center">
                <div className="text-6xl mb-4">📦</div>
                <h3 
                  className="text-xl font-bold mb-2"
                  style={{ color: '#046C4E', fontFamily: 'Inter' }}
                >
                  No Listings Yet
                </h3>
                <p 
                  className="text-gray-600 mb-6"
                  style={{ fontFamily: 'Inter' }}
                >
                  Start selling by creating your first listing
                </p>
              </div>
            )}
          </div>
        ) : (
          // Buyer Marketplace Content
          filteredProducts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredProducts.slice(0, displayCount).map((product, index) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: Math.min(index * 0.05, 0.5) }}
                  whileHover={{ y: -4 }}
                  className="group bg-white rounded-3xl shadow-xl overflow-hidden hover:shadow-2xl transition-all duration-300 border border-gray-100"
                >
                  {/* Product Image */}
                  <div className="relative overflow-hidden group">
                    <img
                      src={product.images[imageIndices[product.id] || 0] || '/pictures/illustration.png'}
                      alt={product.title}
                      className="w-full h-72 object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.src = '/pictures/illustration.png';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    
                    {/* Image Counter */}
                    {product.images.length > 1 && (
                      <div className="absolute top-4 left-4 px-3 py-1.5 bg-black/70 backdrop-blur-sm rounded-full text-white text-sm font-medium">
                        {(imageIndices[product.id] || 0) + 1} of {product.images.length}
                      </div>
                    )}
                    
                    {/* Navigation Arrows */}
                    {product.images.length > 1 && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            prevImage(product.id, product.images.length);
                          }}
                          className="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 backdrop-blur-sm rounded-full text-white hover:bg-black/70 transition-all duration-200 opacity-0 group-hover:opacity-100"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            nextImage(product.id, product.images.length);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/50 backdrop-blur-sm rounded-full text-white hover:bg-black/70 transition-all duration-200 opacity-0 group-hover:opacity-100"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      </>
                    )}
                    
                    {/* Image Dots */}
                    {product.images.length > 1 && (
                      <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex space-x-2">
                        {product.images.map((_, index) => (
                          <button
                            key={index}
                            onClick={(e) => {
                              e.stopPropagation();
                              goToImage(product.id, index);
                            }}
                            className={`w-2 h-2 rounded-full transition-all duration-200 ${
                              (imageIndices[product.id] || 0) === index
                                ? 'bg-white scale-125'
                                : 'bg-white/50 hover:bg-white/75'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                    
                    <button
                      onClick={() => handleSave(product.id)}
                      className="absolute top-4 right-4 p-3 bg-white/90 backdrop-blur-sm rounded-full hover:bg-white hover:scale-110 transition-all duration-200 shadow-lg"
                    >
                      <svg className={`h-5 w-5 ${product.isSaved ? 'text-red-500 fill-current' : 'text-gray-500'}`} viewBox="0 0 24 24">
                        <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                      </svg>
                    </button>
                    <div className="absolute bottom-4 left-4">
                      <span 
                        className="px-4 py-2 text-lg font-bold rounded-xl text-white shadow-lg backdrop-blur-sm"
                        style={{ 
                          background: 'linear-gradient(135deg, #046C4E 0%, #059669 100%)',
                          fontFamily: 'Inter',
                          boxShadow: '0 4px 15px 0 rgba(4, 108, 78, 0.4)'
                        }}
                      >
                        ${product.price}
                      </span>
                    </div>
                  </div>

                  {/* Product Info */}
                  <div className="p-6">
                    {/* Seller Info */}
                    <div className="flex items-center space-x-3 mb-4">
                      <div className="relative">
                        <img
                          src={product.seller.avatar}
                          alt={product.seller.name}
                          className="h-10 w-10 rounded-full ring-2 ring-green-100"
                        />
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white"></div>
                      </div>
                      <div>
                        <p 
                          className="text-sm font-semibold"
                          style={{ color: '#046C4E', fontFamily: 'Inter' }}
                        >
                          {product.seller.name}
                        </p>
                        <p 
                          className="text-xs"
                          style={{ color: '#666666', fontFamily: 'Inter' }}
                        >
                          {product.seller.university}
                        </p>
                      </div>
                    </div>

                    {/* Product Details */}
                    <div className="flex items-center justify-between mb-3">
                      <h3 
                        className="text-xl font-bold group-hover:text-green-700 transition-colors duration-300"
                        style={{ color: '#046C4E', fontFamily: 'Inter' }}
                      >
                        {product.title}
                      </h3>
                      {product.images.length > 1 && (
                        <div className="flex items-center space-x-1 text-xs text-gray-500">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>{product.images.length} photos</span>
                        </div>
                      )}
                    </div>
                    <p 
                      className="text-sm mb-4 leading-relaxed"
                      style={{ color: '#666666', fontFamily: 'Inter' }}
                    >
                      {product.description}
                    </p>

                    {/* Condition & Likes */}
                    <div className="flex items-center justify-between mb-6">
                      <span 
                        className="text-xs px-3 py-1.5 rounded-full font-medium"
                        style={{ 
                          background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)', 
                          color: '#046C4E',
                          fontFamily: 'Inter',
                        }}
                      >
                        {product.condition}
                      </span>
                      <span className="text-xs text-gray-500">
                        {product.savedBy?.length || 0} saved
                      </span>
                    </div>

                    {/* Buy & Chat Buttons */}
                    <div className="flex space-x-3">
                      <button
                        onClick={() => handleBuyNow(product)}
                        className="flex-1 py-2 rounded-lg font-semibold text-white transition-colors"
                        style={{ background: 'linear-gradient(135deg, #046C4E 0%, #059669 100%)', fontFamily: 'Inter' }}
                      >
                        Buy Now
                      </button>
                      <button
                        onClick={() => handleChat(product)}
                        className="flex-1 py-2 rounded-lg font-semibold text-green-700 border border-green-200 bg-green-50 hover:bg-green-100 transition-colors"
                        style={{ fontFamily: 'Inter' }}
                      >
                        Chat
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}

              {/* Load More Button */}
              {filteredProducts.length > displayCount && (
                <div className="col-span-full flex justify-center mt-8">
                  <motion.button
                    onClick={() => setDisplayCount(prev => prev + 12)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-8 py-3 rounded-xl font-semibold text-white transition-all duration-300 hover:shadow-lg"
                    style={{ 
                      backgroundColor: '#046C4E',
                      fontFamily: 'Inter',
                      boxShadow: '0 4px 15px 0 rgba(4, 108, 78, 0.3)'
                    }}
                  >
                    Load More Items
                  </motion.button>
                </div>
              )}
            </div>
          ) : (
            // Empty State
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col items-center justify-center py-20 px-6"
            >
              {/* Empty State Illustration */}
              <div className="relative mb-8">
                <div className="w-32 h-32 bg-gradient-to-br from-green-100 to-emerald-100 rounded-full flex items-center justify-center mb-6">
                  <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: '#046C4E' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
              </div>

              {/* Empty State Text */}
              <div className="text-center max-w-md">
                <h2 
                  className="text-2xl font-bold mb-4"
                  style={{ color: '#046C4E', fontFamily: 'Inter' }}
                >
                  Nothing Available to Trade
                </h2>
                <p 
                  className="text-lg mb-6 leading-relaxed"
                  style={{ color: '#666666', fontFamily: 'Inter' }}
                >
                  Looks like your campus marketplace is empty! Be the first to start trading and help build your community.
                </p>

                {/* Call to Action */}
                <div className="space-y-4">
                  <motion.button
                    onClick={() => navigate('/create-listing')}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="px-8 py-4 rounded-xl font-semibold text-white transition-all duration-300 hover:shadow-lg"
                    style={{ 
                      background: 'linear-gradient(135deg, #046C4E 0%, #059669 100%)',
                      fontFamily: 'Inter',
                      boxShadow: '0 4px 15px 0 rgba(4, 108, 78, 0.3)'
                    }}
                  >
                    Start Listing Something to Sell
                  </motion.button>
                  
                  <p 
                    className="text-sm"
                    style={{ color: '#999999', fontFamily: 'Inter' }}
                  >
                    📚 Textbooks • 💻 Electronics • 🏠 Dorm Essentials • 👕 Clothing • 🪑 Furniture
                  </p>
                </div>
              </div>

              {/* Decorative Elements */}
              <div className="absolute top-20 left-10 w-4 h-4 bg-green-200 rounded-full opacity-60"></div>
              <div className="absolute top-40 right-16 w-6 h-6 bg-emerald-200 rounded-full opacity-40"></div>
              <div className="absolute bottom-32 left-20 w-3 h-3 bg-green-300 rounded-full opacity-50"></div>
            </motion.div>
          )
        )}
      </div>

      {/* Chat Modal */}
      {showChat && selectedProduct && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl p-6 w-full max-w-md mx-4"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 
                className="text-lg font-bold"
                style={{ color: '#046C4E', fontFamily: 'Inter' }}
              >
                Chat with {selectedProduct.seller.name}
              </h3>
              <button
                onClick={() => setShowChat(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="mb-4 p-4 rounded-lg" style={{ backgroundColor: '#F1F3EB' }}>
              <p 
                className="text-sm font-medium mb-1"
                style={{ color: '#046C4E', fontFamily: 'Inter' }}
              >
                {selectedProduct.title}
              </p>
              <p 
                className="text-sm"
                style={{ color: '#666666', fontFamily: 'Inter' }}
              >
                ${selectedProduct.price}
              </p>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                placeholder="Type your message..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                style={{ fontFamily: 'Inter' }}
              />
              <div className="flex space-x-2">
                <button
                  className="flex-1 py-2 px-4 rounded-lg font-medium text-white transition-colors"
                  style={{ 
                    backgroundColor: '#046C4E',
                    fontFamily: 'Inter'
                  }}
                >
                  Send Message
                </button>
                <button
                  onClick={() => setShowChat(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 font-medium transition-colors"
                  style={{ 
                    color: '#666666',
                    fontFamily: 'Inter'
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTargetId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl"
          >
            <h3 className="text-lg font-bold mb-2" style={{ color: '#046C4E', fontFamily: 'Inter' }}>Delete listing?</h3>
            <p className="text-sm mb-6" style={{ color: '#666666', fontFamily: 'Inter' }}>
              Are you sure you want to delete this listing? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleCancelDelete}
                className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
                style={{ fontFamily: 'Inter' }}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-lg text-white text-sm"
                style={{ backgroundColor: '#046C4E', fontFamily: 'Inter', opacity: isDeleting ? 0.7 : 1 }}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Marketplace; 