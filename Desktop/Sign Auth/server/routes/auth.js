// =============================
// NOTE: DO NOT use a personal Gmail account for OAuth in production.
// Set up Google OAuth credentials in the Google Cloud Console and use those client ID/secret.
// See project README or ask the developer for setup instructions.
// =============================
const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
// Removed: const GitHubStrategy = require('passport-github2').Strategy;
// Removed: const FacebookStrategy = require('passport-facebook').Strategy;

const router = express.Router();

// Configure Passport strategies only if credentials are provided
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback"
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ 'socialLogins.provider': 'google', 'socialLogins.socialId': profile.id });
      
      if (!user) {
        // Check if email already exists
        const existingUser = await User.findOne({ email: profile.emails[0].value });
        if (existingUser) {
          // Link social account to existing user
          existingUser.socialLogins.push({
            provider: 'google',
            socialId: profile.id,
            socialEmail: profile.emails[0].value
          });
          await existingUser.save();
          return done(null, existingUser);
        }
        
        // Create new user
        user = new User({
          name: profile.displayName,
          email: profile.emails[0].value,
          password: crypto.randomBytes(32).toString('hex'), // Random password for social login
          isEmailVerified: true,
          socialLogins: [{
            provider: 'google',
            socialId: profile.id,
            socialEmail: profile.emails[0].value
          }]
        });
        await user.save();
      }
      
      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }));
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
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
    from: `"Sign Auth Support" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html
  });
};

// Validation middleware
const validateSignUp = [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters long'),
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('adminCode').optional().isString().withMessage('Admin code must be a string')
];

const validateSignIn = [
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
];

// Middleware to check for admin role
const requireAdmin = async (req, res, next) => {
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
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

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

// Helper to log user activity
async function logActivity(user, action, details = null, req = null) {
  user.activities = user.activities || [];
  user.activities.push({
    action,
    details,
    ipAddress: req?.ip || null,
    userAgent: req?.headers['user-agent'] || null,
    timestamp: new Date()
  });
  await user.save();
}

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

    const { name, email, password, adminCode } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Determine user role based on admin code
    const role = adminCode === '705' ? 'admin' : 'user';

    // Generate email verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Create new user
    const user = new User({ 
      name, 
      email, 
      password, 
      role,
      emailVerificationCode: verificationCode,
      emailVerificationExpires: Date.now() + 1000 * 60 * 30 // 30 minutes
    });
    await user.save();

    // Send verification email
    const emailHtml = `
      <h2>Welcome to Sign Auth!</h2>
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

    await logActivity(user, 'signup', null, req);

    res.status(201).json({
      message: 'Account created successfully. Please check your email to verify your account.',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
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

    await logActivity(user, 'email_verified', null, req);

    // Generate token
    const token = generateToken(user._id);

    res.json({
      message: 'Email verified successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
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

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Check if account is locked
    if (user.isLocked()) {
      return res.status(423).json({ 
        message: 'Account is temporarily locked due to too many failed attempts. Please try again later.' 
      });
    }

    // Check if user is blocked by admin
    if (user.isBlocked) {
      return res.status(403).json({ 
        message: 'Your profile is currently suspended by the admin, to continue contact mwkarim@owu.edu'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await user.incLoginAttempts();
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Reset login attempts on successful login
    await user.resetLoginAttempts();

    // Check if email is verified (only for non-social logins)
    if (!user.isEmailVerified && user.socialLogins.length === 0) {
      return res.status(403).json({ 
        message: 'Please verify your email address before signing in',
        requiresVerification: true
      });
    }

    // Generate token
    const token = generateToken(user._id, rememberMe);

    await logActivity(user, 'login', null, req);

    res.json({
      message: 'Signed in successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
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
        role: req.user.role,
        isEmailVerified: req.user.isEmailVerified,
        avatar: req.user.avatar,
        phone: req.user.phone,
        lastLogin: req.user.lastLogin
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update profile
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { name, phone, avatar } = req.body;
    
    const updates = {};
    if (name) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (avatar !== undefined) updates.avatar = avatar;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    await logActivity(user, 'profile_updated', null, req);

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        avatar: user.avatar,
        phone: user.phone,
        lastLogin: user.lastLogin
      }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Social login routes (only available if credentials are configured)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
  router.get('/google/callback', passport.authenticate('google', { session: false }), (req, res) => {
    const token = generateToken(req.user._id);
    res.redirect(`/auth-success?token=${token}`);
  });
}

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

    await logActivity(user, 'password_reset', null, req);

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete account
router.delete('/account', verifyToken, async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ message: 'Password is required to delete account' });
    }

    const isPasswordValid = await req.user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid password' });
    }

    await User.findByIdAndDelete(req.user._id);

    await logActivity(req.user, 'account_deleted', null, req);

    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Account deletion error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all users (admin only)
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    const count = await User.countDocuments({});
    
    res.json({
      users,
      count
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add user search endpoint (admin only)
router.get('/users/search', requireAdmin, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'Email query required' });
    const users = await User.find({ email: { $regex: email, $options: 'i' } }).select('-password');
    res.json({ users });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});
// Add user activity endpoint (admin only)
router.get('/users/:id/activities', requireAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('activities name email role createdAt isBlocked blockedAt blockedReason blockedBy');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ 
      activities: user.activities, 
      name: user.name, 
      email: user.email, 
      role: user.role, 
      createdAt: user.createdAt,
      isBlocked: user.isBlocked,
      blockedAt: user.blockedAt,
      blockedReason: user.blockedReason,
      blockedBy: user.blockedBy
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Block user (admin only)
router.post('/users/:id/block', requireAdmin, async (req, res) => {
  try {
    const { reason } = req.body;
    const userToBlock = await User.findById(req.params.id);
    
    if (!userToBlock) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (userToBlock.role === 'admin') {
      return res.status(403).json({ message: 'Cannot block another admin' });
    }
    
    if (userToBlock.isBlocked) {
      return res.status(400).json({ message: 'User is already blocked' });
    }
    
    userToBlock.isBlocked = true;
    userToBlock.blockedBy = req.user._id;
    userToBlock.blockedAt = new Date();
    userToBlock.blockedReason = reason || null;
    
    await userToBlock.save();
    
    // Log the blocking activity
    await logActivity(userToBlock, 'user_blocked', `Blocked by admin: ${req.user.name}${reason ? ` - Reason: ${reason}` : ''}`, req);
    
    res.json({ 
      message: 'User blocked successfully',
      user: {
        id: userToBlock._id,
        name: userToBlock.name,
        email: userToBlock.email,
        isBlocked: userToBlock.isBlocked,
        blockedAt: userToBlock.blockedAt,
        blockedReason: userToBlock.blockedReason
      }
    });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Unblock user (admin only)
router.post('/users/:id/unblock', requireAdmin, async (req, res) => {
  try {
    const userToUnblock = await User.findById(req.params.id);
    
    if (!userToUnblock) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (!userToUnblock.isBlocked) {
      return res.status(400).json({ message: 'User is not blocked' });
    }
    
    userToUnblock.isBlocked = false;
    userToUnblock.blockedBy = null;
    userToUnblock.blockedAt = null;
    userToUnblock.blockedReason = null;
    
    await userToUnblock.save();
    
    // Log the unblocking activity
    await logActivity(userToUnblock, 'user_unblocked', `Unblocked by admin: ${req.user.name}`, req);
    
    res.json({ 
      message: 'User unblocked successfully',
      user: {
        id: userToUnblock._id,
        name: userToUnblock.name,
        email: userToUnblock.email,
        isBlocked: userToUnblock.isBlocked
      }
    });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 