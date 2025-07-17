# 🔐 Sign Auth - Full-Stack Authentication System

A comprehensive authentication system built with React frontend and Node.js backend, featuring advanced security mechanisms, admin panel, and user management capabilities.

## 🌟 Features

### 🔑 Authentication Features
- **Email/Password Registration & Login**
- **Email Verification System**
- **Password Reset via Email**
- **Google OAuth Integration**
- **JWT Token-based Authentication**
- **Remember Me Functionality**
- **Session Management**

### 🛡️ Security Features
- **Password Hashing** (bcrypt)
- **JWT Token Security**
- **Email Verification Required**
- **Rate Limiting Protection**
- **CORS Configuration**
- **Input Validation & Sanitization**

### 👨‍💼 Admin Panel Features
- **User Management Dashboard**
- **Real-time User Search** (Gmail-style search bar)
- **User Activity Logging**
- **User Blocking/Unblocking System**
- **Detailed User Profiles**
- **Activity Timeline with Device Info**

### 📊 User Activity Tracking
- **Login/Logout Tracking**
- **Account Creation Logs**
- **Password Reset Logs**
- **Device Information** (IP, User Agent)
- **Timestamp Tracking**
- **Activity History**

## 🏗️ Architecture

### Frontend (React + TypeScript)
```
client/
├── src/
│   ├── components/
│   │   ├── SignIn.tsx          # Login component
│   │   ├── SignUp.tsx          # Registration component
│   │   ├── Dashboard.tsx       # User dashboard
│   │   ├── AdminDashboard.tsx  # Admin panel
│   │   ├── AdminUserProfile.tsx # User profile view
│   │   └── ...
│   ├── contexts/
│   │   └── AuthContext.tsx     # Authentication context
│   └── App.tsx                 # Main app component
```

### Backend (Node.js + Express)
```
server/
├── models/
│   └── User.js                 # User model with activity tracking
├── routes/
│   └── auth.js                 # Authentication routes
├── config.env                  # Environment variables
└── index.js                    # Server entry point
```

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (local or cloud)
- npm or yarn

### Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd Sign Auth
```

2. **Install dependencies**
```bash
# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install
```3*Environment Setup**
```bash
# Copy and configure environment variables
cd ../server
cp config.env.example config.env
```

Edit `server/config.env`:
```env
PORT=5001ONGODB_URI=mongodb://localhost:27017/sign-auth
JWT_SECRET=your-super-secret-jwt-key
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

4. **Start the application**
```bash
# From the root directory
npm run dev
```

This will start both backend (port 51) and frontend (port 3000).

## 🔧 Configuration

### Email Configuration
The system uses Gmail SMTP for sending verification and reset emails:
- Configure `EMAIL_USER` and `EMAIL_PASS` in `config.env`
- Use Gmail App Passwords for security

### Google OAuth
1ate a Google Cloud Project2Enable Google+ API
3. Create OAuth 2credentials4uthorized redirect URIs5 Update `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`

### Database Configuration
- **Local MongoDB**: `mongodb://localhost:27017gn-auth`
- **MongoDB Atlas**: `mongodb+srv://username:password@cluster.mongodb.net/sign-auth`

## 📋 API Endpoints

### Authentication Routes
```
POST /api/auth/signup          # User registration
POST /api/auth/signin          # User login
POST /api/auth/verify-email    # Email verification
POST /api/auth/forgot-password # Password reset request
POST /api/auth/reset-password  # Password reset
POST /api/auth/signout         # User logout
GET  /api/auth/google          # Google OAuth
GET  /api/auth/google/callback # Google OAuth callback
```

### Admin Routes
```
GET  /api/auth/admin/users     # Get all users (admin only)
GET  /api/auth/admin/users/:id # Get specific user (admin only)
POST /api/auth/admin/users/:id/block    # Block user (admin only)
POST /api/auth/admin/users/:id/unblock  # Unblock user (admin only)
GET  /api/auth/admin/users/:id/activities # Get user activities (admin only)
```

## 🔍 Core Mechanisms

### 1. User Registration Flow
1. User submits registration form
2. Email validation and password strength check
3. Password hashing with bcrypt
4. User creation with verification token
5. Verification email sent
6. User must verify email before login

### 2. Email Verification System
- Unique verification tokens generated
- Tokens expire after 24 hours
- Email templates with verification links
- Automatic token cleanup

###3rd Reset Mechanism
- Secure token generation
- Email-based reset links
- Token expiration (1 Password strength validation

### 4. JWT Authentication
- Access tokens (15 minutes)
- Refresh tokens (7ays)
- Remember me tokens (30 days)
- Secure token storage

### 5. Activity Logging System
- Automatic logging of user actions
- Device information capture
- IP address tracking
- Timestamp recording
- Activity categorization

### 6. Admin User Management
- Real-time user search with debouncing
- User blocking/unblocking with reasons
- Detailed user profiles
- Activity timeline visualization
- Admin-only access protection

### 7. Security Measures
- Password hashing with salt rounds
- JWT token validation
- Rate limiting on auth endpoints
- Input sanitization
- CORS protection
- Secure headers

## 🎨 UI/UX Features

### Responsive Design
- Mobile-first approach
- Modern, clean interface
- Smooth transitions
- Loading states
- Error handling

### Admin Dashboard
- Real-time search functionality
- Clickable user rows
- Modal dialogs for actions
- Activity timeline with icons
- Color-coded activity types

### User Experience
- Form validation
- Success/error notifications
- Loading indicators
- Auto-redirect after actions
- Persistent login state

## 📊 Database Schema

### User Model
```javascript
  email: String (unique, required),
  password: String (hashed, required),
  name: String (required),
  isVerified: Boolean (default: false),
  verificationToken: String,
  resetToken: String,
  resetTokenExpiry: Date,
  role: String (default: user'),
  isBlocked: Boolean (default: false),
  blockReason: String,
  blockedBy: ObjectId,
  blockedAt: Date,
  activities: [
    {
      type: String,
      description: String,
      ip: String,
      userAgent: String,
      timestamp: Date
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

## 🔒 Security Considerations

### Production Deployment
- Use HTTPS
- Secure environment variables
- Database connection security
- Rate limiting
- Input validation
- CORS configuration
- Security headers

### Data Protection
- Password hashing
- JWT token security
- Email verification
- Activity logging
- User blocking system

## 🚀 Deployment

### Local Development
```bash
npm run dev
```

### Production Build
```bash
# Frontend
cd client
npm run build

# Backend
cd server
npm start
```

### Cloud Deployment Options
- **Heroku**: Easy deployment with Git integration
- **Railway**: Modern platform with automatic scaling
- **DigitalOcean**: VPS with full control
- **AWS**: Enterprise-grade infrastructure

### Database Options
- **MongoDB Atlas**: Cloud database with free tier
- **Local MongoDB**: For development
- **Self-hosted**: For full control

## 📝 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port | No (default: 51) |
| `MONGODB_URI` | MongoDB connection string | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `EMAIL_USER` | Gmail address | Yes |
| `EMAIL_PASS` | Gmail app password | Yes |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | No |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | No |
| `NODE_ENV` | Environment (development/production) | No |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the code comments

## 🔄 Recent Updates

- ✅ Removed2 functionality for simplicity
- ✅ Enhanced admin panel with user blocking
- ✅ Added comprehensive activity logging
- ✅ Improved UI/UX with better search
- ✅ Added detailed user profiles
- ✅ Implemented debounced search
- ✅ Removed animations for better performance

---

**Built with ❤️ using React, Node.js, and MongoDB** 