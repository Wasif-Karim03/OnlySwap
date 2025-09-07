import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Building2, 
  Calendar, 
  Package, 
  MessageSquare, 
  Eye, 
  Heart, 
  Trash2, 
  Edit, 
  Plus,
  Activity,
  TrendingUp,
  Clock,
  Shield,
  Ban,
  CheckCircle
} from 'lucide-react';

const UserProfile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [userProducts, setUserProducts] = useState([]);
  const [userChats, setUserChats] = useState([]);
  const [userInteractions, setUserInteractions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    loadUserData();
  }, [userId]);

  const loadUserData = () => {
    try {
      // Load user data
      const users = JSON.parse(localStorage.getItem('onlyswap_users') || '[]');
      const foundUser = users.find(u => u.id === userId);
      
      if (!foundUser) {
        navigate('/admin');
        return;
      }

      setUser(foundUser);

      // Load user's products
      const products = JSON.parse(localStorage.getItem('onlyswap_products') || '[]');
      const userProducts = products.filter(p => p.sellerId === userId);
      setUserProducts(userProducts);

      // Load user's chats
      const chats = JSON.parse(localStorage.getItem('onlyswap_chats') || '[]');
      const userChats = chats.filter(c => c.participants.includes(userId));
      setUserChats(userChats);

      // Load user's interactions (likes, views, etc.)
      const interactions = JSON.parse(localStorage.getItem('onlyswap_interactions') || '[]');
      const userInteractions = interactions.filter(i => i.userId === userId);
      setUserInteractions(userInteractions);

      setLoading(false);
    } catch (error) {
      console.error('Error loading user data:', error);
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActivityTimeline = () => {
    const activities = [];

    // Add user creation
    if (user?.createdAt || user?.joinDate) {
      activities.push({
        type: 'account_created',
        title: 'Account Created',
        description: 'User joined the platform',
        date: user.createdAt || user.joinDate,
        icon: User,
        color: '#10b981'
      });
    }

    // Add product listings
    userProducts.forEach(product => {
      activities.push({
        type: 'product_listed',
        title: 'Product Listed',
        description: `Listed "${product.name}" for $${product.price}`,
        date: product.createdAt,
        icon: Plus,
        color: '#3b82f6',
        productId: product.id
      });
    });

    // Add interactions
    userInteractions.forEach(interaction => {
      const product = userProducts.find(p => p.id === interaction.productId);
      if (product) {
        activities.push({
          type: interaction.type,
          title: interaction.type === 'like' ? 'Liked Product' : 'Viewed Product',
          description: `${interaction.type === 'like' ? 'Liked' : 'Viewed'} "${product.name}"`,
          date: interaction.timestamp,
          icon: interaction.type === 'like' ? Heart : Eye,
          color: interaction.type === 'like' ? '#ef4444' : '#8b5cf6'
        });
      }
    });

    // Add chat activities
    userChats.forEach(chat => {
      activities.push({
        type: 'chat_started',
        title: 'Chat Started',
        description: `Started conversation about "${chat.productName || 'product'}"`,
        date: chat.createdAt,
        icon: MessageSquare,
        color: '#f59e0b'
      });
    });

    // Sort by date (newest first)
    return activities.sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const getStats = () => {
    const totalProducts = userProducts.length;
    const activeProducts = userProducts.filter(p => !p.isDeleted).length;
    const totalLikes = userInteractions.filter(i => i.type === 'like').length;
    const totalViews = userInteractions.filter(i => i.type === 'view').length;
    const totalChats = userChats.length;

    return {
      totalProducts,
      activeProducts,
      totalLikes,
      totalViews,
      totalChats
    };
  };

  if (loading) {
    return (
      <div className="user-profile-loading">
        <div className="loading-spinner"></div>
        <p>Loading user profile...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="user-profile-error">
        <h2>User Not Found</h2>
        <p>The requested user could not be found.</p>
        <button onClick={() => navigate('/admin')} className="back-btn">
          <ArrowLeft size={16} />
          Back to Admin
        </button>
      </div>
    );
  }

  const stats = getStats();
  const activities = getActivityTimeline();

  return (
    <div className="user-profile">
      <div className="profile-header">
        <button onClick={() => navigate('/admin')} className="back-btn">
          <ArrowLeft size={16} />
          Back to Admin
        </button>
        <h1>User Profile</h1>
      </div>

      <div className="profile-content">
        {/* User Info Card */}
        <div className="user-info-card">
          <div className="user-avatar-large">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="user-details">
            <h2>{user.name}</h2>
            <div className="user-meta">
              <div className="meta-item">
                <Mail size={16} />
                <span>{user.email}</span>
              </div>
              <div className="meta-item">
                <Building2 size={16} />
                <span>{user.university || 'No university'}</span>
              </div>
              <div className="meta-item">
                <Calendar size={16} />
                <span>Joined {formatDate(user.createdAt || user.joinDate)}</span>
              </div>
              <div className="meta-item">
                {user.isBlocked ? (
                  <>
                    <Ban size={16} />
                    <span className="blocked-status">Blocked</span>
                  </>
                ) : (
                  <>
                    <CheckCircle size={16} />
                    <span className="active-status">Active</span>
                  </>
                )}
              </div>
            </div>
            {user.isBlocked && user.blockReason && (
              <div className="block-reason-display">
                <strong>Block Reason:</strong> {user.blockReason}
              </div>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">
              <Package size={24} />
            </div>
            <div className="stat-content">
              <h3>{stats.totalProducts}</h3>
              <p>Total Products</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              <TrendingUp size={24} />
            </div>
            <div className="stat-content">
              <h3>{stats.activeProducts}</h3>
              <p>Active Listings</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              <Heart size={24} />
            </div>
            <div className="stat-content">
              <h3>{stats.totalLikes}</h3>
              <p>Total Likes</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              <Eye size={24} />
            </div>
            <div className="stat-content">
              <h3>{stats.totalViews}</h3>
              <p>Product Views</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">
              <MessageSquare size={24} />
            </div>
            <div className="stat-content">
              <h3>{stats.totalChats}</h3>
              <p>Chats Started</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="profile-tabs">
          <button 
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <Activity size={16} />
            Activity Timeline
          </button>
          <button 
            className={`tab-btn ${activeTab === 'products' ? 'active' : ''}`}
            onClick={() => setActiveTab('products')}
          >
            <Package size={16} />
            Products ({stats.totalProducts})
          </button>
          <button 
            className={`tab-btn ${activeTab === 'chats' ? 'active' : ''}`}
            onClick={() => setActiveTab('chats')}
          >
            <MessageSquare size={16} />
            Chats ({stats.totalChats})
          </button>
        </div>

        {/* Tab Content */}
        <div className="tab-content">
          {activeTab === 'overview' && (
            <div className="activity-timeline">
              <h3>Activity Timeline</h3>
              {activities.length > 0 ? (
                <div className="timeline">
                  {activities.map((activity, index) => {
                    const IconComponent = activity.icon;
                    return (
                      <div key={index} className="timeline-item">
                        <div className="timeline-marker" style={{ backgroundColor: activity.color }}>
                          <IconComponent size={16} />
                        </div>
                        <div className="timeline-content">
                          <h4>{activity.title}</h4>
                          <p>{activity.description}</p>
                          <span className="timeline-date">{formatDate(activity.date)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="no-activity">
                  <Activity size={48} />
                  <p>No activity recorded for this user.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'products' && (
            <div className="products-section">
              <h3>Products Listed</h3>
              {userProducts.length > 0 ? (
                <div className="products-grid">
                  {userProducts.map((product, index) => (
                    <div key={index} className="product-card">
                      <div className="product-image">
                        {product.image ? (
                          <img src={product.image} alt={product.name} />
                        ) : (
                          <Package size={32} />
                        )}
                      </div>
                      <div className="product-info">
                        <h4>{product.name}</h4>
                        <p className="product-price">${product.price}</p>
                        <p className="product-description">{product.description}</p>
                        <div className="product-meta">
                          <span className="product-date">
                            <Clock size={12} />
                            Listed {formatDate(product.createdAt)}
                          </span>
                          <span className={`product-status ${product.isDeleted ? 'deleted' : 'active'}`}>
                            {product.isDeleted ? 'Deleted' : 'Active'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-products">
                  <Package size={48} />
                  <p>No products listed by this user.</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'chats' && (
            <div className="chats-section">
              <h3>Chat Conversations</h3>
              {userChats.length > 0 ? (
                <div className="chats-list">
                  {userChats.map((chat, index) => (
                    <div key={index} className="chat-item">
                      <div className="chat-info">
                        <h4>{chat.productName || 'Product Chat'}</h4>
                        <p>Started {formatDate(chat.createdAt)}</p>
                        <p>{chat.messages?.length || 0} messages</p>
                      </div>
                      <div className="chat-participants">
                        <span>Participants: {chat.participants.length}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="no-chats">
                  <MessageSquare size={48} />
                  <p>No chat conversations for this user.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfile;
