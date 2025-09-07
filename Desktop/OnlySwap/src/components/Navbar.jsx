import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Menu, X, LogOut, User, Bookmark, Shield } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const { user, logout, isAuthenticated } = useAuth()

  useEffect(() => {
    if (user) {
      const saved = JSON.parse(localStorage.getItem(`savedProducts_${user.id}`) || '[]')
      setSavedCount(saved.length)
    }
  }, [user])

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  const handleLogout = () => {
    logout()
    setIsMenuOpen(false)
  }

  return (
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-logo">
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
        </Link>

        <div className={`nav-menu ${isMenuOpen ? 'active' : ''}`}>
          <Link to="/" className="nav-link" onClick={() => setIsMenuOpen(false)}>
            Home
          </Link>
          {isAuthenticated && (
            <>
              <Link to="/marketplace" className="nav-link" onClick={() => setIsMenuOpen(false)}>
                Marketplace
              </Link>
              <Link to="/saved" className="nav-link saved-link" onClick={() => setIsMenuOpen(false)}>
                <Bookmark size={16} />
                Saved
                {savedCount > 0 && <span className="saved-count">{savedCount}</span>}
              </Link>
              {user?.isAdmin && (
                <Link to="/admin" className="nav-link admin-link" onClick={() => setIsMenuOpen(false)}>
                  <Shield size={16} />
                  Admin
                </Link>
              )}
            </>
          )}
          {!isAuthenticated ? (
            <>
              <Link to="/signin" className="nav-link" onClick={() => setIsMenuOpen(false)}>
                Sign In
              </Link>
              <Link to="/signup" className="nav-btn" onClick={() => setIsMenuOpen(false)}>
                Get Started
              </Link>
            </>
          ) : (
            <div className="user-menu">
              <div className="user-info">
                <User size={16} />
                <span>{user?.name || 'User'}</span>
              </div>
              <button onClick={handleLogout} className="logout-btn">
                <LogOut size={16} />
                Logout
              </button>
            </div>
          )}
        </div>

        <div className="nav-toggle" onClick={toggleMenu}>
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </div>
      </div>
    </nav>
  )
}

export default Navbar
