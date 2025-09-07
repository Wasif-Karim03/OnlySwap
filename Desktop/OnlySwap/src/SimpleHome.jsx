import React from 'react'

function SimpleHome() {
  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #4CAF50, #388E3C)',
      color: 'white',
      padding: '2rem 0'
    }}>
      {/* Hero Section */}
      <div style={{ 
        textAlign: 'center', 
        padding: '4rem 2rem',
        maxWidth: '1200px',
        margin: '0 auto'
      }}>
        <h1 style={{ 
          fontSize: '3.5rem', 
          fontWeight: 'bold', 
          marginBottom: '1rem',
          textShadow: '2px 2px 4px rgba(0,0,0,0.3)'
        }}>
          OnlySwap
        </h1>
        <p style={{ 
          fontSize: '1.5rem', 
          marginBottom: '2rem',
          opacity: 0.9
        }}>
          The smart way to exchange items with other students
        </p>
        <div style={{ marginBottom: '3rem' }}>
          <button style={{
            backgroundColor: 'white',
            color: '#4CAF50',
            padding: '1rem 2rem',
            border: 'none',
            borderRadius: '8px',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            margin: '0 1rem',
            boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
            transition: 'transform 0.2s'
          }}>
            Get Started
          </button>
          <button style={{
            backgroundColor: 'transparent',
            color: 'white',
            padding: '1rem 2rem',
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
          fontSize: '2.5rem', 
          marginBottom: '3rem',
          textShadow: '1px 1px 2px rgba(0,0,0,0.3)'
        }}>
          Why Choose OnlySwap?
        </h2>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '2rem',
          maxWidth: '1200px',
          margin: '0 auto'
        }}>
          <div style={{ padding: '2rem' }}>
            <div style={{ 
              fontSize: '3rem', 
              marginBottom: '1rem' 
            }}>🎯</div>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Smart Matching</h3>
            <p>Find exactly what you need with our intelligent recommendation system</p>
          </div>
          <div style={{ padding: '2rem' }}>
            <div style={{ 
              fontSize: '3rem', 
              marginBottom: '1rem' 
            }}>✅</div>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Verified Community</h3>
            <p>Trade with verified students from your university</p>
          </div>
          <div style={{ padding: '2rem' }}>
            <div style={{ 
              fontSize: '3rem', 
              marginBottom: '1rem' 
            }}>💬</div>
            <h3 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Easy Communication</h3>
            <p>Chat directly with other students to arrange exchanges</p>
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
          fontSize: '2.5rem', 
          marginBottom: '3rem',
          textShadow: '1px 1px 2px rgba(0,0,0,0.3)'
        }}>
          Join Our Growing Community
        </h2>
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '2rem',
          maxWidth: '800px',
          margin: '0 auto'
        }}>
          <div>
            <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#FFD700' }}>1,000+</div>
            <div>Active Users</div>
          </div>
          <div>
            <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#FFD700' }}>5,000+</div>
            <div>Items Exchanged</div>
          </div>
          <div>
            <div style={{ fontSize: '3rem', fontWeight: 'bold', color: '#FFD700' }}>50+</div>
            <div>Universities</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SimpleHome
