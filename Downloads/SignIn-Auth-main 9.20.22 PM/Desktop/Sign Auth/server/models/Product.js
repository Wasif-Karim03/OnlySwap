const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  images: [{
    originalName: String,
    fileName: String,
    filePath: String,
    fileSize: Number,
    mimeType: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ['textbooks', 'electronics', 'dorm-essentials', 'clothing', 'furniture', 'science', 'fitness', 'other']
  },
  condition: {
    type: String,
    required: true,
    enum: ['new', 'like-new', 'good', 'fair']
  },
  savedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Enhanced data tracking
  listingId: {
    type: String,
    unique: true,
    required: false
  },
  views: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'sold', 'expired', 'removed'],
    default: 'active'
  },
  soldAt: Date,
  soldTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // File management
  userFolder: {
    type: String,
    required: true
  },
  // Activity tracking
  activityLog: [{
    action: {
      type: String,
      enum: ['created', 'updated', 'viewed', 'saved', 'unsaved', 'sold', 'deactivated']
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    details: {
      type: mongoose.Schema.Types.Mixed
    }
  }],
  // Metadata
  tags: [String],
  location: {
    university: String,
    campus: String
  },
  // Analytics
  analytics: {
    totalViews: {
      type: Number,
      default: 0
    },
    uniqueViews: {
      type: Number,
      default: 0
    },
    savesCount: {
      type: Number,
      default: 0
    },
    sharesCount: {
      type: Number,
      default: 0
    }
  }
});

// Generate unique listing ID
productSchema.pre('save', function(next) {
  if (this.isNew && !this.listingId) {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    this.listingId = `LIST_${timestamp}_${randomSuffix}`;
  }
  
  // Update the updatedAt field
  this.updatedAt = new Date();
  next();
});

// Add activity log method
productSchema.methods.logActivity = async function(action, userId = null, details = {}) {
  this.activityLog.push({
    action,
    timestamp: new Date(),
    userId,
    details
  });
  
  // Update analytics based on action
  switch (action) {
    case 'viewed':
      this.analytics.totalViews += 1;
      break;
    case 'saved':
      this.analytics.savesCount += 1;
      break;
    case 'shared':
      this.analytics.sharesCount += 1;
      break;
  }
  
  await this.save();
};

// Get product statistics
productSchema.methods.getStats = function() {
  return {
    views: this.views,
    saves: this.savedBy.length,
    daysListed: Math.floor((Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
    status: this.status,
    analytics: this.analytics
  };
};

// Virtual for image URLs
productSchema.virtual('imageUrls').get(function() {
  return this.images.map(img => img.filePath);
});

// Ensure virtuals are included in JSON
productSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Product', productSchema); 