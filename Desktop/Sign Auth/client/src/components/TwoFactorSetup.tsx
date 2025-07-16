import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import axios from 'axios';

interface TwoFactorSetupProps {
  onClose: () => void;
  onSuccess: () => void;
}

interface TwoFactorData {
  qrCode: string;
  secret: string;
  backupCodes: string[];
}

const TwoFactorSetup: React.FC<TwoFactorSetupProps> = ({ onClose, onSuccess }) => {
  const [step, setStep] = useState<'setup' | 'verify' | 'backup'>('setup');
  const [twoFactorData, setTwoFactorData] = useState<TwoFactorData | null>(null);
  const [verificationToken, setVerificationToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setupTwoFactor();
  }, []);

  const setupTwoFactor = async () => {
    try {
      setLoading(true);
      const response = await axios.post('/api/auth/setup-2fa');
      setTwoFactorData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to setup 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationToken) return;

    try {
      setLoading(true);
      await axios.post('/api/auth/verify-2fa', { token: verificationToken });
      setStep('backup');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    onSuccess();
    onClose();
  };

  if (loading && !twoFactorData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 text-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"
          />
          <p>Setting up 2FA...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-lg p-8 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
      >
        {step === 'setup' && twoFactorData && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Setup Two-Factor Authentication</h2>
            
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-gray-600 mb-4">
                  Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                </p>
                <div className="bg-gray-50 p-4 rounded-lg inline-block">
                  <img src={twoFactorData.qrCode} alt="QR Code" className="w-48 h-48" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Manual Entry Code
                </label>
                <div className="flex">
                  <input
                    type="text"
                    value={twoFactorData.secret}
                    readOnly
                    className="input-field flex-1 font-mono text-sm"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(twoFactorData.secret)}
                    className="ml-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <button
                onClick={() => setStep('verify')}
                className="btn-primary w-full"
              >
                Next: Verify Setup
              </button>
            </div>
          </div>
        )}

        {step === 'verify' && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Verify Setup</h2>
            
            <form onSubmit={handleVerify} className="space-y-6">
              <div>
                <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-2">
                  Enter 6-digit code from your app
                </label>
                <input
                  type="text"
                  id="token"
                  value={verificationToken}
                  onChange={(e) => setVerificationToken(e.target.value)}
                  className="input-field"
                  placeholder="000000"
                  maxLength={6}
                  required
                  autoComplete="off"
                  data-form-type="other"
                />
              </div>

              {error && (
                <div className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-lg">
                  {error}
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => setStep('setup')}
                  className="btn-secondary flex-1"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={loading || verificationToken.length !== 6}
                  className="btn-primary flex-1"
                >
                  {loading ? 'Verifying...' : 'Verify'}
                </button>
              </div>
            </form>
          </div>
        )}

        {step === 'backup' && twoFactorData && (
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Backup Codes</h2>
            
            <div className="space-y-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-yellow-800 text-sm">
                  <strong>Important:</strong> Save these backup codes in a secure location. 
                  You can use them to access your account if you lose your authenticator device.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Backup Codes
                </label>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                    {twoFactorData.backupCodes.map((code, index) => (
                      <div key={index} className="bg-white p-2 rounded border">
                        {code}
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => {
                    const codesText = twoFactorData.backupCodes.join('\n');
                    navigator.clipboard.writeText(codesText);
                  }}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-700"
                >
                  Copy all codes
                </button>
              </div>

              <button
                onClick={handleComplete}
                className="btn-primary w-full"
              >
                Complete Setup
              </button>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </motion.div>
    </div>
  );
};

export default TwoFactorSetup; 