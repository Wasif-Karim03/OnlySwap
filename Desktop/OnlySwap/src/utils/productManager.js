// src/utils/productManager.js
const PRODUCTS_KEY = 'onlyswap_products';

const getProducts = () => {
  const products = localStorage.getItem(PRODUCTS_KEY);
  return products ? JSON.parse(products) : [];
};

const saveProducts = (products) => {
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
};

export const createProduct = ({ title, description, price, originalPrice, category, condition, location, images, sellerId, sellerName, sellerUniversity }) => {
  const products = getProducts();
  
  const newProduct = {
    id: Date.now() + Math.random(), // Unique ID
    title,
    description,
    price: parseFloat(price),
    originalPrice: parseFloat(originalPrice),
    category,
    condition,
    location,
    images: images || [],
    sellerId,
    sellerName,
    sellerUniversity,
    timePosted: new Date().toISOString(),
    rating: 5.0, // Default rating
    isLiked: false,
    views: 0,
    status: 'active' // active, sold, removed
  };
  
  products.push(newProduct);
  saveProducts(products);
  return newProduct;
};

// Initialize sample products if none exist
const initializeSampleProducts = () => {
  const existingProducts = getProducts();
  if (existingProducts.length === 0) {
    const sampleProducts = [
      {
        id: 1,
        title: "MacBook Pro 2021 - Excellent Condition",
        description: "M1 Pro chip, 16GB RAM, 512GB SSD. Perfect for students!",
        price: 1200,
        originalPrice: 1800,
        images: [], // Empty for now - will be populated by user uploads
        category: "Electronics",
        condition: "Excellent",
        location: "Ohio Wesleyan University",
        timePosted: "2023-10-26T10:00:00Z",
        sellerId: "sample-seller-1",
        sellerName: "John D.",
        sellerUniversity: "Ohio Wesleyan University",
        rating: 4.8,
        isLiked: false,
        views: 150,
        likes: 25,
        status: 'active'
      },
      {
        id: 2,
        title: "Calculus Textbook - Stewart 8th Edition",
        description: "Used but in great condition. No writing inside.",
        price: 45,
        originalPrice: 120,
        images: [],
        category: "Books",
        condition: "Good",
        location: "Ohio Wesleyan University",
        timePosted: "2023-10-25T14:30:00Z",
        sellerId: "sample-seller-2",
        sellerName: "Sarah M.",
        sellerUniversity: "Ohio Wesleyan University",
        rating: 4.9,
        isLiked: true,
        views: 120,
        likes: 30,
        status: 'active'
      }
    ];
    saveProducts(sampleProducts);
  }
};

// Call initialization when the module is loaded
initializeSampleProducts();

export const getAllProducts = () => {
  return getProducts().filter(product => product.status === 'active');
};

export const getProductById = (id) => {
  const products = getProducts();
  return products.find(product => product.id === id);
};

export const getProductsBySeller = (sellerId) => {
  const products = getProducts();
  return products.filter(product => product.sellerId === sellerId && product.status === 'active');
};

export const updateProduct = (id, updates) => {
  const products = getProducts();
  const productIndex = products.findIndex(product => product.id === id);
  
  if (productIndex !== -1) {
    products[productIndex] = { ...products[productIndex], ...updates };
    saveProducts(products);
    return products[productIndex];
  }
  return null;
};

export const deleteProduct = (id) => {
  const products = getProducts();
  const productIndex = products.findIndex(product => product.id === id);
  
  if (productIndex !== -1) {
    products[productIndex].status = 'removed';
    saveProducts(products);
    return true;
  }
  return false;
};

export const deleteProductBySeller = (productId, sellerId) => {
  const products = getProducts();
  const productIndex = products.findIndex(product => product.id === productId && product.sellerId === sellerId);
  
  if (productIndex !== -1) {
    products.splice(productIndex, 1); // Actually remove the product
    saveProducts(products);
    return true;
  }
  return false;
};

export const searchProducts = (query, filters = {}) => {
  let products = getAllProducts();
  
  // Search by title and description
  if (query) {
    const searchTerm = query.toLowerCase();
    products = products.filter(product => 
      product.title.toLowerCase().includes(searchTerm) ||
      product.description.toLowerCase().includes(searchTerm)
    );
  }
  
  // Filter by category
  if (filters.category && filters.category !== 'All') {
    products = products.filter(product => product.category === filters.category);
  }
  
  // Filter by university
  if (filters.university && filters.university !== 'All') {
    products = products.filter(product => product.sellerUniversity === filters.university);
  }
  
  // Filter by price range
  if (filters.minPrice) {
    products = products.filter(product => product.price >= parseFloat(filters.minPrice));
  }
  
  if (filters.maxPrice) {
    products = products.filter(product => product.price <= parseFloat(filters.maxPrice));
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
        products.sort((a, b) => b.rating - a.rating);
        break;
      case 'recent':
      default:
        products.sort((a, b) => new Date(b.timePosted) - new Date(a.timePosted));
        break;
    }
  }
  
  return products;
};

export const toggleProductLike = (id) => {
  const products = getProducts();
  const productIndex = products.findIndex(product => product.id === id);
  
  if (productIndex !== -1) {
    products[productIndex].isLiked = !products[productIndex].isLiked;
    saveProducts(products);
    return products[productIndex].isLiked;
  }
  return false;
};

export const incrementProductViews = (id) => {
  const products = getProducts();
  const productIndex = products.findIndex(product => product.id === id);
  
  if (productIndex !== -1) {
    products[productIndex].views = (products[productIndex].views || 0) + 1;
    saveProducts(products);
  }
};

export const getProductStats = (sellerId) => {
  const products = getProductsBySeller(sellerId);
  
  return {
    totalProducts: products.length,
    totalViews: products.reduce((sum, product) => sum + (product.views || 0), 0),
    totalLikes: products.reduce((sum, product) => sum + (product.isLiked ? 1 : 0), 0),
    averageRating: products.length > 0 ? products.reduce((sum, product) => sum + product.rating, 0) / products.length : 0
  };
};
