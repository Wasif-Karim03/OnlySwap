import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../contexts/AuthContext';
import EmailVerification from './EmailVerification';

// US Universities data - Comprehensive list
const US_UNIVERSITIES = [
  // Major Public Universities
  "Arizona State University",
  "Boston University",
  "Brown University",
  "California Institute of Technology (Caltech)",
  "Carnegie Mellon University",
  "Columbia University",
  "Cornell University",
  "Dartmouth College",
  "Duke University",
  "Emory University",
  "Georgetown University",
  "Georgia Institute of Technology",
  "Harvard University",
  "Indiana University Bloomington",
  "Johns Hopkins University",
  "Massachusetts Institute of Technology (MIT)",
  "Michigan State University",
  "New York University (NYU)",
  "North Carolina State University",
  "Northwestern University",
  "Ohio State University",
  "Pennsylvania State University",
  "Princeton University",
  "Purdue University",
  "Rice University",
  "Stanford University",
  "Texas A&M University",
  "University of Arizona",
  "University of California, Berkeley",
  "University of California, Davis",
  "University of California, Irvine",
  "University of California, Los Angeles (UCLA)",
  "University of California, San Diego",
  "University of California, Santa Barbara",
  "University of Chicago",
  "University of Colorado Boulder",
  "University of Florida",
  "University of Georgia",
  "University of Illinois at Urbana-Champaign",
  "University of Maryland",
  "University of Michigan",
  "University of Minnesota",
  "University of North Carolina at Chapel Hill",
  "University of Notre Dame",
  "University of Pennsylvania",
  "University of Pittsburgh",
  "University of Southern California (USC)",
  "University of Texas at Austin",
  "University of Virginia",
  "University of Washington",
  "University of Wisconsin-Madison",
  "Vanderbilt University",
  "Virginia Tech",
  "Washington University in St. Louis",
  "Yale University",
  
  // Additional Major Universities
  "American University",
  "Baylor University",
  "Boston College",
  "Brandeis University",
  "Case Western Reserve University",
  "Clemson University",
  "Colorado State University",
  "Drexel University",
  "Florida State University",
  "George Washington University",
  "Howard University",
  "Iowa State University",
  "Kansas State University",
  "Lehigh University",
  "Loyola University Chicago",
  "Marquette University",
  "Miami University",
  "Michigan Technological University",
  "Mississippi State University",
  "Missouri University of Science and Technology",
  "Montana State University",
  "Northeastern University",
  "Northern Arizona University",
  "Ohio University",
  "Oklahoma State University",
  "Oregon State University",
  "Rensselaer Polytechnic Institute",
  "Rutgers University",
  "San Diego State University",
  "San Jose State University",
  "Southern Methodist University",
  "Syracuse University",
  "Temple University",
  "Texas Tech University",
  "Tufts University",
  "Tulane University",
  "University of Alabama",
  "University of Alaska Fairbanks",
  "University of Arkansas",
  "University of California, Riverside",
  "University of California, Santa Cruz",
  "University of Central Florida",
  "University of Cincinnati",
  "University of Connecticut",
  "University of Delaware",
  "University of Hawaii at Manoa",
  "University of Houston",
  "University of Idaho",
  "University of Iowa",
  "University of Kansas",
  "University of Kentucky",
  "University of Louisville",
  "University of Maine",
  "University of Massachusetts Amherst",
  "University of Memphis",
  "University of Miami",
  "University of Mississippi",
  "University of Missouri",
  "University of Montana",
  "University of Nebraska-Lincoln",
  "University of Nevada, Las Vegas",
  "University of New Hampshire",
  "University of New Mexico",
  "University of North Dakota",
  "University of Oklahoma",
  "University of Oregon",
  "University of Rhode Island",
  "University of South Carolina",
  "University of South Florida",
  "University of Tennessee",
  "University of Utah",
  "University of Vermont",
  "University of Wyoming",
  "Utah State University",
  "Villanova University",
  "Wake Forest University",
  "West Virginia University",
  "Wichita State University",
  "Worcester Polytechnic Institute",
  
  // Liberal Arts Colleges
  "Amherst College",
  "Bard College",
  "Barnard College",
  "Bates College",
  "Beloit College",
  "Bennington College",
  "Bowdoin College",
  "Bryn Mawr College",
  "Bucknell University",
  "Carleton College",
  "Centre College",
  "Claremont McKenna College",
  "Colby College",
  "Colgate University",
  "College of the Holy Cross",
  "Colorado College",
  "Connecticut College",
  "Davidson College",
  "Denison University",
  "DePauw University",
  "Dickinson College",
  "Earlham College",
  "Franklin and Marshall College",
  "Furman University",
  "Gettysburg College",
  "Grinnell College",
  "Hamilton College",
  "Hampshire College",
  "Harvey Mudd College",
  "Haverford College",
  "Hendrix College",
  "Hobart and William Smith Colleges",
  "Kalamazoo College",
  "Kenyon College",
  "Knox College",
  "Lafayette College",
  "Lake Forest College",
  "Lawrence University",
  "Lewis & Clark College",
  "Macalester College",
  "Middlebury College",
  "Millsaps College",
  "Mount Holyoke College",
  "Muhlenberg College",
  "Oberlin College",
  "Occidental College",
  "Ohio Wesleyan University",
  "Pitzer College",
  "Pomona College",
  "Reed College",
  "Rhodes College",
  "Ripon College",
  "Scripps College",
  "Sewanee: The University of the South",
  "Skidmore College",
  "Smith College",
  "St. Lawrence University",
  "St. Olaf College",
  "Swarthmore College",
  "Trinity College",
  "Union College",
  "University of Puget Sound",
  "Vassar College",
  "Wabash College",
  "Wellesley College",
  "Wesleyan University",
  "Wheaton College (IL)",
  "Whitman College",
  "Williams College",
  "Wofford College",
  
  // Religious and Specialized Institutions
  "Baylor University",
  "Brigham Young University",
  "Catholic University of America",
  "Creighton University",
  "DePaul University",
  "Duquesne University",
  "Fordham University",
  "Georgetown University",
  "Gonzaga University",
  "Loyola Marymount University",
  "Loyola University New Orleans",
  "Marquette University",
  "Notre Dame University",
  "Pepperdine University",
  "Saint Louis University",
  "Santa Clara University",
  "Seattle University",
  "Seton Hall University",
  "St. John's University",
  "University of Dayton",
  "University of San Diego",
  "University of San Francisco",
  "Villanova University",
  "Xavier University",
  
  // Technical and Specialized Schools
  "Art Center College of Design",
  "Berklee College of Music",
  "California Institute of the Arts",
  "Cooper Union",
  "Fashion Institute of Technology",
  "Juilliard School",
  "Massachusetts College of Art and Design",
  "Parsons School of Design",
  "Pratt Institute",
  "Rhode Island School of Design",
  "School of the Art Institute of Chicago",
  "Savannah College of Art and Design",
  "The New School",
  
  // Additional State Universities
  "Auburn University",
  "Boise State University",
  "California State University, Fullerton",
  "California State University, Long Beach",
  "California State University, Northridge",
  "Central Michigan University",
  "Eastern Michigan University",
  "Florida Atlantic University",
  "Florida International University",
  "Georgia State University",
  "Grand Valley State University",
  "Illinois State University",
  "Indiana State University",
  "James Madison University",
  "Kent State University",
  "Louisiana State University",
  "Marshall University",
  "Missouri State University",
  "Montclair State University",
  "New Mexico State University",
  "Northern Illinois University",
  "Northern Kentucky University",
  "Oakland University",
  "Old Dominion University",
  "Portland State University",
  "San Francisco State University",
  "Southern Illinois University",
  "Tennessee State University",
  "Texas State University",
  "Towson University",
  "University of Alabama at Birmingham",
  "University of Central Arkansas",
  "University of Louisiana at Lafayette",
  "University of North Carolina at Charlotte",
  "University of North Carolina at Greensboro",
  "University of South Alabama",
  "University of Southern Mississippi",
  "University of Toledo",
  "University of Wisconsin-Milwaukee",
  "Western Michigan University",
  "Wright State University",
  "Youngstown State University"
];

interface PasswordStrength {
  score: number;
  feedback: string[];
  isValid: boolean;
}

const SignUp: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [university, setUniversity] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showVerification, setShowVerification] = useState(false);
  const [showUniversityDropdown, setShowUniversityDropdown] = useState(false);
  const [universitySearch, setUniversitySearch] = useState('');
  const { signUp } = useAuth();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowUniversityDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const validatePassword = (password: string): PasswordStrength => {
    const feedback: string[] = [];
    let score = 0;

    // Check minimum length (8 characters)
    if (password.length >= 8) {
      score += 20;
    } else {
      feedback.push('At least 8 characters');
    }

    // Check for capital letter
    if (/[A-Z]/.test(password)) {
      score += 20;
    } else {
      feedback.push('At least one capital letter');
    }

    // Check for lowercase letter
    if (/[a-z]/.test(password)) {
      score += 20;
    } else {
      feedback.push('At least one lowercase letter');
    }

    // Check for number
    if (/\d/.test(password)) {
      score += 20;
    } else {
      feedback.push('At least one number');
    }

    // Check for special character
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      score += 20;
    } else {
      feedback.push('At least one special character (!@#$%^&*)');
    }

    return {
      score,
      feedback,
      isValid: score === 100
    };
  };

  const getPasswordStrengthColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getPasswordStrengthText = (score: number) => {
    if (score >= 80) return 'Strong';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Weak';
  };

  const getPasswordStrengthBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-yellow-100';
    if (score >= 40) return 'bg-orange-100';
    return 'bg-red-100';
  };

  const passwordStrength = validatePassword(password);

  // Filter universities based on search
  const filteredUniversities = US_UNIVERSITIES.filter(uni =>
    uni.toLowerCase().includes(universitySearch.toLowerCase())
  );

  const handleUniversitySelect = (selectedUniversity: string) => {
    setUniversity(selectedUniversity);
    setUniversitySearch(selectedUniversity);
    setShowUniversityDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Check if email is a .edu email
    if (!email.toLowerCase().endsWith('.edu')) {
      setError('Please use a valid .edu email address');
      setLoading(false);
      return;
    }

    if (!university) {
      setError('Please select your university');
      setLoading(false);
      return;
    }

    if (!passwordStrength.isValid) {
      setError('Please meet all password requirements');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      await signUp(name, email, password, university);
      setShowVerification(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (showVerification) {
    return (
      <EmailVerification 
        email={email} 
        onBack={() => setShowVerification(false)} 
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8" style={{ backgroundColor: '#FAFAF8' }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md mx-auto text-center"
      >
        {/* Brand Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-2"
        >
          <img 
            src="/pictures/logo.png"
            alt="OnlySwap Logo"
            className="h-72 mx-auto"
            style={{ height: '288px', width: 'auto' }}
          />
        </motion.div>

        {/* Main Heading */}
        <motion.h2
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-2xl font-bold mb-1"
          style={{ color: '#046C4E', fontFamily: 'Inter' }}
        >
          Create Account
        </motion.h2>

        {/* Sub-heading */}
        <motion.p
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-base mb-4"
          style={{ color: '#046C4E', fontFamily: 'Inter' }}
        >
          Join us today
        </motion.p>

          <motion.form
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            onSubmit={handleSubmit}
            className="space-y-6"
          >
            {/* Full Name Input */}
            <div>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Full Name"
                required
                autoComplete="off"
                data-form-type="other"
                style={{ fontFamily: 'Inter' }}
              />
            </div>

            {/* Email Input */}
            <div>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent ${
                  email && !email.toLowerCase().endsWith('.edu') 
                    ? 'border-red-300 focus:ring-red-500' 
                    : 'border-gray-300'
                }`}
                placeholder="Your .edu email address"
                required
                autoComplete="off"
                data-form-type="other"
                style={{ fontFamily: 'Inter' }}
              />
              {email && !email.toLowerCase().endsWith('.edu') && (
                <p className="mt-1 text-sm text-red-600" style={{ fontFamily: 'Inter' }}>
                  Please use a valid .edu email address
                </p>
              )}
            </div>

            {/* University Selection */}
            <div className="relative" ref={dropdownRef}>
              <input
                type="text"
                id="university"
                value={universitySearch}
                onChange={(e) => {
                  setUniversitySearch(e.target.value);
                  setShowUniversityDropdown(true);
                }}
                onFocus={() => setShowUniversityDropdown(true)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Select your university"
                required
                autoComplete="off"
                data-form-type="other"
                style={{ fontFamily: 'Inter' }}
              />
              
              {showUniversityDropdown && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                >
                  {filteredUniversities.length > 0 ? (
                    filteredUniversities.map((uni, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleUniversitySelect(uni)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                        style={{ fontFamily: 'Inter' }}
                      >
                        {uni}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-gray-500" style={{ fontFamily: 'Inter' }}>
                      No universities found
                    </div>
                  )}
                </motion.div>
              )}
            </div>

            {/* Password Input */}
            <div>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Password"
                required
                autoComplete="new-password"
                data-form-type="other"
                style={{ fontFamily: 'Inter' }}
              />
              
              {/* Password Strength Indicator */}
              {password && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm" style={{ color: '#666666', fontFamily: 'Inter' }}>
                      Password Strength:
                    </span>
                    <span 
                      className={`px-2 py-1 rounded text-xs font-medium ${getPasswordStrengthBgColor(passwordStrength.score)}`}
                      style={{ 
                        color: passwordStrength.score >= 80 ? '#059669' : 
                               passwordStrength.score >= 60 ? '#D97706' : 
                               passwordStrength.score >= 40 ? '#EA580C' : '#DC2626',
                        fontFamily: 'Inter'
                      }}
                    >
                      {getPasswordStrengthText(passwordStrength.score)}
                    </span>
                  </div>
                  
                  {/* Strength Bar */}
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${getPasswordStrengthColor(passwordStrength.score)}`}
                      style={{ width: `${passwordStrength.score}%` }}
                    />
                  </div>
                  
                  {/* Requirements List */}
                  {passwordStrength.feedback.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs mb-1" style={{ color: '#666666', fontFamily: 'Inter' }}>
                        Requirements:
                      </p>
                      <ul className="text-xs space-y-1">
                        {passwordStrength.feedback.map((feedback, index) => (
                          <li key={index} className="flex items-center">
                            <span className="text-red-500 mr-2">•</span>
                            <span style={{ color: '#666666', fontFamily: 'Inter' }}>{feedback}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {/* Success Message */}
                  {passwordStrength.isValid && (
                    <div className="mt-2">
                      <p className="text-xs flex items-center" style={{ color: '#059669', fontFamily: 'Inter' }}>
                        <span className="mr-2">✓</span>
                        Password meets all requirements
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Confirm Password Input */}
            <div>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                placeholder="Confirm Password"
                required
                autoComplete="new-password"
                data-form-type="other"
                style={{ fontFamily: 'Inter' }}
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-600 text-sm text-center bg-red-50 p-3 rounded-lg"
                style={{ fontFamily: 'Inter' }}
              >
                {error}
              </motion.div>
            )}

            {/* Create Account Button */}
            <button
              type="submit"
              disabled={loading || !passwordStrength.isValid || password !== confirmPassword || !university || !email.toLowerCase().endsWith('.edu')}
              className="w-full py-3 px-4 rounded-lg font-semibold transition-colors"
              style={{ 
                backgroundColor: '#046C4E', 
                color: 'white', 
                fontFamily: 'Inter',
                opacity: (loading || !passwordStrength.isValid || password !== confirmPassword || !university || !email.toLowerCase().endsWith('.edu')) ? 0.7 : 1
              }}
            >
              {loading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full mx-auto"
                />
              ) : (
                'Create Account'
              )}
            </button>
          </motion.form>

          {/* Sign In Link */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-8 text-center space-y-2"
          >
            <p style={{ color: '#046C4E', fontFamily: 'Inter' }}>
              Already have an account?
            </p>
            <Link 
              to="/signin" 
              className="block"
              style={{ color: '#046C4E', fontFamily: 'Inter', textDecoration: 'underline' }}
            >
              Sign in here
            </Link>
          </motion.div>
        </motion.div>
      </div>
  );
};

export default SignUp; 