import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface ProfileEditData {
  name: string;
  university: string;
  internshipCompany: string;
  graduationYear: string;
  major: string;
  avatar?: string;
}

interface User {
  _id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  university?: string;
  internshipCompany?: string;
  graduationYear?: string;
  major?: string;
  isBlocked?: boolean;
  createdAt?: string;
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

const ReviewerWelcome: React.FC = () => {
  const { user, signOut, updateProfile } = useAuth();
  const [students, setStudents] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [success, setSuccess] = useState('');
  const [editName, setEditName] = useState(user?.name || '');
  const [editUniversity, setEditUniversity] = useState(user?.university || '');
  const [editInternshipCompany, setEditInternshipCompany] = useState(user?.internshipCompany || '');
  const [editGraduationYear, setEditGraduationYear] = useState(user?.graduationYear || '');
  const [editMajor, setEditMajor] = useState(user?.major || '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(user?.avatar || null);
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchStudents();
  }, []);

  // Update form fields when modal opens or user data changes
  useEffect(() => {
    if (showProfileEdit && user) {
      setEditName(user.name || '');
      setEditUniversity(user.university || '');
      setEditInternshipCompany(user.internshipCompany || '');
      setEditGraduationYear(user.graduationYear || '');
      setEditMajor(user.major || '');
      setPreviewUrl(user.avatar || null);
    }
  }, [showProfileEdit, user]);

  const fetchStudents = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get('/api/auth/students');
      setStudents(response.data.students);
    } catch (err: any) {
      console.error('Fetch error:', err);
      setError(err.response?.data?.message || 'Failed to fetch students');
    } finally {
      setLoading(false);
    }
  };

  const performSearch = useCallback(async (searchTerm: string) => {
    if (searchTerm.trim() === '') {
      fetchStudents();
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await axios.get(`/api/auth/students/search?query=${encodeURIComponent(searchTerm)}`);
      setStudents(response.data.students);
    } catch (err: any) {
      console.error('Search error:', err);
      setError(err.response?.data?.message || 'Failed to search students');
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileError('');
    setSuccess('');

    try {
      const formData = new FormData();
      formData.append('name', editName);
      formData.append('university', editUniversity);
      formData.append('internshipCompany', editInternshipCompany);
      formData.append('graduationYear', editGraduationYear);
      formData.append('major', editMajor);
      
      if (selectedFile) {
        formData.append('avatar', selectedFile);
      }

      const response = await axios.put('/api/auth/profile', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      // Update the user in context
      await updateProfile({
        name: editName,
        university: editUniversity,
        internshipCompany: editInternshipCompany,
        graduationYear: editGraduationYear,
        major: editMajor,
        avatar: response.data.user.avatar
      });
      setSuccess('Profile updated successfully!');
      setShowProfileEdit(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      console.error('Profile update error:', err);
      setProfileError(err.response?.data?.message || err.message);
    } finally {
      setProfileLoading(false);
    }
  };

  const handleSignOut = () => {
    signOut();
    navigate('/');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const isProfileComplete = () => {
    return user?.university && user?.internshipCompany && user?.graduationYear && user?.major;
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
          <button onClick={handleSignOut} className="btn-secondary">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="card">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Reviewer Dashboard 🕵️‍♂️
              </h1>
              <p className="text-gray-600">
                Welcome, {user?.name}! Here are all student users.
              </p>
            </div>
            <div className="flex space-x-3">
              <button 
                onClick={() => navigate('/reviewer/chat', { state: { from: '/reviewer' } })}
                className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-semibold transition-colors"
              >
                Chat Support
              </button>
              <button 
                onClick={() => setShowProfileEdit(true)}
                className="btn-primary"
              >
                Edit Profile
              </button>
              <button onClick={handleSignOut} className="btn-secondary">
                Sign Out
              </button>
            </div>
          </div>

          {/* Success/Error Messages */}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-lg mb-6">
              {success}
            </div>
          )}

          {profileError && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
              {profileError}
            </div>
          )}

          {/* Profile Completion Warning */}
          {!isProfileComplete() && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg mb-6">
              <div className="flex items-center">
                <span className="text-red-500 mr-2">⚠️</span>
                <span className="font-medium">Please complete your profile information to continue.</span>
              </div>
              <p className="text-red-500 text-sm mt-1">
                Missing: {!user?.university && 'University, '}{!user?.internshipCompany && 'Recent Internship Company, '}{!user?.graduationYear && 'Graduation Year, '}{!user?.major && 'Major'}
              </p>
            </div>
          )}

          <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl p-6 mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              Student Statistics
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-primary-600">{students.length}</div>
                <div className="text-gray-600">Total Students</div>
              </div>
              <div className="bg-white rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-green-600">
                  {students.filter(s => !s.isBlocked).length}
                </div>
                <div className="text-gray-600">Active Students</div>
              </div>
              <div className="bg-white rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-red-600">
                  {students.filter(s => s.isBlocked).length}
                </div>
                <div className="text-gray-600">Blocked Students</div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">
              Student Users
            </h2>
            <div className="mb-4 flex items-center">
              <input
                type="text"
                value={search}
                onChange={handleSearch}
                placeholder="Search by name or email..."
                className="input-field w-64 mr-2"
              />
              <span className="text-gray-500 text-sm">Search students</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full bg-white rounded-lg shadow-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Student ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Onboarding Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Account Status</th>
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
                      <td className="px-4 py-4 whitespace-nowrap">
                        {student.isBlocked ? (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                            🔒 Blocked
                          </span>
                        ) : (
                          <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                            ✅ Active
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {students.length === 0 && !loading && (
              <div className="text-center py-8">
                <p className="text-gray-500">No students found.</p>
              </div>
            )}
          </div>
        </div>
      </div>

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
                            ⏳ Processing
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

      {/* Profile Edit Modal */}
      {showProfileEdit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Edit Profile</h3>
            <form onSubmit={handleProfileUpdate} className="space-y-4">
              {/* Profile Picture Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Profile Picture
                </label>
                <div className="flex items-center space-x-4">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 flex items-center justify-center">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Profile preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-lg font-bold">
                        {user?.name?.charAt(0).toUpperCase() || 'U'}
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      JPG, PNG, GIF up to 5MB
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="input-field"
                  placeholder="Enter your full name"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  University
                </label>
                <input
                  type="text"
                  value={editUniversity}
                  onChange={(e) => setEditUniversity(e.target.value)}
                  className="input-field"
                  placeholder="Enter your university name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Recent Internship Company
                </label>
                <input
                  type="text"
                  value={editInternshipCompany}
                  onChange={(e) => setEditInternshipCompany(e.target.value)}
                  className="input-field"
                  placeholder="Enter your recent internship company name"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Graduation Year
                </label>
                <input
                  type="number"
                  value={editGraduationYear}
                  onChange={(e) => setEditGraduationYear(e.target.value)}
                  className="input-field"
                  placeholder="e.g., 2024"
                  min="1900"
                  max="2100"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Major
                </label>
                <input
                  type="text"
                  value={editMajor}
                  onChange={(e) => setEditMajor(e.target.value)}
                  className="input-field"
                  placeholder="Enter your major/field of study"
                  required
                />
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileEdit(false);
                    setEditName(user?.name || '');
                    setEditUniversity(user?.university || '');
                    setEditInternshipCompany(user?.internshipCompany || '');
                    setEditGraduationYear(user?.graduationYear || '');
                    setEditMajor(user?.major || '');
                    setSelectedFile(null);
                    setPreviewUrl(user?.avatar || null);
                    setProfileError('');
                  }}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={profileLoading}
                  className="btn-primary"
                >
                  {profileLoading ? 'Updating...' : 'Update Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReviewerWelcome; 