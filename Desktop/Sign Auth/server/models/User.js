const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters long']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  role: {
    type: String,
    enum: ['user', 'reviewer', 'admin'],
    default: 'user'
  },
  // Student-specific fields
  studentId: {
    type: String,
    unique: true,
    sparse: true,
    default: null
  },
  isOnboardingCompleted: {
    type: Boolean,
    default: false
  },
  onboardingCompletedAt: {
    type: Date,
    default: null
  },
  // Reviewer approval status
  reviewerApprovalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: null
  },
  reviewerApprovedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  reviewerApprovedAt: {
    type: Date,
    default: null
  },
  reviewerRejectionReason: {
    type: String,
    default: null
  },
  // Email verification
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationCode: {
    type: String,
    default: null
  },
  emailVerificationExpires: {
    type: Date,
    default: null
  },
  // Password reset
  resetPasswordCode: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },

  // Social login
  socialLogins: [{
    provider: {
      type: String,
      enum: ['google', 'github', 'facebook']
    },
    socialId: String,
    socialEmail: String
  }],
  // Account management
  isActive: {
    type: Boolean,
    default: true
  },
  // Admin blocking functionality
  isBlocked: {
    type: Boolean,
    default: false
  },
  blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  blockedAt: {
    type: Date,
    default: null
  },
  blockedReason: {
    type: String,
    default: null
  },
  lastLogin: {
    type: Date,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  // Profile
  avatar: {
    type: String,
    default: null
  },
  phone: {
    type: String,
    default: null
  },
  university: {
    type: String,
    default: null
  },
  universityLogo: {
    type: String,
    default: null
  },
  bio: {
    type: String,
    default: null
  },
  internshipCompany: {
    type: String,
    default: null
  },
  graduationYear: {
    type: String,
    default: null
  },
  major: {
    type: String,
    default: null
  },
  // Student Profile Information
  firstName: {
    type: String,
    trim: true,
    default: null
  },
  lastName: {
    type: String,
    trim: true,
    default: null
  },
  dob: {
    type: Date,
    default: null
  },
  country: {
    type: String,
    trim: true,
    default: null
  },
  stateCity: {
    type: String,
    trim: true,
    default: null
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    default: null
  },
  // Education Information
  highSchool: {
    type: String,
    default: null
  },
  gradYear: {
    type: String,
    default: null
  },
  classSize: {
    type: String,
    default: null
  },
  classRankReport: {
    type: String,
    default: null
  },
  gpaScale: {
    type: String,
    default: null
  },
  cumulativeGpa: {
    type: String,
    default: null
  },
  gpaWeighted: {
    type: String,
    default: null
  },
  // Language proficiency
  languages: [
    {
      language: { type: String, required: true },
      proficiency: { type: String, required: true },
      speak: { type: Boolean, default: false },
      read: { type: Boolean, default: false },
      write: { type: Boolean, default: false },
      spokenAtHome: { type: Boolean, default: false }
    }
  ],
  // User activity tracking
  activities: [{
    action: {
      type: String,
      enum: ['login', 'logout', 'signup', 'email_verified', 'password_reset', 'profile_updated', 'account_deleted', 'user_blocked', 'user_unblocked', 'user_updated', 'reviewer_request', 'reviewer_approved', 'reviewer_rejected', 'onboarding_completed', 'onboarding_reset', 'support_request'],
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: {
      type: String,
      default: null
    },
    ipAddress: {
      type: String,
      default: null
    },
    userAgent: {
      type: String,
      default: null
    }
  }]
});

// Create indexes for better querying
userSchema.index({ role: 1, isOnboardingCompleted: 1 });
userSchema.index({ studentId: 1 });
userSchema.index({ email: 1 });
userSchema.index({ firstName: 1, lastName: 1 });
userSchema.index({ country: 1 });
userSchema.index({ gradYear: 1 });
userSchema.index({ createdAt: 1 });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Generate unique student ID before saving
userSchema.pre('save', async function(next) {
  if (this.role === 'user' && !this.studentId) {
    try {
      // Generate a unique student ID: STU + year + 6-digit sequence
      const year = new Date().getFullYear();
      const count = await mongoose.model('User').countDocuments({ role: 'user' });
      this.studentId = `STU${year}${String(count + 1).padStart(6, '0')}`;
    } catch (error) {
      next(error);
    }
  }
  next();
});

// Method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to check if account is locked
userSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Method to increment login attempts
userSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 };
  }
  
  return this.updateOne(updates);
};

// Method to reset login attempts
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
    $set: { lastLogin: Date.now() }
  });
};

// Method to mark onboarding as completed
userSchema.methods.completeOnboarding = function() {
  this.isOnboardingCompleted = true;
  this.onboardingCompletedAt = new Date();
  this.activities.push({
    action: 'onboarding_completed',
    timestamp: new Date(),
    details: 'Student onboarding completed successfully'
  });
  return this.save();
};

module.exports = mongoose.model('User', userSchema); 