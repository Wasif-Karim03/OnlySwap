// User management utilities for local storage
export const getUserByEmail = (email) => {
  const users = JSON.parse(localStorage.getItem('onlyswap_users') || '[]')
  return users.find(user => user.email === email)
}

export const createUser = (userData) => {
  const users = JSON.parse(localStorage.getItem('onlyswap_users') || '[]')
  
  // Check if email already exists
  if (getUserByEmail(userData.email)) {
    throw new Error('Email already in use')
  }
  
  const newUser = {
    id: Date.now(),
    ...userData,
    createdAt: new Date().toISOString(),
    isEmailVerified: false
  }
  
  users.push(newUser)
  localStorage.setItem('onlyswap_users', JSON.stringify(users))
  return newUser
}

export const updateUserPassword = (email, newPassword) => {
  const users = JSON.parse(localStorage.getItem('onlyswap_users') || '[]')
  const userIndex = users.findIndex(user => user.email === email)
  
  if (userIndex === -1) {
    throw new Error('User not found')
  }
  
  users[userIndex].password = newPassword
  users[userIndex].updatedAt = new Date().toISOString()
  localStorage.setItem('onlyswap_users', JSON.stringify(users))
  return users[userIndex]
}

export const savePasswordResetToken = (email, token) => {
  const resetTokens = JSON.parse(localStorage.getItem('onlyswap_reset_tokens') || '{}')
  resetTokens[email] = {
    token,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes
  }
  localStorage.setItem('onlyswap_reset_tokens', JSON.stringify(resetTokens))
}

export const validateResetToken = (email, token) => {
  const resetTokens = JSON.parse(localStorage.getItem('onlyswap_reset_tokens') || '{}')
  const tokenData = resetTokens[email]
  
  if (!tokenData) {
    throw new Error('Invalid or expired token')
  }
  
  if (new Date() > new Date(tokenData.expiresAt)) {
    delete resetTokens[email]
    localStorage.setItem('onlyswap_reset_tokens', JSON.stringify(resetTokens))
    throw new Error('Token has expired')
  }
  
  if (tokenData.token !== token) {
    throw new Error('Invalid token')
  }
  
  return true
}

export const clearResetToken = (email) => {
  const resetTokens = JSON.parse(localStorage.getItem('onlyswap_reset_tokens') || '{}')
  delete resetTokens[email]
  localStorage.setItem('onlyswap_reset_tokens', JSON.stringify(resetTokens))
}

// Generate a simple 6-digit verification code
export const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString()
}
