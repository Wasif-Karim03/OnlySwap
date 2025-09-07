import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Mail, CheckCircle, ArrowRight } from 'lucide-react'
import dataManager from '../utils/dataManager'

const ForgotPassword = () => {
  const [step, setStep] = useState(1) // 1: email, 2: verification, 3: new password
  const [formData, setFormData] = useState({
    email: '',
    verificationCode: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [sentCode, setSentCode] = useState('')
  const navigate = useNavigate()

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSendCode = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      // Check if email exists
      const user = dataManager.getUserByEmail(formData.email)
      if (!user) {
        setError('No account found with this email address')
        setIsLoading(false)
        return
      }

      // Generate and save verification code
      const code = Math.random().toString(36).substring(2, 8).toUpperCase()
      // Save password reset token to localStorage for demo
      localStorage.setItem(`reset_token_${formData.email}`, code)
      setSentCode(code) // In real app, this would be sent via email
      
      setStep(2)
      setSuccess(`Verification code sent to ${formData.email}`)
    } catch (err) {
      setError('Failed to send verification code. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyCode = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      if (formData.verificationCode === sentCode) {
        setStep(3)
        setSuccess('Code verified! Please enter your new password.')
      } else {
        setError('Invalid verification code')
      }
    } catch (err) {
      setError('Verification failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      if (formData.newPassword !== formData.confirmPassword) {
        setError('Passwords do not match')
        setIsLoading(false)
        return
      }

      if (formData.newPassword.length < 6) {
        setError('Password must be at least 6 characters long')
        setIsLoading(false)
        return
      }

      // Update the user's password in dataManager
      const user = dataManager.getUserByEmail(formData.email)
      if (user) {
        user.password = formData.newPassword
        dataManager.updateUser(user.id, user)
        // Clear the reset token
        localStorage.removeItem(`reset_token_${formData.email}`)
        setSuccess('Password reset successfully! You can now sign in with your new password.')
      } else {
        setError('User not found. Please try again.')
        setIsLoading(false)
        return
      }
      
      setTimeout(() => {
        navigate('/signin')
      }, 2000)
    } catch (err) {
      setError('Failed to reset password. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="signin-container">
      {/* Background Shapes */}
      <div className="background-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
        <div className="shape shape-4"></div>
      </div>

      {/* Centered Form */}
      <div className="signin-form-container">
        <div className="form-header">
          <Link to="/signin" className="back-link">
            <ArrowLeft size={20} />
            Back to Sign In
          </Link>
          <div className="logo-section">
            <div className="logo-icon">
              <svg 
                width="32" 
                height="32" 
                viewBox="0 0 32 32" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* Main Circle */}
                <circle cx="16" cy="16" r="15" fill="url(#gradient1)" stroke="url(#gradient2)" strokeWidth="2"/>
                
                {/* Inner Design Elements */}
                <path d="M8 12C8 9.79086 9.79086 8 12 8H20C22.2091 8 24 9.79086 24 12V20C24 22.2091 22.2091 24 20 24H12C9.79086 24 8 22.2091 8 20V12Z" fill="url(#gradient3)" opacity="0.9"/>
                
                {/* Exchange Arrows */}
                <path d="M10 14L14 18L18 14" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 18L18 14L14 18" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                
                {/* Center Dot */}
                <circle cx="16" cy="16" r="2" fill="white"/>
                
                {/* Decorative Elements */}
                <circle cx="12" cy="12" r="1.5" fill="white" opacity="0.7"/>
                <circle cx="20" cy="12" r="1.5" fill="white" opacity="0.7"/>
                <circle cx="12" cy="20" r="1.5" fill="white" opacity="0.7"/>
                <circle cx="20" cy="20" r="1.5" fill="white" opacity="0.7"/>
                
                {/* Gradients */}
                <defs>
                  <linearGradient id="gradient1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4CAF50"/>
                    <stop offset="100%" stopColor="#388E3C"/>
                  </linearGradient>
                  <linearGradient id="gradient2" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#66BB6A"/>
                    <stop offset="100%" stopColor="#4CAF50"/>
                  </linearGradient>
                  <linearGradient id="gradient3" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#388E3C"/>
                    <stop offset="100%" stopColor="#2E7D32"/>
                  </linearGradient>
                </defs>
              </svg>
              <span>OnlySwap</span>
            </div>
            <h1>
              {step === 1 && 'Reset Password'}
              {step === 2 && 'Verify Email'}
              {step === 3 && 'New Password'}
            </h1>
            <p>
              {step === 1 && 'Enter your email address to receive a verification code'}
              {step === 2 && 'Enter the 6-digit code sent to your email'}
              {step === 3 && 'Create a new password for your account'}
            </p>
          </div>
        </div>

        {success && (
          <div className="success-message">
            <CheckCircle size={16} />
            {success}
          </div>
        )}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        {step === 1 && (
          <form onSubmit={handleSendCode} className="signin-form">
            <div className="form-group">
              <div className="input-wrapper">
                <Mail className="input-icon" />
                <input
                  type="email"
                  name="email"
                  placeholder="Enter your email address"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <button type="submit" className="signin-submit-btn" disabled={isLoading}>
              <span>{isLoading ? 'Sending...' : 'Send Verification Code'}</span>
              {!isLoading && <ArrowRight className="btn-icon" />}
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleVerifyCode} className="signin-form">
            <div className="form-group">
              <div className="input-wrapper">
                <input
                  type="text"
                  name="verificationCode"
                  placeholder="Enter 6-digit code"
                  value={formData.verificationCode}
                  onChange={handleChange}
                  maxLength="6"
                  required
                  disabled={isLoading}
                  className="verification-input"
                />
              </div>
              <p className="verification-note">
                Demo: Your code is <strong>{sentCode}</strong>
              </p>
            </div>

            <button type="submit" className="signin-submit-btn" disabled={isLoading}>
              <span>{isLoading ? 'Verifying...' : 'Verify Code'}</span>
              {!isLoading && <ArrowRight className="btn-icon" />}
            </button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleResetPassword} className="signin-form">
            <div className="form-group">
              <div className="input-wrapper">
                <input
                  type="password"
                  name="newPassword"
                  placeholder="New password"
                  value={formData.newPassword}
                  onChange={handleChange}
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="form-group">
              <div className="input-wrapper">
                <input
                  type="password"
                  name="confirmPassword"
                  placeholder="Confirm new password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  required
                  disabled={isLoading}
                />
              </div>
            </div>

            <button type="submit" className="signin-submit-btn" disabled={isLoading}>
              <span>{isLoading ? 'Resetting...' : 'Reset Password'}</span>
              {!isLoading && <ArrowRight className="btn-icon" />}
            </button>
          </form>
        )}

        <div className="signup-prompt">
          <p>Remember your password? <Link to="/signin">Sign in</Link></p>
        </div>
      </div>

      {/* Floating Icons */}
      <div className="floating-icons">
        <div className="floating-icon" style={{ top: '20%', left: '10%', animationDelay: '0s' }}>
          <Mail size={24} />
        </div>
        <div className="floating-icon" style={{ top: '60%', right: '15%', animationDelay: '1s' }}>
          <CheckCircle size={20} />
        </div>
        <div className="floating-icon" style={{ bottom: '30%', left: '20%', animationDelay: '2s' }}>
          <ArrowRight size={18} />
        </div>
      </div>
    </div>
  )
}

export default ForgotPassword
