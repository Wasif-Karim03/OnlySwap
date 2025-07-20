import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';

interface LanguageData {
  language: string;
  proficiency: string;
  speak: boolean;
  read: boolean;
  write: boolean;
  spokenAtHome: boolean;
}

interface StudentProfileData {
  firstName: string;
  lastName: string;
  dob: string;
  phone: string;
  country: string;
  stateCity: string;
  gender: string;
  languages: LanguageData[];
  highSchool: string;
  gradYear: string;
  classSize: string;
  classRankReport: string;
  gpaScale: string;
  cumulativeGpa: string;
  gpaWeighted: string;
}

const countries = [
  'United States', 'Canada', 'United Kingdom', 'India', 'Pakistan', 'Australia', 'Bangladesh', 'Germany', 'France', 'Other'
];

const languageOptions = [
  'English', 'Spanish', 'French', 'German', 'Chinese', 'Hindi', 'Arabic', 'Bengali', 'Russian', 'Portuguese', 'Other'
];

const proficiencyOptions = ['Beginner', 'Intermediate', 'Advanced', 'Native'];

const StudentProfile: React.FC = () => {
  const { user, updateProfile, reloadProfile } = useAuth();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [profileData, setProfileData] = useState<StudentProfileData>({
    firstName: '',
    lastName: '',
    dob: '',
    phone: '',
    country: '',
    stateCity: '',
    gender: '',
    languages: [],
    highSchool: '',
    gradYear: '',
    classSize: '',
    classRankReport: '',
    gpaScale: '',
    cumulativeGpa: '',
    gpaWeighted: '',
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (user) {
      loadProfileData();
    }
  }, [user]);

  const loadProfileData = () => {
    if (!user) return;

    setProfileData({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      dob: user.dob ? new Date(user.dob).toISOString().split('T')[0] : '',
      phone: user.phone || '',
      country: user.country || '',
      stateCity: user.stateCity || '',
      gender: user.gender || '',
      languages: user.languages || [],
      highSchool: user.highSchool || '',
      gradYear: user.gradYear || '',
      classSize: user.classSize || '',
      classRankReport: user.classRankReport || '',
      gpaScale: user.gpaScale || '',
      cumulativeGpa: user.cumulativeGpa || '',
      gpaWeighted: user.gpaWeighted || '',
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProfileData(prev => ({ ...prev, [name]: value }));
  };

  const handlePhoneChange = (value: string) => {
    setProfileData(prev => ({ ...prev, phone: value }));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('Image size should be less than 5MB');
        return;
      }
      setSelectedFile(file);
      setError('');
    }
  };

  const handleImageUpload = async () => {
    if (!selectedFile) return;

    setUploadingImage(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('avatar', selectedFile);

      const response = await axios.put('/api/auth/profile', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      // Update the user context with new avatar
      await reloadProfile();
      setSelectedFile(null);
      setSuccess('Profile picture updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleLanguageChange = (index: number, field: keyof LanguageData, value: any) => {
    setProfileData(prev => {
      const updatedLanguages = [...prev.languages];
      updatedLanguages[index] = { ...updatedLanguages[index], [field]: value };
      return { ...prev, languages: updatedLanguages };
    });
  };

  const addLanguage = () => {
    setProfileData(prev => ({
      ...prev,
      languages: [...prev.languages, {
        language: '',
        proficiency: '',
        speak: false,
        read: false,
        write: false,
        spokenAtHome: false
      }]
    }));
  };

  const removeLanguage = (index: number) => {
    setProfileData(prev => ({
      ...prev,
      languages: prev.languages.filter((_, i) => i !== index)
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      await updateProfile(profileData);
      await reloadProfile();
      setIsEditing(false);
      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    loadProfileData();
    setIsEditing(false);
    setError('');
  };

  const handleBackToDashboard = () => {
    navigate('/student');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Top Navigation Bar */}
      <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <button
                onClick={handleBackToDashboard}
                className="mr-4 p-2 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h1 className="text-xl font-bold text-gray-900">My Profile</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                  {getInitials(user.name)}
                </div>
                <span className="text-sm font-medium text-gray-700">{user.name}</span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Student Profile</h1>
              <p className="text-gray-600">View and edit your personal information</p>
            </div>
            <div className="flex space-x-3">
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
                >
                  Edit Profile
                </button>
              ) : (
                <>
                  <button
                    onClick={handleCancel}
                    className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={loading}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-semibold transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Success/Error Messages */}
        {success && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-green-800">{success}</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-red-800">{error}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Picture and Basic Info */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="text-center mb-6">
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-32 h-32 rounded-full mx-auto mb-4 object-cover border-4 border-gray-200"
                  />
                ) : (
                  <div className="w-32 h-32 rounded-full mx-auto mb-4 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-4xl font-bold border-4 border-gray-200">
                    {getInitials(user.name)}
                  </div>
                )}
                
                {/* Profile Picture Upload */}
                <div className="mt-4 space-y-3">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="avatar-upload"
                  />
                  <label
                    htmlFor="avatar-upload"
                    className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer transition-colors"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    {selectedFile ? 'Change Photo' : 'Upload Photo'}
                  </label>
                  
                  {selectedFile && (
                    <div className="space-y-2">
                      <p className="text-xs text-gray-600">
                        Selected: {selectedFile.name}
                      </p>
                      <button
                        onClick={handleImageUpload}
                        disabled={uploadingImage}
                        className="w-full inline-flex items-center justify-center px-3 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                      >
                        {uploadingImage ? (
                          <>
                            <svg className="w-4 h-4 mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Uploading...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Save Photo
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
                
                <h2 className="text-2xl font-bold text-gray-900 mt-4">{user.name}</h2>
                <p className="text-gray-600">{user.email}</p>
                <div className="mt-3">
                  <span className="inline-flex px-3 py-1 text-sm font-semibold rounded-full bg-green-100 text-green-800">
                    ✅ Active Student
                  </span>
                </div>
              </div>

              {/* Account Info */}
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Student ID:</span>
                  <span className="font-medium">{user.studentId || 'Not assigned'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Member since:</span>
                  <span className="font-medium">
                    {user.createdAt ? new Date(user.createdAt).getFullYear() : 'Unknown'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Onboarding:</span>
                  <span className="font-medium">
                    {user.isOnboardingCompleted ? 'Completed' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Information */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <svg className="w-6 h-6 text-blue-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Personal Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">First Name</label>
                  {isEditing ? (
                    <input
                      type="text"
                      name="firstName"
                      value={profileData.firstName}
                      onChange={handleInputChange}
                      className="input-field"
                    />
                  ) : (
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                      {profileData.firstName || 'Not provided'}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Last Name</label>
                  {isEditing ? (
                    <input
                      type="text"
                      name="lastName"
                      value={profileData.lastName}
                      onChange={handleInputChange}
                      className="input-field"
                    />
                  ) : (
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                      {profileData.lastName || 'Not provided'}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth</label>
                  {isEditing ? (
                    <input
                      type="date"
                      name="dob"
                      value={profileData.dob}
                      onChange={handleInputChange}
                      className="input-field"
                    />
                  ) : (
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                      {profileData.dob ? new Date(profileData.dob).toLocaleDateString() : 'Not provided'}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                  {isEditing ? (
                    <select
                      name="gender"
                      value={profileData.gender}
                      onChange={handleInputChange}
                      className="input-field"
                    >
                      <option value="">Select Gender</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  ) : (
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg capitalize">
                      {profileData.gender || 'Not provided'}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                  {isEditing ? (
                    <PhoneInput
                      country={'us'}
                      value={profileData.phone}
                      onChange={handlePhoneChange}
                      inputClass="input-field"
                      enableSearch
                    />
                  ) : (
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                      {profileData.phone || 'Not provided'}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                  {isEditing ? (
                    <select
                      name="country"
                      value={profileData.country}
                      onChange={handleInputChange}
                      className="input-field"
                    >
                      <option value="">Select Country</option>
                      {countries.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                      {profileData.country || 'Not provided'}
                    </p>
                  )}
                </div>
                
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">State/City</label>
                  {isEditing ? (
                    <input
                      type="text"
                      name="stateCity"
                      value={profileData.stateCity}
                      onChange={handleInputChange}
                      className="input-field"
                    />
                  ) : (
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                      {profileData.stateCity || 'Not provided'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Education Information */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                <svg className="w-6 h-6 text-green-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Education Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">High School</label>
                  {isEditing ? (
                    <input
                      type="text"
                      name="highSchool"
                      value={profileData.highSchool}
                      onChange={handleInputChange}
                      className="input-field"
                    />
                  ) : (
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                      {profileData.highSchool || 'Not provided'}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Graduation Year</label>
                  {isEditing ? (
                    <input
                      type="number"
                      name="gradYear"
                      value={profileData.gradYear}
                      onChange={handleInputChange}
                      className="input-field"
                      min="1900"
                      max="2100"
                    />
                  ) : (
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                      {profileData.gradYear || 'Not provided'}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Class Size</label>
                  {isEditing ? (
                    <input
                      type="number"
                      name="classSize"
                      value={profileData.classSize}
                      onChange={handleInputChange}
                      className="input-field"
                      min="1"
                    />
                  ) : (
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                      {profileData.classSize || 'Not provided'}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Class Rank Report</label>
                  {isEditing ? (
                    <select
                      name="classRankReport"
                      value={profileData.classRankReport}
                      onChange={handleInputChange}
                      className="input-field"
                    >
                      <option value="">Select</option>
                      <option value="reported">Yes, school reports rank</option>
                      <option value="not_reported">No, school does not report rank</option>
                    </select>
                  ) : (
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                      {profileData.classRankReport === 'reported' ? 'Yes, school reports rank' : 
                       profileData.classRankReport === 'not_reported' ? 'No, school does not report rank' : 
                       'Not provided'}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">GPA Scale</label>
                  {isEditing ? (
                    <select
                      name="gpaScale"
                      value={profileData.gpaScale}
                      onChange={handleInputChange}
                      className="input-field"
                    >
                      <option value="">Select</option>
                      <option value="4.0">4.0</option>
                      <option value="5.0">5.0</option>
                      <option value="100">100</option>
                      <option value="other">Other</option>
                    </select>
                  ) : (
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                      {profileData.gpaScale || 'Not provided'}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Cumulative GPA</label>
                  {isEditing ? (
                    <input
                      type="number"
                      name="cumulativeGpa"
                      value={profileData.cumulativeGpa}
                      onChange={handleInputChange}
                      className="input-field"
                      min="0"
                      step="any"
                    />
                  ) : (
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                      {profileData.cumulativeGpa || 'Not provided'}
                    </p>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">GPA Weighted</label>
                  {isEditing ? (
                    <select
                      name="gpaWeighted"
                      value={profileData.gpaWeighted}
                      onChange={handleInputChange}
                      className="input-field"
                    >
                      <option value="">Select</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  ) : (
                    <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                      {profileData.gpaWeighted === 'yes' ? 'Yes' : 
                       profileData.gpaWeighted === 'no' ? 'No' : 
                       'Not provided'}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Language Proficiency */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-semibold text-gray-900 flex items-center">
                  <svg className="w-6 h-6 text-purple-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                  Language Proficiency
                </h3>
                {isEditing && (
                  <button
                    onClick={addLanguage}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  >
                    Add Language
                  </button>
                )}
              </div>
              
              {profileData.languages.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No languages added yet.</p>
              ) : (
                <div className="space-y-4">
                  {profileData.languages.map((language, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-4">
                        <h4 className="font-medium text-gray-900">Language {index + 1}</h4>
                        {isEditing && (
                          <button
                            onClick={() => removeLanguage(index)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
                          {isEditing ? (
                            <select
                              value={language.language}
                              onChange={(e) => handleLanguageChange(index, 'language', e.target.value)}
                              className="input-field"
                            >
                              <option value="">Select Language</option>
                              {languageOptions.map(l => <option key={l} value={l}>{l}</option>)}
                            </select>
                          ) : (
                            <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                              {language.language || 'Not specified'}
                            </p>
                          )}
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Proficiency</label>
                          {isEditing ? (
                            <select
                              value={language.proficiency}
                              onChange={(e) => handleLanguageChange(index, 'proficiency', e.target.value)}
                              className="input-field"
                            >
                              <option value="">Select Proficiency</option>
                              {proficiencyOptions.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          ) : (
                            <p className="text-gray-900 bg-gray-50 p-3 rounded-lg">
                              {language.proficiency || 'Not specified'}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      {isEditing && (
                        <div className="mt-4 space-y-2">
                          <div className="flex flex-wrap gap-4">
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={language.speak}
                                onChange={(e) => handleLanguageChange(index, 'speak', e.target.checked)}
                                className="mr-2"
                              />
                              <span className="text-sm text-gray-700">Speak</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={language.read}
                                onChange={(e) => handleLanguageChange(index, 'read', e.target.checked)}
                                className="mr-2"
                              />
                              <span className="text-sm text-gray-700">Read</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={language.write}
                                onChange={(e) => handleLanguageChange(index, 'write', e.target.checked)}
                                className="mr-2"
                              />
                              <span className="text-sm text-gray-700">Write</span>
                            </label>
                            <label className="flex items-center">
                              <input
                                type="checkbox"
                                checked={language.spokenAtHome}
                                onChange={(e) => handleLanguageChange(index, 'spokenAtHome', e.target.checked)}
                                className="mr-2"
                              />
                              <span className="text-sm text-gray-700">Spoken at Home</span>
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentProfile; 