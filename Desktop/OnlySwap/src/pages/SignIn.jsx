import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Mail, Lock } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import dataManager from '../utils/dataManager'

const SignIn = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const { login } = useAuth()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Check for admin credentials first
      if (formData.email === 'Admin@admin.edu' && formData.password === 'ThisWebsiteSucks#') {
        const adminData = {
          id: 'admin-001',
          email: 'Admin@admin.edu',
          name: 'Admin User',
          university: 'Admin University',
          joinedAt: new Date().toISOString(),
          isAdmin: true
        }
        
        // Store admin in localStorage
        localStorage.setItem('currentUser', JSON.stringify(adminData))
        navigate('/admin')
        return
      }
      
      // Check if user exists using data manager
      const user = dataManager.getUserByEmail(formData.email)
      if (!user) {
        setError('No account found with this email address. Please sign up first.')
        return
      }
      
      // Check if user is blocked
      if (user.isBlocked) {
        setError(`Your account has been blocked. Reason: ${user.blockReason || 'No reason provided'}. Please contact the administrator for assistance.`)
        return
      }
      
      // Check password (in real app, this would be hashed)
      if (user.password !== formData.password) {
        setError('Invalid password. Please try again or use forgot password.')
        return
      }
      
      // Login successful
      const userData = {
        id: user.id,
        email: user.email,
        name: user.name,
        university: user.university,
        joinedAt: user.joinDate
      }
      
      login(userData)
      navigate('/marketplace')
    } catch (err) {
      setError('Sign in failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
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

      {/* Centered Sign In Form */}
      <div className="signin-form-container">
        <div className="form-header">
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
            </div>
            <h1>Welcome Back</h1>
            <p>Sign in to your OnlySwap account</p>
          </div>
        </div>

        <form className="signin-form" onSubmit={handleSubmit}>
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}

          <div className="form-group">
            <div className="input-wrapper">
              <Mail className="input-icon" />
              <input
                type="email"
                id="email"
                name="email"
                placeholder="Your .edu email address"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="form-group">
            <div className="input-wrapper">
              <Lock className="input-icon" />
              <input
                type="password"
                id="password"
                name="password"
                placeholder="Password"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
            </div>
          </div>

          <button type="submit" className="signin-submit-btn" disabled={isLoading}>
            <span>{isLoading ? 'Signing In...' : 'Sign In'}</span>
            {!isLoading && <ArrowRight className="btn-icon" />}
          </button>

          <div className="signup-prompt">
            <p>Don't have an account? <Link to="/signup">Sign up</Link></p>
            <p className="forgot-password-link">
              <Link to="/forgot-password">Forgot your password?</Link>
            </p>
          </div>
        </form>
      </div>

      {/* Floating Icons */}
      <div className="floating-icon icon-1">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z" fill="currentColor"/>
        </svg>
      </div>
      <div className="icon-label label-1">Secure</div>

      <div className="floating-icon icon-2">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z" fill="currentColor"/>
        </svg>
      </div>
      <div className="icon-label label-2">Fast</div>

      <div className="floating-icon icon-3">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L13.09 8.26L20 9L13.09 9.74L12 16L10.91 9.74L4 9L10.91 8.26L12 2Z" fill="currentColor"/>
        </svg>
      </div>
      <div className="icon-label label-3">Reliable</div>
    </div>
  )
}

export default SignIn
