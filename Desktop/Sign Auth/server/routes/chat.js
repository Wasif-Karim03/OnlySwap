const express = require('express');
const jwt = require('jsonwebtoken');
const Message = require('../models/Message');
const User = require('../models/User');
const router = express.Router();

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

// Middleware to check for admin role
const requireAdmin = async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Update lastActive middleware
const updateLastActive = async (req, res, next) => {
  if (req.user) {
    req.user.lastActive = new Date();
    await req.user.save();
  }
  next();
};

// Apply updateLastActive to all chat routes
router.use(verifyToken, updateLastActive);

// Typing status endpoint
router.post('/typing', verifyToken, async (req, res) => {
  try {
    const { receiverId, isTyping } = req.body;
    if (!receiverId) return res.status(400).json({ message: 'receiverId required' });
    req.user.typingStatus.set(receiverId, !!isTyping);
    await req.user.save();
    res.json({ message: 'Typing status updated' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update typing status' });
  }
});

// Get typing status for a conversation
router.get('/typing/:otherUserId', verifyToken, async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const otherUser = await User.findById(otherUserId);
    if (!otherUser) return res.status(404).json({ message: 'User not found' });
    const isTyping = otherUser.typingStatus.get(String(req.user._id)) || false;
    res.json({ isTyping });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get typing status' });
  }
});

// Get all conversations for a user (students see admin conversations, admins see all student conversations)
router.get('/conversations', verifyToken, async (req, res) => {
  try {
    let conversations = [];
    
    if (req.user.role === 'admin') {
      // Admins see conversations with all students and reviewers
      const students = await User.find({ role: 'user' }).select('name email avatar');
      const reviewers = await User.find({ role: 'reviewer' }).select('name email avatar');
      
      const allUsers = [...students, ...reviewers];
      conversations = allUsers.map(user => ({
        userId: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        unreadCount: 0 // Will be calculated below
      }));
      
      // Get unread message counts for each user
      for (let conv of conversations) {
        const unreadCount = await Message.countDocuments({
          sender: conv.userId,
          receiver: req.user._id,
          isRead: false
        });
        conv.unreadCount = unreadCount;
      }
    } else if (req.user.role === 'reviewer') {
      // Reviewers see conversations with all admins
      const admins = await User.find({ role: 'admin' }).select('name email avatar');
      conversations = admins.map(admin => ({
        userId: admin._id,
        name: admin.name,
        email: admin.email,
        avatar: admin.avatar,
        role: 'admin',
        unreadCount: 0
      }));
      
      // Get unread message counts for each admin
      for (let conv of conversations) {
        const unreadCount = await Message.countDocuments({
          sender: conv.userId,
          receiver: req.user._id,
          isRead: false
        });
        conv.unreadCount = unreadCount;
      }
    } else {
      // Students see conversations with all admins
      const admins = await User.find({ role: 'admin' }).select('name email avatar');
      conversations = admins.map(admin => ({
        userId: admin._id,
        name: admin.name,
        email: admin.email,
        avatar: admin.avatar,
        role: 'admin',
        unreadCount: 0
      }));
      
      // Get unread message counts for each admin
      for (let conv of conversations) {
        const unreadCount = await Message.countDocuments({
          sender: conv.userId,
          receiver: req.user._id,
          isRead: false
        });
        conv.unreadCount = unreadCount;
      }
    }
    
    res.json({ conversations });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get messages between two users
router.get('/messages/:otherUserId', verifyToken, async (req, res) => {
  try {
    const { otherUserId } = req.params;
    
    // Verify the other user exists
    const otherUser = await User.findById(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Get messages between the two users
    const messages = await Message.find({
      $or: [
        { sender: req.user._id, receiver: otherUserId },
        { sender: otherUserId, receiver: req.user._id }
      ]
    })
    .sort({ createdAt: 1 })
    .populate('sender', 'name email avatar')
    .populate('receiver', 'name email avatar');
    
    // Mark messages as read
    await Message.updateMany(
      {
        sender: otherUserId,
        receiver: req.user._id,
        isRead: false
      },
      {
        isRead: true,
        readAt: new Date()
      }
    );
    
    res.json({ messages });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search messages in a conversation
router.get('/messages/:otherUserId/search', verifyToken, async (req, res) => {
  try {
    const { otherUserId } = req.params;
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }
    
    // Verify the other user exists
    const otherUser = await User.findById(otherUserId);
    if (!otherUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Search messages between the two users
    const messages = await Message.find({
      $or: [
        { sender: req.user._id, receiver: otherUserId },
        { sender: otherUserId, receiver: req.user._id }
      ],
      content: { $regex: query, $options: 'i' }
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('sender', 'name email avatar')
    .populate('receiver', 'name email avatar');
    
    res.json({ messages });
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send a message
router.post('/messages', verifyToken, async (req, res) => {
  try {
    const { receiverId, content, messageType = 'text' } = req.body;
    
    if (!receiverId || !content) {
      return res.status(400).json({ message: 'Receiver ID and content are required' });
    }
    
    // Verify the receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: 'Receiver not found' });
    }
    
    // Create the message
    const message = new Message({
      sender: req.user._id,
      receiver: receiverId,
      content: content.trim(),
      messageType
    });
    
    await message.save();
    
    // Populate sender and receiver details
    await message.populate('sender', 'name email avatar');
    await message.populate('receiver', 'name email avatar');
    
    res.json({ message });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Send support request (creates a message to all admins)
router.post('/support-request', verifyToken, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({ message: 'Support request content is required' });
    }
    
    // Get all admin users
    const admins = await User.find({ role: 'admin' });
    
    if (admins.length === 0) {
      return res.status(500).json({ message: 'No admin users found' });
    }
    
    // Send message to each admin
    const messages = [];
    for (const admin of admins) {
      const message = new Message({
        sender: req.user._id,
        receiver: admin._id,
        content: `🆘 Support Request: ${content}`,
        messageType: 'support_request'
      });
      
      await message.save();
      await message.populate('sender', 'name email avatar');
      await message.populate('receiver', 'name email avatar');
      messages.push(message);
    }
    
    res.json({ 
      message: 'Support request sent to all admins',
      messages 
    });
  } catch (error) {
    console.error('Support request error:', error);
    res.status(500).json({ message: 'Failed to send support request' });
  }
});

// Get unread message count for current user
router.get('/unread-count', verifyToken, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      receiver: req.user._id,
      isRead: false
    });
    
    res.json({ unreadCount: count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router; 