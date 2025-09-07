import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './contexts/SimpleAuthContext'
import Navbar from './components/Navbar'
import Home from './pages/Home'

function SimpleApp() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/signin" element={<div style={{padding: '2rem', textAlign: 'center'}}><h1>Sign In Page</h1><p>Coming soon...</p></div>} />
            <Route path="/signup" element={<div style={{padding: '2rem', textAlign: 'center'}}><h1>Sign Up Page</h1><p>Coming soon...</p></div>} />
            <Route path="/marketplace" element={<div style={{padding: '2rem', textAlign: 'center'}}><h1>Marketplace</h1><p>Coming soon...</p></div>} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  )
}

export default SimpleApp