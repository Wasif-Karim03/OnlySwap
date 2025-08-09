# Clean Authentication System

A simplified authentication system with sign-in and sign-up functionality, built with React, Node.js, and MongoDB.

## Features

- ✅ User registration with email verification
- ✅ User login with JWT authentication
- ✅ Password strength validation
- ✅ Email verification system
- ✅ Password reset functionality
- ✅ Protected routes
- ✅ Responsive design with Tailwind CSS
- ✅ Modern animations with Framer Motion

## Project Structure

```
Clean-Auth-Project/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── contexts/       # React contexts
│   │   ├── App.tsx         # Main app component
│   │   └── index.tsx       # Entry point
│   └── package.json
├── server/                 # Node.js backend
│   ├── routes/             # API routes
│   ├── models/             # Database models
│   ├── config.env          # Environment variables
│   └── index.js            # Server entry point
└── package.json
```

## Quick Start

1. **Install dependencies:**
   ```bash
   npm run install-all
   ```

2. **Set up environment variables:**
   - Copy `server/config.env` and update with your values
   - Update email configuration for verification emails

3. **Start the development servers:**
   ```bash
   npm run dev
   ```

4. **Access the application:**
   - Frontend: http://localhost:3000
   - Backend: http://localhost:5001

## API Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/signin` - User login
- `POST /api/auth/verify-email` - Email verification
- `POST /api/auth/resend-verification` - Resend verification email
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password
- `GET /api/auth/profile` - Get user profile (protected)

## Environment Variables

Create a `server/config.env` file:

```env
PORT=5001
MONGODB_URI=mongodb://localhost:27017/clean-auth
JWT_SECRET=your-super-secret-jwt-key
JWT_REMEMBER_ME_SECRET=your-remember-me-secret-key
JWT_REMEMBER_ME_EXPIRES_IN=30d
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

## Technologies Used

- **Frontend:** React, TypeScript, Tailwind CSS, Framer Motion
- **Backend:** Node.js, Express, MongoDB, Mongoose
- **Authentication:** JWT, bcryptjs
- **Email:** Nodemailer
- **Validation:** express-validator

## Customization

This is a clean foundation that you can build upon:

1. **Add more user fields** in `server/models/User.js`
2. **Create new components** in `client/src/components/`
3. **Add new API routes** in `server/routes/`
4. **Customize styling** in `client/src/index.css`

## License

MIT 