// src/utils/dataManager.js
// Comprehensive Data Management System for OnlySwap

// ============================================================================
// DATA STRUCTURE DEFINITIONS
// ============================================================================

// User Profile Structure
const createUserProfile = (userData) => ({
  id: userData.id || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  email: userData.email,
  password: userData.password, // In production, this should be hashed
  name: userData.name,
  university: userData.university,
  major: userData.major || '',
  graduationYear: userData.graduationYear || '',
  phone: userData.phone || '',
  profileImage: userData.profileImage || '',
  bio: userData.bio || '',
  isVerified: userData.isVerified || false,
  joinDate: new Date().toISOString(),
  lastActive: new Date().toISOString(),
  
  // Activity Tracking
  stats: {
    totalProductsListed: 0,
    totalProductsSold: 0,
    totalProductsBought: 0,
    totalProductsSaved: 0,
    totalProductsLiked: 0,
    totalChats: 0,
    totalViews: 0,
    rating: 5.0,
    reviews: []
  },
  
  // Preferences
  preferences: {
    notifications: {
      email: true,
      push: true,
      chat: true,
      likes: true,
      saves: true
    },
    privacy: {
      showEmail: false,
      showPhone: false,
      showUniversity: true
    }
  },
  
  // University Information
  universityInfo: {
    name: userData.university,
    verified: false,
    verificationDate: null,
    studentId: userData.studentId || '',
    department: userData.department || ''
  }
});


// Interaction Structure
const createInteraction = (type, userId, productId, data = {}) => ({
  id: `interaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  type, // 'like', 'save', 'view', 'share', 'inquiry', 'purchase'
  userId,
  productId,
  timestamp: new Date().toISOString(),
  data
});

// Chat Structure
const createChat = (buyerId, sellerId, productId, productTitle, productImage) => ({
  id: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  buyerId,
  sellerId,
  productId,
  productTitle,
  productImage,
  messages: [],
  status: 'active', // active, closed, archived
  createdAt: new Date().toISOString(),
  lastMessageAt: new Date().toISOString()
});

// ============================================================================
// STORAGE KEYS
// ============================================================================
const STORAGE_KEYS = {
  USERS: 'onlyswap_users',
  CURRENT_USER: 'onlyswap_currentUser',
  PRODUCTS: 'onlyswap_products',
  INTERACTIONS: 'onlyswap_interactions',
  CHATS: 'onlyswap_chats',
  SAVED_PRODUCTS: 'onlyswap_savedProducts',
  ANALYTICS: 'onlyswap_analytics',
  SETTINGS: 'onlyswap_settings'
};

// ============================================================================
// CORE DATA MANAGEMENT FUNCTIONS
// ============================================================================

class DataManager {
  constructor() {
    this.initializeStorage();
  }

  // Initialize storage with default values
  initializeStorage() {
    // Check if we're in a browser environment
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }

    const defaultData = {
      [STORAGE_KEYS.USERS]: [],
      [STORAGE_KEYS.CURRENT_USER]: null,
      [STORAGE_KEYS.PRODUCTS]: [],
      [STORAGE_KEYS.INTERACTIONS]: [],
      [STORAGE_KEYS.CHATS]: [],
      [STORAGE_KEYS.SAVED_PRODUCTS]: {},
      [STORAGE_KEYS.ANALYTICS]: {
        totalUsers: 0,
        totalProducts: 0,
        totalInteractions: 0,
        totalChats: 0,
        dailyStats: {}
      },
      [STORAGE_KEYS.SETTINGS]: {
        appVersion: '1.0.0',
        lastUpdated: new Date().toISOString()
      }
    };

    Object.entries(defaultData).forEach(([key, value]) => {
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    });
  }

  // Generic get/set methods
  getData(key) {
    try {
      // Check if we're in a browser environment
      if (typeof window === 'undefined' || !window.localStorage) {
        return null;
      }
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error(`Error getting data for key ${key}:`, error);
      return null;
    }
  }

  setData(key, data) {
    try {
      // Check if we're in a browser environment
      if (typeof window === 'undefined' || !window.localStorage) {
        return false;
      }
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error(`Error setting data for key ${key}:`, error);
      return false;
    }
  }

  // ============================================================================
  // USER MANAGEMENT
  // ============================================================================

  // Create new user
  createUser(userData) {
    const users = this.getData(STORAGE_KEYS.USERS) || [];
    const newUser = createUserProfile(userData);
    
    // Check if user already exists
    const existingUser = users.find(user => user.email === userData.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }


    users.push(newUser);
    this.setData(STORAGE_KEYS.USERS, users);
    this.updateAnalytics('totalUsers', users.length);
    
    return newUser;
  }

  // Get user by ID
  getUserById(userId) {
    const users = this.getData(STORAGE_KEYS.USERS) || [];
    return users.find(user => user.id === userId);
  }

  // Get user by email
  getUserByEmail(email) {
    const users = this.getData(STORAGE_KEYS.USERS) || [];
    return users.find(user => user.email === email);
  }

  // Update user
  updateUser(userId, updates) {
    const users = this.getData(STORAGE_KEYS.USERS) || [];
    const userIndex = users.findIndex(user => user.id === userId);
    
    if (userIndex !== -1) {
      users[userIndex] = { ...users[userIndex], ...updates, lastActive: new Date().toISOString() };
      this.setData(STORAGE_KEYS.USERS, users);
      
      // Update current user if it's the same user
      const currentUser = this.getData(STORAGE_KEYS.CURRENT_USER);
      if (currentUser && currentUser.id === userId) {
        this.setData(STORAGE_KEYS.CURRENT_USER, users[userIndex]);
      }
      
      return users[userIndex];
    }
    return null;
  }

  // Get all users
  getAllUsers() {
    return this.getData(STORAGE_KEYS.USERS) || [];
  }

  // ============================================================================
  // PRODUCT MANAGEMENT
  // ============================================================================

  // Create new product
  createProduct(productData) {
    const products = this.getData(STORAGE_KEYS.PRODUCTS) || [];
    const newProduct = {
      id: productData.id || `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: productData.title,
      description: productData.description,
      price: parseFloat(productData.price),
      originalPrice: parseFloat(productData.originalPrice),
      category: productData.category,
      condition: productData.condition,
      location: productData.location,
      images: productData.images || [],
      
      // Seller Information
      seller: {
        id: productData.sellerId,
        name: productData.sellerName,
        university: productData.sellerUniversity,
        profileImage: productData.sellerProfileImage || ''
      },
      
      // Product Status
      status: 'active', // active, sold, removed, pending
      timePosted: new Date().toISOString(),
      timeSold: null,
      
      // Engagement Metrics
      engagement: {
        views: 0,
        likes: 0,
        saves: 0,
        shares: 0,
        inquiries: 0
      },
      
      // Product Details
      details: {
        brand: productData.brand || '',
        model: productData.model || '',
        year: productData.year || '',
        color: productData.color || '',
        size: productData.size || '',
        tags: productData.tags || []
      },
      
      // Availability
      availability: {
        isAvailable: true,
        availableUntil: productData.availableUntil || null,
        pickupLocation: productData.pickupLocation || '',
        shippingAvailable: productData.shippingAvailable || false
      }
    };
    
    products.push(newProduct);
    this.setData(STORAGE_KEYS.PRODUCTS, products);
    this.updateAnalytics('totalProducts', products.length);
    
    // Update user stats
    this.updateUserStats(productData.sellerId, 'totalProductsListed', 1);
    
    return newProduct;
  }

  // Get all products
  getAllProducts() {
    const products = this.getData(STORAGE_KEYS.PRODUCTS) || [];
    return products.filter(product => product.status === 'active');
  }

  // Get product by ID
  getProductById(productId) {
    const products = this.getData(STORAGE_KEYS.PRODUCTS) || [];
    return products.find(product => product.id === productId);
  }

  // Get products by seller
  getProductsBySeller(sellerId) {
    const products = this.getData(STORAGE_KEYS.PRODUCTS) || [];
    return products.filter(product => product.seller.id === sellerId && product.status === 'active');
  }

  // Update product
  updateProduct(productId, updates) {
    const products = this.getData(STORAGE_KEYS.PRODUCTS) || [];
    const productIndex = products.findIndex(product => product.id === productId);
    
    if (productIndex !== -1) {
      products[productIndex] = { ...products[productIndex], ...updates };
      this.setData(STORAGE_KEYS.PRODUCTS, products);
      return products[productIndex];
    }
    return null;
  }

  // Delete product
  deleteProduct(productId, sellerId) {
    const products = this.getData(STORAGE_KEYS.PRODUCTS) || [];
    const productIndex = products.findIndex(product => product.id === productId && product.seller.id === sellerId);
    
    if (productIndex !== -1) {
      products.splice(productIndex, 1);
      this.setData(STORAGE_KEYS.PRODUCTS, products);
      this.updateAnalytics('totalProducts', products.length);
      
      // Update user stats
      this.updateUserStats(sellerId, 'totalProductsListed', -1);
      
      return true;
    }
    return false;
  }

  // Search products
  searchProducts(query, filters = {}) {
    let products = this.getAllProducts();
    
    // Search by title and description
    if (query) {
      const searchTerm = query.toLowerCase();
      products = products.filter(product => 
        product.title.toLowerCase().includes(searchTerm) ||
        product.description.toLowerCase().includes(searchTerm) ||
        product.details.tags.some(tag => tag.toLowerCase().includes(searchTerm))
      );
    }
    
    // Apply filters
    if (filters.category && filters.category !== 'All') {
      products = products.filter(product => product.category === filters.category);
    }
    
    if (filters.university && filters.university !== 'All') {
      products = products.filter(product => product.seller.university === filters.university);
    }
    
    if (filters.minPrice) {
      products = products.filter(product => product.price >= parseFloat(filters.minPrice));
    }
    
    if (filters.maxPrice) {
      products = products.filter(product => product.price <= parseFloat(filters.maxPrice));
    }
    
    if (filters.condition && filters.condition !== 'All') {
      products = products.filter(product => product.condition === filters.condition);
    }
    
    // Sort products
    if (filters.sortBy) {
      switch (filters.sortBy) {
        case 'price-low':
          products.sort((a, b) => a.price - b.price);
          break;
        case 'price-high':
          products.sort((a, b) => b.price - a.price);
          break;
        case 'rating':
          products.sort((a, b) => b.engagement.views - a.engagement.views);
          break;
        case 'recent':
        default:
          products.sort((a, b) => new Date(b.timePosted) - new Date(a.timePosted));
          break;
      }
    }
    
    return products;
  }

  // ============================================================================
  // INTERACTION MANAGEMENT
  // ============================================================================

  // Record interaction
  recordInteraction(type, userId, productId, data = {}) {
    const interactions = this.getData(STORAGE_KEYS.INTERACTIONS) || [];
    const newInteraction = createInteraction(type, userId, productId, data);
    
    interactions.push(newInteraction);
    this.setData(STORAGE_KEYS.INTERACTIONS, interactions);
    this.updateAnalytics('totalInteractions', interactions.length);
    
    // Update product engagement
    this.updateProductEngagement(productId, type);
    
    // Update user stats
    this.updateUserStats(userId, `totalProducts${type.charAt(0).toUpperCase() + type.slice(1)}`, 1);
    
    return newInteraction;
  }

  // Get user interactions
  getUserInteractions(userId, type = null) {
    const interactions = this.getData(STORAGE_KEYS.INTERACTIONS) || [];
    let userInteractions = interactions.filter(interaction => interaction.userId === userId);
    
    if (type) {
      userInteractions = userInteractions.filter(interaction => interaction.type === type);
    }
    
    return userInteractions;
  }

  // Get product interactions
  getProductInteractions(productId, type = null) {
    const interactions = this.getData(STORAGE_KEYS.INTERACTIONS) || [];
    let productInteractions = interactions.filter(interaction => interaction.productId === productId);
    
    if (type) {
      productInteractions = productInteractions.filter(interaction => interaction.type === type);
    }
    
    return productInteractions;
  }

  // ============================================================================
  // SAVED PRODUCTS MANAGEMENT
  // ============================================================================

  // Save product for user
  saveProduct(userId, productId) {
    const savedProducts = this.getData(STORAGE_KEYS.SAVED_PRODUCTS) || {};
    
    if (!savedProducts[userId]) {
      savedProducts[userId] = [];
    }
    
    if (!savedProducts[userId].includes(productId)) {
      savedProducts[userId].push(productId);
      this.setData(STORAGE_KEYS.SAVED_PRODUCTS, savedProducts);
      
      // Record interaction
      this.recordInteraction('save', userId, productId);
      
      return true;
    }
    
    return false;
  }

  // Remove saved product
  removeSavedProduct(userId, productId) {
    const savedProducts = this.getData(STORAGE_KEYS.SAVED_PRODUCTS) || {};
    
    if (savedProducts[userId]) {
      const index = savedProducts[userId].indexOf(productId);
      if (index > -1) {
        savedProducts[userId].splice(index, 1);
        this.setData(STORAGE_KEYS.SAVED_PRODUCTS, savedProducts);
        
        // Update user stats
        this.updateUserStats(userId, 'totalProductsSaved', -1);
        
        return true;
      }
    }
    
    return false;
  }

  // Get saved products for user
  getSavedProducts(userId) {
    const savedProducts = this.getData(STORAGE_KEYS.SAVED_PRODUCTS) || {};
    const productIds = savedProducts[userId] || [];
    const products = this.getAllProducts();
    
    return products.filter(product => productIds.includes(product.id));
  }

  // ============================================================================
  // CHAT MANAGEMENT
  // ============================================================================

  // Create or get chat
  createOrGetChat(buyerId, sellerId, productId, productTitle, productImage) {
    const chats = this.getData(STORAGE_KEYS.CHATS) || [];
    
    // Check if chat already exists
    let existingChat = chats.find(chat => 
      chat.buyerId === buyerId && 
      chat.sellerId === sellerId && 
      chat.productId === productId
    );
    
    if (existingChat) {
      return existingChat;
    }
    
    // Create new chat
    const newChat = createChat(buyerId, sellerId, productId, productTitle, productImage);
    chats.push(newChat);
    this.setData(STORAGE_KEYS.CHATS, chats);
    this.updateAnalytics('totalChats', chats.length);
    
    // Update user stats
    this.updateUserStats(buyerId, 'totalChats', 1);
    this.updateUserStats(sellerId, 'totalChats', 1);
    
    return newChat;
  }

  // Get chat by ID
  getChatById(chatId) {
    const chats = this.getData(STORAGE_KEYS.CHATS) || [];
    return chats.find(chat => chat.id === chatId);
  }

  // Get user chats
  getUserChats(userId) {
    const chats = this.getData(STORAGE_KEYS.CHATS) || [];
    return chats.filter(chat => chat.buyerId === userId || chat.sellerId === userId);
  }

  // Send message
  sendMessage(chatId, senderId, message) {
    const chats = this.getData(STORAGE_KEYS.CHATS) || [];
    const chatIndex = chats.findIndex(chat => chat.id === chatId);
    
    if (chatIndex !== -1) {
      const newMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        senderId,
        message,
        timestamp: new Date().toISOString()
      };
      
      chats[chatIndex].messages.push(newMessage);
      chats[chatIndex].lastMessageAt = new Date().toISOString();
      
      this.setData(STORAGE_KEYS.CHATS, chats);
      return newMessage;
    }
    
    return null;
  }

  // ============================================================================
  // ANALYTICS AND STATS
  // ============================================================================

  // Update analytics
  updateAnalytics(metric, value) {
    const analytics = this.getData(STORAGE_KEYS.ANALYTICS) || {};
    analytics[metric] = value;
    analytics.lastUpdated = new Date().toISOString();
    this.setData(STORAGE_KEYS.ANALYTICS, analytics);
  }

  // Get analytics
  getAnalytics() {
    return this.getData(STORAGE_KEYS.ANALYTICS) || {};
  }

  // Update user stats
  updateUserStats(userId, statName, increment = 1) {
    const user = this.getUserById(userId);
    if (user) {
      const currentValue = user.stats[statName] || 0;
      this.updateUser(userId, {
        stats: {
          ...user.stats,
          [statName]: Math.max(0, currentValue + increment)
        }
      });
    }
  }

  // Update product engagement
  updateProductEngagement(productId, type) {
    const product = this.getProductById(productId);
    if (product) {
      const engagement = { ...product.engagement };
      
      switch (type) {
        case 'view':
          engagement.views += 1;
          break;
        case 'like':
          engagement.likes += 1;
          break;
        case 'save':
          engagement.saves += 1;
          break;
        case 'share':
          engagement.shares += 1;
          break;
        case 'inquiry':
          engagement.inquiries += 1;
          break;
      }
      
      this.updateProduct(productId, { engagement });
    }
  }

  // Get user dashboard data
  getUserDashboard(userId) {
    const user = this.getUserById(userId);
    if (!user) return null;
    
    const products = this.getProductsBySeller(userId);
    const savedProducts = this.getSavedProducts(userId);
    const chats = this.getUserChats(userId);
    const interactions = this.getUserInteractions(userId);
    
    return {
      user,
      products,
      savedProducts,
      chats,
      interactions,
      stats: {
        ...user.stats,
        totalProductsListed: products.length,
        totalProductsSaved: savedProducts.length,
        totalChats: chats.length,
        totalInteractions: interactions.length
      }
    };
  }

  // ============================================================================

  // Get detailed user information
  getDetailedUserInfo(userId) {
    const user = this.getUserById(userId);
    if (!user) return null;

    const userProducts = this.getProductsBySeller(userId);
    const savedProducts = this.getSavedProducts(userId);
    const userChats = this.getUserChats(userId);
    const userInteractions = this.getUserInteractions(userId);

    return {
      user,
      products: userProducts,
      savedProducts,
      chats: userChats,
      interactions: userInteractions,
      stats: {
        totalProductsListed: userProducts.length,
        totalProductsSaved: savedProducts.length,
        totalChats: userChats.length,
        totalInteractions: userInteractions.length,
        ...user.stats
      }
    };
  }

  // Get university breakdown
  getUniversityBreakdown(universityName) {
    const users = this.getAllUsers().filter(user => user.university === universityName);
    const products = this.getAllProducts().filter(product => product.seller.university === universityName);
    
    const userDetails = users.map(user => this.getDetailedUserInfo(user.id));
    
    return {
      university: universityName,
      totalUsers: users.length,
      totalProducts: products.length,
      userDetails
    };
  }

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  // Clear all data (for testing)
  clearAllData() {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
    this.initializeStorage();
  }

  // Export data
  exportData() {
    const data = {};
    Object.entries(STORAGE_KEYS).forEach(([name, key]) => {
      data[name] = this.getData(key);
    });
    return data;
  }

  // Import data
  importData(data) {
    Object.entries(data).forEach(([name, value]) => {
      if (STORAGE_KEYS[name]) {
        this.setData(STORAGE_KEYS[name], value);
      }
    });
  }
}

// Create singleton instance
const dataManager = new DataManager();

// Export the instance and individual functions for backward compatibility
export default dataManager;

// Export individual functions for easy use
export const {
  createUser,
  getUserById,
  getUserByEmail,
  updateUser,
  getAllUsers,
  createProduct,
  getAllProducts,
  getProductById,
  getProductsBySeller,
  updateProduct,
  deleteProduct,
  searchProducts,
  recordInteraction,
  getUserInteractions,
  getProductInteractions,
  saveProduct,
  removeSavedProduct,
  getSavedProducts,
  createOrGetChat,
  getChatById,
  getUserChats,
  sendMessage,
  getAnalytics,
  getUserDashboard,
  clearAllData,
  exportData,
  importData
} = dataManager;
