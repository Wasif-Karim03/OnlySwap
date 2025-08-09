const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Product = require('../models/Product');
const DeletedListing = require('../models/DeletedListing');
const nodemailer = require('nodemailer');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const fileManager = require('../utils/fileManager');

const router = express.Router();

// Multer configuration for file uploads with memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Generate JWT token
const generateToken = (userId, rememberMe = false) => {
  const secret = rememberMe ? process.env.JWT_REMEMBER_ME_SECRET : process.env.JWT_SECRET;
  const expiresIn = rememberMe ? process.env.JWT_REMEMBER_ME_EXPIRES_IN : '7d';
  return jwt.sign({ userId }, secret, { expiresIn });
};

// Send email function
const sendEmail = async (to, subject, text, html) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  
  await transporter.sendMail({
    from: `"Clean Auth Support" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html
  });
};

// Validation middleware
const validateSignUp = [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters long'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email')
    .custom((value) => {
      if (!value.toLowerCase().endsWith('.edu')) {
        throw new Error('Please use a valid .edu email address');
      }
      return true;
    }),
  body('university').trim().notEmpty().withMessage('University is required'),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/\d/).withMessage('Password must contain at least one number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least one special character'),
  body('adminCode').optional().isString().withMessage('Admin code must be a string')
];

const validateSignIn = [
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
];

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });
    
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      decoded = jwt.verify(token, process.env.JWT_REMEMBER_ME_SECRET);
    }
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

// Admin-only middleware
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Sign up route
router.post('/signup', validateSignUp, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { name, email, university, password, adminCode, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    let finalRole = 'user';
    if (role === 'admin') {
      if (adminCode !== '705') {
        return res.status(400).json({ message: 'Invalid admin code' });
      }
      finalRole = 'admin';
    }

    // Generate email verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Generate unique user folder
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const userFolder = `user_${timestamp}_${randomSuffix}`;

    // Create new user
    const user = new User({ 
      name, 
      email, 
      university,
      password, 
      role: finalRole,
      userFolder: userFolder,
      emailVerificationCode: verificationCode,
      emailVerificationExpires: Date.now() + 1000 * 60 * 30 // 30 minutes
    });
    await user.save();

    // Send verification email
    const emailHtml = `
      <h2>Welcome to Clean Auth!</h2>
      <p>Hi ${name},</p>
      <p>Please verify your email address by entering this code:</p>
      <h1 style="color: #3B82F6; font-size: 2rem; text-align: center; padding: 1rem; background: #F3F4F6; border-radius: 0.5rem;">${verificationCode}</h1>
      <p>This code will expire in 30 minutes.</p>
      <p>If you didn't create this account, please ignore this email.</p>
    `;

    await sendEmail(
      user.email,
      'Verify Your Email Address',
      `Your verification code is: ${verificationCode}`,
      emailHtml
    );

    res.status(201).json({
      message: 'Account created successfully. Please check your email to verify your account.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        university: user.university,
        bio: user.bio,
        profilePicture: user.profilePicture,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (error) {
    console.error('Sign up error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify email route
router.post('/verify-email', async (req, res) => {
  try {
    const { email, code } = req.body;
    
    if (!email || !code) {
      return res.status(400).json({ message: 'Email and verification code are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    if (!user.emailVerificationCode || !user.emailVerificationExpires) {
      return res.status(400).json({ message: 'No verification request found' });
    }

    if (user.emailVerificationCode !== code) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    if (user.emailVerificationExpires < Date.now()) {
      return res.status(400).json({ message: 'Verification code has expired' });
    }

    user.isEmailVerified = true;
    user.emailVerificationCode = null;
    user.emailVerificationExpires = null;
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      message: 'Email verified successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        university: user.university,
        bio: user.bio,
        profilePicture: user.profilePicture,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    // Generate new verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.emailVerificationCode = verificationCode;
    user.emailVerificationExpires = Date.now() + 1000 * 60 * 30; // 30 minutes
    await user.save();

    // Send verification email
    const emailHtml = `
      <h2>Email Verification</h2>
      <p>Hi ${user.name},</p>
      <p>Here's your new verification code:</p>
      <h1 style="color: #3B82F6; font-size: 2rem; text-align: center; padding: 1rem; background: #F3F4F6; border-radius: 0.5rem;">${verificationCode}</h1>
      <p>This code will expire in 30 minutes.</p>
    `;

    await sendEmail(
      user.email,
      'Verify Your Email Address',
      `Your verification code is: ${verificationCode}`,
      emailHtml
    );

    res.json({ message: 'Verification email sent successfully' });
  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Sign in route
router.post('/signin', validateSignIn, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        message: 'Validation failed', 
        errors: errors.array() 
      });
    }

    const { email, password, rememberMe } = req.body;

    // Check for hardcoded admin credentials first
    if (email === 'admin@admin.com' && password === 'admin123') {
      // Create or update admin user
      let adminUser = await User.findOne({ email: 'admin@admin.com' });
      if (!adminUser) {
        adminUser = new User({
          name: 'Admin User',
          email: 'admin@admin.com',
          university: 'Admin University',
          password: 'admin123',
          role: 'admin',
          isEmailVerified: true
        });
        await adminUser.save();
      } else {
        // Update existing admin user to ensure admin role
        adminUser.role = 'admin';
        adminUser.isEmailVerified = true;
        await adminUser.save();
      }
      
      // Update last login
      adminUser.lastLogin = new Date();
      await adminUser.save();

      // Generate token
      const token = generateToken(adminUser._id, rememberMe);

      return res.json({
        message: 'Signed in successfully as Admin',
        token,
        user: {
          id: adminUser._id,
          name: adminUser.name,
          email: adminUser.email,
          role: adminUser.role,
          isEmailVerified: adminUser.isEmailVerified
        }
      });
    }

    // Regular user authentication
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if email is verified (only for regular users)
    if (!user.isEmailVerified) {
      return res.status(403).json({ 
        message: 'Please verify your email address before signing in',
        requiresVerification: true
      });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id, rememberMe);

    res.json({
      message: 'Signed in successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        university: user.university,
        bio: user.bio,
        profilePicture: user.profilePicture,
        role: user.role,
        isEmailVerified: user.isEmailVerified
      }
    });
  } catch (error) {
    console.error('Sign in error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user profile (protected route)
router.get('/profile', verifyToken, async (req, res) => {
  try {
    res.json({ 
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        university: req.user.university,
        bio: req.user.bio,
        profilePicture: req.user.profilePicture,
        role: req.user.role,
        isEmailVerified: req.user.isEmailVerified,
        createdAt: req.user.createdAt,
        lastLogin: req.user.lastLogin
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update user profile (protected route)
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { name, bio } = req.body;
    
    // Update user fields
    if (name) {
      req.user.name = name;
    }
    
    if (bio !== undefined) {
      req.user.bio = bio;
    }
    
    await req.user.save();
    
    res.json({ 
      message: 'Profile updated successfully',
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        university: req.user.university,
        bio: req.user.bio,
        profilePicture: req.user.profilePicture,
        role: req.user.role,
        isEmailVerified: req.user.isEmailVerified,
        createdAt: req.user.createdAt,
        lastLogin: req.user.lastLogin
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload profile picture with enhanced file management
router.post('/upload-profile-picture', verifyToken, upload.single('profilePicture'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Ensure user has a userFolder (for existing users)
    if (!req.user.userFolder) {
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      req.user.userFolder = `user_${req.user._id}_${timestamp}_${randomSuffix}`;
      await req.user.save();
      console.log(`✅ Created userFolder for existing user: ${req.user.userFolder}`);
    }

    console.log(`📸 Uploading profile picture for user: ${req.user.name} (${req.user.userFolder})`);

    // Validate file
    try {
      fileManager.validateFile(req.file);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    // Delete old profile picture if it exists
    if (req.user.profilePicture) {
      try {
        await fileManager.deleteFile(req.user.profilePicture);
        console.log(`🗑️ Deleted old profile picture: ${req.user.profilePicture}`);
      } catch (error) {
        console.warn(`⚠️ Error deleting old profile picture:`, error.message);
      }
    }

    // Process and save new profile picture
    const imageMetadata = await fileManager.saveProfilePicture(req.file, req.user.userFolder);

    // Update user's profile picture
    req.user.profilePicture = imageMetadata.filePath;
    await req.user.save();

    // Log activity
    await req.user.logActivity('upload_picture', {
      oldPicture: req.user.profilePicture,
      newPicture: imageMetadata.filePath,
      fileSize: imageMetadata.fileSize
    }, req);

    console.log(`✅ Profile picture uploaded successfully: ${imageMetadata.fileName}`);

    res.json({ 
      message: 'Profile picture uploaded successfully',
      profilePicture: req.user.profilePicture,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        university: req.user.university,
        bio: req.user.bio,
        profilePicture: req.user.profilePicture,
        role: req.user.role,
        isEmailVerified: req.user.isEmailVerified,
        createdAt: req.user.createdAt,
        lastLogin: req.user.lastLogin
      }
    });
  } catch (error) {
    console.error('❌ Profile picture upload error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Save/Unsave item (protected route)
router.post('/save-item/:productId', verifyToken, async (req, res) => {
  try {
    const { productId } = req.params;
    
    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Check if user already saved this item
    const isSaved = req.user.savedItems.includes(productId);
    
    if (isSaved) {
      // Unsave the item
      req.user.savedItems = req.user.savedItems.filter(id => id.toString() !== productId);
      product.savedBy = product.savedBy.filter(id => id.toString() !== req.user._id.toString());
    } else {
      // Save the item
      req.user.savedItems.push(productId);
      product.savedBy.push(req.user._id);
    }

    await req.user.save();
    await product.save();

    res.json({ 
      message: isSaved ? 'Item unsaved successfully' : 'Item saved successfully',
      isSaved: !isSaved,
      savedCount: product.savedBy.length
    });
  } catch (error) {
    console.error('Save item error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's saved items (protected route)
router.get('/saved-items', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'savedItems',
      populate: {
        path: 'seller',
        select: 'name university'
      }
    });

    res.json({ 
      savedItems: user.savedItems || []
    });
  } catch (error) {
    console.error('Get saved items error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});



// Get all products
router.get('/products', async (req, res) => {
  try {
    const products = await Product.find({ isActive: true })
      .populate('seller', 'name university')
      .sort({ createdAt: -1 });
    
    res.json({ products });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Clear all products (for testing)
router.delete('/clear-products', async (req, res) => {
  try {
    await Product.deleteMany({});
    res.json({ message: 'All products cleared' });
  } catch (error) {
    console.error('Clear products error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new product listing with enhanced file management
router.post('/create-listing', upload.array('images', 5), async (req, res) => {
  try {
    const { title, description, price, category, condition } = req.body;
    
    // Validate required fields
    if (!title || !description || !price || !category || !condition) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    // Validate price
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      return res.status(400).json({ message: 'Invalid price' });
    }

    // Validate category
    const validCategories = ['textbooks', 'electronics', 'dorm-essentials', 'clothing', 'furniture', 'science', 'fitness', 'other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({ message: 'Invalid category' });
    }

    // Validate condition
    const validConditions = ['new', 'like-new', 'good', 'fair'];
    if (!validConditions.includes(condition)) {
      return res.status(400).json({ message: 'Invalid condition' });
    }

    // Get user from token
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // Ensure user has a userFolder (for existing users)
    if (!user.userFolder) {
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 8);
      user.userFolder = `user_${user._id}_${timestamp}_${randomSuffix}`;
      await user.save();
      console.log(`✅ Created userFolder for existing user: ${user.userFolder}`);
    }

    console.log(`📝 Creating listing for user: ${user.name} (${user.userFolder})`);

    // Process and save images using the new file manager
    let imageMetadata = [];
    if (req.files && req.files.length > 0) {
      console.log(`📸 Processing ${req.files.length} images for user ${user.userFolder}`);
      
      try {
        imageMetadata = await fileManager.saveProductImages(req.files, user.userFolder);
        console.log(`✅ Successfully processed ${imageMetadata.length} images`);
      } catch (error) {
        console.error(`❌ Error processing images:`, error);
        return res.status(500).json({ message: 'Error processing images' });
      }
    } else {
      // Use default image if no images uploaded
      imageMetadata = [{
        originalName: 'default.png',
        fileName: 'default.png',
        filePath: 'pictures/illustration.png',
        thumbnailPath: null,
        fileSize: 0,
        mimeType: 'image/png',
        uploadedAt: new Date(),
        userFolder: user.userFolder,
        type: 'product'
      }];
      console.log('⚠️ No images uploaded, using default illustration');
    }

    // Generate unique listing ID
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const listingId = `LIST_${timestamp}_${randomSuffix}`;

    // Create the product with enhanced metadata
    const product = new Product({
      title: title.trim(),
      description: description.trim(),
      price: numPrice,
      images: imageMetadata,
      seller: user._id,
      category,
      condition,
      savedBy: [],
      isActive: true,
      listingId: listingId,
      userFolder: user.userFolder,
      location: {
        university: user.university,
        campus: 'Main Campus' // Default value
      }
    });

    await product.save();

    // Log activity for both user and product
    await user.logActivity('create_listing', {
      productId: product._id,
      productTitle: product.title,
      category: product.category,
      price: product.price,
      imageCount: imageMetadata.length
    }, req);

    await product.logActivity('created', user._id, {
      title: product.title,
      category: product.category,
      price: product.price
    });

    // Update user statistics
    user.totalListings += 1;
    user.activeListings += 1;
    await user.save();

    // Populate seller info for response
    await product.populate('seller', 'name university');

    console.log(`✅ Listing created successfully: ${product.listingId}`);

    res.status(201).json({
      message: 'Listing created successfully',
      product: {
        ...product.toJSON(),
        imageUrls: product.imageUrls
      }
    });

  } catch (error) {
    console.error('❌ Create listing error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'No user with that email' });

    // Generate code
    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
    user.resetPasswordCode = code;
    user.resetPasswordExpires = Date.now() + 1000 * 60 * 10; // 10 minutes
    await user.save();

    // Send email
    const emailHtml = `
      <h2>Password Reset Request</h2>
      <p>Hi ${user.name},</p>
      <p>You requested a password reset. Use this code to reset your password:</p>
      <h1 style="color: #3B82F6; font-size: 2rem; text-align: center; padding: 1rem; background: #F3F4F6; border-radius: 0.5rem;">${code}</h1>
      <p>This code will expire in 10 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
    `;

    await sendEmail(
      user.email,
      'Password Reset Code',
      `Your password reset code is: ${code}`,
      emailHtml
    );

    res.json({ message: 'Verification code sent to email' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Reset Password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) return res.status(400).json({ message: 'All fields required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'No user with that email' });
    if (!user.resetPasswordCode || !user.resetPasswordExpires) return res.status(400).json({ message: 'No reset request found' });
    if (user.resetPasswordCode !== code) return res.status(400).json({ message: 'Invalid code' });
    if (user.resetPasswordExpires < Date.now()) return res.status(400).json({ message: 'Code expired' });

    user.password = newPassword;
    user.resetPasswordCode = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user statistics and file info
router.get('/user-stats', verifyToken, async (req, res) => {
  try {
    const userStats = req.user.getStats();
    const fileStats = await fileManager.getUserFileStats(req.user.userFolder);
    
    // Get user's products
    const userProducts = await Product.find({ seller: req.user._id })
      .select('title category price status createdAt')
      .sort({ createdAt: -1 });

    res.json({
      userStats,
      fileStats,
      recentProducts: userProducts.slice(0, 5),
      totalProducts: userProducts.length
    });
  } catch (error) {
    console.error('❌ Get user stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user activity log
router.get('/user-activity', verifyToken, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const activities = req.user.activities
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(skip, skip + parseInt(limit));

    res.json({
      activities,
      total: req.user.activities.length,
      page: parseInt(page),
      totalPages: Math.ceil(req.user.activities.length / limit)
    });
  } catch (error) {
    console.error('❌ Get user activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get seller's listings
router.get('/seller/listings', verifyToken, async (req, res) => {
  try {
    console.log(`🔍 Fetching listings for seller: ${req.user.name} (${req.user._id})`);
    console.log(`🔑 User ID from token: ${req.user._id}`);
    
    // Find all products by this seller
    const listings = await Product.find({ seller: req.user._id })
      .populate('seller', 'name university')
      .sort({ createdAt: -1 });
    
    console.log(`📦 Found ${listings.length} listings for seller ${req.user.name}`);
    console.log(`📋 Raw listings data:`, listings.map(l => ({
      id: l._id,
      title: l.title,
      seller: l.seller,
      isActive: l.isActive
    })));
    
    // Transform the data to include image URLs
    const transformedListings = listings.map(listing => {
      const listingObj = listing.toObject();
      
      // Add image URLs
      if (listingObj.images && listingObj.images.length > 0) {
        listingObj.imageUrls = listingObj.images.map(img => {
          if (img.filePath) {
            return `http://localhost:5001/uploads/${img.filePath}`;
          }
          return null;
        }).filter(url => url !== null);
      } else {
        listingObj.imageUrls = [];
      }
      
      return listingObj;
    });
    
    const response = {
      success: true,
      listings: transformedListings,
      totalListings: listings.length,
      activeListings: listings.filter(l => l.isActive !== false).length,
      soldListings: listings.filter(l => l.soldAt).length
    };
    
    console.log(`📤 Sending response:`, response);
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Get seller listings error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch seller listings',
      error: error.message 
    });
  }
});

// Delete a seller's listing (and associated image files)
router.delete('/seller/listings/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Listing not found' });
    }

    // Ownership check
    if (product.seller.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this listing' });
    }

    // Delete image files (originals and thumbnails)
    if (Array.isArray(product.images)) {
      for (const img of product.images) {
        try {
          await fileManager.deleteFile(img.filePath, img.thumbnailPath || null);
        } catch (err) {
          console.warn('⚠️ Error deleting image file for listing', id, err?.message);
        }
      }
    }

    // Archive to DeletedListing for admin audit
    try {
      await DeletedListing.create({
        originalProductId: product._id,
        title: product.title,
        description: product.description,
        price: product.price,
        category: product.category,
        condition: product.condition,
        seller: product.seller,
        images: product.images,
        savedByCount: Array.isArray(product.savedBy) ? product.savedBy.length : 0,
        savedBySample: Array.isArray(product.savedBy) ? product.savedBy.slice(0, 20) : [],
        createdAt: product.createdAt,
        userFolder: product.userFolder,
        statusAtDelete: product.status,
        deletedBy: req.user._id,
      });
    } catch (e) {
      console.warn('⚠️ Failed to archive deleted listing:', e?.message);
    }

    // Remove the product document
    await Product.deleteOne({ _id: id });

    // Update user stats safely
    try {
      req.user.totalListings = Math.max(0, (req.user.totalListings || 0) - 1);
      if (product.isActive) {
        req.user.activeListings = Math.max(0, (req.user.activeListings || 0) - 1);
      }
      await req.user.save();
    } catch (err) {
      console.warn('⚠️ Error updating user stats after deletion:', err?.message);
    }

    // Activity log
    try {
      await req.user.logActivity('delete_listing', { productId: id, title: product.title, price: product.price }, req);
    } catch {}

    return res.json({ success: true, message: 'Listing deleted successfully', id });
  } catch (error) {
    console.error('❌ Delete listing error:', error);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// =====================
// Admin APIs
// =====================

// Admin overview dashboard
router.get('/admin/overview', verifyToken, requireAdmin, async (req, res) => {
  try {
    const [usersCount, productsCount, deletedCount] = await Promise.all([
      User.countDocuments({}),
      Product.countDocuments({}),
      DeletedListing.countDocuments({}),
    ]);

    const recentProducts = await Product.find({})
      .populate('seller', 'name email university')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const recentDeleted = await DeletedListing.find({})
      .populate('seller', 'name email university')
      .populate('deletedBy', 'name email')
      .sort({ deletedAt: -1 })
      .limit(50)
      .lean();

    const recentUsers = await User.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({
      summary: { usersCount, productsCount, deletedCount },
      recentProducts,
      recentDeleted,
      recentUsers,
    });
  } catch (err) {
    console.error('❌ Admin overview error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: list users with basic stats
router.get('/admin/users', verifyToken, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({})
      .select('name email university role createdAt lastLogin isSuspended totalListings activeListings memberSince')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ users });
  } catch (err) {
    console.error('❌ Admin users error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: suspend/unsuspend a user
router.post('/admin/users/:id/suspend', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = 'Policy violation', suspend = true } = req.body || {};
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.isSuspended = !!suspend;
    user.suspension = suspend
      ? { reason, by: req.user._id, at: new Date() }
      : { reason: null, by: null, at: null };
    await user.save();

    res.json({
      message: suspend ? 'User suspended' : 'User unsuspended',
      user: {
        id: user._id,
        isSuspended: user.isSuspended,
        suspension: user.suspension,
      },
    });
  } catch (err) {
    console.error('❌ Admin suspend error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: all listings with saves and owner info
router.get('/admin/listings', verifyToken, requireAdmin, async (req, res) => {
  try {
    const listings = await Product.find({})
      .populate('seller', 'name email university')
      .select('title price category condition createdAt savedBy status isActive seller')
      .sort({ createdAt: -1 })
      .lean();

    const response = listings.map(l => ({
      ...l,
      savedCount: Array.isArray(l.savedBy) ? l.savedBy.length : 0,
    }));

    res.json({ listings: response });
  } catch (err) {
    console.error('❌ Admin listings error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// Admin: deleted listings
router.get('/admin/deleted-listings', verifyToken, requireAdmin, async (req, res) => {
  try {
    const items = await DeletedListing.find({})
      .populate('seller', 'name email university')
      .populate('deletedBy', 'name email')
      .sort({ deletedAt: -1 })
      .limit(200)
      .lean();
    res.json({ items });
  } catch (err) {
    console.error('❌ Admin deleted listings error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


module.exports = router; 