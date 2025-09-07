import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Mail, Lock, User, Eye, EyeOff, GraduationCap, Search, ChevronDown, AlertCircle, CheckCircle } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const SignUp = () => {
  const { register } = useAuth()
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    university: '',
    password: '',
    confirmPassword: '',
    agreeToTerms: false
  })

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [showUniversityDropdown, setShowUniversityDropdown] = useState(false)
  const [universitySearch, setUniversitySearch] = useState('')
  const [emailError, setEmailError] = useState('')
  const [passwordStrength, setPasswordStrength] = useState({
    score: 0,
    feedback: '',
    color: '#e5e7eb'
  })
  const [passwordsMatch, setPasswordsMatch] = useState(true)
  const [emailValid, setEmailValid] = useState(true)
  const navigate = useNavigate()

  const universityRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (universityRef.current && !universityRef.current.contains(event.target)) {
        setShowUniversityDropdown(false)
        setUniversitySearch('')
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Validate .edu email
  const validateEmail = (email) => {
    if (!email) {
      setEmailError('')
      return true
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setEmailError('Please enter a valid email address')
      return false
    }
    
    if (!email.endsWith('.edu')) {
      setEmailError('Only .edu email addresses are accepted')
      return false
    }
    
    setEmailError('')
    return true
  }

  // Check password strength
  const checkPasswordStrength = (password) => {
    let score = 0
    let feedback = []
    
    if (password.length >= 8) score += 1
    else feedback.push('At least 8 characters')
    
    if (/[a-z]/.test(password)) score += 1
    else feedback.push('Lowercase letter')
    
    if (/[A-Z]/.test(password)) score += 1
    else feedback.push('Uppercase letter')
    
    if (/[0-9]/.test(password)) score += 1
    else feedback.push('Number')
    
    if (/[^A-Za-z0-9]/.test(password)) score += 1
    else feedback.push('Special character')
    
    let color = '#e5e7eb'
    let strengthText = ''
    
    if (score === 0) {
      color = '#ef4444'
      strengthText = 'Very Weak'
    } else if (score === 1) {
      color = '#f97316'
      strengthText = 'Weak'
    } else if (score === 2) {
      color = '#eab308'
      strengthText = 'Fair'
    } else if (score === 3) {
      color = '#84cc16'
      strengthText = 'Good'
    } else if (score === 4) {
      color = '#22c55e'
      strengthText = 'Strong'
    } else {
      color = '#16a34a'
      strengthText = 'Very Strong'
    }
    
    setPasswordStrength({
      score,
      feedback: feedback.length > 0 ? feedback.join(', ') : 'All requirements met!',
      color,
      strengthText
    })
  }

  // List of major USA universities
  const universities = [
    "University of California, Berkeley",
    "Stanford University",
    "Massachusetts Institute of Technology (MIT)",
    "Harvard University",
    "Yale University",
    "Princeton University",
    "Columbia University",
    "University of Pennsylvania",
    "Dartmouth College",
    "Brown University",
    "Cornell University",
    "University of California, Los Angeles (UCLA)",
    "University of California, San Diego (UCSD)",
    "University of Michigan",
    "University of Virginia",
    "University of North Carolina at Chapel Hill",
    "University of Texas at Austin",
    "University of Wisconsin-Madison",
    "University of Illinois at Urbana-Champaign",
    "University of Washington",
    "University of California, Davis",
    "University of California, Irvine",
    "University of California, Santa Barbara",
    "University of California, Santa Cruz",
    "University of California, Riverside",
    "University of California, Merced",
    "New York University (NYU)",
    "Carnegie Mellon University",
    "University of Southern California (USC)",
    "Georgetown University",
    "Vanderbilt University",
    "Rice University",
    "Emory University",
    "University of Notre Dame",
    "Washington University in St. Louis",
    "Tufts University",
    "Wake Forest University",
    "Boston College",
    "Tulane University",
    "University of Miami",
    "University of Florida",
    "University of Georgia",
    "University of South Carolina",
    "University of Tennessee",
    "University of Kentucky",
    "University of Indiana",
    "Purdue University",
    "Ohio State University",
    "Ohio Wesleyan University",
    "Miami University",
    "Case Western Reserve University",
    "University of Cincinnati",
    "Bowling Green State University",
    "Kent State University",
    "University of Akron",
    "University of Toledo",
    "Wright State University",
    "University of Pittsburgh",
    "Penn State University",
    "Rutgers University",
    "University of Maryland",
    "University of Delaware",
    "University of Connecticut",
    "Boston University",
    "Northeastern University",
    "University of Massachusetts",
    "University of Vermont",
    "University of New Hampshire",
    "University of Maine",
    "University of Rhode Island",
    "University of Alaska",
    "University of Hawaii",
    "University of Oregon",
    "Oregon State University",
    "University of Idaho",
    "University of Montana",
    "University of Wyoming",
    "University of Colorado Boulder",
    "University of Utah",
    "University of Arizona",
    "Arizona State University",
    "University of New Mexico",
    "University of Nevada, Las Vegas",
    "University of Nevada, Reno",
    "University of Oklahoma",
    "Oklahoma State University",
    "University of Arkansas",
    "University of Mississippi",
    "University of Alabama",
    "Auburn University",
    "University of Louisiana at Lafayette",
    "Louisiana State University",
    "University of Houston",
    "Texas A&M University",
    "Baylor University",
    "Southern Methodist University",
    "University of Denver",
    "University of Tulsa",
    "University of Kansas",
    "Kansas State University",
    "University of Missouri",
    "University of Nebraska",
    "University of Iowa",
    "Iowa State University",
    "University of Minnesota",
    "University of North Dakota",
    "University of South Dakota",
    "University of Montana",
    "Montana State University",
    "Williams College",
    "Amherst College",
    "Swarthmore College",
    "Wellesley College",
    "Pomona College",
    "Claremont McKenna College",
    "Harvey Mudd College",
    "Scripps College",
    "Pitzer College",
    "Davidson College",
    "Colgate University",
    "Bucknell University",
    "Lafayette College",
    "Lehigh University",
    "Villanova University",
    "University of Richmond",
    "College of William & Mary",
    "University of Vermont",
    "University of New Hampshire",
    "University of Maine",
    "University of Rhode Island",
    "University of Alaska",
    "University of Hawaii",
    "University of Oregon",
    "Oregon State University",
    "University of Idaho",
    "University of Montana",
    "University of Wyoming",
    "University of Colorado Boulder",
    "University of Utah",
    "University of Arizona",
    "Arizona State University",
    "University of New Mexico",
    "University of Nevada, Las Vegas",
    "University of Nevada, Reno",
    "University of Oklahoma",
    "Oklahoma State University",
    "University of Arkansas",
    "University of Mississippi",
    "University of Alabama",
    "Auburn University",
    "University of Louisiana at Lafayette",
    "Louisiana State University",
    "University of Houston",
    "Texas A&M University",
    "Baylor University",
    "Southern Methodist University",
    "University of Denver",
    "University of Tulsa",
    "University of Kansas",
    "Kansas State University",
    "University of Missouri",
    "University of Nebraska",
    "University of Iowa",
    "Iowa State University",
    "University of Minnesota",
    "University of North Dakota",
    "University of South Dakota",
    "University of Montana",
    "Montana State University"
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    // Validate email before submission
    if (!validateEmail(formData.email)) {
      return
    }
    
    // Check if passwords match
    if (formData.password !== formData.confirmPassword) {
      setEmailError('Passwords do not match')
      return
    }
    
    try {
      // Create new user using the auth context
      const result = await register({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        university: formData.university,
        password: formData.password,
        name: `${formData.firstName} ${formData.lastName}`
      })
      
      if (result.success) {
        console.log('Account created successfully:', result.user)
        // Redirect to marketplace after successful sign up
        navigate('/marketplace')
      } else {
        setEmailError(result.error || 'Failed to create account. Please try again.')
      }
    } catch (error) {
      setEmailError('Failed to create account. Please try again.')
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
    
    // Validate email on change
    if (name === 'email') {
      validateEmail(value)
    }
    
    // Check password strength on change
    if (name === 'password') {
      checkPasswordStrength(value)
    }
  }

  const togglePasswordVisibility = () => setShowPassword(!showPassword)
  const toggleConfirmPasswordVisibility = () => setShowConfirmPassword(!showConfirmPassword)
  const toggleUniversityDropdown = () => setShowUniversityDropdown(!showUniversityDropdown)

  const selectUniversity = (university) => {
    setFormData(prev => ({ ...prev, university }))
    setShowUniversityDropdown(false)
    setUniversitySearch('')
  }

  const filteredUniversities = universities.filter(uni =>
    uni.toLowerCase().includes(universitySearch.toLowerCase())
  )

  return (
    <div className="signin-container">
      {/* Background Shapes */}
      <div className="background-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
        <div className="shape shape-4"></div>
      </div>

      {/* Centered Sign Up Form */}
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
            <h1>Create Account</h1>
            <p>Join OnlySwap and start swapping today</p>
          </div>
        </div>

        <form className="signin-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <div className="input-wrapper">
              <User className="input-icon" />
              <input
                type="text"
                id="firstName"
                name="firstName"
                placeholder="First name"
                value={formData.firstName}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <div className="input-wrapper">
              <User className="input-icon" />
              <input
                type="text"
                id="lastName"
                name="lastName"
                placeholder="Last name"
                value={formData.lastName}
                onChange={handleChange}
                required
              />
            </div>
          </div>

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
                className={emailError ? 'error' : ''}
              />
            </div>
            {emailError && (
              <div className="error-message">
                <AlertCircle size={16} />
                <span>{emailError}</span>
              </div>
            )}
            {!emailError && formData.email && formData.email.endsWith('.edu') && (
              <div className="success-message">
                <CheckCircle size={16} />
                <span>Valid .edu email address</span>
              </div>
            )}
          </div>

          <div className="form-group" ref={universityRef}>
            <div className="input-wrapper university-input">
              <GraduationCap className="input-icon" />
              <input
                type="text"
                id="university"
                name="university"
                placeholder="Select your university"
                value={formData.university}
                onChange={handleChange}
                onClick={toggleUniversityDropdown}
                readOnly
                required
              />
              <button
                type="button"
                onClick={toggleUniversityDropdown}
                className="university-toggle"
              >
                <ChevronDown size={18} />
              </button>
            </div>
            
            {showUniversityDropdown && (
              <div className="university-dropdown">
                <div className="dropdown-search">
                  <Search className="search-icon" size={18} />
                  <input
                    type="text"
                    placeholder="Search universities..."
                    value={universitySearch}
                    onChange={(e) => setUniversitySearch(e.target.value)}
                    className="search-input"
                  />
                </div>
                <div className="university-list">
                  {filteredUniversities.map((university, index) => (
                    <div
                      key={index}
                      className="university-item"
                      onClick={() => selectUniversity(university)}
                    >
                      {university}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <div className="input-wrapper">
              <Lock className="input-icon" />
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                placeholder="Create a strong password"
                value={formData.password}
                onChange={handleChange}
                required
              />
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className="password-toggle"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            
            {/* Password Strength Indicator */}
            {formData.password && (
              <div className="password-strength">
                <div className="strength-bar">
                  <div 
                    className="strength-fill" 
                    style={{ 
                      width: `${(passwordStrength.score / 5) * 100}%`,
                      backgroundColor: passwordStrength.color
                    }}
                  ></div>
                </div>
                <div className="strength-info">
                  <span className="strength-text" style={{ color: passwordStrength.color }}>
                    {passwordStrength.strengthText}
                  </span>
                  <span className="strength-feedback">
                    {passwordStrength.feedback}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <div className="input-wrapper">
              <Lock className="input-icon" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                id="confirmPassword"
                name="confirmPassword"
                placeholder="Confirm password"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
              />
              <button
                type="button"
                onClick={toggleConfirmPasswordVisibility}
                className="password-toggle"
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            
            {/* Password Match Indicator */}
            {formData.confirmPassword && (
              <div className="password-match">
                {formData.password === formData.confirmPassword ? (
                  <div className="match-success">
                    <CheckCircle size={16} />
                    <span>Passwords match</span>
                  </div>
                ) : (
                  <div className="match-error">
                    <AlertCircle size={16} />
                    <span>Passwords do not match</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="checkbox-wrapper">
              <input
                type="checkbox"
                id="agreeToTerms"
                name="agreeToTerms"
                checked={formData.agreeToTerms}
                onChange={handleChange}
                required
              />
              <span className="checkmark"></span>
              I agree to the <a href="#terms" className="terms-link">Terms of Service</a> and <a href="#privacy" className="terms-link">Privacy Policy</a>
            </label>
          </div>

          <button type="submit" className="signin-submit-btn">
            <span>Create Account</span>
            <ArrowRight className="btn-icon" />
          </button>

          <div className="signup-prompt">
            <p>Already have an account? <Link to="/signin">Sign in</Link></p>
          </div>
        </form>
      </div>
    </div>
  )
}

export default SignUp
