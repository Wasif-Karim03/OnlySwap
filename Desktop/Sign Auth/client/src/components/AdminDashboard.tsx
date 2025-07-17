import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  isBlocked?: boolean;
  blockedAt?: string;
  blockedReason?: string;
}

interface UsersResponse {
  count: number;
  users: User[];
}

const AdminDashboard: React.FC = () => {
  const { user, signOut } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [blockingUser, setBlockingUser] = useState<string | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [showBlockModal, setShowBlockModal] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await axios.get<UsersResponse>('/api/auth/users');
      setUsers(response.data.users);
      setCount(response.data.count);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const performSearch = useCallback(async (searchTerm: string) => {
    if (searchTerm.trim() === '') {
      fetchUsers();
      return;
    }
    setLoading(true);
    try {
      const response = await axios.get<{ users: User[] }>(`/api/auth/users/search?email=${encodeURIComponent(searchTerm)}`);
      setUsers(response.data.users);
    } catch (err: any) {
      setError('Failed to search users');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    
    // Clear existing timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    // Set new timeout for debounced search
    const timeout = setTimeout(() => {
      performSearch(value);
    }, 500); // Wait 500ms after user stops typing
    
    setSearchTimeout(timeout);
  };

  const handleRowClick = (id: string) => {
    navigate(`/admin/user/${id}`);
  };

  const handleBlockUser = async () => {
    if (!blockingUser) return;
    
    try {
      await axios.post(`/api/auth/users/${blockingUser}/block`, { reason: blockReason });
      setShowBlockModal(false);
      setBlockReason('');
      setBlockingUser(null);
      fetchUsers(); // Refresh the user list
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to block user');
    }
  };

  const handleUnblockUser = async (userId: string) => {
    try {
      await axios.post(`/api/auth/users/${userId}/unblock`);
      fetchUsers(); // Refresh the user list
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to unblock user');
    }
  };

  const openBlockModal = (userId: string) => {
    setBlockingUser(userId);
    setShowBlockModal(true);
  };

  const handleSignOut = () => {
    signOut();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="card text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Access Denied</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button onClick={handleSignOut} className="btn-secondary">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="card">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Admin Dashboard 👑
              </h1>
              <p className="text-gray-600">
                Welcome back, {user?.name}! You have admin privileges.
              </p>
            </div>
            <button onClick={handleSignOut} className="btn-secondary">
              Sign Out
            </button>
          </div>

          <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl p-6 mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              User Statistics
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-primary-600">{count}</div>
                <div className="text-gray-600">Total Users</div>
              </div>
              <div className="bg-white rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-green-600">
                  {users.filter(u => u.role === 'admin').length}
                </div>
                <div className="text-gray-600">Admin Users</div>
              </div>
              <div className="bg-white rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-blue-600">
                  {users.filter(u => u.role === 'user').length}
                </div>
                <div className="text-gray-600">Regular Users</div>
              </div>
              <div className="bg-white rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-red-600">
                  {users.filter(u => u.isBlocked).length}
                </div>
                <div className="text-gray-600">Blocked Users</div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">
              All Users
            </h2>
            <div className="mb-4 flex items-center">
              <input
                type="text"
                value={search}
                onChange={handleSearch}
                placeholder="Gmail Search"
                className="input-field w-64 mr-2"
              />
              <span className="text-gray-500 text-sm">Search by Gmail address</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full bg-white rounded-lg shadow-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Joined
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr
                      key={user._id}
                      className={`hover:bg-gray-50 cursor-pointer ${user.isBlocked ? 'bg-red-50' : ''}`}
                      onClick={() => handleRowClick(user._id)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {user.name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{user.email}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          user.role === 'admin' 
                            ? 'bg-purple-100 text-purple-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.isBlocked ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                            🔒 Blocked
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            ✅ Active
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2" onClick={(e) => e.stopPropagation()}>
                          {user.role !== 'admin' && (
                            user.isBlocked ? (
                              <button
                                onClick={() => handleUnblockUser(user._id)}
                                className="text-green-600 hover:text-green-900 bg-green-100 hover:bg-green-200 px-2 py-1 rounded text-xs"
                              >
                                Unblock
                              </button>
                            ) : (
                              <button
                                onClick={() => openBlockModal(user._id)}
                                className="text-red-600 hover:text-red-900 bg-red-100 hover:bg-red-200 px-2 py-1 rounded text-xs"
                              >
                                Block
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Block User Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Block User</h3>
            <p className="text-gray-600 mb-4">Are you sure you want to block this user? They will not be able to sign in.</p>
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
                  setBlockingUser(null);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleBlockUser}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Block User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard; 