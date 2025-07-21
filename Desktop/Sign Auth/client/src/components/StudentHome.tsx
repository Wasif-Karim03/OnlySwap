import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';


interface ServiceModule {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  completed: boolean;
  progress: number;
}

interface Reviewer {
  _id: string;
  name: string;
  email: string;
  university?: string;
  graduationYear?: string;
  avatar?: string;
  universityLogo?: string;
  bio?: string;
  phone?: string;
  createdAt: string;
}

const StudentHome: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [reviewersLoading, setReviewersLoading] = useState(false);
  const [selectedReviewer, setSelectedReviewer] = useState<Reviewer | null>(null);
  const [showReviewerModal, setShowReviewerModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);

  // Service modules with professional icons and subtle colors
  const [modules, setModules] = useState<ServiceModule[]>([
    {
      id: 'basics',
      title: 'Understand the Basics',
      description: 'Learn about the application process, requirements, and timeline',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      completed: false,
      progress: 0
    },
    {
      id: 'research',
      title: 'Research & Shortlist Universities',
      description: 'Explore universities, programs, and find your perfect match',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      ),
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
      completed: false,
      progress: 0
    },
    {
      id: 'tests',
      title: 'Standardized Tests',
      description: 'Prepare for SAT, ACT, TOEFL, IELTS, and other required exams',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      completed: false,
      progress: 0
    },
    {
      id: 'documents',
      title: 'Prepare Documents',
      description: 'Organize transcripts, letters of recommendation, and essays',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      completed: false,
      progress: 0
    },
    {
      id: 'financial',
      title: 'Financial Aid & Scholarships',
      description: 'Find funding opportunities and complete financial aid applications',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
        </svg>
      ),
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      completed: false,
      progress: 0
    },
    {
      id: 'results',
      title: 'Admission Results & Post-Result Negotiation',
      description: 'Track applications and negotiate offers if needed',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      completed: false,
      progress: 0
    },
    {
      id: 'visa',
      title: 'Visa & Interview Preparation',
      description: 'Prepare for visa interviews and complete visa applications',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      completed: false,
      progress: 0
    },
    {
      id: 'resources',
      title: 'Blogs and Resources',
      description: 'Access guides, tips, and expert advice for your journey',
      icon: (
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      ),
      color: 'text-pink-600',
      bgColor: 'bg-pink-50',
      borderColor: 'border-pink-200',
      completed: false,
      progress: 0
    }
  ]);

  useEffect(() => {
    // Calculate overall progress
    const completedModules = modules.filter(module => module.completed).length;
    const totalProgress = (completedModules / modules.length) * 100;
    setOverallProgress(Math.round(totalProgress));
    
    // Find the first incomplete module for "Continue where you left off"
    const firstIncomplete = modules.findIndex(module => !module.completed);
    setCurrentStep(firstIncomplete >= 0 ? firstIncomplete : 0);

    // Fetch approved reviewers
    fetchApprovedReviewers();
  }, [modules]);

  const fetchApprovedReviewers = async () => {
    setReviewersLoading(true);
    try {
      const response = await axios.get('/api/auth/reviewers/approved');
      setReviewers(response.data.reviewers);
    } catch (error) {
      console.error('Failed to fetch reviewers:', error);
    } finally {
      setReviewersLoading(false);
    }
  };

  const handleModuleClick = (moduleId: string) => {
    // Navigate to the specific module page
    console.log(`Navigating to ${moduleId} module`);
    // For now, just show an alert. In a real app, you'd navigate to specific pages
    alert(`Opening ${moduleId} module. This would navigate to the specific service page.`);
  };

  const handleReviewerClick = (reviewer: Reviewer) => {
    setSelectedReviewer(reviewer);
    setShowReviewerModal(true);
  };

  const handleRequestHelp = (reviewer: Reviewer) => {
    // In a real app, this would send a request to the reviewer
    alert(`Request sent to ${reviewer.name}. They will contact you soon!`);
    setShowReviewerModal(false);
  };

  const handleSignOut = () => {
    signOut();
    navigate('/');
  };

  const getStudentFirstName = () => {
    if (user?.firstName) {
      return user.firstName;
    }
    // Fallback to first word of full name
    return user?.name?.split(' ')[0] || 'Student';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      {/* Top Navigation Bar */}
      <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Student Portal</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => navigate('/student/profile')}
                className="flex items-center space-x-2 hover:bg-gray-100 rounded-lg px-2 py-1 transition-colors cursor-pointer"
              >
                {user?.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-8 h-8 rounded-full object-cover border-2 border-gray-200"
                  />
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-semibold">
                    {getStudentFirstName().charAt(0).toUpperCase()}
                  </div>
                )}
                <span className="text-sm font-medium text-gray-700">{getStudentFirstName()}</span>
              </button>
              <button
                onClick={handleSignOut}
                className="text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 bg-gradient-to-r from-blue-50 to-indigo-50">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-3">
                Welcome back, {getStudentFirstName()}
              </h1>
              <p className="text-gray-600 text-lg">
                Your application journey is {overallProgress}% complete. Continue your progress below.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Progress Overview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-8"
        >
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-6">Application Progress</h2>
            <div className="flex items-center space-x-6">
              <div className="flex-1">
                <div className="flex justify-between text-sm text-gray-600 mb-3">
                  <span className="font-medium">Overall Completion</span>
                  <span className="font-semibold">{overallProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-indigo-500 h-4 rounded-full transition-all duration-500"
                    style={{ width: `${overallProgress}%` }}
                  ></div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-blue-600">{modules.filter(m => m.completed).length}</div>
                <div className="text-sm text-gray-500">of {modules.length} completed</div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Service Modules Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Application Journey</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {modules.map((module, index) => (
              <motion.div
                key={module.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 * index }}
                className={`bg-white rounded-xl shadow-sm border-2 ${module.borderColor} hover:shadow-lg transition-all duration-300 cursor-pointer group ${
                  module.completed ? 'ring-2 ring-green-200' : 'hover:border-opacity-60'
                }`}
                onClick={() => handleModuleClick(module.id)}
              >
                <div className="p-6">
                  {/* Module Header */}
                  <div className="flex items-start justify-between mb-6">
                    <div className={`w-12 h-12 ${module.bgColor} rounded-lg flex items-center justify-center group-hover:bg-opacity-80 transition-colors`}>
                      <div className={module.color}>
                        {module.icon}
                      </div>
                    </div>
                    {module.completed && (
                      <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Module Content */}
                  <h3 className={`text-lg font-semibold ${module.color} mb-3 group-hover:opacity-80 transition-opacity`}>
                    {module.title}
                  </h3>
                  <p className="text-gray-600 text-sm mb-6 leading-relaxed">
                    {module.description}
                  </p>

                  {/* Progress Bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-gray-500 mb-2">
                      <span>Progress</span>
                      <span>{module.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`${module.color.replace('text-', 'bg-')} h-2 rounded-full transition-all duration-500`}
                        style={{ width: `${module.progress}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-medium px-3 py-1 rounded-full ${
                      module.completed 
                        ? 'bg-green-100 text-green-800' 
                        : module.progress === 0
                        ? 'bg-gray-100 text-gray-500'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {module.completed 
                        ? 'Completed' 
                        : module.progress === 0 
                        ? 'Not Started'
                        : 'In Progress'
                      }
                    </span>
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Available Reviewers Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-12"
        >
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Available Reviewers</h2>
          {reviewersLoading ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <p className="text-gray-600">Loading approved reviewers...</p>
            </div>
          ) : reviewers.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
              <p className="text-gray-600">No approved reviewers found at this time. Please check back later.</p>
            </div>
          ) : (
            <div className="relative">
              <div className="flex space-x-6 overflow-x-auto pb-4 scrollbar-hide">
                {reviewers.map((reviewer, index) => (
                  <motion.div
                    key={reviewer._id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.6, delay: 0.1 * index }}
                    className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-w-[280px] max-w-[280px] cursor-pointer hover:shadow-lg transition-all duration-300 group"
                    onClick={() => handleReviewerClick(reviewer)}
                  >
                    {/* Profile Picture */}
                    <div className="flex justify-center mb-4">
                      {reviewer.avatar ? (
                        <img
                          src={reviewer.avatar}
                          alt={reviewer.name}
                          className="w-20 h-20 rounded-full object-cover shadow-lg border-2 border-gray-200"
                        />
                      ) : (
                        <div className="w-20 h-20 bg-gradient-to-br from-purple-400 to-indigo-500 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-lg">
                          {reviewer.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Name */}
                    <h3 className="text-xl font-bold text-gray-900 text-center mb-3">
                      {reviewer.name}
                    </h3>

                    {/* Bio (only show if exists) */}
                    {reviewer.bio && (
                      <div className="text-sm text-gray-600 text-center mb-6 leading-relaxed">
                        {reviewer.bio}
                      </div>
                    )}

                    {/* Divider */}
                    <div className="border-t border-gray-200 mb-6"></div>

                    {/* University Section */}
                    <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                      {/* University Logo */}
                      {reviewer.universityLogo ? (
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden">
                          <img
                            src={reviewer.universityLogo}
                            alt={reviewer.university}
                            className="w-full h-full object-contain"
                            onError={(e) => {
                              // Fallback to colored initial if image fails to load
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                              const parent = target.parentElement;
                              if (parent) {
                                const initial = reviewer.university ? reviewer.university.charAt(0).toUpperCase() : 'U';
                                const colors = ['bg-red-600', 'bg-blue-600', 'bg-green-600', 'bg-purple-600', 'bg-indigo-600', 'bg-pink-600'];
                                const colorIndex = reviewer.university ? reviewer.university.length % colors.length : 0;
                                parent.innerHTML = `<span class="text-white font-bold text-sm ${colors[colorIndex]} w-full h-full rounded-lg flex items-center justify-center">${initial}</span>`;
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div className="w-10 h-10 bg-gray-600 rounded-lg flex items-center justify-center">
                          <span className="text-white font-bold text-sm">
                            {reviewer.university ? reviewer.university.charAt(0).toUpperCase() : 'U'}
                          </span>
                        </div>
                      )}
                      {/* University Info */}
                      <div className="flex-1">
                        <div className="text-sm font-bold text-gray-900">
                          {reviewer.university || 'University'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {reviewer.graduationYear ? `Class of ${reviewer.graduationYear}` : 'Alumni'}
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent opening modal
                          handleRequestHelp(reviewer);
                        }}
                        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-4 py-2 rounded-lg font-semibold text-sm transition-all duration-300 transform hover:scale-105"
                      >
                        Request Help
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
              
              {/* Navigation Arrow (only show if there are more reviewers than visible) */}
              {reviewers.length > 3 && (
                <button className="absolute right-0 top-1/2 transform -translate-y-1/2 w-10 h-10 bg-white rounded-full shadow-lg border border-gray-200 flex items-center justify-center hover:shadow-xl transition-all duration-300">
                  <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </motion.div>
      </div>

             {/* Reviewer Modal */}
       {showReviewerModal && selectedReviewer && (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
           <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full mx-4">
             <div className="flex items-center mb-6">
               {selectedReviewer.avatar ? (
                 <img
                   src={selectedReviewer.avatar}
                   alt={selectedReviewer.name}
                   className="w-16 h-16 rounded-full object-cover mr-4 border-2 border-gray-200"
                 />
               ) : (
                 <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 text-2xl font-semibold mr-4">
                   {selectedReviewer.name.charAt(0).toUpperCase()}
                 </div>
               )}
               <div>
                 <h3 className="text-xl font-bold text-gray-900">{selectedReviewer.name}</h3>
                 <p className="text-gray-600">{selectedReviewer.university}</p>
               </div>
             </div>
             
             <div className="space-y-4 mb-6">
               <div className="flex justify-between">
                 <span className="text-gray-600">University:</span>
                 <span className="font-medium">{selectedReviewer.university || 'Not specified'}</span>
               </div>
               <div className="flex justify-between">
                 <span className="text-gray-600">Graduation Year:</span>
                 <span className="font-medium">{selectedReviewer.graduationYear || 'Not specified'}</span>
               </div>
               <div className="flex justify-between">
                 <span className="text-gray-600">Joined:</span>
                 <span className="font-medium">{formatDate(selectedReviewer.createdAt)}</span>
               </div>
             </div>
             
             <p className="text-gray-700 mb-6">
               You are requesting help from <strong>{selectedReviewer.name}</strong> for your application journey. 
               They will be notified and can reach out to you through the provided contact information.
             </p>
             
             <div className="flex justify-end space-x-3">
               <button
                 onClick={() => setShowReviewerModal(false)}
                 className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
               >
                 Cancel
               </button>
               <button
                 onClick={() => handleRequestHelp(selectedReviewer)}
                 className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-2 rounded-lg font-semibold transition-all duration-300"
               >
                 Send Request
               </button>
             </div>
           </div>
         </div>
       )}

      {/* Support Request Modal - Replaced with Chat Navigation */}
      {showSupportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-2xl mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Chat Support</h3>
              <p className="text-gray-600 mb-6">
                Connect with our support team through our new chat system for instant help and assistance.
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowSupportModal(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowSupportModal(false);
                    navigate('/chat', { state: { from: '/student' } });
                  }}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-6 py-2 rounded-lg font-semibold transition-all duration-300"
                >
                  Open Chat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Chat Button */}
      <button
        onClick={() => navigate('/chat', { state: { from: location.pathname } })}
        className="fixed bottom-8 right-8 z-50 bg-white hover:bg-blue-50 text-blue-600 rounded-full shadow-2xl p-4 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-200 border border-blue-100"
        title="Open Chat Support"
      >
        <svg className="w-7 h-7" fill="none" stroke="#2563eb" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a8.96 8.96 0 01-4.255-.949L3 20l1.395-3.72C2.512 15.042 2 13.574 2 12c0-4.418 3.582-8 8-8s8 3.582 8 8z" />
        </svg>
      </button>
    </div>
  );
};

export default StudentHome; 