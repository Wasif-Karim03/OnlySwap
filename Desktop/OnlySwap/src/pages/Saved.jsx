import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bookmark, Camera, MessageCircle, Heart, Search, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useChat } from '../hooks/useChat'
import dataManager from '../utils/dataManager'

const Saved = () => {
  const { user } = useAuth()
  const { startChat: startChatContext } = useChat()
  const navigate = useNavigate()
  const [savedProducts, setSavedProducts] = useState([])
  const [products, setProducts] = useState([])
  const [showProductModal, setShowProductModal] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState(null)

  useEffect(() => {
    if (user) {
      loadSavedProducts()
      loadProducts()
    }
  }, [user])

  const loadProducts = () => {
    const allProducts = dataManager.getAllProducts()
    setProducts(allProducts)
  }

  const loadSavedProducts = () => {
    if (user) {
      const saved = dataManager.getSavedProducts(user.id).map(p => p.id)
      setSavedProducts(saved)
    }
  }

  const getSavedProducts = () => {
    if (!user) return []
    return dataManager.getSavedProducts(user.id).filter(product => 
      product.seller.university === user.university &&
      product.seller.id !== user.id
    )
  }

  const unsaveProduct = (productId) => {
    if (!user) return
    
    dataManager.removeSavedProduct(user.id, productId)
    loadSavedProducts()
  }

  const isLiked = (productId) => {
    if (!user) return false
    const interactions = dataManager.getData('onlyswap_interactions') || []
    return interactions.some(interaction => 
      interaction.userId === user.id && 
      interaction.productId === productId && 
      interaction.type === 'like'
    )
  }

  const toggleLike = (productId) => {
    if (!user) return
    
    dataManager.recordInteraction('like', user.id, productId)
    loadProducts() // Reload to get updated data
  }

  const startChat = (productId, sellerName) => {
    // Find the product to get seller ID and other details
    const product = products.find(p => p.id === productId)
    if (!product) return

    // Create or get existing chat
    const chat = startChatContext(
      productId,
      sellerName,
      product.seller.id,
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

  const handleProductClick = (product) => {
    setSelectedProduct(product)
    setShowProductModal(true)
  }

  const closeProductModal = () => {
    setShowProductModal(false)
    setSelectedProduct(null)
  }

  if (!user) {
    return (
      <div className="auth-required">
        <div className="auth-required-content">
          <h2>Please sign in to view your saved products</h2>
          <p>You need to be logged in to access your saved items.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="saved-page">
      <div className="saved-header">
        <div className="saved-header-content">
          <div className="saved-title">
            <Bookmark size={32} />
            <h1>Your Saved Products</h1>
          </div>
          <p className="saved-subtitle">Products you've saved for later ({savedProducts.length})</p>
        </div>
      </div>

      <div className="saved-content">
        {getSavedProducts().length > 0 ? (
          <div className="products-grid">
            {getSavedProducts().map(product => (
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
                  {product.originalPrice > product.price && (
                    <div className="discount-badge">
                      {Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF
                    </div>
                  )}
                  
                  {/* Action buttons overlay */}
                  <div className="product-actions-overlay">
                    <button 
                      className={`action-btn like-btn ${isLiked(product.id) ? 'liked' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleLike(product.id)
                      }}
                      title={isLiked(product.id) ? 'Unlike' : 'Like'}
                    >
                      <Heart size={20} fill={isLiked(product.id) ? 'currentColor' : 'none'} />
                    </button>
                    <button 
                      className={`action-btn save-btn saved`}
                      onClick={(e) => {
                        e.stopPropagation()
                        unsaveProduct(product.id)
                      }}
                      title="Remove from saved"
                    >
                      <Bookmark size={20} fill="currentColor" />
                    </button>
                  </div>
                </div>

                <div className="product-info">
                  <h3 className="product-title">{product.title}</h3>
                  
                  <p className="product-description">{product.description}</p>
                  
                  <div className="price-section">
                    <span className="current-price">${product.price}</span>
                    {product.originalPrice > product.price && (
                      <span className="original-price">${product.originalPrice}</span>
                    )}
                  </div>

                    <div className="seller-info">
                      <span className="seller-name">Posted by {product.seller.name}</span>
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
                          startChat(product.id, product.seller.name)
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
        ) : (
          <div className="no-saved-products">
            <div className="no-saved-content">
              <Bookmark size={64} />
              <h3>No saved products yet</h3>
              <p>Save products you're interested in to view them here later</p>
            </div>
          </div>
        )}
      </div>

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
                          <span>• {selectedProduct.views} views</span>
                          <span>• {selectedProduct.likes} likes</span>
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

export default Saved
