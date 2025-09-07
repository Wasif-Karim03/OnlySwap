import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'

function WorkingHome() {
  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #4CAF50, #388E3C)',
      color: 'white',
      padding: '2rem 0'
    }}>
      {/* Navigation */}
      <nav style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        background: 'rgba(76, 175, 80, 0.95)',
        padding: '1rem 2rem',
        zIndex: 1000,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ fontSize: '1.5rem' }}>🔄</div>
          <span style={{ fontWeight: 'bold', fontSize: '1.2rem' }}>OnlySwap</span>
        </div>
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
          <a href="/" style={{ color: 'white', textDecoration: 'none', padding: '0.5rem 1rem', borderRadius: '4px', transition: 'background-color 0.2s' }}>Home</a>
          <a href="/marketplace" style={{ color: 'white', textDecoration: 'none', padding: '0.5rem 1rem', borderRadius: '4px', transition: 'background-color 0.2s' }}>Marketplace</a>
          <a href="/signin" style={{ color: 'white', textDecoration: 'none', padding: '0.5rem 1rem', borderRadius: '4px', transition: 'background-color 0.2s' }}>Sign In</a>
          <a href="/signup" style={{ color: 'white', textDecoration: 'none', padding: '0.5rem 1rem', borderRadius: '4px', transition: 'background-color 0.2s' }}>Sign Up</a>
          <button style={{
            backgroundColor: 'white',
            color: '#4CAF50',
            padding: '0.5rem 1.5rem',
            border: 'none',
            borderRadius: '6px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}>Get Started</button>
        </div>
      </nav>

      {/* Hero Section */}
      <div style={{ 
        textAlign: 'center', 
        padding: '8rem 2rem 4rem',
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        <h1 style={{ 
          fontSize: '4rem', 
          fontWeight: 'bold', 
          marginBottom: '1.5rem',
          textShadow: '2px 2px 4px rgba(0,0,0,0.3)'
        }}>
          OnlySwap
        </h1>
        <p style={{ 
          fontSize: '1.5rem', 
          marginBottom: '2rem',
          opacity: 0.9,
          maxWidth: '600px',
          margin: '0 auto 2rem'
        }}>
          The smart way to exchange items with other students. Trade textbooks, electronics, furniture, and more within your university community.
        </p>
        
        {/* Laptop Mockup */}
        <div style={{
          margin: '3rem auto',
          width: '400px',
          height: '250px',
          background: 'linear-gradient(145deg, #2c3e50, #34495e)',
          borderRadius: '20px',
          padding: '20px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
          position: 'relative',
          transform: 'perspective(1000px) rotateY(-5deg) rotateX(5deg)',
          animation: 'float 3s ease-in-out infinite'
        }}>
          <div style={{
            width: '100%',
            height: '100%',
            background: 'linear-gradient(135deg, #4CAF50, #388E3C)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontSize: '1.2rem',
            fontWeight: 'bold'
          }}>
            OnlySwap Dashboard
          </div>
        </div>

        <div style={{ marginBottom: '4rem' }}>
          <button style={{
            backgroundColor: 'white',
            color: '#4CAF50',
            padding: '1.2rem 2.5rem',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            margin: '0 1rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            transition: 'transform 0.2s, box-shadow 0.2s'
          }}>
            Start Trading Now
          </button>
          <button style={{
            backgroundColor: 'transparent',
            color: 'white',
            padding: '1.2rem 2.5rem',
            border: '2px solid white',
            borderRadius: '8px',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            margin: '0 1rem',
            transition: 'all 0.2s'
          }}>
            Learn More
          </button>
        </div>
      </div>

      {/* Features Section */}
      <div style={{ 
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: '4rem 2rem',
        textAlign: 'center'
      }}>
        <h2 style={{ 
          fontSize: '3rem', 
          marginBottom: '3rem',
          textShadow: '1px 1px 2px rgba(0,0,0,0.3)'
        }}>
          Why Choose OnlySwap?
        </h2>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '3rem',
          maxWidth: '1200px',
          margin: '0 auto'
        }}>
          <div style={{ padding: '2rem' }}>
            <div style={{ 
              fontSize: '4rem', 
              marginBottom: '1.5rem' 
            }}>🎯</div>
            <h3 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>Smart Matching</h3>
            <p style={{ fontSize: '1.1rem', opacity: 0.9 }}>Find exactly what you need with our intelligent recommendation system that learns from your preferences.</p>
          </div>
          <div style={{ padding: '2rem' }}>
            <div style={{ 
              fontSize: '4rem', 
              marginBottom: '1.5rem' 
            }}>✅</div>
            <h3 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>Verified Community</h3>
            <p style={{ fontSize: '1.1rem', opacity: 0.9 }}>Trade with verified students from your university. All users are authenticated with their student email.</p>
          </div>
          <div style={{ padding: '2rem' }}>
            <div style={{ 
              fontSize: '4rem', 
              marginBottom: '1.5rem' 
            }}>💬</div>
            <h3 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>Easy Communication</h3>
            <p style={{ fontSize: '1.1rem', opacity: 0.9 }}>Chat directly with other students to arrange exchanges. Built-in messaging system for seamless communication.</p>
          </div>
          <div style={{ padding: '2rem' }}>
            <div style={{ 
              fontSize: '4rem', 
              marginBottom: '1.5rem' 
            }}>🔒</div>
            <h3 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>Secure Transactions</h3>
            <p style={{ fontSize: '1.1rem', opacity: 0.9 }}>Safe and secure trading with built-in escrow system and dispute resolution.</p>
          </div>
          <div style={{ padding: '2rem' }}>
            <div style={{ 
              fontSize: '4rem', 
              marginBottom: '1.5rem' 
            }}>📱</div>
            <h3 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>Mobile Friendly</h3>
            <p style={{ fontSize: '1.1rem', opacity: 0.9 }}>Access OnlySwap anywhere with our responsive design that works on all devices.</p>
          </div>
          <div style={{ padding: '2rem' }}>
            <div style={{ 
              fontSize: '4rem', 
              marginBottom: '1.5rem' 
            }}>🌟</div>
            <h3 style={{ fontSize: '1.8rem', marginBottom: '1rem' }}>Student Focused</h3>
            <p style={{ fontSize: '1.1rem', opacity: 0.9 }}>Designed specifically for students with features like textbook trading and campus meetups.</p>
          </div>
        </div>
      </div>

      {/* Testimonials Section */}
      <div style={{ 
        padding: '4rem 2rem',
        textAlign: 'center',
        backgroundColor: 'rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ 
          fontSize: '3rem', 
          marginBottom: '3rem',
          textShadow: '1px 1px 2px rgba(0,0,0,0.3)'
        }}>
          What Students Say
        </h2>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '2rem',
          maxWidth: '1000px',
          margin: '0 auto'
        }}>
          <div style={{ 
            backgroundColor: 'rgba(255,255,255,0.1)',
            padding: '2rem',
            borderRadius: '10px',
            backdropFilter: 'blur(10px)'
          }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '1rem', fontStyle: 'italic' }}>
              "OnlySwap saved me hundreds of dollars on textbooks! The community is amazing and everyone is so helpful."
            </p>
            <div style={{ fontWeight: 'bold' }}>- Sarah M., Computer Science</div>
          </div>
          <div style={{ 
            backgroundColor: 'rgba(255,255,255,0.1)',
            padding: '2rem',
            borderRadius: '10px',
            backdropFilter: 'blur(10px)'
          }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '1rem', fontStyle: 'italic' }}>
              "I've made so many friends through OnlySwap. It's not just about trading items, it's about building connections."
            </p>
            <div style={{ fontWeight: 'bold' }}>- Alex K., Business</div>
          </div>
          <div style={{ 
            backgroundColor: 'rgba(255,255,255,0.1)',
            padding: '2rem',
            borderRadius: '10px',
            backdropFilter: 'blur(10px)'
          }}>
            <p style={{ fontSize: '1.1rem', marginBottom: '1rem', fontStyle: 'italic' }}>
              "The interface is so intuitive and the matching system actually works! Found exactly what I needed in minutes."
            </p>
            <div style={{ fontWeight: 'bold' }}>- Mike R., Engineering</div>
          </div>
        </div>
      </div>

      {/* Stats Section */}
      <div style={{ 
        padding: '4rem 2rem',
        textAlign: 'center',
        backgroundColor: 'rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ 
          fontSize: '3rem', 
          marginBottom: '3rem',
          textShadow: '1px 1px 2px rgba(0,0,0,0.3)'
        }}>
          Join Our Growing Community
        </h2>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '3rem',
          maxWidth: '800px',
          margin: '0 auto'
        }}>
          <div>
            <div style={{ fontSize: '4rem', fontWeight: 'bold', color: '#FFD700', textShadow: '2px 2px 4px rgba(0,0,0,0.3)' }}>1,000+</div>
            <div style={{ fontSize: '1.2rem', opacity: 0.9 }}>Active Users</div>
          </div>
          <div>
            <div style={{ fontSize: '4rem', fontWeight: 'bold', color: '#FFD700', textShadow: '2px 2px 4px rgba(0,0,0,0.3)' }}>5,000+</div>
            <div style={{ fontSize: '1.2rem', opacity: 0.9 }}>Items Exchanged</div>
          </div>
          <div>
            <div style={{ fontSize: '4rem', fontWeight: 'bold', color: '#FFD700', textShadow: '2px 2px 4px rgba(0,0,0,0.3)' }}>50+</div>
            <div style={{ fontSize: '1.2rem', opacity: 0.9 }}>Universities</div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{
        backgroundColor: 'rgba(0,0,0,0.2)',
        padding: '2rem',
        textAlign: 'center',
        marginTop: '2rem'
      }}>
        <p style={{ opacity: 0.8 }}>© 2024 OnlySwap. Making student life easier, one trade at a time.</p>
      </footer>
    </div>
  )
}

function WorkingApp() {
  return (
    <Router>
      <div className="App">
        <Routes>
          <Route path="/" element={<WorkingHome />} />
          <Route path="/marketplace" element={<div style={{padding: '2rem', textAlign: 'center', minHeight: '100vh', paddingTop: '100px'}}><h1>Marketplace</h1><p>Browse and trade items with other students</p></div>} />
          <Route path="/signin" element={<div style={{padding: '2rem', textAlign: 'center', minHeight: '100vh', paddingTop: '100px'}}><h1>Sign In</h1><p>Welcome back! Sign in to your account</p></div>} />
          <Route path="/signup" element={<div style={{padding: '2rem', textAlign: 'center', minHeight: '100vh', paddingTop: '100px'}}><h1>Sign Up</h1><p>Join the OnlySwap community</p></div>} />
        </Routes>
      </div>
    </Router>
  )
}

export default WorkingApp
