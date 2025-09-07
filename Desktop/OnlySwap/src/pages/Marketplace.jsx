import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Filter, MessageCircle, Heart, Share2, MapPin, Clock, Plus, Upload, X, Camera, Bookmark } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useChat } from '../hooks/useChat'
import { getAllProducts, searchProducts, createProduct, getProductsBySeller, deleteProductBySeller, toggleProductLike, incrementProductViews } from '../utils/productManager'
import dataManager from '../utils/dataManager'

const Marketplace = () => {
  const { user } = useAuth()
  const { startChat: startChatContext } = useChat()
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [selectedUniversity, setSelectedUniversity] = useState('All')
  const [sortBy, setSortBy] = useState('recent')
  const [isSellerMode, setIsSellerMode] = useState(false)
  const [showProductForm, setShowProductForm] = useState(false)
  const [productImages, setProductImages] = useState([])
  const [productForm, setProductForm] = useState({
    title: '',
    description: '',
    price: '',
    originalPrice: '',
    category: 'Electronics',
    condition: 'Excellent',
    location: user?.university || 'Ohio Wesleyan University'
  })

  // State for products and seller data
  const [products, setProducts] = useState([])
  const [sellerProducts, setSellerProducts] = useState([])
  const [sellerStats, setSellerStats] = useState({ totalProducts: 0, totalViews: 0, totalLikes: 0, averageRating: 0 })
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [productToDelete, setProductToDelete] = useState(null)
  const [showProductModal, setShowProductModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [savedProducts, setSavedProducts] = useState([])
  const [saveFeedback, setSaveFeedback] = useState(null)

  const categories = ['All', 'Electronics', 'Books', 'Transportation', 'Furniture', 'Appliances', 'Clothing', 'Sports']
  
  // Load products on component mount and when user changes
  useEffect(() => {
    loadProducts()
    if (user) {
      loadSellerData()
      loadSavedProducts()
    }
  }, [user])

  const loadProducts = () => {
    const allProducts = getAllProducts()
    console.log('Loaded products:', allProducts)
    allProducts.forEach(product => {
      console.log(`Product ${product.id} images:`, product.images)
    })
    setProducts(allProducts)
  }

  const loadSellerData = () => {
    if (user) {
      const userProducts = getProductsBySeller(user.id)
      setSellerProducts(userProducts)
      setSellerStats({
        totalProducts: userProducts.length,
        totalViews: userProducts.reduce((sum, product) => sum + (product.views || 0), 0),
        totalLikes: userProducts.reduce((sum, product) => sum + (product.likes || 0), 0),
        averageRating: userProducts.length > 0 ? userProducts.reduce((sum, product) => sum + product.rating, 0) / userProducts.length : 0
      })
    }
  }

  // Get unique universities from products
  const universities = ['All', ...Array.from(new Set(products.map(product => product.sellerUniversity)))]

  const filteredProducts = searchProducts(searchTerm, {
    category: selectedCategory,
    university: selectedUniversity,
    sortBy: sortBy
  })

  // Filter products based on mode and user
  const sortedProducts = isSellerMode 
    ? filteredProducts // In seller mode, show all products (including own)
    : filteredProducts.filter(product => {
        // In buyer mode, show products from same university but not own products
        const isSameUniversity = product.sellerUniversity === user?.university
        const isNotOwnProduct = product.sellerId !== user?.id
        
        // Debug logging
        console.log('Product filtering debug:', {
          productTitle: product.title,
          productUniversity: product.sellerUniversity,
          userUniversity: user?.university,
          productSellerId: product.sellerId,
          userId: user?.id,
          isSameUniversity,
          isNotOwnProduct,
          willShow: isSameUniversity && isNotOwnProduct
        })
        
        return isSameUniversity && isNotOwnProduct
      })

  const toggleLike = (productId) => {
    toggleProductLike(productId)
    loadProducts() // Refresh products to update UI
  }

  const startChat = (productId, sellerName) => {
    // Find the product to get seller ID and other details
    const product = products.find(p => p.id === productId)
    if (!product) return

    // Create or get existing chat
    const chat = startChatContext(
      productId,
      sellerName,
      product.sellerId,
      product.title,
      product.images[0]
    )

    // Navigate to chat page
    navigate(`/chat/${chat.id}`)
  }

  const handleBuy = (product) => {
    // Placeholder for buy functionality
    console.log(`Buying product: ${product.title}`)
    alert(`Buy ${product.title} for $${product.price} - Feature coming soon!`)
  }

  const handleDeleteProduct = (productId) => {
    if (!user) return
    
    const product = sellerProducts.find(p => p.id === productId)
    setProductToDelete(product)
    setShowDeleteModal(true)
  }

  const confirmDelete = () => {
    if (!productToDelete || !user) return
    
    try {
      const success = deleteProductBySeller(productToDelete.id, user.id)
      if (success) {
        // Refresh data
        loadProducts()
        loadSellerData()
        setShowDeleteModal(false)
        setProductToDelete(null)
      } else {
        alert('Failed to delete product. You can only delete your own products.')
      }
    } catch (error) {
      console.error('Error deleting product:', error)
      alert('Failed to delete product. Please try again.')
    }
  }

  const cancelDelete = () => {
    setShowDeleteModal(false)
    setProductToDelete(null)
  }

  const handleProductClick = (product) => {
    setSelectedProduct(product)
    setShowProductModal(true)
  }

  const closeProductModal = () => {
    setShowProductModal(false)
    setSelectedProduct(null)
  }

  const loadSavedProducts = () => {
    if (user) {
      const saved = dataManager.getSavedProducts(user.id)
      setSavedProducts(saved)
    }
  }

  const saveProduct = (productId) => {
    if (user) {
      dataManager.saveProduct(user.id, productId)
      loadSavedProducts() // Refresh saved products list
      setSaveFeedback('Product saved!')
      setTimeout(() => setSaveFeedback(null), 2000)
    }
  }

  const unsaveProduct = (productId) => {
    if (user) {
      dataManager.removeSavedProduct(user.id, productId)
      loadSavedProducts() // Refresh saved products list
      setSaveFeedback('Product removed from saved!')
      setTimeout(() => setSaveFeedback(null), 2000)
    }
  }

  const isProductSaved = (productId) => {
    if (!user) return false
    return savedProducts.some(product => product.id === productId)
  }

  const getSavedProducts = () => {
    return savedProducts
  }

  const handleImageUpload = async (event) => {
    const files = Array.from(event.target.files)
    console.log('Files selected:', files)
    const newImages = await Promise.all(
      files.map(async (file) => {
        const base64 = await convertToBase64(file)
        console.log('Converted to base64:', base64.substring(0, 50) + '...')
        return {
          id: Date.now() + Math.random(),
          file,
          preview: base64
        }
      })
    )
    console.log('New images created:', newImages)
    setProductImages(prev => [...prev, ...newImages])
  }

  const convertToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => resolve(reader.result)
      reader.onerror = error => reject(error)
    })
  }

  const removeImage = (imageId) => {
    setProductImages(prev => prev.filter(img => img.id !== imageId))
  }

  const handleFormChange = (field, value) => {
    setProductForm(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handleSubmitProduct = (e) => {
    e.preventDefault()
    
    if (!user) {
      alert('Please sign in to add products')
      return
    }

    try {
      const newProduct = createProduct({
        title: productForm.title,
        description: productForm.description,
        price: productForm.price,
        originalPrice: productForm.originalPrice,
        category: productForm.category,
        condition: productForm.condition,
        location: productForm.location,
        images: productImages.map(img => img.preview), // Use preview URLs
        sellerId: user.id,
        sellerName: user.name,
        sellerUniversity: user.university
      })

      console.log('Product created successfully:', newProduct)
      console.log('Images stored:', newProduct.images)
      alert('Product submitted successfully!')
      
      // Reset form
      setShowProductForm(false)
      setProductForm({
        title: '',
        description: '',
        price: '',
        originalPrice: '',
        category: 'Electronics',
        condition: 'Excellent',
        location: user?.university || 'Ohio Wesleyan University'
      })
      // Reset images
      setProductImages([])
      
      // Refresh data
      loadProducts()
      loadSellerData()
    } catch (error) {
      console.error('Error creating product:', error)
      alert('Failed to create product. Please try again.')
    }
  }

  return (
    <div className="marketplace-container">
      {/* Save Feedback */}
      {saveFeedback && (
        <div className="save-feedback">
          {saveFeedback}
        </div>
      )}
      
      {/* Header */}
      <div className="marketplace-header">
        {/* Floating decorative elements */}
        <div className="floating-shape"></div>
        <div className="floating-shape"></div>
        <div className="floating-shape"></div>
        
        <div className="header-content">
          <h1>OnlySwap Marketplace</h1>
          <p>Buy, sell, and trade with fellow students</p>
          
          <div className="user-welcome">
            <h3>Welcome back, {user?.name}!</h3>
            <p className="user-university-header">🏫 {user?.university}</p>
          </div>
          
          {/* Mode Toggle */}
          <div className="mode-toggle">
            <button 
              className={`mode-btn ${!isSellerMode ? 'active' : ''}`}
              onClick={() => setIsSellerMode(false)}
            >
              Browse
            </button>
            <button 
              className={`mode-btn ${isSellerMode ? 'active' : ''}`}
              onClick={() => setIsSellerMode(true)}
            >
              Sell
            </button>
          </div>
        </div>
      </div>

      {/* Content based on mode */}
      {!isSellerMode ? (
        <>
          {/* Browse Mode - Search and Products */}
          <div className="search-filters">
            <div className="search-section">
              <div className="search-input-wrapper">
                <Search className="search-icon" />
                <input
                  type="text"
                  placeholder="Search for products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>

            <div className="filters-section">
              <div className="filter-group">
                <label>Category:</label>
                <select 
                  value={selectedCategory} 
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="filter-select"
                >
                  {categories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>University:</label>
                <select 
                  value={selectedUniversity} 
                  onChange={(e) => setSelectedUniversity(e.target.value)}
                  className="filter-select"
                >
                  {universities.map(university => (
                    <option key={university} value={university}>{university}</option>
                  ))}
                </select>
              </div>

              <div className="filter-group">
                <label>Sort by:</label>
                <select 
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value)}
                  className="filter-select"
                >
                  <option value="recent">Most Recent</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="rating">Highest Rated</option>
                </select>
              </div>
            </div>
          </div>

          {/* Products Grid */}
          <div className="products-section">
            <div className="products-header">
              <h2>{filteredProducts.length} products found</h2>
            </div>

            <div className="products-grid">
              {sortedProducts.map(product => (
                <div key={product.id} className="product-card" onClick={() => handleProductClick(product)}>
                  <div className="product-image">
                    {product.images && product.images.length > 0 ? (
                      <img 
                        src={product.images[0]} 
                        alt={product.title}
                        onLoad={() => console.log('Image loaded successfully for product:', product.id)}
                        onError={(e) => console.log('Image failed to load for product:', product.id, 'Error:', e)}
                      />
                    ) : (
                      <div className="placeholder-image">
                        <Camera size={32} />
                      </div>
                    )}
                    
                    {/* Action buttons overlay */}
                    <div className="product-actions-overlay">
                      <button 
                        className={`action-btn like-btn ${product.isLiked ? 'liked' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleLike(product.id)
                        }}
                        title={product.isLiked ? 'Unlike' : 'Like'}
                      >
                        <Heart size={20} fill={product.isLiked ? 'currentColor' : 'none'} />
                      </button>
                      <button 
                        className={`action-btn save-btn ${isProductSaved(product.id) ? 'saved' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (isProductSaved(product.id)) {
                            unsaveProduct(product.id)
                          } else {
                            saveProduct(product.id)
                          }
                        }}
                        title={isProductSaved(product.id) ? 'Remove from saved' : 'Save for later'}
                      >
                        <Bookmark size={20} fill={isProductSaved(product.id) ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>

                  <div className="product-info">
                    <h3 className="product-title">{product.title}</h3>
                    
                    <p className="product-description">{product.description}</p>
                    
                    <div className="price-section">
                      <span className="current-price">${product.price}</span>
                    </div>


                    <div className="product-actions">
                      <button 
                        className="buy-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleBuy(product)
                        }}
                      >
                        Buy Now
                      </button>
                      <button 
                        className="chat-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          startChat(product.id, product.sellerName)
                        }}
                      >
                        <MessageCircle size={18} />
                        Chat
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {sortedProducts.length === 0 && (
              <div className="no-products">
                <div className="no-products-content">
                  <Search size={64} />
                  <h3>No products found</h3>
                  <p>Try adjusting your search or filters</p>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Seller Mode - Product Management */}
          <div className="seller-dashboard">
            <div className="seller-header">
              <h2>Your Products</h2>
              <button 
                className="add-product-btn"
                onClick={() => setShowProductForm(true)}
              >
                <Plus size={20} />
                Add New Product
              </button>
            </div>

            <div className="seller-content">
              <div className="seller-stats">
                <div className="stat-card">
                  <h3>{sellerStats.totalProducts}</h3>
                  <p>Active Listings</p>
                </div>
                <div className="stat-card">
                  <h3>{sellerStats.totalViews}</h3>
                  <p>Total Views</p>
                </div>
                <div className="stat-card">
                  <h3>{sellerStats.totalLikes}</h3>
                  <p>Likes Received</p>
                </div>
              </div>

              <div className="seller-products">
                {sellerProducts.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-state-content">
                      <Upload size={64} />
                      <h3>No products yet</h3>
                      <p>Start by adding your first product to the marketplace</p>
                    </div>
                  </div>
                ) : (
                  <div className="products-grid">
                    {sellerProducts.map(product => (
                      <div key={product.id} className="product-card">
                        <div className="product-image">
                          {product.images && product.images.length > 0 ? (
                            <img src={product.images[0]} alt={product.title} />
                          ) : (
                            <div className="placeholder-image">
                              <Camera size={32} />
                            </div>
                          )}
                        </div>
                        <div className="product-info">
                          <h3>{product.title}</h3>
                          <p className="product-price">${product.price}</p>
                          <p className="product-description">{product.description}</p>
                          <div className="product-meta">
                            <span className="product-category">{product.category}</span>
                            <span className="product-condition">{product.condition}</span>
                          </div>
                          <div className="seller-actions">
                            <button 
                              className="delete-btn"
                              onClick={() => handleDeleteProduct(product.id)}
                              title="Delete Product"
                            >
                              <X size={16} />
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Product Upload Modal */}
      {showProductForm && (
        <div className="modal-overlay">
          <div className="product-form-modal">
            <div className="modal-header">
              <h2>Add New Product</h2>
              <button 
                className="close-btn"
                onClick={() => setShowProductForm(false)}
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmitProduct} className="product-form">
              {/* Image Upload Section */}
              <div className="form-section">
                <label className="form-label">Product Images</label>
                <div className="image-upload-area">
                  <input
                    type="file"
                    id="image-upload"
                    multiple
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden-input"
                  />
                  <label htmlFor="image-upload" className="upload-btn">
                    <Camera size={24} />
                    <span>Upload Images</span>
                  </label>
                  
                  {productImages.length > 0 && (
                    <div className="image-preview-grid">
                      {productImages.map(image => (
                        <div key={image.id} className="image-preview-item">
                          <img src={image.preview} alt="Preview" />
                          <button
                            type="button"
                            className="remove-image-btn"
                            onClick={() => removeImage(image.id)}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Product Details */}
              <div className="form-section">
                <label className="form-label">Product Title *</label>
                <input
                  type="text"
                  value={productForm.title}
                  onChange={(e) => handleFormChange('title', e.target.value)}
                  placeholder="Enter product title"
                  className="form-input"
                  required
                />
              </div>

              <div className="form-section">
                <label className="form-label">Description *</label>
                <textarea
                  value={productForm.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  placeholder="Describe your product..."
                  className="form-textarea"
                  rows="4"
                  required
                />
              </div>

              <div className="form-row">
                <div className="form-section">
                  <label className="form-label">Selling Price *</label>
                  <input
                    type="number"
                    value={productForm.price}
                    onChange={(e) => handleFormChange('price', e.target.value)}
                    placeholder="0"
                    className="form-input"
                    required
                  />
                </div>

                <div className="form-section">
                  <label className="form-label">Original Price</label>
                  <input
                    type="number"
                    value={productForm.originalPrice}
                    onChange={(e) => handleFormChange('originalPrice', e.target.value)}
                    placeholder="0"
                    className="form-input"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-section">
                  <label className="form-label">Category *</label>
                  <select
                    value={productForm.category}
                    onChange={(e) => handleFormChange('category', e.target.value)}
                    className="form-select"
                    required
                  >
                    {categories.filter(cat => cat !== 'All').map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>

                <div className="form-section">
                  <label className="form-label">Condition *</label>
                  <select
                    value={productForm.condition}
                    onChange={(e) => handleFormChange('condition', e.target.value)}
                    className="form-select"
                    required
                  >
                    <option value="Excellent">Excellent</option>
                    <option value="Good">Good</option>
                    <option value="Fair">Fair</option>
                    <option value="Poor">Poor</option>
                  </select>
                </div>
              </div>

              <div className="form-section">
                <label className="form-label">Location *</label>
                <input
                  type="text"
                  value={productForm.location}
                  onChange={(e) => handleFormChange('location', e.target.value)}
                  placeholder="Where is this item located?"
                  className="form-input"
                  required
                />
              </div>

              <div className="form-actions">
                <button 
                  type="button" 
                  className="cancel-btn"
                  onClick={() => setShowProductForm(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="submit-btn">
                  <Upload size={20} />
                  List Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={cancelDelete}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete Product</h3>
              <button className="close-btn" onClick={cancelDelete}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-content">
              <div className="warning-icon">
                <X size={48} />
              </div>
              <p>Are you sure you want to delete this product?</p>
              {productToDelete && (
                <div className="product-preview">
                  <strong>"{productToDelete.title}"</strong>
                  <span className="price">${productToDelete.price}</span>
                </div>
              )}
              <p className="warning-text">This action cannot be undone.</p>
            </div>
            <div className="modal-actions">
              <button className="cancel-btn" onClick={cancelDelete}>
                Cancel
              </button>
              <button className="delete-confirm-btn" onClick={confirmDelete}>
                Delete Product
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      {showProductModal && selectedProduct && (
        <div className="modal-overlay" onClick={closeProductModal}>
          <div className="product-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Product Details</h2>
              <button className="close-btn" onClick={closeProductModal}>
                <X size={24} />
              </button>
            </div>
            
            <div className="modal-content">
              <div className="product-images">
                {selectedProduct.images && selectedProduct.images.length > 0 ? (
                  <div className="main-image">
                    <img src={selectedProduct.images[0]} alt={selectedProduct.title} />
                  </div>
                ) : (
                  <div className="main-image placeholder">
                    <Camera size={64} />
                    <p>No image available</p>
                  </div>
                )}
                
                {selectedProduct.images && selectedProduct.images.length > 1 && (
                  <div className="thumbnail-images">
                    {selectedProduct.images.slice(1, 4).map((image, index) => (
                      <img key={index} src={image} alt={`${selectedProduct.title} ${index + 2}`} />
                    ))}
                  </div>
                )}
              </div>

              <div className="product-details">
                <div className="product-header">
                  <h1 className="product-title">{selectedProduct.title}</h1>
                  <div className="price-section">
                    <span className="current-price">${selectedProduct.price}</span>
                    {selectedProduct.originalPrice > selectedProduct.price && (
                      <span className="original-price">${selectedProduct.originalPrice}</span>
                    )}
                  </div>
                </div>

                <div className="product-description">
                  <h3>Description</h3>
                  <p>{selectedProduct.description}</p>
                </div>

                <div className="product-specs">
                  <div className="spec-item">
                    <strong>Category:</strong>
                    <span>{selectedProduct.category}</span>
                  </div>
                  <div className="spec-item">
                    <strong>Condition:</strong>
                    <span>{selectedProduct.condition}</span>
                  </div>
                  <div className="spec-item">
                    <strong>Location:</strong>
                    <span>{selectedProduct.location}</span>
                  </div>
                  <div className="spec-item">
                    <strong>Posted:</strong>
                    <span>{new Date(selectedProduct.timePosted).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="seller-info">
                  <h3>Seller Information</h3>
                  <div className="seller-details">
                    <div className="seller-profile">
                      <div className="seller-avatar">
                        {selectedProduct.sellerName.charAt(0).toUpperCase()}
                      </div>
                      <div className="seller-info-text">
                        <h4>{selectedProduct.sellerName}</h4>
                        <p>🏫 {selectedProduct.sellerUniversity}</p>
                        <div className="seller-rating">
                          <span>⭐ {selectedProduct.rating}</span>
                          <span>• {selectedProduct.views || 0} views</span>
                          <span>• {selectedProduct.likes || 0} likes</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="modal-actions">
                  <button 
                    className="chat-btn primary"
                    onClick={() => {
                      startChat(selectedProduct.id, selectedProduct.sellerName)
                      closeProductModal()
                    }}
                  >
                    <MessageCircle size={20} />
                    Chat with Seller
                  </button>
                  <button 
                    className="like-btn"
                    onClick={() => toggleLike(selectedProduct.id)}
                  >
                    <Heart size={20} />
                    {selectedProduct.isLiked ? 'Liked' : 'Like'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Marketplace
