import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthProvider } from './contexts/AuthContext';
import SignIn from './components/SignIn';
import SignUp from './components/SignUp';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import ForgotPassword from './components/ForgotPassword';
import ProtectedRoute from './components/ProtectedRoute';
import AnimatedBlob from './components/AnimatedBlob';
import AdminUserProfile from './components/AdminUserProfile';
import AdminReviewerManagement from './components/AdminReviewerManagement';
import AdminChatInterface from './components/AdminChatInterface';
import ReviewerWelcome from './components/ReviewerWelcome';
import StudentProfile from './components/StudentProfile';
import StudentHome from './components/StudentHome';
import StudentOnboarding from './components/StudentOnboarding';
import StudentChatInterface from './components/StudentChatInterface';
import { useAuth } from './contexts/AuthContext';
import axios from 'axios';

const StudentGate: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!user) return;
    // Check if onboarding is completed
    if (!user.isOnboardingCompleted) {
      setShowOnboarding(true);
    } else {
      setShowOnboarding(false);
    }
    setLoading(false);
  }, [user]);

  const handleOnboardingComplete = async (data: any) => {
    setLoading(true);
    try {
      await updateProfile(data);
      setShowOnboarding(false);
    } catch (err) {
      // Optionally handle error
    }
    setLoading(false);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (showOnboarding) return <StudentOnboarding onNext={handleOnboardingComplete} />;
  return <StudentHome />;
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-100 relative overflow-x-hidden">
        <AnimatedBlob />
        <AnimatePresence mode="wait">
          <Routes>
            <Route 
              path="/" 
              element={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <SignIn />
                </motion.div>
              } 
            />
            <Route 
              path="/signup" 
              element={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <SignUp />
                </motion.div>
              } 
            />
            <Route 
              path="/signin" 
              element={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <SignIn />
                </motion.div>
              } 
            />
            <Route 
              path="/forgot-password" 
              element={
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <ForgotPassword />
                </motion.div>
              } 
            />
            <Route 
              path="/dashboard" 
              element={
                <ProtectedRoute>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <Dashboard />
                  </motion.div>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin" 
              element={
                <ProtectedRoute>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <AdminDashboard />
                  </motion.div>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/reviewers" 
              element={
                <ProtectedRoute>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <AdminReviewerManagement />
                  </motion.div>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/reviewer" 
              element={
                <ProtectedRoute>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <ReviewerWelcome />
                  </motion.div>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/reviewer/student/:studentId" 
              element={
                <ProtectedRoute>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <StudentProfile />
                  </motion.div>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/student" 
              element={
                <ProtectedRoute>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <StudentGate />
                  </motion.div>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/student/welcome" 
              element={
                <ProtectedRoute>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <StudentHome />
                  </motion.div>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/student/profile" 
              element={
                <ProtectedRoute>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <StudentProfile />
                  </motion.div>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/admin/chat" 
              element={
                <ProtectedRoute>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <AdminChatInterface />
                  </motion.div>
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/chat" 
              element={
                <ProtectedRoute>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                  >
                    <StudentChatInterface />
                  </motion.div>
                </ProtectedRoute>
              } 
            />
            <Route path="/admin/user/:id" element={<AdminUserProfile />} />
          </Routes>
        </AnimatePresence>
      </div>
    </AuthProvider>
  );
};

export default App; 