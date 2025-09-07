import { createContext, useState, useEffect } from 'react'
import dataManager from '../utils/dataManager'

export const AuthContext = createContext()

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Check if user is logged in on app start
  useEffect(() => {
    const savedUser = dataManager.getData('onlyswap_currentUser')
    if (savedUser) {
      setUser(savedUser)
    }
    setLoading(false)
  }, [])

  const login = (userData) => {
    setUser(userData)
    dataManager.setData('onlyswap_currentUser', userData)
  }

  const logout = () => {
    setUser(null)
    dataManager.setData('onlyswap_currentUser', null)
  }

  const register = async (userData) => {
    try {
      const newUser = dataManager.createUser(userData)
      login(newUser)
      return { success: true, user: newUser }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }

  const updateProfile = (updates) => {
    if (user) {
      const updatedUser = dataManager.updateUser(user.id, updates)
      if (updatedUser) {
        setUser(updatedUser)
        return { success: true, user: updatedUser }
      }
    }
    return { success: false, error: 'Failed to update profile' }
  }

  const value = {
    user,
    login,
    logout,
    register,
    updateProfile,
    loading,
    isAuthenticated: !!user
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}
