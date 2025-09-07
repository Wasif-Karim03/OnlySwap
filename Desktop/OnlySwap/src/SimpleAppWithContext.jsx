import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/SimpleAuthContext'

function SimpleHome() {
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
      <p>This is a test of the App component with context providers.</p>
    </div>
  )
}

function SimpleApp() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/" element={<SimpleHome />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  )
}

export default SimpleApp
