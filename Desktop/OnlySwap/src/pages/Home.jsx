import { useState, useEffect } from 'react'
import { Rocket, TrendingUp, Users, Globe, Star, ArrowRight, CheckCircle, Play } from 'lucide-react'

const Home = () => {
  const [stats, setStats] = useState({
    users: 0,
    items: 0,
    countries: 0,
    savings: 0
  })

  const [currentTestimonial, setCurrentTestimonial] = useState(0)

  // Animate stats on scroll
  useEffect(() => {
    const animateStats = () => {
      setStats({
        users: 25000,
        items: 150000,
        countries: 45,
        savings: 2500000
      })
    }

    const timer = setTimeout(animateStats, 1000)
    return () => clearTimeout(timer)
  }, [])

  // Auto-rotate testimonials
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % 3)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const testimonials = [
    {
      name: "Sarah Chen",
      university: "Stanford University",
      text: "OnlySwap helped me find the perfect laptop for my studies while saving $800! The community is amazing.",
      rating: 5,
      avatar: "👩‍🎓"
    },
    {
      name: "Marcus Rodriguez",
      university: "MIT",
      text: "I've swapped over 20 items this year. It's not just about saving money - it's about sustainability.",
      rating: 5,
      avatar: "👨‍💻"
    },
    {
      name: "Emma Thompson",
      university: "UC Berkeley",
      text: "The verification system makes me feel safe, and I love connecting with fellow students worldwide.",
      rating: 5,
      avatar: "👩‍🔬"
    }
  ]

  const features = [
    {
      icon: (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="22" fill="url(#smartGradient)" stroke="url(#smartStroke)" strokeWidth="2"/>
          <path d="M16 20L24 28L32 20" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M24 16V28" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="24" cy="24" r="4" fill="white" opacity="0.3"/>
          <defs>
            <linearGradient id="smartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4CAF50"/>
              <stop offset="100%" stopColor="#388E3C"/>
            </linearGradient>
            <linearGradient id="smartStroke" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#66BB6A"/>
              <stop offset="100%" stopColor="#4CAF50"/>
            </linearGradient>
          </defs>
        </svg>
      ),
      title: "Smart Matching",
      description: "AI-powered algorithm finds perfect swap matches based on your preferences and location."
    },
    {
      icon: (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="8" y="16" width="32" height="24" rx="4" fill="url(#shieldGradient)" stroke="url(#shieldStroke)" strokeWidth="2"/>
          <path d="M24 8L32 16V24C32 28 28 32 24 32C20 32 16 28 16 24V16L24 8Z" fill="url(#shieldGradient)" stroke="url(#shieldStroke)" strokeWidth="2"/>
          <circle cx="24" cy="24" r="6" fill="white"/>
          <path d="M21 24L23 26L27 22" stroke="#4CAF50" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <defs>
            <linearGradient id="shieldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#388E3C"/>
              <stop offset="100%" stopColor="#2E7D32"/>
            </linearGradient>
            <linearGradient id="shieldStroke" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4CAF50"/>
              <stop offset="100%" stopColor="#388E3C"/>
            </linearGradient>
          </defs>
        </svg>
      ),
      title: "Verified Community",
      description: "Student ID verification ensures a safe, trusted environment for all transactions."
    },
    {
      icon: (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="20" fill="url(#ecoGradient)" stroke="url(#ecoStroke)" strokeWidth="2"/>
          <path d="M16 28C16 24 18 20 22 18C26 16 30 18 32 22C34 26 32 30 28 32C24 34 20 32 18 28" fill="white" opacity="0.9"/>
          <path d="M20 24C20 22 22 20 24 20C26 20 28 22 28 24C28 26 26 28 24 28C22 28 20 26 20 24Z" fill="#4CAF50"/>
          <path d="M24 16V20" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <path d="M24 28V32" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <path d="M16 24H20" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <path d="M28 24H32" stroke="white" strokeWidth="2" strokeLinecap="round"/>
          <defs>
            <linearGradient id="ecoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#66BB6A"/>
              <stop offset="100%" stopColor="#4CAF50"/>
            </linearGradient>
            <linearGradient id="ecoStroke" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4CAF50"/>
              <stop offset="100%" stopColor="#388E3C"/>
            </linearGradient>
          </defs>
        </svg>
      ),
      title: "Eco-Impact",
      description: "Track your environmental impact with carbon footprint reduction metrics."
    },
    {
      icon: (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="12" y="8" width="24" height="32" rx="4" fill="url(#mobileGradient)" stroke="url(#mobileStroke)" strokeWidth="2"/>
          <rect x="16" y="12" width="16" height="20" rx="2" fill="white"/>
          <circle cx="24" cy="36" r="2" fill="white"/>
          <rect x="18" y="14" width="12" height="2" rx="1" fill="#4CAF50"/>
          <rect x="18" y="18" width="8" height="2" rx="1" fill="#388E3C"/>
          <rect x="18" y="22" width="10" height="2" rx="1" fill="#4CAF50"/>
          <rect x="18" y="26" width="6" height="2" rx="1" fill="#388E3C"/>
          <rect x="18" y="30" width="9" height="2" rx="1" fill="#4CAF50"/>
          <defs>
            <linearGradient id="mobileGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4CAF50"/>
              <stop offset="100%" stopColor="#388E3C"/>
            </linearGradient>
            <linearGradient id="mobileStroke" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#66BB6A"/>
              <stop offset="100%" stopColor="#4CAF50"/>
            </linearGradient>
          </defs>
        </svg>
      ),
      title: "Mobile First",
      description: "Seamless experience across all devices with our responsive design."
    },
    {
      icon: (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="20" fill="url(#globalGradient)" stroke="url(#globalStroke)" strokeWidth="2"/>
          <path d="M24 4C24 4 28 8 32 16C36 24 36 32 32 40C28 48 24 52 24 52C24 52 20 48 16 40C12 32 12 24 16 16C20 8 24 4 24 4Z" fill="white" opacity="0.9"/>
          <path d="M24 4C24 4 20 8 16 16C12 24 12 32 16 40C20 48 24 52 24 52" stroke="#4CAF50" strokeWidth="2" fill="none"/>
          <path d="M24 4C24 4 28 8 32 16C36 24 36 32 32 40C28 48 24 52 24 52" stroke="#388E3C" strokeWidth="2" fill="none"/>
          <circle cx="24" cy="24" r="6" fill="white"/>
          <circle cx="24" cy="24" r="3" fill="#4CAF50"/>
          <defs>
            <linearGradient id="globalGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#4CAF50"/>
              <stop offset="100%" stopColor="#388E3C"/>
            </linearGradient>
            <linearGradient id="globalStroke" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#66BB6A"/>
              <stop offset="100%" stopColor="#4CAF50"/>
            </linearGradient>
          </defs>
        </svg>
      ),
      title: "Global Network",
      description: "Connect with students from 45+ countries and expand your network."
    },
    {
      icon: (
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="24" cy="24" r="20" fill="url(#instantGradient)" stroke="url(#instantStroke)" strokeWidth="2"/>
          <path d="M16 24L22 18L30 26L32 24" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M16 24L22 30L30 22L32 24" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="24" cy="24" r="4" fill="white" opacity="0.3"/>
          <defs>
            <linearGradient id="instantGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FBBF24"/>
              <stop offset="100%" stopColor="#F59E0B"/>
            </linearGradient>
            <linearGradient id="instantStroke" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FCD34D"/>
              <stop offset="100%" stopColor="#FBBF24"/>
            </linearGradient>
          </defs>
        </svg>
      ),
      title: "Instant Trading",
      description: "Real-time notifications and instant trade confirmations for smooth transactions."
    }
  ]

  const howItWorks = [
    {
      step: "01",
      title: "Create Profile",
      description: "Sign up with your student email and verify your university identity."
    },
    {
      step: "02",
      title: "List Items",
      description: "Upload photos and describe items you want to swap or trade."
    },
    {
      step: "03",
      title: "Find Matches",
      description: "Browse available items and find perfect swap opportunities."
    },
    {
      step: "04",
      title: "Connect & Trade",
      description: "Chat with other students and arrange safe meetups or shipping."
    }
  ]

  return (
    <>
      {/* Hero Section */}
      <section className="hero">
        <div className="background-shapes">
          <div className="shape shape-1"></div>
          <div className="shape shape-2"></div>
          <div className="shape shape-3"></div>
          <div className="shape shape-4"></div>
          <div className="shape shape-5"></div>
        </div>
        
        <div className="container">
          <div className="hero-content">
            <div className="hero-text">
              <div className="hero-badge">
                <span className="badge-icon">🌱</span>
                <span>Join 25,000+ students saving money & the planet</span>
              </div>
              
              <h1>
                The Future of <span className="brand-highlight">Sustainable</span> Shopping
                <br />
                <span className="hero-subtitle">is Here</span>
              </h1>
              
              <p className="hero-description">
                OnlySwap connects students worldwide to swap, trade, and find unique items while reducing waste and building a sustainable future. Join the revolution that's changing how students shop.
              </p>
              
              <div className="hero-actions">
                <button className="cta-button primary">
                  <Rocket className="cta-icon" />
                  <span>Start Swapping Today</span>
                </button>
                <button className="cta-button secondary">
                  <Play className="cta-icon" />
                  <span>Watch Demo</span>
                </button>
              </div>

              <div className="hero-stats">
                <div className="stat-item">
                  <div className="stat-number">{stats.users.toLocaleString()}+</div>
                  <div className="stat-label">Active Students</div>
                </div>
                <div className="stat-item">
                  <div className="stat-number">{stats.items.toLocaleString()}+</div>
                  <div className="stat-label">Items Swapped</div>
                </div>
                <div className="stat-item">
                  <div className="stat-number">{stats.countries}</div>
                  <div className="stat-label">Countries</div>
                </div>
              </div>
            </div>
            
            <div className="hero-visual">
              <div className="laptop-container">
                <div className="laptop">
                  <div className="laptop-screen">
                    <div className="screen-header">
                      <div className="app-name">
                        <span className="app-icon">🔄</span>
                        OnlySwap
                      </div>
                      <div className="header-right">
                        <span className="nav-item active">Home</span>
                        <span className="nav-item">Browse</span>
                        <span className="nav-item">My Items</span>
                        <div className="user-avatar">👤</div>
                      </div>
                    </div>
                    
                    <div className="search-section">
                      <div className="search-bar">
                        <div className="search-icon">🔍</div>
                        <input type="text" placeholder="What are you looking for?" />
                        <button className="search-btn">Search</button>
                      </div>
                    </div>
                    
                    <div className="trending-section">
                      <div className="section-title">Trending Now</div>
                      <div className="product-grid">
                        <div className="product-card featured">
                          <div className="product-image">
                            <img 
                              src="https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=150&h=100&fit=crop&crop=center" 
                              alt="iPhone 13" 
                            />
                            <div className="product-badge">Hot</div>
                          </div>
                          <div className="product-info">
                            <div className="product-name">iPhone 13</div>
                            <div className="product-trade">Swap for Android</div>
                            <div className="product-location">📍 Stanford</div>
                          </div>
                        </div>
                        <div className="product-card">
                          <div className="product-image">
                            <img 
                              src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=150&h=100&fit=crop&crop=center" 
                              alt="Nike Sneakers" 
                            />
                          </div>
                          <div className="product-info">
                            <div className="product-name">Nike Air Max</div>
                            <div className="product-trade">Trade for Size 9</div>
                            <div className="product-location">📍 MIT</div>
                          </div>
                        </div>
                        <div className="product-card">
                          <div className="product-image">
                            <img 
                              src="https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=150&h=100&fit=crop&crop=center" 
                              alt="MacBook Pro" 
                            />
                          </div>
                          <div className="product-info">
                            <div className="product-name">MacBook Pro</div>
                            <div className="product-trade">Exchange for Gaming PC</div>
                            <div className="product-location">📍 Berkeley</div>
                          </div>
                        </div>
                        <div className="product-card">
                          <div className="product-image">
                            <img 
                              src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=100&fit=crop&crop=center" 
                              alt="Gaming Headset" 
                            />
                          </div>
                          <div className="product-info">
                            <div className="product-name">Gaming Headset</div>
                            <div className="product-trade">Trade for Speakers</div>
                            <div className="product-location">📍 Harvard</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="how-it-works">
        <div className="container">
          <div className="section-header">
            <h2>How OnlySwap Works</h2>
            <p>Get started in just 4 simple steps</p>
          </div>
          
          <div className="steps-container">
            {howItWorks.map((step, index) => (
              <div key={index} className="step-item">
                <div className="step-number">{step.step}</div>
                <div className="step-content">
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </div>
                {index < howItWorks.length - 1 && <div className="step-arrow">→</div>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="features">
        <div className="container">
          <div className="section-header">
            <h2>Why Students Choose OnlySwap</h2>
            <p>Built by students, for students</p>
          </div>
          
          <div className="features-grid">
            {features.map((feature, index) => (
              <div key={index} className="feature-card">
                <div className="feature-icon">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Statistics Section */}
      <section className="statistics">
        <div className="container">
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="24" cy="24" r="20" fill="url(#usersGradient)" stroke="url(#usersStroke)" strokeWidth="2"/>
                  <circle cx="18" cy="20" r="3" fill="white"/>
                  <circle cx="30" cy="20" r="3" fill="white"/>
                  <path d="M16 32C16 28 19 25 24 25C29 25 32 28 32 32" fill="white"/>
                  <defs>
                    <linearGradient id="usersGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4CAF50"/>
                      <stop offset="100%" stopColor="#388E3C"/>
                    </linearGradient>
                    <linearGradient id="usersStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#66BB6A"/>
                      <stop offset="100%" stopColor="#4CAF50"/>
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div className="stat-number">25,000+</div>
              <div className="stat-label">Active Students</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="24" cy="24" r="20" fill="url(#swapGradient)" stroke="url(#swapStroke)" strokeWidth="2"/>
                  <path d="M16 20L24 28L32 20" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M16 28L24 20L32 28" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="24" cy="24" r="4" fill="white" opacity="0.3"/>
                  <defs>
                    <linearGradient id="swapGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#388E3C"/>
                      <stop offset="100%" stopColor="#2E7D32"/>
                    </linearGradient>
                    <linearGradient id="swapStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4CAF50"/>
                      <stop offset="100%" stopColor="#388E3C"/>
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div className="stat-number">150,000+</div>
              <div className="stat-label">Items Swapped</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="24" cy="24" r="20" fill="url(#moneyGradient)" stroke="url(#moneyStroke)" strokeWidth="2"/>
                  <path d="M24 12V36" stroke="white" strokeWidth="3" strokeLinecap="round"/>
                  <path d="M18 18L24 12L30 18" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M18 30L24 36L30 30" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                  <circle cx="24" cy="24" r="4" fill="white" opacity="0.3"/>
                  <defs>
                    <linearGradient id="moneyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FBBF24"/>
                      <stop offset="100%" stopColor="#F59E0B"/>
                    </linearGradient>
                    <linearGradient id="moneyStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FCD34D"/>
                      <stop offset="100%" stopColor="#FBBF24"/>
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div className="stat-number">$2.5M+</div>
              <div className="stat-label">Money Saved</div>
            </div>
            <div className="stat-card">
              <div className="stat-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="24" cy="24" r="20" fill="url(#ecoStatGradient)" stroke="url(#ecoStatStroke)" strokeWidth="2"/>
                  <path d="M16 28C16 24 18 20 22 18C26 16 30 18 32 22C34 26 32 30 28 32C24 34 20 32 18 28" fill="white" opacity="0.9"/>
                  <path d="M20 24C20 22 22 20 24 20C26 20 28 22 28 24C28 26 26 28 24 28C22 28 20 26 20 24Z" fill="#4CAF50"/>
                  <path d="M24 16V20" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <path d="M24 28V32" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                  <defs>
                    <linearGradient id="ecoStatGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#66BB6A"/>
                      <stop offset="100%" stopColor="#4CAF50"/>
                    </linearGradient>
                    <linearGradient id="ecoStatStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#4CAF50"/>
                      <stop offset="100%" stopColor="#388E3C"/>
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <div className="stat-number">45,000+</div>
              <div className="stat-label">CO₂ kg Saved</div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="testimonials">
        <div className="container">
          <div className="section-header">
            <h2>What Students Are Saying</h2>
            <p>Join thousands of satisfied users worldwide</p>
          </div>
          
          <div className="testimonials-container">
            <div className="testimonial-card active">
              <div className="testimonial-content">
                <div className="testimonial-text">
                  "{testimonials[currentTestimonial].text}"
                </div>
                <div className="testimonial-author">
                  <div className="author-avatar">{testimonials[currentTestimonial].avatar}</div>
                  <div className="author-info">
                    <div className="author-name">{testimonials[currentTestimonial].name}</div>
                    <div className="author-university">{testimonials[currentTestimonial].university}</div>
                  </div>
                  <div className="testimonial-rating">
                    {[...Array(testimonials[currentTestimonial].rating)].map((_, i) => (
                      <Star key={i} className="star-icon" fill="currentColor" />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="testimonial-dots">
              {testimonials.map((_, index) => (
                <button
                  key={index}
                  className={`dot ${index === currentTestimonial ? 'active' : ''}`}
                  onClick={() => setCurrentTestimonial(index)}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="container">
          <div className="cta-content">
            <h2>Ready to Start Your Sustainable Journey?</h2>
            <p>Join thousands of students already making a difference</p>
            <div className="cta-buttons">
              <button className="cta-button primary">
                <span>Create Free Account</span>
                <ArrowRight className="cta-icon" />
              </button>
              <button className="cta-button secondary">
                <span>Learn More</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}

export default Home
