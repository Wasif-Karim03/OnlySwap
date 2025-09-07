import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
  RefreshCw,
  Ban,
  CheckCircle,
  X,
  AlertTriangle,
  Mail,
  Search
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
  
  // Block/Unblock functionality
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [userToBlock, setUserToBlock] = useState(null);
  const [blockReason, setBlockReason] = useState('');
  const [blocking, setBlocking] = useState(false);
  
  // Block reason display functionality
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  
  // University details functionality
  const [showUniversityModal, setShowUniversityModal] = useState(false);
  const [selectedUniversity, setSelectedUniversity] = useState(null);
  const [universityUsers, setUniversityUsers] = useState([]);
  
  // User search functionality
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [filteredUsers, setFilteredUsers] = useState([]);

  useEffect(() => {
    loadAdminData();
  }, []);

  // Filter users based on search term
  useEffect(() => {
    if (!userSearchTerm.trim()) {
      setFilteredUsers(users);
    } else {
      const filtered = users.filter(user => 
        user.name.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(userSearchTerm.toLowerCase())
      );
      setFilteredUsers(filtered);
    }
  }, [users, userSearchTerm]);

  const loadAdminData = () => {
    try {
      // Load users
      const usersData = JSON.parse(localStorage.getItem('onlyswap_users') || '[]');
      setUsers(usersData);

      // Load products
      const productsData = JSON.parse(localStorage.getItem('onlyswap_products') || '[]');
      setProducts(productsData);

      // Load chats
      const chatsData = JSON.parse(localStorage.getItem('onlyswap_chats') || '[]');

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

  const handleBlockUser = (user) => {
    setUserToBlock(user);
    setBlockReason('');
    setShowBlockModal(true);
  };

  const handleUnblockUser = (userId) => {
    const updatedUsers = users.map(user => {
      if (user.id === userId) {
        return {
          ...user,
          isBlocked: false,
          blockReason: '',
          blockedAt: null,
          blockedBy: null
        };
      }
      return user;
    });
    
    setUsers(updatedUsers);
    localStorage.setItem('onlyswap_users', JSON.stringify(updatedUsers));
    loadAdminData(); // Refresh data
  };

  const confirmBlockUser = async () => {
    if (!blockReason.trim()) {
      alert('Please provide a reason for blocking this user.');
      return;
    }

    setBlocking(true);
    
    try {
      const updatedUsers = users.map(user => {
        if (user.id === userToBlock.id) {
          return {
            ...user,
            isBlocked: true,
            blockReason: blockReason.trim(),
            blockedAt: new Date().toISOString(),
            blockedBy: 'Admin'
          };
        }
        return user;
      });
      
      setUsers(updatedUsers);
      localStorage.setItem('onlyswap_users', JSON.stringify(updatedUsers));
      
      // Close modal and reset
      setShowBlockModal(false);
      setUserToBlock(null);
      setBlockReason('');
      setBlocking(false);
      
      // Refresh data
      loadAdminData();
      
    } catch (error) {
      console.error('Error blocking user:', error);
      setBlocking(false);
    }
  };

  const cancelBlock = () => {
    setShowBlockModal(false);
    setUserToBlock(null);
    setBlockReason('');
  };

  const handleShowBlockReason = (user) => {
    if (user.isBlocked && user.blockReason) {
      setSelectedUser(user);
      setShowReasonModal(true);
    }
  };

  const closeReasonModal = () => {
    setShowReasonModal(false);
    setSelectedUser(null);
  };

  const handleUniversityClick = (universityName) => {
    const usersFromUniversity = users.filter(user => user.university === universityName);
    setSelectedUniversity(universityName);
    setUniversityUsers(usersFromUniversity);
    setShowUniversityModal(true);
  };

  const closeUniversityModal = () => {
    setShowUniversityModal(false);
    setSelectedUniversity(null);
    setUniversityUsers([]);
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
            <div className="users-header">
              <h2>User Management</h2>
              <div className="user-search-section">
                <div className="search-input-wrapper">
                  <Search className="search-icon" />
                  <input
                    type="text"
                    placeholder="Search users by name or email..."
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    className="user-search-input"
                  />
                  {userSearchTerm && (
                    <button 
                      className="clear-search-btn"
                      onClick={() => setUserSearchTerm('')}
                      title="Clear search"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <div className="search-results-count">
                  {filteredUsers.length} of {users.length} users
                </div>
              </div>
            </div>
            <div className="users-table">
              <div className="table-header">
                <div>Name</div>
                <div>Email</div>
                <div>University</div>
                <div>Joined</div>
                <div>Status</div>
                <div>Actions</div>
              </div>
              {filteredUsers.map((user, index) => (
                <div key={index} className={`table-row ${user.isBlocked ? 'blocked-row' : ''}`}>
                  <div className="user-info">
                    <div className="user-avatar">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    {user.isBlocked && user.blockReason ? (
                      <span 
                        className="user-name-clickable"
                        onClick={() => handleShowBlockReason(user)}
                        title="Click to view block reason"
                      >
                        {user.name}
                      </span>
                    ) : (
                      <Link 
                        to={`/admin/user/${user.id}`}
                        className="user-name-link"
                        title="Click to view user profile"
                      >
                        {user.name}
                      </Link>
                    )}
                  </div>
                  <div>{user.email}</div>
                  <div>{user.university || 'N/A'}</div>
                  <div>{formatDate(user.createdAt || user.joinDate)}</div>
                  <div className="user-status">
                    {user.isBlocked ? (
                      <span className="status-badge blocked">
                        <Ban size={12} />
                        Blocked
                      </span>
                    ) : (
                      <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </div>
                  <div className="user-actions">
                    {user.isBlocked ? (
                      <button 
                        className="action-btn unblock-btn"
                        onClick={() => handleUnblockUser(user.id)}
                        title="Unblock User"
                      >
                        <CheckCircle size={16} />
                        Unblock
                      </button>
                    ) : (
                      <button 
                        className="action-btn block-btn"
                        onClick={() => handleBlockUser(user)}
                        title="Block User"
                      >
                        <Ban size={16} />
                        Block
                      </button>
                    )}
                    {user.isBlocked && user.blockReason && (
                      <div className="block-reason" title={`Blocked: ${user.blockReason}`}>
                        <AlertTriangle size={14} />
                        {user.blockReason.length > 30 ? 
                          `${user.blockReason.substring(0, 30)}...` : 
                          user.blockReason
                        }
                      </div>
                    )}
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
                  <div 
                    className="university-info clickable"
                    onClick={() => handleUniversityClick(university.university)}
                    title="Click to view users from this university"
                  >
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

      {/* Block User Modal */}
      {showBlockModal && (
        <div className="modal-overlay">
          <div className="block-modal">
            <div className="modal-header">
              <div className="modal-title">
                <Ban className="modal-icon" />
                <h3>Block User</h3>
              </div>
              <button className="close-btn" onClick={cancelBlock}>
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-content">
              <div className="user-info-modal">
                <div className="user-avatar-large">
                  {userToBlock?.name.charAt(0).toUpperCase()}
                </div>
                <div className="user-details">
                  <h4>{userToBlock?.name}</h4>
                  <p>{userToBlock?.email}</p>
                  <p>{userToBlock?.university}</p>
                </div>
              </div>
              
              <div className="block-reason-section">
                <label htmlFor="blockReason">
                  <AlertTriangle size={16} />
                  Reason for blocking this user:
                </label>
                <textarea
                  id="blockReason"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="Please provide a detailed reason for blocking this user. This will be visible to the user and help them understand the action taken."
                  rows={4}
                  className="reason-textarea"
                />
                <div className="character-count">
                  {blockReason.length}/500 characters
                </div>
              </div>
              
            </div>
            
            <div className="modal-actions">
              <button 
                className="cancel-btn" 
                onClick={cancelBlock}
                disabled={blocking}
              >
                Cancel
              </button>
              <button 
                className="block-confirm-btn" 
                onClick={confirmBlockUser}
                disabled={blocking || !blockReason.trim()}
              >
                {blocking ? (
                  <>
                    <RefreshCw className="loading-spinner" size={16} />
                    Blocking...
                  </>
                ) : (
                  <>
                    <Ban size={16} />
                    Block User
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Block Reason Modal */}
      {showReasonModal && selectedUser && (
        <div className="modal-overlay">
          <div className="reason-modal">
            <div className="modal-header">
              <div className="modal-title">
                <AlertTriangle className="modal-icon" />
                <h3>Block Reason</h3>
              </div>
              <button className="close-btn" onClick={closeReasonModal}>
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-content">
              <div className="user-info-modal">
                <div className="user-avatar-large">
                  {selectedUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="user-details">
                  <h4>{selectedUser.name}</h4>
                  <p>{selectedUser.email}</p>
                  <p>{selectedUser.university || 'No university'}</p>
                </div>
              </div>
              
              <div className="block-reason-display">
                <h4>Reason for Blocking:</h4>
                <div className="reason-content">
                  <p>{selectedUser.blockReason}</p>
                </div>
                {selectedUser.blockedAt && (
                  <div className="block-details">
                    <p><strong>Blocked on:</strong> {formatDate(selectedUser.blockedAt)}</p>
                    {selectedUser.blockedBy && (
                      <p><strong>Blocked by:</strong> {selectedUser.blockedBy}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="modal-actions">
              <button className="cancel-btn" onClick={closeReasonModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* University Users Modal */}
      {showUniversityModal && selectedUniversity && (
        <div className="modal-overlay">
          <div className="university-modal">
            <div className="modal-header">
              <div className="modal-title">
                <Building2 className="modal-icon" />
                <h3>{selectedUniversity}</h3>
              </div>
              <button className="close-btn" onClick={closeUniversityModal}>
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-content">
              <div className="university-summary">
                <div className="summary-stats">
                  <div className="stat-item">
                    <Users size={20} />
                    <span>{universityUsers.length} Total Users</span>
                  </div>
                  <div className="stat-item">
                    <CheckCircle size={20} />
                    <span>{universityUsers.filter(user => !user.isBlocked).length} Active</span>
                  </div>
                  <div className="stat-item">
                    <Ban size={20} />
                    <span>{universityUsers.filter(user => user.isBlocked).length} Blocked</span>
                  </div>
                </div>
              </div>
              
              <div className="university-users-list">
                <h4>Users from {selectedUniversity}</h4>
                <div className="users-table">
                  <div className="table-header">
                    <div>Name</div>
                    <div>Email</div>
                    <div>Joined</div>
                    <div>Status</div>
                    <div>Actions</div>
                  </div>
                  {universityUsers.map((user, index) => (
                    <div key={index} className={`table-row ${user.isBlocked ? 'blocked-row' : ''}`}>
                           <div className="user-info">
                             <div className="user-avatar">
                               {user.name.charAt(0).toUpperCase()}
                             </div>
                             {user.isBlocked && user.blockReason ? (
                               <span 
                                 className="user-name-clickable"
                                 onClick={() => handleShowBlockReason(user)}
                                 title="Click to view block reason"
                               >
                                 {user.name}
                               </span>
                             ) : (
                               <Link 
                                 to={`/admin/user/${user.id}`}
                                 className="user-name-link"
                                 title="Click to view user profile"
                               >
                                 {user.name}
                               </Link>
                             )}
                           </div>
                      <div>{user.email}</div>
                      <div>{formatDate(user.createdAt || user.joinDate)}</div>
                      <div className="user-status">
                        {user.isBlocked ? (
                          <span className="status-badge blocked">
                            <Ban size={12} />
                            Blocked
                          </span>
                        ) : (
                          <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                            {user.isActive ? 'Active' : 'Inactive'}
                          </span>
                        )}
                      </div>
                      <div className="user-actions">
                        {user.isBlocked ? (
                          <button 
                            className="action-btn unblock-btn"
                            onClick={() => handleUnblockUser(user.id)}
                            title="Unblock User"
                          >
                            <CheckCircle size={16} />
                            Unblock
                          </button>
                        ) : (
                          <button 
                            className="action-btn block-btn"
                            onClick={() => handleBlockUser(user)}
                            title="Block User"
                          >
                            <Ban size={16} />
                            Block
                          </button>
                        )}
                        {user.isBlocked && user.blockReason && (
                          <div className="block-reason" title={`Blocked: ${user.blockReason}`}>
                            <AlertTriangle size={14} />
                            {user.blockReason.length > 30 ? 
                              `${user.blockReason.substring(0, 30)}...` : 
                              user.blockReason
                            }
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="modal-actions">
              <button className="cancel-btn" onClick={closeUniversityModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
