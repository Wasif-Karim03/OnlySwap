import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthProvider } from './contexts/AuthContext';
import SignIn from './components/SignIn';
import SignUp from './components/SignUp';
import ForgotPassword from './components/ForgotPassword';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import ProtectedRoute from './components/ProtectedRoute';

const AnimatedBlob = () => (
  <motion.div
    className="blob-bg"
    initial={{ scale: 1, x: '-20vw', y: '-10vh', rotate: 0 }}
    animate={{
      scale: [1, 1.15, 1],
      x: ['-20vw', '60vw', '-10vw'],
      y: ['-10vh', '40vh', '10vh'],
      rotate: [0, 30, -15, 0],
    }}
    transition={{
      duration: 18,
      repeat: Infinity,
      repeatType: 'mirror',
      ease: 'easeInOut',
    }}
    style={{
      width: '60vw',
      height: '60vw',
      minWidth: 320,
      minHeight: 320,
      maxWidth: 700,
      maxHeight: 700,
      background: 'radial-gradient(circle at 30% 30%, #60a5fa 60%, #818cf8 100%)',
      borderRadius: '50%',
      top: '-10vh',
      left: '-20vw',
    }}
  />
);

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
          </Routes>
        </AnimatePresence>
      </div>
    </AuthProvider>
  );
};

export default App; 