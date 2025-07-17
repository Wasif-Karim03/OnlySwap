import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';

interface Activity {
  action: string;
  timestamp: string;
  details?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface User {
  name: string;
  email: string;
  role?: string;
  createdAt?: string;
  isBlocked?: boolean;
  blockedAt?: string;
  blockedReason?: string;
  blockedBy?: string;
}

const actionLabels: Record<string, string> = {
  signup: 'Account Created',
  login: 'Login',
  logout: 'Logout',
  email_verified: 'Email Verified',
  password_reset: 'Password Reset',
  profile_updated: 'Profile Updated',
  account_deleted: 'Account Deleted',
  user_blocked: 'User Blocked',
  user_unblocked: 'User Unblocked',
};

const actionIcons: Record<string, string> = {
  signup: '👤',
  login: '🔑',
  logout: '🚪',
  email_verified: '✅',
  password_reset: '🔒',
  profile_updated: '✏️',
  account_deleted: '🗑️',
  user_blocked: '🚫',
  user_unblocked: '✅',
};

const actionColors: Record<string, string> = {
  signup: 'bg-green-100 text-green-800 border border-green-200',
  login: 'bg-blue-100 text-blue-800 border border-blue-200',
  logout: 'bg-gray-100 text-gray-800 border border-gray-200',
  email_verified: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  password_reset: 'bg-orange-100 text-orange-800 border border-orange-200',
  profile_updated: 'bg-purple-100 text-purple-800 border border-purple-200',
  account_deleted: 'bg-red-100 text-red-800 border border-red-200',
  user_blocked: 'bg-red-100 text-red-800 border border-red-200',
  user_unblocked: 'bg-green-100 text-green-800 border border-green-200',
};

const AdminUserProfile: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [blockingUser, setBlockingUser] = useState(false);
  const [blockReason, setBlockReason] = useState('');
  const [showBlockModal, setShowBlockModal] = useState(false);

  useEffect(() => {
    fetchActivities();
  }, [id]);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/auth/users/${id}/activities`);
      setActivities(res.data.activities || []);
      setUser({ 
        name: res.data.name, 
        email: res.data.email,
        role: res.data.role,
        createdAt: res.data.createdAt,
        isBlocked: res.data.isBlocked,
        blockedAt: res.data.blockedAt,
        blockedReason: res.data.blockedReason,
        blockedBy: res.data.blockedBy
      });
    } catch (err: any) {
      setError('Failed to fetch user activity');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
      }),
      relative: getRelativeTime(date)
    };
  };

  const getRelativeTime = (date: Date) => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    return `${Math.floor(diffInSeconds / 2592000)} months ago`;
  };

  const getDeviceInfo = (userAgent: string) => {
    if (!userAgent) return 'Unknown device';
    
    if (userAgent.includes('Chrome')) return 'Chrome Browser';
    if (userAgent.includes('Firefox')) return 'Firefox Browser';
    if (userAgent.includes('Safari')) return 'Safari Browser';
    if (userAgent.includes('Edge')) return 'Edge Browser';
    if (userAgent.includes('Mobile')) return 'Mobile Device';
    
    return 'Desktop Browser';
  };

  const handleBlockUser = async () => {
    if (!id) return;
    
    try {
      setBlockingUser(true);
      await axios.post(`/api/auth/users/${id}/block`, { reason: blockReason });
      setShowBlockModal(false);
      setBlockReason('');
      fetchActivities(); // Refresh the data
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to block user');
    } finally {
      setBlockingUser(false);
    }
  };

  const handleUnblockUser = async () => {
    if (!id) return;
    
    try {
      setBlockingUser(true);
      await axios.post(`/api/auth/users/${id}/unblock`);
      fetchActivities(); // Refresh the data
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to unblock user');
    } finally {
      setBlockingUser(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading user profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Profile</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button 
            onClick={() => navigate(-1)} 
            className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button 
            onClick={() => navigate(-1)} 
            className="flex items-center text-blue-600 hover:text-blue-800 transition-colors mb-4"
          >
            <span className="text-xl mr-2">←</span>
            Back to Admin Dashboard
          </button>
        </div>

        {/* User Info Card */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <div className="flex items-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-3xl font-bold mr-6">
              {user?.name?.charAt(0)}
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{user?.name}</h1>
              <p className="text-gray-600 text-lg mb-2">{user?.email}</p>
              <div className="flex items-center space-x-4">
                {user?.role && (
                  <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                    user.role === 'admin' 
                      ? 'bg-purple-100 text-purple-800' 
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </span>
                )}
                {user?.isBlocked ? (
                  <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-red-100 text-red-800">
                    🔒 Blocked
                  </span>
                ) : (
                  <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-green-100 text-green-800">
                    ✅ Active
                  </span>
                )}
                {user?.createdAt && (
                  <span className="text-gray-500 text-sm">
                    Member since {formatDate(user.createdAt).date}
                  </span>
                )}
              </div>
            </div>
            <div className="flex space-x-3">
              {user?.role !== 'admin' && (
                user?.isBlocked ? (
                  <button
                    onClick={handleUnblockUser}
                    disabled={blockingUser}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {blockingUser ? 'Unblocking...' : 'Unblock User'}
                  </button>
                ) : (
                  <button
                    onClick={() => setShowBlockModal(true)}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Block User
                  </button>
                )
              )}
            </div>
          </div>

          {/* Blocking Information */}
          {user?.isBlocked && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-center mb-2">
                <span className="text-red-600 text-lg mr-2">🚫</span>
                <h3 className="text-lg font-semibold text-red-800">User is Blocked</h3>
              </div>
              <div className="text-sm text-red-700">
                {user.blockedAt && (
                  <p><strong>Blocked on:</strong> {formatDate(user.blockedAt).date} at {formatDate(user.blockedAt).time}</p>
                )}
                {user.blockedReason && (
                  <p><strong>Reason:</strong> {user.blockedReason}</p>
                )}
                <p><strong>Contact:</strong> mwkarim@owu.edu for support</p>
              </div>
            </div>
          )}
        </div>

        {/* Activity Timeline */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Account Activity Timeline</h2>
            <span className="ml-3 bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
              {activities.length} activities
            </span>
          </div>

          {activities.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-gray-400 text-6xl mb-4">📝</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">No Activity Found</h3>
              <p className="text-gray-600">This user hasn't performed any actions yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {activities.slice().reverse().map((activity, index) => {
                const { date, time, relative } = formatDate(activity.timestamp);
                const icon = actionIcons[activity.action] || '📋';
                const color = actionColors[activity.action] || 'bg-gray-100 text-gray-800 border border-gray-200';
                
                return (
                  <div key={index} className="relative">
                    {/* Timeline line */}
                    {index < activities.length - 1 && (
                      <div className="absolute left-6 top-12 w-0.5 h-full bg-gray-200"></div>
                    )}
                    
                    <div className="flex items-start space-x-4">
                      {/* Icon */}
                      <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-lg ${color}`}>
                        {icon}
                      </div>
                      
                      {/* Content */}
                      <div className="flex-1 bg-gray-50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-gray-900">
                            {actionLabels[activity.action] || activity.action}
                          </h3>
                          <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded-full">
                            {relative}
                          </span>
                        </div>
                        
                        <div className="text-sm text-gray-600 mb-3">
                          <div className="flex items-center space-x-4">
                            <span>📅 {date}</span>
                            <span>🕐 {time}</span>
                          </div>
                        </div>
                        
                        {activity.ipAddress && (
                          <div className="text-xs text-gray-500 mb-1">
                            <span className="font-medium">IP Address:</span> {activity.ipAddress}
                          </div>
                        )}
                        
                        {activity.userAgent && (
                          <div className="text-xs text-gray-500">
                            <span className="font-medium">Device:</span> {getDeviceInfo(activity.userAgent)}
                          </div>
                        )}
                        
                        {activity.details && (
                          <div className="mt-2 text-sm text-gray-700 bg-white p-2 rounded border">
                            {activity.details}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary Stats */}
        {activities.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mt-8">
            <h3 className="text-xl font-bold text-gray-900">Activity Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {activities.filter(a => a.action === 'login').length}
                </div>
                <div className="text-sm text-gray-600">Logins</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {activities.filter(a => a.action === 'signup').length}
                </div>
                <div className="text-sm text-gray-600">Account Created</div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">
                  {activities.filter(a => a.action === 'password_reset').length}
                </div>
                <div className="text-sm text-gray-600">Password Resets</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {activities.filter(a => a.action === 'email_verified').length}
                </div>
                <div className="text-sm text-gray-600">Email Verified</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Block User Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Block User</h3>
            <p className="text-gray-600 mb-4">Are you sure you want to block {user?.name}? They will not be able to sign in.</p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason (optional)
              </label>
              <textarea
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md"
                placeholder="Enter reason for blocking..."
                rows={3}
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowBlockModal(false);
                  setBlockReason('');
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleBlockUser}
                disabled={blockingUser}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
              >
                {blockingUser ? 'Blocking...' : 'Block User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminUserProfile; 