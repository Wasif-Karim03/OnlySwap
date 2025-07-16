import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';

const Dashboard: React.FC = () => {
  const { user, signOut } = useAuth();

  const handleSignOut = () => {
    signOut();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-2xl"
      >
        <div className="card text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-8"
          >
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Welcome, {user?.name}! 👋
            </h1>
            <p className="text-xl text-gray-600">
              You've successfully signed in to your account
            </p>
            {user?.role === 'admin' && (
              <div className="mt-4">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                  👑 Admin User
                </span>
              </div>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-xl p-6 mb-8"
          >
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              Account Information
            </h2>
            <div className="space-y-3 text-left max-w-md mx-auto">
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">Name:</span>
                <span className="text-gray-900">{user?.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">Email:</span>
                <span className="text-gray-900">{user?.email}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">Role:</span>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  user?.role === 'admin' 
                    ? 'bg-purple-100 text-purple-800' 
                    : 'bg-green-100 text-green-800'
                }`}>
                  {user?.role}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600 font-medium">User ID:</span>
                <span className="text-gray-900 text-sm">{user?.id}</span>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="space-y-4"
          >
            <p className="text-gray-600">
              This is your protected dashboard. You can add more features here!
            </p>
            
            {user?.role === 'admin' && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4"
              >
                <h3 className="text-lg font-semibold text-purple-800 mb-2">
                  Admin Access Available
                </h3>
                <p className="text-purple-600 text-sm mb-3">
                  You have admin privileges. Access the admin dashboard to manage all users.
                </p>
                <Link
                  to="/admin"
                  className="inline-block bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  Go to Admin Dashboard
                </Link>
              </motion.div>
            )}
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSignOut}
              className="btn-secondary"
            >
              Sign Out
            </motion.button>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default Dashboard; 