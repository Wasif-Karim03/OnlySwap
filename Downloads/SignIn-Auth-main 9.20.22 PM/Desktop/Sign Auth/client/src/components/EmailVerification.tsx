import React, { useState } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';

interface EmailVerificationProps {
  email: string;
  onBack: () => void;
}

const EmailVerification: React.FC<EmailVerificationProps> = ({ email, onBack }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/auth/verify-email', { email, code });
      setSuccess(true);
      // Store token and redirect
      localStorage.setItem('token', response.data.token);
      window.location.href = '/marketplace';
    } catch (err: any) {
      setError(err.response?.data?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setError('');

    try {
      await axios.post('/api/auth/resend-verification', { email });
      setError('Verification code sent successfully!');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ backgroundColor: '#FAFAF8' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md mx-auto text-center"
      >
        {/* Brand Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-2"
        >
          <img 
            src="/pictures/logo.png"
            alt="OnlySwap Logo"
            className="h-72 mx-auto"
            style={{ height: '288px', width: 'auto' }}
          />
        </motion.div>

        {/* Main Heading */}
        <motion.h2
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-2xl font-bold mb-1"
          style={{ color: '#046C4E', fontFamily: 'Inter' }}
        >
          Verify Your Email
        </motion.h2>

        {/* Sub-heading */}
        <motion.p
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-base mb-4"
          style={{ color: '#046C4E', fontFamily: 'Inter' }}
        >
          We've sent a verification code to <span className="font-medium">{email}</span>
        </motion.p>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          {/* Verification Code Input */}
          <div>
            <input
              type="text"
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-center text-2xl tracking-widest"
              placeholder="000000"
              maxLength={6}
              required
              autoComplete="off"
              data-form-type="other"
              style={{ fontFamily: 'Inter' }}
            />
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`text-sm text-center p-3 rounded-lg ${
                error.includes('successfully') 
                  ? 'text-green-600 bg-green-50' 
                  : 'text-red-600 bg-red-50'
              }`}
              style={{ fontFamily: 'Inter' }}
            >
              {error}
            </motion.div>
          )}

          {/* Verify Email Button */}
          <button
            type="submit"
            disabled={loading || code.length !== 6}
            className="w-full px-4 py-3 text-white rounded-lg text-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: '#046C4E', fontFamily: 'Inter' }}
          >
            {loading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-5 h-5 border-2 border-white border-t-transparent rounded-full mx-auto"
              />
            ) : (
              'Verify Email'
            )}
          </button>
        </motion.form>

        {/* Action Links */}
        <div className="mt-6 space-y-4">
          <button
            onClick={handleResend}
            disabled={loading}
            className="w-full text-sm font-medium transition-colors"
            style={{ color: '#046C4E', fontFamily: 'Inter' }}
          >
            Didn't receive the code? Resend
          </button>

          <button
            onClick={onBack}
            className="w-full text-sm transition-colors"
            style={{ color: '#666666', fontFamily: 'Inter' }}
          >
            Back to sign up
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default EmailVerification; 