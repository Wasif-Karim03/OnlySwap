import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const LandingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-green-50 to-emerald-50 relative overflow-hidden">
      {/* Floating Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            y: [0, -20, 0],
            rotate: [0, 5, 0],
          }}
          transition={{
            duration: 6,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-20 left-10 w-32 h-32 bg-green-200/20 rounded-full blur-xl"
        />
        <motion.div
          animate={{
            y: [0, 30, 0],
            rotate: [0, -5, 0],
          }}
          transition={{
            duration: 8,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }}
          className="absolute top-40 right-20 w-24 h-24 bg-emerald-200/30 rounded-full blur-xl"
        />
        <motion.div
          animate={{
            y: [0, -15, 0],
            x: [0, 10, 0],
          }}
          transition={{
            duration: 7,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1
          }}
          className="absolute bottom-40 left-1/4 w-20 h-20 bg-green-100/40 rounded-full blur-xl"
        />
        <motion.div
          animate={{
            y: [0, 25, 0],
            x: [0, -15, 0],
          }}
          transition={{
            duration: 9,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 3
          }}
          className="absolute bottom-20 right-1/3 w-28 h-28 bg-emerald-100/25 rounded-full blur-xl"
        />
      </div>
      {/* Header */}
      <header className="px-6 py-4 flex justify-between items-center max-w-6xl mx-auto bg-white/80 backdrop-blur-md rounded-2xl shadow-xl border border-green-200/50">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="flex items-center"
        >
          <motion.h1 
            className="text-3xl font-bold bg-gradient-to-r from-green-700 to-emerald-600 bg-clip-text text-transparent"
            style={{ fontFamily: 'Inter' }}
          >
            OnlySwap
          </motion.h1>
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex gap-4"
        >
          <Link
            to="/signin"
            className="px-6 py-2 border-2 rounded-lg transition-all duration-300 font-medium hover:shadow-md hover:scale-105 hover:bg-green-50"
            style={{ borderColor: '#046C4E', color: '#046C4E', fontFamily: 'Inter' }}
          >
            Sign In
          </Link>
          <Link
            to="/signup"
            className="px-6 py-2 text-white rounded-lg transition-all duration-300 font-medium hover:shadow-lg hover:scale-105 shadow-md"
            style={{ 
              background: 'linear-gradient(135deg, #046C4E 0%, #059669 100%)', 
              fontFamily: 'Inter' 
            }}
          >
            Sign Up
          </Link>
        </motion.div>
      </header>

      {/* Hero Section */}
      <section className="px-6 py-12 max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Side - Text Content */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="space-y-6"
          >
            <div className="space-y-3">
              <motion.h2 
                className="text-4xl lg:text-5xl font-bold leading-tight bg-gradient-to-r from-green-700 to-emerald-600 bg-clip-text text-transparent" 
                style={{ fontFamily: 'Inter' }}
                animate={{
                  backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                Campus Marketplace for Students
              </motion.h2>
              <motion.p 
                className="text-lg lg:text-xl leading-relaxed text-gray-600" 
                style={{ fontFamily: 'Inter' }}
                animate={{
                  opacity: [0.8, 1, 0.8],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                Trade books, electronics, dorm items, and more with your campus community.
              </motion.p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Link
                  to="/signup"
                  className="px-8 py-3 text-white rounded-xl text-base font-semibold transition-all duration-300 text-center hover:shadow-xl shadow-lg block"
                  style={{ 
                    background: 'linear-gradient(135deg, #046C4E 0%, #059669 100%)', 
                    fontFamily: 'Inter' 
                  }}
                >
                  <motion.span
                    animate={{
                      backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                    }}
                    transition={{
                      duration: 4,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  >
                    Get Started Today
                  </motion.span>
                </Link>
              </motion.div>
            </div>
          </motion.div>

                        {/* Right Side - Illustration */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.5 }}
                className="flex justify-center lg:justify-end"
              >
                <div className="relative w-[500px] h-[500px] flex items-center justify-center">
                  <motion.div 
                    className="absolute inset-0 bg-gradient-to-br from-green-100/50 to-emerald-100/30 rounded-3xl blur-3xl"
                    animate={{
                      scale: [1, 1.1, 1],
                      opacity: [0.5, 0.8, 0.5],
                    }}
                    transition={{
                      duration: 6,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  ></motion.div>
                  <motion.div 
                    className="relative bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border border-green-100"
                    animate={{
                      y: [0, -10, 0],
                      rotateY: [0, 2, 0],
                    }}
                    transition={{
                      duration: 8,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                  >
                    <motion.img 
                      src="/pictures/illustration.png"
                      alt="OnlySwap Illustration"
                      className="w-full h-full object-contain drop-shadow-lg"
                      animate={{
                        scale: [1, 1.02, 1],
                        rotate: [0, 1, 0],
                      }}
                      transition={{
                        duration: 5,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    />
                  </motion.div>
                </div>
              </motion.div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="px-6 py-16 bg-gradient-to-b from-white to-green-50/30">
        <div className="max-w-6xl mx-auto">
          <motion.h3
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="text-3xl lg:text-4xl font-bold text-center mb-12 bg-gradient-to-r from-green-700 to-emerald-600 bg-clip-text text-transparent"
            style={{ fontFamily: 'Inter' }}
          >
            How It Works
          </motion.h3>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
              className="text-center group"
            >
              <motion.div 
                className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 bg-gradient-to-br from-green-100 to-emerald-100 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110"
                whileHover={{ 
                  scale: 1.1,
                  rotate: 5,
                }}
                animate={{
                  y: [0, -5, 0],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                <motion.div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-green-600 to-emerald-600 shadow-lg"
                  animate={{
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                >
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                </motion.div>
              </motion.div>
              <p className="text-base font-medium text-gray-700" style={{ fontFamily: 'Inter' }}>Join with your university email</p>
            </motion.div>

            {/* Step 2 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.9 }}
              className="text-center group"
            >
              <motion.div 
                className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 bg-gradient-to-br from-green-100 to-emerald-100 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110"
                whileHover={{ 
                  scale: 1.1,
                  rotate: -5,
                }}
                animate={{
                  y: [0, -5, 0],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.5
                }}
              >
                <motion.div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-green-600 to-emerald-600 shadow-lg"
                  animate={{
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 0.5
                  }}
                >
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </motion.div>
              </motion.div>
              <p className="text-base font-medium text-gray-700" style={{ fontFamily: 'Inter' }}>Create listings or search items</p>
            </motion.div>

            {/* Step 3 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.0 }}
              className="text-center group"
            >
              <motion.div 
                className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 bg-gradient-to-br from-green-100 to-emerald-100 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110"
                whileHover={{ 
                  scale: 1.1,
                  rotate: 5,
                }}
                animate={{
                  y: [0, -5, 0],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 1
                }}
              >
                <motion.div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-green-600 to-emerald-600 shadow-lg"
                  animate={{
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 1
                  }}
                >
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
                  </svg>
                </motion.div>
              </motion.div>
              <p className="text-base font-medium text-gray-700" style={{ fontFamily: 'Inter' }}>Connect on campus and swap</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Popular Categories Section */}
      <section className="px-6 py-16 bg-gradient-to-t from-green-50/50 to-white">
        <div className="max-w-6xl mx-auto">
          <motion.h3
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.1 }}
            className="text-3xl lg:text-4xl font-bold text-center mb-12 bg-gradient-to-r from-green-700 to-emerald-600 bg-clip-text text-transparent"
            style={{ fontFamily: 'Inter' }}
          >
            Popular Categories
          </motion.h3>
          
          <div className="grid md:grid-cols-4 gap-8">
            {/* Textbooks */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.2 }}
              className="text-center group"
            >
              <motion.div 
                className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4 bg-gradient-to-br from-green-600 to-emerald-600 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110"
                whileHover={{ 
                  scale: 1.1,
                  rotate: 10,
                }}
                animate={{
                  y: [0, -8, 0],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              >
                <motion.svg 
                  className="w-8 h-8 text-white" 
                  fill="currentColor" 
                  viewBox="0 0 24 24"
                  animate={{
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                >
                  <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9H9V9h10v2zm-4 4H9v-2h6v2zm4-8H9V5h10v2z"/>
                </motion.svg>
              </motion.div>
              <p className="text-base font-semibold text-gray-700" style={{ fontFamily: 'Inter' }}>Textbooks</p>
            </motion.div>

            {/* Electronics */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.3 }}
              className="text-center group"
            >
              <motion.div 
                className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 bg-gradient-to-br from-green-600 to-emerald-600 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110"
                whileHover={{ 
                  scale: 1.1,
                  rotate: -10,
                }}
                animate={{
                  y: [0, -8, 0],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.5
                }}
              >
                <motion.svg 
                  className="w-10 h-10 text-white" 
                  fill="currentColor" 
                  viewBox="0 0 24 24"
                  animate={{
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 0.5
                  }}
                >
                  <path d="M20 18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H20zM4 6h16v10H4V6z"/>
                </motion.svg>
              </motion.div>
              <p className="text-lg font-semibold text-gray-700" style={{ fontFamily: 'Inter' }}>Electronics</p>
            </motion.div>

            {/* Dorm Essentials */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.4 }}
              className="text-center group"
            >
              <motion.div 
                className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 bg-gradient-to-br from-green-600 to-emerald-600 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110"
                whileHover={{ 
                  scale: 1.1,
                  rotate: 10,
                }}
                animate={{
                  y: [0, -8, 0],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 1
                }}
              >
                <motion.svg 
                  className="w-10 h-10 text-white" 
                  fill="currentColor" 
                  viewBox="0 0 24 24"
                  animate={{
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 1
                  }}
                >
                  <path d="M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>
                </motion.svg>
              </motion.div>
              <p className="text-lg font-semibold text-gray-700" style={{ fontFamily: 'Inter' }}>Dorm Essentials</p>
            </motion.div>

            {/* Clothing */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.5 }}
              className="text-center group"
            >
              <motion.div 
                className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 bg-gradient-to-br from-green-600 to-emerald-600 shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-110"
                whileHover={{ 
                  scale: 1.1,
                  rotate: -10,
                }}
                animate={{
                  y: [0, -8, 0],
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 1.5
                }}
              >
                <motion.svg 
                  className="w-10 h-10 text-white" 
                  fill="currentColor" 
                  viewBox="0 0 24 24"
                  animate={{
                    scale: [1, 1.1, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 1.5
                  }}
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </motion.svg>
              </motion.div>
              <p className="text-lg font-semibold text-gray-700" style={{ fontFamily: 'Inter' }}>Clothing</p>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage; 