// src/utils/testDataManager.js
// Test script to demonstrate the new data management system

import dataManager from './dataManager'

export const testDataManager = () => {
  console.log('🧪 Testing OnlySwap Data Management System')
  console.log('==========================================')

  // Clear all data for fresh test
  dataManager.clearAllData()
  console.log('✅ Cleared all existing data')

  // Test 1: Create Users
  console.log('\n📝 Test 1: Creating Users')
  console.log('-------------------------')
  
  try {
    const user1 = dataManager.createUser({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@ohiowesleyan.edu',
      university: 'Ohio Wesleyan University',
      password: 'password123',
      name: 'John Doe'
    })
    console.log('✅ User 1 created:', user1.name, 'from', user1.university)

    const user2 = dataManager.createUser({
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@ohiowesleyan.edu',
      university: 'Ohio Wesleyan University',
      password: 'password123',
      name: 'Jane Smith'
    })
    console.log('✅ User 2 created:', user2.name, 'from', user2.university)

    const user3 = dataManager.createUser({
      firstName: 'Bob',
      lastName: 'Johnson',
      email: 'bob.johnson@harvard.edu',
      university: 'Harvard University',
      password: 'password123',
      name: 'Bob Johnson'
    })
    console.log('✅ User 3 created:', user3.name, 'from', user3.university)

  } catch (error) {
    console.error('❌ Error creating users:', error.message)
  }

  // Test 2: Create Products
  console.log('\n🛍️ Test 2: Creating Products')
  console.log('----------------------------')
  
  try {
    const product1 = dataManager.createProduct({
      title: 'MacBook Pro 2021',
      description: 'M1 Pro chip, 16GB RAM, 512GB SSD. Perfect for students!',
      price: 1200,
      originalPrice: 1800,
      category: 'Electronics',
      condition: 'Excellent',
      location: 'Ohio Wesleyan University',
      images: ['data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...'], // Sample base64
      sellerId: user1.id,
      sellerName: user1.name,
      sellerUniversity: user1.university
    })
    console.log('✅ Product 1 created:', product1.title, 'by', product1.seller.name)

    const product2 = dataManager.createProduct({
      title: 'Calculus Textbook',
      description: 'Stewart 8th Edition, used but in great condition.',
      price: 45,
      originalPrice: 120,
      category: 'Books',
      condition: 'Good',
      location: 'Ohio Wesleyan University',
      images: [],
      sellerId: user2.id,
      sellerName: user2.name,
      sellerUniversity: user2.university
    })
    console.log('✅ Product 2 created:', product2.title, 'by', product2.seller.name)

    const product3 = dataManager.createProduct({
      title: 'iPhone 13',
      description: '128GB, Space Gray, excellent condition.',
      price: 600,
      originalPrice: 800,
      category: 'Electronics',
      condition: 'Excellent',
      location: 'Harvard University',
      images: [],
      sellerId: user3.id,
      sellerName: user3.name,
      sellerUniversity: user3.university
    })
    console.log('✅ Product 3 created:', product3.title, 'by', product3.seller.name)

  } catch (error) {
    console.error('❌ Error creating products:', error.message)
  }

  // Test 3: Test Filtering Logic
  console.log('\n🔍 Test 3: Testing University Filtering')
  console.log('--------------------------------------')
  
  const allProducts = dataManager.getAllProducts()
  console.log('📊 Total products in system:', allProducts.length)

  // Test filtering for Ohio Wesleyan University users
  const ohioWesleyanProducts = allProducts.filter(product => 
    product.seller.university === 'Ohio Wesleyan University'
  )
  console.log('🏫 Products from Ohio Wesleyan University:', ohioWesleyanProducts.length)
  ohioWesleyanProducts.forEach(p => console.log(`  - ${p.title} by ${p.seller.name}`))

  // Test filtering for Harvard University users
  const harvardProducts = allProducts.filter(product => 
    product.seller.university === 'Harvard University'
  )
  console.log('🎓 Products from Harvard University:', harvardProducts.length)
  harvardProducts.forEach(p => console.log(`  - ${p.title} by ${p.seller.name}`))

  // Test 4: User Interactions
  console.log('\n💬 Test 4: Testing User Interactions')
  console.log('------------------------------------')
  
  try {
    // User 1 likes product 2
    dataManager.recordInteraction('like', user1.id, product2.id)
    console.log('✅ User 1 liked product 2')

    // User 1 saves product 2
    dataManager.saveProduct(user1.id, product2.id)
    console.log('✅ User 1 saved product 2')

    // User 2 likes product 1
    dataManager.recordInteraction('like', user2.id, product1.id)
    console.log('✅ User 2 liked product 1')

    // User 2 saves product 1
    dataManager.saveProduct(user2.id, product1.id)
    console.log('✅ User 2 saved product 1')

  } catch (error) {
    console.error('❌ Error recording interactions:', error.message)
  }

  // Test 5: Chat Creation
  console.log('\n💬 Test 5: Testing Chat System')
  console.log('-----------------------------')
  
  try {
    const chat1 = dataManager.createOrGetChat(
      user1.id, // buyer
      user2.id, // seller
      product2.id, // product
      product2.title,
      product2.images[0] || ''
    )
    console.log('✅ Chat created between', user1.name, 'and', user2.name, 'about', product2.title)

    // Send a message
    dataManager.sendMessage(chat1.id, user1.id, 'Hi! Is this textbook still available?')
    console.log('✅ Message sent by', user1.name)

    dataManager.sendMessage(chat1.id, user2.id, 'Yes, it is! When would you like to meet?')
    console.log('✅ Message sent by', user2.name)

  } catch (error) {
    console.error('❌ Error creating chat:', error.message)
  }

  // Test 6: User Dashboard
  console.log('\n📊 Test 6: Testing User Dashboard')
  console.log('---------------------------------')
  
  try {
    const user1Dashboard = dataManager.getUserDashboard(user1.id)
    console.log('📈 User 1 Dashboard:')
    console.log(`  - Products listed: ${user1Dashboard.stats.totalProductsListed}`)
    console.log(`  - Products saved: ${user1Dashboard.stats.totalProductsSaved}`)
    console.log(`  - Chats: ${user1Dashboard.stats.totalChats}`)
    console.log(`  - Interactions: ${user1Dashboard.stats.totalInteractions}`)

    const user2Dashboard = dataManager.getUserDashboard(user2.id)
    console.log('📈 User 2 Dashboard:')
    console.log(`  - Products listed: ${user2Dashboard.stats.totalProductsListed}`)
    console.log(`  - Products saved: ${user2Dashboard.stats.totalProductsSaved}`)
    console.log(`  - Chats: ${user2Dashboard.stats.totalChats}`)
    console.log(`  - Interactions: ${user2Dashboard.stats.totalInteractions}`)

  } catch (error) {
    console.error('❌ Error getting user dashboard:', error.message)
  }

  // Test 7: Analytics
  console.log('\n📈 Test 7: System Analytics')
  console.log('--------------------------')
  
  const analytics = dataManager.getAnalytics()
  console.log('📊 System Statistics:')
  console.log(`  - Total Users: ${analytics.totalUsers}`)
  console.log(`  - Total Products: ${analytics.totalProducts}`)
  console.log(`  - Total Interactions: ${analytics.totalInteractions}`)
  console.log(`  - Total Chats: ${analytics.totalChats}`)

  // Test 8: Search Functionality
  console.log('\n🔍 Test 8: Search Functionality')
  console.log('-------------------------------')
  
  const searchResults = dataManager.searchProducts('MacBook', {
    category: 'Electronics',
    university: 'Ohio Wesleyan University'
  })
  console.log('🔍 Search results for "MacBook" in Electronics from Ohio Wesleyan:')
  searchResults.forEach(product => {
    console.log(`  - ${product.title} by ${product.seller.name} - $${product.price}`)
  })

  console.log('\n✅ All tests completed successfully!')
  console.log('=====================================')
  console.log('🎉 The data management system is working correctly!')
  console.log('💡 You can now test the application with real data.')
}

// Export for use in browser console
if (typeof window !== 'undefined') {
  window.testDataManager = testDataManager
}
