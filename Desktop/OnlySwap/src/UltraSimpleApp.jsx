import React from 'react'

function UltraSimpleApp() {
  return (
    <div style={{ 
      minHeight: '100vh',
      backgroundColor: '#4CAF50',
      color: 'white',
      padding: '2rem',
      textAlign: 'center'
    }}>
      <h1>OnlySwap - Landing Page</h1>
      <p>Welcome to OnlySwap! The smart way to exchange items with other students.</p>
      <div style={{ marginTop: '2rem' }}>
        <button style={{
          backgroundColor: 'white',
          color: '#4CAF50',
          padding: '1rem 2rem',
          border: 'none',
          borderRadius: '8px',
          fontSize: '1.1rem',
          fontWeight: 'bold',
          cursor: 'pointer',
          margin: '0 1rem'
        }}>
          Get Started
        </button>
        <button style={{
          backgroundColor: 'transparent',
          color: 'white',
          padding: '1rem 2rem',
          border: '2px solid white',
          borderRadius: '8px',
          fontSize: '1.1rem',
          fontWeight: 'bold',
          cursor: 'pointer',
          margin: '0 1rem'
        }}>
          Learn More
        </button>
      </div>
    </div>
  )
}

export default UltraSimpleApp
