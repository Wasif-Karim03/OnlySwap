# Sign Auth - Modern Authentication System

A beautiful, modern authentication system built with React, Node.js, and MongoDB. Features smooth animations, responsive design, and secure authentication.

## 🚀 Features

- **Modern UI/UX**: Clean, minimalistic design with smooth animations
- **Secure Authentication**: JWT-based authentication with password hashing
- **Responsive Design**: Works perfectly on all devices
- **TypeScript**: Full type safety for better development experience
- **Real-time Validation**: Form validation with error handling
- **Protected Routes**: Secure dashboard access
- **Persistent Sessions**: Automatic login state management

## 🛠️ Tech Stack

### Frontend
- React 18 with TypeScript
- Tailwind CSS for styling
- Framer Motion for animations
- React Router for navigation
- Axios for API calls

### Backend
- Node.js with Express
- MongoDB with Mongoose
- JWT for authentication
- bcryptjs for password hashing
- Express Validator for input validation

## 📦 Installation

### Prerequisites
- Node.js (v16 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd sign-auth
   ```

2. **Install all dependencies**
   ```bash
   npm run install-all
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the `server` directory:
   ```env
       PORT=5001
   MONGODB_URI=mongodb://localhost:27017/sign-auth
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   NODE_ENV=development
   ```

4. **Start MongoDB**
   
   Make sure MongoDB is running on your system. If you're using a cloud MongoDB instance, update the `MONGODB_URI` in the config file.

5. **Run the application**
   ```bash
   npm run dev
   ```

       This will start both the backend server (port 5001) and frontend development server (port 3000).

## 🎯 Usage

1. **Sign Up**: Visit `http://localhost:3000/signup` to create a new account
2. **Sign In**: Visit `http://localhost:3000` to sign in with existing credentials
3. **Dashboard**: After authentication, you'll be redirected to the protected dashboard

## 📁 Project Structure

```
sign-auth/
├── client/                 # React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── contexts/       # React contexts
│   │   ├── App.tsx
│   │   └── index.tsx
│   ├── package.json
│   └── tailwind.config.js
├── server/                 # Node.js backend
│   ├── models/            # Mongoose models
│   ├── routes/            # Express routes
│   ├── index.js           # Server entry point
│   ├── config.env         # Environment variables
│   └── package.json
├── package.json           # Root package.json
└── README.md
```

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/signup` - Create a new account
- `POST /api/auth/signin` - Sign in to existing account
- `GET /api/auth/profile` - Get user profile (protected)

### Health Check
- `GET /api/health` - Server health status

## 🎨 Design Features

- **Gradient Backgrounds**: Beautiful blue gradient backgrounds
- **Smooth Animations**: Framer Motion powered transitions
- **Card-based Layout**: Clean card components with shadows
- **Responsive Forms**: Mobile-friendly input fields
- **Loading States**: Animated loading spinners
- **Error Handling**: User-friendly error messages

## 🔒 Security Features

- **Password Hashing**: bcryptjs with salt rounds
- **JWT Tokens**: Secure token-based authentication
- **Input Validation**: Server-side validation with express-validator
- **CORS Protection**: Cross-origin resource sharing configuration
- **Environment Variables**: Secure configuration management

## 🚀 Deployment

### Backend Deployment
1. Set up a MongoDB database (MongoDB Atlas recommended)
2. Update environment variables with production values
3. Deploy to your preferred hosting service (Heroku, Vercel, etc.)

### Frontend Deployment
1. Build the production version: `npm run build`
2. Deploy the `build` folder to your hosting service

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License.

## 🆘 Support

If you encounter any issues or have questions, please open an issue on GitHub.

---

**Happy Coding! 🎉** 