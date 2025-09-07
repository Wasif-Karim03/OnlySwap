# OnlySwap - Student Marketplace Platform

🌱 **A modern, sustainable marketplace platform designed exclusively for students to swap, trade, and exchange items while building a community and reducing waste.**

## 📍 Repository Information

**GitHub Repository:** [https://github.com/Wasif-Karim03/OnlySwap](https://github.com/Wasif-Karim03/OnlySwap)

This repository contains the complete source code for the OnlySwap platform, including all components, utilities, and configuration files.

## 🚀 Features

### Core Functionality
- **Student Authentication** - Secure sign-up and sign-in with university verification
- **Interactive Marketplace** - Browse, search, and filter products with real-time updates
- **Product Management** - List, edit, and manage your items with image uploads
- **Real-time Chat** - Built-in messaging system for buyer-seller communication
- **Saved Items** - Bookmark and track items you're interested in
- **Responsive Design** - Mobile-first approach with seamless cross-device experience

### Technical Features
- **Modern React + Vite** - Fast development with hot module replacement
- **Context Management** - Efficient state management with React Context
- **Protected Routes** - Secure navigation with authentication guards
- **Local Data Persistence** - Data stored locally with localStorage integration
- **Clean UI/UX** - Minimalist design with green color scheme
- **Component Architecture** - Reusable and maintainable code structure

## 🛠️ Tech Stack

- **Frontend:** React 18, Vite, JavaScript (ES6+)
- **Styling:** CSS3 with custom animations and responsive design
- **State Management:** React Context API
- **Routing:** React Router DOM
- **Icons:** Lucide React
- **Development:** ESLint, Hot Module Replacement

## 📁 Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── Navbar.jsx      # Navigation component
│   └── ProtectedRoute.jsx
├── contexts/           # React Context providers
│   ├── AuthContext.jsx # Authentication state
│   └── ChatContext.jsx # Chat functionality
├── hooks/              # Custom React hooks
│   ├── useAuth.js
│   └── useChat.js
├── pages/              # Main application pages
│   ├── Home.jsx        # Landing page
│   ├── SignIn.jsx      # Authentication
│   ├── SignUp.jsx
│   ├── Marketplace.jsx # Product browsing
│   ├── Chat.jsx        # Messaging
│   └── Saved.jsx       # Bookmarked items
├── utils/              # Utility functions
│   ├── dataManager.js  # Data persistence
│   ├── productManager.js
│   └── userManager.js
└── App.jsx             # Main application component
```

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Wasif-Karim03/OnlySwap.git
   cd OnlySwap
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Navigate to `http://localhost:5173` (or the port shown in terminal)

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## 🎨 Design Philosophy

OnlySwap follows a clean, minimalist design approach with:
- **Green Color Scheme** - Representing sustainability and growth
- **Mobile-First Design** - Optimized for all device sizes
- **Intuitive Navigation** - Easy-to-use interface for students
- **Accessibility** - Inclusive design principles

## 🔧 Development

### Key Components
- **Home Page** - Animated landing page with laptop mockup
- **Authentication** - Secure user registration and login
- **Marketplace** - Product grid with search and filtering
- **Chat System** - Real-time messaging between users
- **User Dashboard** - Profile and product management

### Data Management
- Local storage for user data and products
- Context providers for global state
- Utility functions for data persistence
- Real-time updates and synchronization

## 📱 Responsive Design

The application is fully responsive and optimized for:
- Mobile devices (320px+)
- Tablets (768px+)
- Desktop (1024px+)
- Large screens (1440px+)

## 🌟 Future Enhancements

- Backend integration with database
- Real-time notifications
- Payment processing
- Advanced search and recommendations
- Mobile app development
- Admin dashboard improvements

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Contact

For questions or support, please contact the development team or create an issue in this repository.

---

**Repository:** [https://github.com/Wasif-Karim03/OnlySwap](https://github.com/Wasif-Karim03/OnlySwap)

*Built with ❤️ for the student community*
