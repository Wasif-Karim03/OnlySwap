const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

class FileManager {
  constructor() {
    this.baseUploadDir = 'uploads';
    this.userBaseDir = path.join(this.baseUploadDir, 'users');
    this.productBaseDir = path.join(this.baseUploadDir, 'products');
    this.avatarBaseDir = path.join(this.baseUploadDir, 'avatars');
  }

  // Create user-specific directory structure
  async createUserDirectory(userId, userFolder) {
    const userDir = path.join(this.userBaseDir, userFolder);
    const userProductDir = path.join(userDir, 'products');
    const userAvatarDir = path.join(userDir, 'avatars');
    const userTempDir = path.join(userDir, 'temp');

    try {
      await fs.mkdir(userDir, { recursive: true });
      await fs.mkdir(userProductDir, { recursive: true });
      await fs.mkdir(userAvatarDir, { recursive: true });
      await fs.mkdir(userTempDir, { recursive: true });

      console.log(`✅ Created user directory structure for ${userFolder}`);
      return {
        userDir,
        userProductDir,
        userAvatarDir,
        userTempDir
      };
    } catch (error) {
      console.error(`❌ Error creating user directory for ${userFolder}:`, error);
      throw error;
    }
  }

  // Generate unique filename with timestamp and user info
  generateFileName(originalName, userId, prefix = '') {
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    let extension = path.extname(originalName);
    const baseName = path.basename(originalName, extension);
    
    // Convert HEIC/HEIF extensions to JPG
    if (extension.toLowerCase() === '.heic' || extension.toLowerCase() === '.heif') {
      extension = '.jpg';
    }
    
    return `${prefix}${baseName}_${timestamp}_${randomSuffix}${extension}`;
  }

  // Process and save image with metadata
  async processAndSaveImage(file, userFolder, type = 'product') {
    try {
      const { originalname, mimetype, size, buffer } = file;
      
      console.log(`🔄 Processing image: ${originalname} (${mimetype}, ${size} bytes) for ${type}`);
      
      // Create user directory if it doesn't exist
      const userDirs = await this.createUserDirectory(null, userFolder);
      
      // Determine target directory
      const targetDir = type === 'avatar' ? userDirs.userAvatarDir : userDirs.userProductDir;
      
      // Generate unique filename
      const fileName = this.generateFileName(originalname, userFolder, type === 'avatar' ? 'avatar_' : 'product_');
      const filePath = path.join(targetDir, fileName);
      
      console.log(`📁 Target directory: ${targetDir}`);
      console.log(`📄 Generated filename: ${fileName}`);
      console.log(`📂 Full file path: ${filePath}`);
      
      // Process image based on type
      let processedBuffer = buffer;
      let finalMimeType = mimetype;
      
      // Convert HEIC to JPEG if needed
      let heicConversionFailed = false;
      if (mimetype.includes('heic') || mimetype.includes('heif')) {
        try {
          processedBuffer = await sharp(buffer)
            .jpeg({ quality: 80 })
            .toBuffer();
          finalMimeType = 'image/jpeg';
          // Update filename to have .jpg extension
          fileName = fileName.replace(/\.(heic|heif)$/i, '.jpg');
          filePath = path.join(targetDir, fileName);
          console.log(`✅ Converted HEIC to JPEG: ${originalname} -> ${fileName}`);
        } catch (error) {
          console.warn(`⚠️ HEIC conversion failed for ${originalname}, using original:`, error.message);
          heicConversionFailed = true;
          // Keep original HEIC file but still update the filename to .jpg for consistency
          fileName = fileName.replace(/\.(heic|heif)$/i, '.jpg');
          filePath = path.join(targetDir, fileName);
          finalMimeType = 'image/jpeg'; // Treat as JPEG even if conversion failed
          console.log(`🔄 Using original HEIC but with .jpg extension: ${fileName}`);
        }
      }
      
      // Optimize image (skip if HEIC conversion failed)
      if (!heicConversionFailed) {
        try {
          processedBuffer = await sharp(processedBuffer)
            .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
          console.log(`✅ Optimized image: ${originalname}`);
        } catch (error) {
          console.warn(`⚠️ Image optimization failed for ${originalname}:`, error.message);
        }
      } else {
        console.log(`⏭️ Skipping optimization for HEIC file: ${originalname}`);
      }
      
      // Save file
      await fs.writeFile(filePath, processedBuffer);
      
      // Create thumbnail for products (skip if HEIC conversion failed)
      let thumbnailPath = null;
      if (type === 'product' && !heicConversionFailed) {
        const thumbnailName = `thumb_${fileName}`;
        thumbnailPath = path.join(targetDir, thumbnailName);
        
        try {
          const thumbnailBuffer = await sharp(processedBuffer)
            .resize(300, 300, { fit: 'cover' })
            .jpeg({ quality: 70 })
            .toBuffer();
          
          await fs.writeFile(thumbnailPath, thumbnailBuffer);
          console.log(`✅ Created thumbnail: ${thumbnailName}`);
        } catch (error) {
          console.warn(`⚠️ Thumbnail creation failed for ${originalname}:`, error.message);
        }
      } else if (type === 'product' && heicConversionFailed) {
        console.log(`⏭️ Skipping thumbnail creation for HEIC file: ${originalname}`);
      }
      
      // Return file metadata
      const fileMetadata = {
        originalName: originalname,
        fileName: fileName,
        filePath: path.relative(this.baseUploadDir, filePath),
        thumbnailPath: thumbnailPath ? path.relative(this.baseUploadDir, thumbnailPath) : null,
        fileSize: processedBuffer.length,
        mimeType: finalMimeType,
        uploadedAt: new Date(),
        userFolder: userFolder,
        type: type
      };
      
      console.log(`✅ Successfully saved ${type} image:`, {
        originalName: file.originalname,
        fileName,
        fileSize: `${(processedBuffer.length / 1024).toFixed(2)}KB`,
        userFolder,
        relativePath: fileMetadata.filePath
      });
      
      return fileMetadata;
      
    } catch (error) {
      console.error(`❌ Error processing image ${file.originalname}:`, error);
      throw error;
    }
  }

  // Save multiple product images
  async saveProductImages(files, userFolder) {
    const imageMetadata = [];
    const failedFiles = [];
    
    console.log(`📸 Starting to save ${files.length} product images for user: ${userFolder}`);
    
    for (const file of files) {
      try {
        console.log(`🔄 Processing file: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);
        const metadata = await this.processAndSaveImage(file, userFolder, 'product');
        imageMetadata.push(metadata);
        console.log(`✅ Successfully saved: ${metadata.fileName} -> ${metadata.filePath}`);
      } catch (error) {
        console.error(`❌ Failed to save product image ${file.originalname}:`, error);
        failedFiles.push({ file: file.originalname, error: error.message });
      }
    }
    
    // If any files failed, throw a descriptive error
    if (failedFiles.length > 0) {
      const errorMessage = `Failed to process ${failedFiles.length} image(s): ${failedFiles.map(f => f.file).join(', ')}`;
      console.error(`❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }
    
    console.log(`🎉 Completed saving ${imageMetadata.length} images`);
    return imageMetadata;
  }

  // Save profile picture
  async saveProfilePicture(file, userFolder) {
    return await this.processAndSaveImage(file, userFolder, 'avatar');
  }

  // Delete file and its thumbnail
  async deleteFile(filePath, thumbnailPath = null) {
    try {
      const fullPath = path.join(this.baseUploadDir, filePath);
      await fs.unlink(fullPath);
      console.log(`✅ Deleted file: ${filePath}`);
      
      if (thumbnailPath) {
        const fullThumbnailPath = path.join(this.baseUploadDir, thumbnailPath);
        await fs.unlink(fullThumbnailPath);
        console.log(`✅ Deleted thumbnail: ${thumbnailPath}`);
      }
    } catch (error) {
      console.warn(`⚠️ Error deleting file ${filePath}:`, error.message);
    }
  }

  // Clean up user's temporary files
  async cleanupUserTempFiles(userFolder) {
    try {
      const userTempDir = path.join(this.userBaseDir, userFolder, 'temp');
      const tempFiles = await fs.readdir(userTempDir);
      
      for (const file of tempFiles) {
        const filePath = path.join(userTempDir, file);
        const stats = await fs.stat(filePath);
        
        // Delete files older than 24 hours
        if (Date.now() - stats.mtime.getTime() > 24 * 60 * 60 * 1000) {
          await fs.unlink(filePath);
          console.log(`🗑️ Cleaned up temp file: ${file}`);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error cleaning up temp files for ${userFolder}:`, error.message);
    }
  }

  // Get user's file statistics
  async getUserFileStats(userFolder) {
    try {
      const userDir = path.join(this.userBaseDir, userFolder);
      const userProductDir = path.join(userDir, 'products');
      const userAvatarDir = path.join(userDir, 'avatars');
      
      const [productFiles, avatarFiles] = await Promise.all([
        fs.readdir(userProductDir).catch(() => []),
        fs.readdir(userAvatarDir).catch(() => [])
      ]);
      
      let totalSize = 0;
      
      // Calculate total size
      for (const file of [...productFiles, ...avatarFiles]) {
        try {
          const filePath = path.join(userDir, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        } catch (error) {
          console.warn(`⚠️ Error getting file stats for ${file}:`, error.message);
        }
      }
      
      return {
        totalFiles: productFiles.length + avatarFiles.length,
        productFiles: productFiles.length,
        avatarFiles: avatarFiles.length,
        totalSize: totalSize,
        totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2)
      };
    } catch (error) {
      console.error(`❌ Error getting file stats for ${userFolder}:`, error);
      return {
        totalFiles: 0,
        productFiles: 0,
        avatarFiles: 0,
        totalSize: 0,
        totalSizeMB: '0.00'
      };
    }
  }

  // Validate file
  validateFile(file) {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/heic', 'image/heif'];
    
    if (!file) {
      throw new Error('No file provided');
    }
    
    if (file.size > maxSize) {
      throw new Error(`File size exceeds 5MB limit. Current size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
    }
    
    if (!allowedTypes.includes(file.mimetype)) {
      throw new Error(`File type not allowed. Allowed types: ${allowedTypes.join(', ')}`);
    }
    
    return true;
  }
}

module.exports = new FileManager(); 