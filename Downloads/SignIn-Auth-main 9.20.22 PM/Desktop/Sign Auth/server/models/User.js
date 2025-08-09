const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  university: {
    type: String,
    required: true,
    trim: true
  },
  bio: {
    type: String,
    trim: true,
    maxlength: 200
  },
  profilePicture: {
    type: String,
    default: null
  },
  savedItems: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  }],
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  // Administrative controls
  isSuspended: {
    type: Boolean,
    default: false
  },
  suspension: {
    reason: { type: String, default: null },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: null }
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationCode: String,
  emailVerificationExpires: Date,
  resetPasswordCode: String,
  resetPasswordExpires: Date,
  lastLogin: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Enhanced data tracking
  userFolder: {
    type: String,
    unique: true,
    required: false
  },
  totalListings: {
    type: Number,
    default: 0
  },
  activeListings: {
    type: Number,
    default: 0
  },
  totalSales: {
    type: Number,
    default: 0
  },
  memberSince: {
    type: Date,
    default: Date.now
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  // Activity tracking
  activities: [{
    action: {
      type: String,
      enum: ['signup', 'login', 'logout', 'create_listing', 'update_listing', 'delete_listing', 'save_item', 'unsave_item', 'update_profile', 'upload_picture']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: {
      type: mongoose.Schema.Types.Mixed
    },
    ipAddress: String,
    userAgent: String
  }],
  // Settings and preferences
  preferences: {
    emailNotifications: {
      type: Boolean,
      default: true
    },
    pushNotifications: {
      type: Boolean,
      default: true
    },
    privacySettings: {
      showEmail: {
        type: Boolean,
        default: false
      },
      showPhone: {
        type: Boolean,
        default: false
      }
    }
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Add activity log method
userSchema.methods.logActivity = async function(action, details = {}, req = null) {
  this.activities.push({
    action,
    timestamp: new Date(),
    details,
    ipAddress: req?.ip || null,
    userAgent: req?.get('User-Agent') || null
  });
  
  this.lastActivity = new Date();
  await this.save();
};

// Get user statistics
userSchema.methods.getStats = function() {
  return {
    totalListings: this.totalListings,
    activeListings: this.activeListings,
    totalSales: this.totalSales,
    memberSince: this.memberSince,
    lastActivity: this.lastActivity,
    savedItemsCount: this.savedItems.length
  };
};

module.exports = mongoose.model('User', userSchema); 