const mongoose = require('mongoose');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sign-auth', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));
db.once('open', () => {
  console.log('Connected to MongoDB');
});

// Function to generate student IDs for existing students
async function generateStudentIds() {
  try {
    console.log('Generating student IDs for existing students...');
    
    const students = await User.find({ role: 'user' });
    let updatedCount = 0;
    
    for (const student of students) {
      if (!student.studentId) {
        const year = new Date().getFullYear();
        const count = await User.countDocuments({ role: 'user', studentId: { $exists: true } });
        student.studentId = `STU${year}${String(count + 1).padStart(6, '0')}`;
        await student.save();
        updatedCount++;
        console.log(`Generated ID ${student.studentId} for ${student.email}`);
      }
    }
    
    console.log(`Updated ${updatedCount} students with new IDs`);
  } catch (error) {
    console.error('Error generating student IDs:', error);
  }
}

// Function to export student data to JSON
async function exportStudentData() {
  try {
    console.log('Exporting student data...');
    
    const students = await User.find({ role: 'user' }).select('-password -emailVerificationCode -resetPasswordCode');
    
    const exportData = {
      exportDate: new Date().toISOString(),
      totalStudents: students.length,
      completedOnboarding: students.filter(s => s.isOnboardingCompleted).length,
      pendingOnboarding: students.filter(s => !s.isOnboardingCompleted).length,
      students: students.map(student => ({
        studentId: student.studentId,
        name: student.name,
        email: student.email,
        firstName: student.firstName,
        lastName: student.lastName,
        phone: student.phone,
        dob: student.dob,
        country: student.country,
        stateCity: student.stateCity,
        gender: student.gender,
        isOnboardingCompleted: student.isOnboardingCompleted,
        onboardingCompletedAt: student.onboardingCompletedAt,
        createdAt: student.createdAt,
        // Education
        highSchool: student.highSchool,
        gradYear: student.gradYear,
        classSize: student.classSize,
        classRankReport: student.classRankReport,
        gpaScale: student.gpaScale,
        cumulativeGpa: student.cumulativeGpa,
        gpaWeighted: student.gpaWeighted,
        // Languages
        languages: student.languages || [],
        // Activity
        lastLogin: student.lastLogin,
        isActive: student.isActive,
        isBlocked: student.isBlocked
      }))
    };
    
    const filename = `student-data-${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(__dirname, '..', 'exports', filename);
    
    // Create exports directory if it doesn't exist
    const exportsDir = path.dirname(filepath);
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }
    
    fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));
    console.log(`Student data exported to: ${filepath}`);
    console.log(`Total students: ${exportData.totalStudents}`);
    console.log(`Completed onboarding: ${exportData.completedOnboarding}`);
    console.log(`Pending onboarding: ${exportData.pendingOnboarding}`);
    
  } catch (error) {
    console.error('Error exporting student data:', error);
  }
}

// Function to get student statistics
async function getStudentStats() {
  try {
    console.log('Getting student statistics...');
    
    const totalStudents = await User.countDocuments({ role: 'user' });
    const completedOnboarding = await User.countDocuments({ 
      role: 'user', 
      isOnboardingCompleted: true 
    });
    const pendingOnboarding = totalStudents - completedOnboarding;
    
    // Country distribution
    const countryStats = await User.aggregate([
      { $match: { role: 'user' } },
      { $group: { _id: '$country', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // Language distribution
    const languageStats = await User.aggregate([
      { $match: { role: 'user', languages: { $exists: true, $ne: [] } } },
      { $unwind: '$languages' },
      { $group: { _id: '$languages.language', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    // GPA distribution
    const gpaStats = await User.aggregate([
      { $match: { role: 'user', cumulativeGpa: { $exists: true, $ne: null } } },
      { $group: { 
        _id: null, 
        avgGPA: { $avg: { $toDouble: '$cumulativeGpa' } },
        minGPA: { $min: { $toDouble: '$cumulativeGpa' } },
        maxGPA: { $max: { $toDouble: '$cumulativeGpa' } }
      }}
    ]);
    
    console.log('\n=== STUDENT STATISTICS ===');
    console.log(`Total Students: ${totalStudents}`);
    console.log(`Completed Onboarding: ${completedOnboarding} (${((completedOnboarding/totalStudents)*100).toFixed(1)}%)`);
    console.log(`Pending Onboarding: ${pendingOnboarding} (${((pendingOnboarding/totalStudents)*100).toFixed(1)}%)`);
    
    if (gpaStats.length > 0) {
      console.log(`\nGPA Statistics:`);
      console.log(`Average GPA: ${gpaStats[0].avgGPA.toFixed(2)}`);
      console.log(`Min GPA: ${gpaStats[0].minGPA}`);
      console.log(`Max GPA: ${gpaStats[0].maxGPA}`);
    }
    
    console.log(`\nTop Countries:`);
    countryStats.slice(0, 5).forEach(country => {
      console.log(`  ${country._id || 'Not specified'}: ${country.count} students`);
    });
    
    console.log(`\nTop Languages:`);
    languageStats.slice(0, 5).forEach(lang => {
      console.log(`  ${lang._id}: ${lang.count} students`);
    });
    
  } catch (error) {
    console.error('Error getting student statistics:', error);
  }
}

// Function to find students by criteria
async function findStudents(criteria) {
  try {
    console.log(`Finding students with criteria:`, criteria);
    
    const query = { role: 'user' };
    
    if (criteria.country) {
      query.country = criteria.country;
    }
    
    if (criteria.language) {
      query['languages.language'] = criteria.language;
    }
    
    if (criteria.onboardingStatus === 'completed') {
      query.isOnboardingCompleted = true;
    } else if (criteria.onboardingStatus === 'pending') {
      query.isOnboardingCompleted = false;
    }
    
    if (criteria.minGPA) {
      query.cumulativeGpa = { $gte: criteria.minGPA };
    }
    
    const students = await User.find(query).select('studentId firstName lastName email country languages cumulativeGpa isOnboardingCompleted');
    
    console.log(`Found ${students.length} students:`);
    students.forEach(student => {
      console.log(`  ${student.studentId}: ${student.firstName} ${student.lastName} (${student.email})`);
      console.log(`    Country: ${student.country}, GPA: ${student.cumulativeGpa}, Onboarding: ${student.isOnboardingCompleted ? 'Completed' : 'Pending'}`);
    });
    
  } catch (error) {
    console.error('Error finding students:', error);
  }
}

// Main function to run commands
async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'generate-ids':
      await generateStudentIds();
      break;
    case 'export':
      await exportStudentData();
      break;
    case 'stats':
      await getStudentStats();
      break;
    case 'find':
      const criteria = {
        country: process.argv[3],
        language: process.argv[4],
        onboardingStatus: process.argv[5],
        minGPA: process.argv[6]
      };
      await findStudents(criteria);
      break;
    default:
      console.log('Available commands:');
      console.log('  node manageStudents.js generate-ids  - Generate student IDs for existing students');
      console.log('  node manageStudents.js export        - Export all student data to JSON');
      console.log('  node manageStudents.js stats         - Show student statistics');
      console.log('  node manageStudents.js find [country] [language] [status] [minGPA] - Find students by criteria');
      console.log('');
      console.log('Examples:');
      console.log('  node manageStudents.js find "United States"');
      console.log('  node manageStudents.js find "" "English" "completed"');
      console.log('  node manageStudents.js find "" "" "pending" "3.5"');
  }
  
  mongoose.connection.close();
}

main().catch(console.error); 