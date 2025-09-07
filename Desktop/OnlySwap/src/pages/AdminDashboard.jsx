import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  Building2, 
  Package, 
  MessageSquare, 
  TrendingUp, 
  Eye, 
  Heart, 
  Star,
  BarChart3,
  Activity,
  Shield,
  LogOut,
  RefreshCw
} from 'lucide-react';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalUniversities: 0,
    totalProducts: 0,
    totalChats: 0,
    totalViews: 0,
    totalLikes: 0,
    activeUsers: 0,
    recentActivity: []
  });
  const [users, setUsers] = useState([]);
  const [products, setProducts] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState('overview');

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = () => {
    try {
      // Load users
      const usersData = JSON.parse(localStorage.getItem('users') || '[]');
      setUsers(usersData);

      // Load products
      const productsData = JSON.parse(localStorage.getItem('products') || '[]');
      setProducts(productsData);

      // Load chats
      const chatsData = JSON.parse(localStorage.getItem('chats') || '[]');

      // Calculate universities
      const universitySet = new Set();
      usersData.forEach(user => {
        if (user.university) {
          universitySet.add(user.university);
        }
      });
      const universitiesList = Array.from(universitySet);
      setUniversities(universitiesList);

      // Calculate stats
      const totalViews = productsData.reduce((sum, product) => sum + (product.views || 0), 0);
      const totalLikes = productsData.reduce((sum, product) => sum + (product.likes || 0), 0);
      const activeUsers = usersData.filter(user => {
        const lastActive = new Date(user.lastActive || user.createdAt);
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        return lastActive > thirtyDaysAgo;
      }).length;

      // Recent activity (last 10 activities)
      const recentActivity = [
        ...usersData.slice(-5).map(user => ({
          type: 'user_registered',
          message: `${user.name} registered`,
          timestamp: new Date(user.createdAt),
          icon: Users
        })),
        ...productsData.slice(-5).map(product => ({
          type: 'product_created',
          message: `New product: ${product.name}`,
          timestamp: new Date(product.createdAt),
          icon: Package
        }))
      ].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);

      setStats({
        totalUsers: usersData.length,
        totalUniversities: universitiesList.length,
        totalProducts: productsData.length,
        totalChats: chatsData.length,
        totalViews,
        totalLikes,
        activeUsers,
        recentActivity
      });

      setLoading(false);
    } catch (error) {
      console.error('Error loading admin data:', error);
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    navigate('/');
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getUniversityStats = () => {
    const universityStats = {};
    users.forEach(user => {
      if (user.university) {
        universityStats[user.university] = (universityStats[user.university] || 0) + 1;
      }
    });
    return Object.entries(universityStats)
      .map(([university, count]) => ({ university, count }))
      .sort((a, b) => b.count - a.count);
  };

  const getProductStats = () => {
    const categoryStats = {};
    products.forEach(product => {
      if (product.category) {
        categoryStats[product.category] = (categoryStats[product.category] || 0) + 1;
      }
    });
    return Object.entries(categoryStats)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  };

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="admin-loading">
          <RefreshCw className="loading-spinner" />
          <p>Loading admin data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      {/* Admin Header */}
      <div className="admin-header">
        <div className="admin-header-content">
          <div className="admin-title">
            <Shield className="admin-icon" />
            <h1>Admin Dashboard</h1>
          </div>
          <button className="admin-logout-btn" onClick={handleLogout}>
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </div>

      {/* Admin Navigation */}
      <div className="admin-nav">
        <button 
          className={`admin-nav-btn ${selectedTab === 'overview' ? 'active' : ''}`}
          onClick={() => setSelectedTab('overview')}
        >
          <BarChart3 size={20} />
          Overview
        </button>
        <button 
          className={`admin-nav-btn ${selectedTab === 'users' ? 'active' : ''}`}
          onClick={() => setSelectedTab('users')}
        >
          <Users size={20} />
          Users
        </button>
        <button 
          className={`admin-nav-btn ${selectedTab === 'products' ? 'active' : ''}`}
          onClick={() => setSelectedTab('products')}
        >
          <Package size={20} />
          Products
        </button>
        <button 
          className={`admin-nav-btn ${selectedTab === 'universities' ? 'active' : ''}`}
          onClick={() => setSelectedTab('universities')}
        >
          <Building2 size={20} />
          Universities
        </button>
      </div>

      {/* Admin Content */}
      <div className="admin-content">
        {selectedTab === 'overview' && (
          <div className="admin-overview">
            {/* Stats Grid */}
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">
                  <Users />
                </div>
                <div className="stat-content">
                  <h3>{stats.totalUsers}</h3>
                  <p>Total Users</p>
                  <span className="stat-subtitle">{stats.activeUsers} active</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <Building2 />
                </div>
                <div className="stat-content">
                  <h3>{stats.totalUniversities}</h3>
                  <p>Universities</p>
                  <span className="stat-subtitle">Registered</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <Package />
                </div>
                <div className="stat-content">
                  <h3>{stats.totalProducts}</h3>
                  <p>Products</p>
                  <span className="stat-subtitle">Listed</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <MessageSquare />
                </div>
                <div className="stat-content">
                  <h3>{stats.totalChats}</h3>
                  <p>Chats</p>
                  <span className="stat-subtitle">Messages</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <Eye />
                </div>
                <div className="stat-content">
                  <h3>{stats.totalViews}</h3>
                  <p>Views</p>
                  <span className="stat-subtitle">Total</span>
                </div>
              </div>

              <div className="stat-card">
                <div className="stat-icon">
                  <Heart />
                </div>
                <div className="stat-content">
                  <h3>{stats.totalLikes}</h3>
                  <p>Likes</p>
                  <span className="stat-subtitle">Total</span>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="activity-section">
              <h2>Recent Activity</h2>
              <div className="activity-list">
                {stats.recentActivity.map((activity, index) => {
                  const IconComponent = activity.icon;
                  return (
                    <div key={index} className="activity-item">
                      <div className="activity-icon">
                        <IconComponent size={16} />
                      </div>
                      <div className="activity-content">
                        <p>{activity.message}</p>
                        <span>{formatDate(activity.timestamp)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'users' && (
          <div className="admin-users">
            <h2>User Management</h2>
            <div className="users-table">
              <div className="table-header">
                <div>Name</div>
                <div>Email</div>
                <div>University</div>
                <div>Joined</div>
                <div>Status</div>
              </div>
              {users.map((user, index) => (
                <div key={index} className="table-row">
                  <div className="user-info">
                    <div className="user-avatar">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <span>{user.name}</span>
                  </div>
                  <div>{user.email}</div>
                  <div>{user.university || 'N/A'}</div>
                  <div>{formatDate(user.createdAt)}</div>
                  <div className="user-status">
                    <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedTab === 'products' && (
          <div className="admin-products">
            <h2>Product Analytics</h2>
            <div className="product-stats">
              <div className="product-categories">
                <h3>Categories</h3>
                {getProductStats().map((category, index) => (
                  <div key={index} className="category-item">
                    <span>{category.category}</span>
                    <span>{category.count} products</span>
                  </div>
                ))}
              </div>
              <div className="product-list">
                <h3>Recent Products</h3>
                {products.slice(-10).map((product, index) => (
                  <div key={index} className="product-item">
                    <div className="product-info">
                      <h4>{product.name}</h4>
                      <p>{product.category} • {product.sellerName}</p>
                    </div>
                    <div className="product-stats">
                      <span><Eye size={14} /> {product.views || 0}</span>
                      <span><Heart size={14} /> {product.likes || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'universities' && (
          <div className="admin-universities">
            <h2>University Analytics</h2>
            <div className="university-stats">
              {getUniversityStats().map((university, index) => (
                <div key={index} className="university-item">
                  <div className="university-info">
                    <Building2 size={20} />
                    <span>{university.university}</span>
                  </div>
                  <div className="university-count">
                    {university.count} users
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
