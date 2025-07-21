# 🔐 Sign Auth - Full-Stack Authentication System

A comprehensive authentication system built with React frontend and Node.js backend, featuring advanced security mechanisms, admin panel, user management capabilities, and a real-time chat support system with multi-role communication.

## 🌟 Features

### 🔑 Authentication Features
- **Email/Password Registration & Login**
- **Email Verification System**
- **Password Reset via Email**
- **Google OAuth Integration**
- **JWT Token-based Authentication**
- **Remember Me Functionality**
- **Session Management**
- **Role-based Access Control** (Admin, Student, Reviewer)

### 🛡️ Security Features
- **Password Hashing** (bcrypt)
- **JWT Token Security**
- **Email Verification Required**
- **Rate Limiting Protection**
- **CORS Configuration**
- **Input Validation & Sanitization**
- **Protected Routes** with role-based access

### 👨‍💼 Admin Panel Features
- **User Management Dashboard**
- **Real-time User Search** (Gmail-style search bar)
- **User Activity Logging**
- **User Blocking/Unblocking System**
- **Detailed User Profiles**
- **Activity Timeline with Device Info**
- **Reviewer Management System**
- **University Logo Upload & Management**
- **Bio Management for Reviewers**
- **Real-time Chat Support Interface**
- **Multi-role Chat Support** (Students + Reviewers)
- **Smart Back Navigation** with location tracking

### 💬 Advanced Chat Support System
- **Real-time Messaging** between all user roles
- **Multi-role Communication**:
  - Students ↔ Admins
  - Reviewers ↔ Admins
  - Admins ↔ Students + Reviewers
- **Smart Navigation** with back button to previous page
- **User Search** in conversations list
- **Message Search** within conversations
- **Typing Indicators** with real-time updates
- **Active Status** tracking (Online/Offline)
- **Unread Message Counts** with visual indicators
- **Conversation Management** with user avatars
- **Message History** with timestamps
- **Message Persistence** - no message loss
- **Floating Chat Button** on student dashboard
- **Chat Notifications** for new messages
- **Scrollable Chat Interface** with modern UI
- **Animated Chat Bubbles** with gradient backgrounds
- **Pop-in Animations** for new messages

### 👨‍🎓 Student Features
- **Student Dashboard** with onboarding flow
- **Reviewer Discovery** with university logos and bios
- **Chat Support Access** for instant help
- **Profile Management** with detailed information
- **University Affiliation** display
- **Floating Chat Button** for quick access
- **Smart Back Navigation** from chat to dashboard
- **Real-time Chat** with admins

### 👨‍🏫 Reviewer System
- **Reviewer Registration** with approval workflow
- **University Logo Upload** via admin panel
- **Bio Management** by admins
- **Profile Customization** with university details
- **Student Connection** system
- **Chat Support Access** to contact admins
- **Reviewer Dashboard** with student management
- **Real-time Chat** with admins

### 📊 User Activity Tracking
- **Login/Logout Tracking**
- **Account Creation Logs**
- **Password Reset Logs**
- **Device Information** (IP, User Agent)
- **Timestamp Tracking**
- **Activity History**
- **Chat Message Logging**
- **Last Active Status** tracking

### 🔍 Search & Navigation Features
- **User Search** in chat conversations
- **Message Search** within conversations
- **Smart Back Navigation** with location state
- **Real-time Filtering** of conversations
- **Search Results** with user-friendly messages

## 🏗️ Architecture

### Frontend (React + TypeScript)
```
client/
├── src/
│   ├── components/
│   │   ├── SignIn.tsx                    # Login component
│   │   ├── SignUp.tsx                    # Registration component
│   │   ├── Dashboard.tsx                 # User dashboard
│   │   ├── AdminDashboard.tsx            # Admin panel
│   │   ├── AdminUserProfile.tsx          # User profile view
│   │   ├── AdminChatInterface.tsx        # Admin chat interface
│   │   ├── StudentChatInterface.tsx      # Student chat interface
│   │   ├── ReviewerChatInterface.tsx     # Reviewer chat interface
│   │   ├── AdminReviewerManagement.tsx   # Reviewer management
│   │   ├── StudentHome.tsx               # Student dashboard
│   │   ├── StudentOnboarding.tsx         # Student onboarding flow
│   │   ├── StudentProfile.tsx            # Student profile management
│   │   ├── ReviewerWelcome.tsx           # Reviewer dashboard
│   │   ├── ChatNotification.tsx          # Chat notifications
│   │   └── ...
│   ├── contexts/
│   │   └── AuthContext.tsx               # Authentication context
│   ├── hooks/                            # Custom React hooks
│   └── App.tsx                           # Main app component
```

### Backend (Node.js + Express)
```
server/
├── models/
│   ├── User.js                           # User model with activity tracking
│   └── Message.js                        # Chat message model
├── routes/
│   ├── auth.js                           # Authentication routes
│   └── chat.js                           # Chat system routes
├── config.env                            # Environment variables
└── index.js                              # Main server file
```

## 🚀 Installation & Setup

### Prerequisites
- Node.js (v14 or higher)
- MongoDB
- npm or yarn

### Backend Setup
```bash
cd server
npm install
cp config.env.example config.env
# Edit config.env with your configuration
npm start
```

### Frontend Setup
```bash
cd client
npm install
npm start
```

### Environment Variables (config.env)
```env
PORT=5001
MONGODB_URI=mongodb://localhost:27017/sign-auth
JWT_SECRET=your_jwt_secret_here
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_email_password
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

## 📱 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/verify-email` - Email verification
- `POST /api/auth/forgot-password` - Password reset
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

### Chat System
- `GET /api/chat/conversations` - Get user conversations
- `GET /api/chat/messages/:userId` - Get messages with user
- `POST /api/chat/messages` - Send message
- `POST /api/chat/typing/:userId` - Update typing status
- `GET /api/chat/typing/:userId` - Get typing status
- `GET /api/chat/messages/:userId/search` - Search messages

### Admin Management
- `GET /api/auth/users` - Get all users (admin only)
- `GET /api/auth/students` - Get all students
- `PUT /api/auth/admin/users/:id` - Update user (admin only)
- `DELETE /api/auth/admin/users/:id` - Delete user (admin only)

## 🎨 UI/UX Features

### Modern Design
- **Gradient Backgrounds** throughout the application
- **Card-based Layout** with subtle shadows
- **Responsive Design** for all screen sizes
- **Smooth Animations** using Framer Motion
- **Consistent Color Scheme** with Tailwind CSS

### Chat Interface
- **Modern Chat Bubbles** with rounded corners
- **Gradient Message Backgrounds** (blue for sent, gray for received)
- **Pop-in Animations** for new messages
- **Scrollable Message Area** with fixed height
- **Real-time Typing Indicators** with animated dots
- **Active Status Indicators** with colored dots
- **Search Functionality** for users and messages

### Navigation
- **Smart Back Buttons** that remember previous location
- **Breadcrumb Navigation** for complex flows
- **Floating Action Buttons** for quick access
- **Consistent Header Design** across all pages

## 🔧 Technical Implementation

### Real-time Features
- **Polling-based Updates** for messages and conversations
- **Typing Status Tracking** with timeouts
- **Active Status Monitoring** with last activity tracking
- **Message Persistence** with MongoDB storage
- **Unread Count Tracking** with real-time updates

### State Management
- **React Context API** for authentication state
- **Local State Management** for UI components
- **Optimistic Updates** for better UX
- **Error Handling** with user-friendly messages

### Security Implementation
- **JWT Token Validation** on all protected routes
- **Role-based Middleware** for route protection
- **Input Sanitization** and validation
- **CORS Configuration** for cross-origin requests
- **Rate Limiting** to prevent abuse

## 📈 Recent Updates (Latest Version)

### Chat System Enhancements
- ✅ **Multi-role Chat Support** - Reviewers can now chat with admins
- ✅ **Smart Back Navigation** - Back buttons remember previous location
- ✅ **User Search** - Search for users in conversation lists
- ✅ **Message Search** - Search within conversations
- ✅ **Message Persistence** - Fixed message disappearing issue
- ✅ **Floating Chat Button** - Added to student dashboard
- ✅ **Enhanced UI** - Modern chat bubbles with animations
- ✅ **Typing Indicators** - Real-time typing status
- ✅ **Active Status** - Online/offline indicators

### Backend Improvements
- ✅ **Reviewer Role Support** - Added reviewer role to chat system
- ✅ **Enhanced API Endpoints** - Better error handling and responses
- ✅ **Message Search API** - New endpoint for searching messages
- ✅ **Improved Authentication** - Better token validation

### Frontend Improvements
- ✅ **TypeScript Support** - Better type safety
- ✅ **Responsive Design** - Mobile-friendly interface
- ✅ **Loading States** - Better user feedback
- ✅ **Error Handling** - User-friendly error messages
- ✅ **Performance Optimization** - Reduced unnecessary re-renders

## 🐛 Bug Fixes

### Recent Fixes
- ✅ **Message Disappearing Issue** - Fixed in all chat interfaces
- ✅ **Backend Server Issues** - Proper server startup and port management
- ✅ **TypeScript Errors** - Fixed type mismatches in chat interfaces
- ✅ **Loading State Issues** - Proper loading state management
- ✅ **Navigation Issues** - Smart back navigation implementation

## 🚀 Deployment

### Production Setup
1. Set up MongoDB Atlas or local MongoDB
2. Configure environment variables
3. Build frontend: `npm run build`
4. Start backend server
5. Set up reverse proxy (nginx) if needed

### Environment Variables for Production
```env
NODE_ENV=production
MONGODB_URI=your_production_mongodb_uri
JWT_SECRET=your_secure_jwt_secret
EMAIL_USER=your_production_email
EMAIL_PASS=your_production_email_password
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 📞 Support

For support and questions, please use the chat system within the application or contact the development team.

---

**Last Updated:** July 20, 2025
**Version:** 2.0.0
**Status:** Production Ready ✅ 