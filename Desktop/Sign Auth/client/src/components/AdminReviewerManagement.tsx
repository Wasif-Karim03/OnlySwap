import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface Reviewer {
  _id: string;
  name: string;
  email: string;
  university?: string;
  universityLogo?: string;
  bio?: string;
  graduationYear?: string;
  major?: string;
  internshipCompany?: string;
  avatar?: string;
  reviewerApprovalStatus?: string;
  createdAt: string;
}

const AdminReviewerManagement: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedReviewer, setSelectedReviewer] = useState<Reviewer | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    university: '',
    bio: '',
    graduationYear: '',
    major: '',
    internshipCompany: ''
  });
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    fetchReviewers();
  }, []);

  const fetchReviewers = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get('/api/auth/users');
      const reviewerUsers = response.data.users.filter((u: any) => u.role === 'reviewer');
      setReviewers(reviewerUsers);
    } catch (err: any) {
      setError('Failed to fetch reviewers');
    } finally {
      setLoading(false);
    }
  };

  const handleEditReviewer = (reviewer: Reviewer) => {
    setSelectedReviewer(reviewer);
    setEditForm({
      university: reviewer.university || '',
      bio: reviewer.bio || '',
      graduationYear: reviewer.graduationYear || '',
      major: reviewer.major || '',
      internshipCompany: reviewer.internshipCompany || ''
    });
    setSelectedLogoFile(null);
    setLogoPreview(reviewer.universityLogo || null);
    setShowEditModal(true);
  };

  const handleSaveReviewer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReviewer) return;

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append('university', editForm.university);
      formData.append('bio', editForm.bio);
      formData.append('graduationYear', editForm.graduationYear);
      formData.append('major', editForm.major);
      formData.append('internshipCompany', editForm.internshipCompany);
      
      if (selectedLogoFile) {
        formData.append('universityLogo', selectedLogoFile);
      }

      await axios.put(`/api/auth/admin/users/${selectedReviewer._id}`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Refresh the reviewers list
      await fetchReviewers();
      setShowEditModal(false);
      setSelectedReviewer(null);
      setSelectedLogoFile(null);
      setLogoPreview(null);
      setSuccessMessage('Reviewer profile updated successfully!');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err: any) {
      console.error('Update error:', err);
      const errorMessage = err.response?.data?.message || err.message || 'Failed to update reviewer';
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ ...prev, [name]: value }));
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
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button onClick={() => setError('')} className="btn-primary">
            Try Again
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
            <div className="flex items-center space-x-4">
              {/* Back Button */}
              <button
                onClick={() => navigate('/admin')}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                title="Back to Admin Dashboard"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Reviewer Management
                </h1>
                <p className="text-gray-600">
                  Manage reviewer profiles and university logos
                </p>
              </div>
            </div>
          </div>

          {successMessage && (
            <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-800">{successMessage}</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reviewer</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">University</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Logo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {reviewers.map((reviewer) => (
                    <tr key={reviewer._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-3">
                          {reviewer.avatar ? (
                            <img
                              src={reviewer.avatar}
                              alt={reviewer.name}
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                              {getInitials(reviewer.name)}
                            </div>
                          )}
                          <div>
                            <div className="text-sm font-medium text-gray-900">{reviewer.name}</div>
                            <div className="text-sm text-gray-500">{reviewer.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{reviewer.university || 'Not set'}</div>
                        <div className="text-sm text-gray-500">{reviewer.graduationYear || 'No year'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {reviewer.universityLogo ? (
                          <div className="w-10 h-10 rounded-lg overflow-hidden">
                            <img
                              src={reviewer.universityLogo}
                              alt={reviewer.university}
                              className="w-full h-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 bg-gray-300 rounded-lg flex items-center justify-center">
                            <span className="text-gray-500 text-xs">No logo</span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          reviewer.reviewerApprovalStatus === 'approved' 
                            ? 'bg-green-100 text-green-800' 
                            : reviewer.reviewerApprovalStatus === 'pending'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-red-100 text-red-800'
                        }`}>
                          {reviewer.reviewerApprovalStatus || 'Not set'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <button
                          onClick={() => handleEditReviewer(reviewer)}
                          className="text-indigo-600 hover:text-indigo-900 font-medium"
                        >
                          Edit Profile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {showEditModal && selectedReviewer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Edit Reviewer Profile</h3>
            <p className="text-sm text-gray-600 mb-6">Editing profile for: {selectedReviewer.name}</p>
            
            <form onSubmit={handleSaveReviewer} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  University Name
                </label>
                <input
                  type="text"
                  name="university"
                  value={editForm.university}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter university name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Bio/Expertise
                </label>
                <textarea
                  name="bio"
                  value={editForm.bio}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter reviewer's bio or expertise (optional)"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This will be displayed on the student dashboard
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  University Logo
                </label>
                <div className="space-y-2">
                  {logoPreview && (
                    <div className="w-20 h-20 rounded-lg overflow-hidden border border-gray-300">
                      <img
                        src={logoPreview}
                        alt="Current logo"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setSelectedLogoFile(file);
                        const url = URL.createObjectURL(file);
                        setLogoPreview(url);
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500">
                    Upload a university logo (JPEG, PNG, GIF, SVG - max 2MB)
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Graduation Year
                </label>
                <input
                  type="text"
                  name="graduationYear"
                  value={editForm.graduationYear}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., 2024"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Major
                </label>
                <input
                  type="text"
                  name="major"
                  value={editForm.major}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Computer Science"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Internship Company
                </label>
                <input
                  type="text"
                  name="internshipCompany"
                  value={editForm.internshipCompany}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Google"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedLogoFile(null);
                    setLogoPreview(null);
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold transition-all duration-300 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminReviewerManagement; 