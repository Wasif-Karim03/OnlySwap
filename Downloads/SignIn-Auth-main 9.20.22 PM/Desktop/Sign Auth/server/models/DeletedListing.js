const mongoose = require('mongoose');

const deletedListingSchema = new mongoose.Schema({
  originalProductId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', index: true },
  title: String,
  description: String,
  price: Number,
  category: String,
  condition: String,
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  images: [
    {
      originalName: String,
      fileName: String,
      filePath: String,
      fileSize: Number,
      mimeType: String,
      uploadedAt: Date
    }
  ],
  savedByCount: { type: Number, default: 0 },
  savedBySample: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: Date,
  deletedAt: { type: Date, default: Date.now },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userFolder: String,
  statusAtDelete: String,
});

module.exports = mongoose.model('DeletedListing', deletedListingSchema);


