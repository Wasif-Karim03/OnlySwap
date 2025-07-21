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
  avatar?: string;
  isBlocked?: boolean;
  blockedAt?: string;
  blockedReason?: string;
  studentId?: string;
  isOnboardingCompleted?: boolean;
  onboardingCompletedAt?: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  country?: string;
  stateCity?: string;
  gender?: string;
  phone?: string;
  highSchool?: string;
  gradYear?: string;
  classSize?: string;
  classRankReport?: string;
  gpaScale?: string;
  cumulativeGpa?: string;
  gpaWeighted?: string;
  lastLogin?: string;
  languages?: Array<{
    language: string;
    proficiency: string;
    speak: boolean;
    read: boolean;
    write: boolean;
    spokenAtHome: boolean;
  }>;
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
  const [deletingUser, setDeletingUser] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [pendingReviewers, setPendingReviewers] = useState<User[]>([]);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approvingReviewer, setApprovingReviewer] = useState<string | null>(null);
  const [students, setStudents] = useState<User[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUsers();
    fetchPendingReviewers();
    fetchStudents();
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

  const fetchPendingReviewers = async () => {
    try {
      const response = await axios.get('/api/auth/reviewers/pending');
      setPendingReviewers(response.data.reviewers);
    } catch (err: any) {
      // Optionally handle error
    }
  };

  const fetchStudents = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get('/api/auth/users');
      // Only show students
      setStudents(response.data.users.filter((u: User) => u.role === 'user'));
    } catch (err: any) {
      setError('Failed to fetch students');
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

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    try {
      await axios.delete(`/api/auth/users/${deletingUser}`);
      setShowDeleteModal(false);
      setDeletingUser(null);
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to delete user');
    }
  };



  const handleApproveReviewer = async () => {
    if (!approvingReviewer) return;
    try {
      await axios.post(`/api/auth/reviewers/${approvingReviewer}/approve`);
      setShowApproveModal(false);
      setApprovingReviewer(null);
      fetchPendingReviewers();
      fetchUsers();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to approve reviewer');
    }
  };

  const openBlockModal = (userId: string) => {
    setBlockingUser(userId);
    setShowBlockModal(true);
  };

  const handleSignOut = () => {
    signOut();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatLanguages = (languages: any[]) => {
    if (!languages || languages.length === 0) return 'None';
    return languages.map(lang => `${lang.language} (${lang.proficiency})`).join(', ');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
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
            <div className="flex space-x-3">
              <button 
                onClick={() => navigate('/admin/reviewers')}
                className="btn-primary"
              >
                Manage Reviewers
              </button>
              <button 
                onClick={() => navigate('/admin/chat', { state: { from: '/admin' } })}
                className="btn-primary"
              >
                Chat Support
              </button>
              <button onClick={handleSignOut} className="btn-secondary">
                Sign Out
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl p-6 mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              User Statistics
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
                <div className="text-3xl font-bold text-purple-600">
                  {users.filter(u => u.role === 'reviewer').length}
                </div>
                <div className="text-gray-600">Reviewer Users</div>
              </div>
              <div className="bg-white rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-red-600">
                  {users.filter(u => u.isBlocked).length}
                </div>
                <div className="text-gray-600">Blocked Users</div>
              </div>
            </div>
          </div>

          {/* Student Onboarding Data Section */}
          <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl p-6 mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold text-gray-800">
                Student Onboarding Data ({students.length} students)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full bg-white rounded-lg shadow-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Onboarding Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {students.map((student) => (
                    <tr key={student._id} className="hover:bg-gray-50">
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-mono text-blue-600">
                        {student.studentId || 'N/A'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <button
                          onClick={() => setSelectedStudent(student)}
                          className="text-left hover:text-blue-600 transition-colors flex items-center space-x-3"
                        >
                          {student.avatar ? (
                            <img
                              src={student.avatar}
                              alt={student.name}
                              className="w-8 h-8 rounded-full object-cover border-2 border-gray-200"
                            />
                          ) : (
                            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                              {getInitials(student.name)}
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {student.firstName && student.lastName 
                                ? `${student.firstName} ${student.lastName}`
                                : student.name
                              }
                            </div>
                            {student.firstName && student.lastName && (
                              <div className="text-xs text-gray-500">Account: {student.name}</div>
                            )}
                          </div>
                        </button>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                        {student.email}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {student.isOnboardingCompleted ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            ✅ Completed
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            ⏳ Processing
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* All Users Section */}
          <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl p-6 mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Joined</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
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
                        <div className="flex items-center space-x-3">
                          {user.avatar ? (
                            <img
                              src={user.avatar}
                              alt={user.name}
                              className="w-8 h-8 rounded-full object-cover border-2 border-gray-200"
                            />
                          ) : (
                            <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                              {getInitials(user.name)}
                            </div>
                          )}
                          <div className="text-sm font-medium text-gray-900">
                            {user.name}
                          </div>
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
                          {user.role !== 'admin' && (
                            <button
                              onClick={() => { setDeletingUser(user._id); setShowDeleteModal(true); }}
                              className="text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-xs"
                            >
                              Delete
                            </button>
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

      {/* Delete User Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Delete User</h3>
            <p className="text-gray-600 mb-4">Are you sure you want to <span className='text-red-600 font-bold'>permanently delete</span> this user? This action cannot be undone.</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowDeleteModal(false); setDeletingUser(null); }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Reviewer Approvals */}
      {pendingReviewers.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 mb-8">
          <h2 className="text-xl font-semibold text-yellow-800 mb-4 flex items-center">
            <span className="mr-2">🕒</span> Pending Reviewer Approvals
          </h2>
          <table className="w-full bg-white rounded-lg shadow-sm mb-2">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Requested</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pendingReviewers.map((reviewer) => (
                <tr key={reviewer._id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-3">
                      {reviewer.avatar ? (
                        <img
                          src={reviewer.avatar}
                          alt={reviewer.name}
                          className="w-8 h-8 rounded-full object-cover border-2 border-gray-200"
                        />
                      ) : (
                        <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-semibold">
                          {getInitials(reviewer.name)}
                        </div>
                      )}
                      <div className="text-sm font-medium text-gray-900">
                        {reviewer.name}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">{reviewer.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap">{new Date(reviewer.createdAt).toLocaleDateString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => { setApprovingReviewer(reviewer._id); setShowApproveModal(true); }}
                      className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 mr-2"
                    >
                      Approve
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* Approve Reviewer Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Approve Reviewer</h3>
            <p className="text-gray-600 mb-4">Are you sure you want to approve this reviewer? They will be notified by email and gain access to the reviewer portal.</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowApproveModal(false); setApprovingReviewer(null); }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleApproveReviewer}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Detail Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">
                    {selectedStudent.firstName && selectedStudent.lastName 
                      ? `${selectedStudent.firstName} ${selectedStudent.lastName}`
                      : selectedStudent.name
                    }
                  </h2>
                  <p className="text-gray-600 mt-1">
                    Student ID: <span className="font-mono text-blue-600">{selectedStudent.studentId || 'N/A'}</span>
                  </p>
                </div>
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="text-gray-400 hover:text-gray-600 text-3xl font-bold"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Basic Information */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-xl border border-blue-100">
                  <h3 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
                    <span className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm mr-2">1</span>
                    Basic Information
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Full Name:</span>
                      <span className="text-gray-900">{selectedStudent.firstName && selectedStudent.lastName 
                        ? `${selectedStudent.firstName} ${selectedStudent.lastName}`
                        : 'Not provided'
                      }</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Account Name:</span>
                      <span className="text-gray-900">{selectedStudent.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Email:</span>
                      <span className="text-gray-900 break-all">{selectedStudent.email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Phone:</span>
                      <span className="text-gray-900">{selectedStudent.phone || 'Not provided'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Date of Birth:</span>
                      <span className="text-gray-900">{selectedStudent.dob ? formatDate(selectedStudent.dob) : 'Not provided'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Gender:</span>
                      <span className="text-gray-900 capitalize">{selectedStudent.gender || 'Not provided'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Country:</span>
                      <span className="text-gray-900">{selectedStudent.country || 'Not provided'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">State/City:</span>
                      <span className="text-gray-900">{selectedStudent.stateCity || 'Not provided'}</span>
                    </div>
                  </div>
                </div>

                {/* Education Information */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-xl border border-green-100">
                  <h3 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
                    <span className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-sm mr-2">2</span>
                    Education Information
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">High School:</span>
                      <span className="text-gray-900">{selectedStudent.highSchool || 'Not provided'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Graduation Year:</span>
                      <span className="text-gray-900">{selectedStudent.gradYear || 'Not provided'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Class Size:</span>
                      <span className="text-gray-900">{selectedStudent.classSize || 'Not provided'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Class Rank:</span>
                      <span className="text-gray-900">{selectedStudent.classRankReport || 'Not provided'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">GPA Scale:</span>
                      <span className="text-gray-900">{selectedStudent.gpaScale || 'Not provided'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Cumulative GPA:</span>
                      <span className="text-gray-900 font-semibold">{selectedStudent.cumulativeGpa || 'Not provided'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">GPA Weighted:</span>
                      <span className="text-gray-900">{selectedStudent.gpaWeighted || 'Not provided'}</span>
                    </div>
                  </div>
                </div>

                {/* Account & Status */}
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-6 rounded-xl border border-purple-100">
                  <h3 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
                    <span className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center text-white text-sm mr-2">3</span>
                    Account & Status
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Onboarding Status:</span>
                      <span>
                        {selectedStudent.isOnboardingCompleted ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            ✅ Completed
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                            ⏳ Pending
                          </span>
                        )}
                      </span>
                    </div>
                    {selectedStudent.onboardingCompletedAt && (
                      <div className="flex justify-between">
                        <span className="font-medium text-gray-700">Completed At:</span>
                        <span className="text-gray-900">{formatDate(selectedStudent.onboardingCompletedAt)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Account Created:</span>
                      <span className="text-gray-900">{selectedStudent.createdAt ? formatDate(selectedStudent.createdAt) : 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Last Login:</span>
                      <span className="text-gray-900">{selectedStudent.lastLogin ? formatDate(selectedStudent.lastLogin) : 'Never'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-gray-700">Account Status:</span>
                      <span>
                        {selectedStudent.isBlocked ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                            🔒 Blocked
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            ✅ Active
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Languages Section */}
              <div className="mt-6 bg-gradient-to-br from-orange-50 to-yellow-50 p-6 rounded-xl border border-orange-100">
                <h3 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
                  <span className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center text-white text-sm mr-2">4</span>
                  Language Proficiency
                </h3>
                {selectedStudent.languages && selectedStudent.languages.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {selectedStudent.languages.map((lang, idx) => (
                      <div key={idx} className="bg-white p-4 rounded-lg border border-orange-200 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-semibold text-orange-600 text-lg">{lang.language}</div>
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full">
                            {lang.proficiency}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center text-sm">
                            <span className="w-3 h-3 mr-2">
                              {lang.speak ? '✅' : '❌'}
                            </span>
                            <span className={lang.speak ? 'text-gray-900' : 'text-gray-400'}>Speak</span>
                          </div>
                          <div className="flex items-center text-sm">
                            <span className="w-3 h-3 mr-2">
                              {lang.read ? '✅' : '❌'}
                            </span>
                            <span className={lang.read ? 'text-gray-900' : 'text-gray-400'}>Read</span>
                          </div>
                          <div className="flex items-center text-sm">
                            <span className="w-3 h-3 mr-2">
                              {lang.write ? '✅' : '❌'}
                            </span>
                            <span className={lang.write ? 'text-gray-900' : 'text-gray-400'}>Write</span>
                          </div>
                          <div className="flex items-center text-sm">
                            <span className="w-3 h-3 mr-2">
                              {lang.spokenAtHome ? '✅' : '❌'}
                            </span>
                            <span className={lang.spokenAtHome ? 'text-gray-900' : 'text-gray-400'}>Spoken at Home</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-gray-400 text-6xl mb-4">🗣️</div>
                    <p className="text-gray-500 text-lg">No language information available</p>
                    <p className="text-gray-400 text-sm">Student hasn't provided language proficiency details yet.</p>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setSelectedStudent(null)}
                  className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard; 