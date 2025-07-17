const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config({ path: '../.env' });

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

// Function to verify admin email manually
async function verifyAdminEmail(adminEmail) {
  try {
    const user = await User.findOne({ email: adminEmail });
    if (!user) {
      console.log(`❌ No user found with email: ${adminEmail}`);
      return;
    }

    user.isEmailVerified = true;
    user.emailVerificationCode = null;
    user.emailVerificationExpires = null;
    await user.save();

    console.log(`✅ Successfully verified email for: ${adminEmail}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Name: ${user.name}`);
  } catch (error) {
    console.error('❌ Error verifying admin email:', error);
  }
}

// Function to verify all existing users' emails (for accounts created before email verification)
async function verifyAllExistingEmails() {
  try {
    const result = await User.updateMany(
      { isEmailVerified: false },
      { 
        $set: { 
          isEmailVerified: true,
          emailVerificationCode: null,
          emailVerificationExpires: null
        }
      }
    );

    console.log(`✅ Successfully verified ${result.modifiedCount} existing accounts`);
  } catch (error) {
    console.error('❌ Error verifying existing emails:', error);
  }
}

// Function to delete all users
async function deleteAllUsers() {
  try {
    const result = await User.deleteMany({});
    console.log(`🗑️  Successfully deleted ${result.deletedCount} users`);
  } catch (error) {
    console.error('❌ Error deleting users:', error);
  }
}

// Function to list all users
async function listAllUsers() {
  try {
    const users = await User.find({}).select('-password -twoFactorSecret -twoFactorBackupCodes');
    console.log('\n📋 Current Users:');
    console.log('================');
    
    if (users.length === 0) {
      console.log('No users found in database');
      return;
    }

    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.name} (${user.email})`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Email Verified: ${user.isEmailVerified ? '✅' : '❌'}`);
      console.log(`   Created: ${user.createdAt.toLocaleDateString()}`);
      console.log('---');
    });
  } catch (error) {
    console.error('❌ Error listing users:', error);
  }
}

// Function to create a new admin user
async function createAdminUser(name, email, password) {
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.log(`❌ User with email ${email} already exists`);
      return;
    }

    const adminUser = new User({
      name,
      email,
      password,
      role: 'admin',
      isEmailVerified: true
    });

    await adminUser.save();
    console.log(`✅ Successfully created admin user: ${email}`);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
  }
}

// Main function to handle command line arguments
async function main() {
  const command = process.argv[2];
  const email = process.argv[3];

  switch (command) {
    case 'verify-admin':
      if (!email) {
        console.log('❌ Please provide an email address');
        console.log('Usage: node manageUsers.js verify-admin <email>');
        return;
      }
      await verifyAdminEmail(email);
      break;

    case 'verify-all':
      await verifyAllExistingEmails();
      break;

    case 'delete-all':
      console.log('⚠️  This will delete ALL users from the database!');
      console.log('Type "YES" to confirm:');
      
      process.stdin.once('data', async (data) => {
        const input = data.toString().trim();
        if (input === 'YES') {
          await deleteAllUsers();
        } else {
          console.log('❌ Operation cancelled');
        }
        process.exit(0);
      });
      return;

    case 'list':
      await listAllUsers();
      break;

    case 'create-admin':
      const name = process.argv[3];
      const adminEmail = process.argv[4];
      const password = process.argv[5];
      
      if (!name || !adminEmail || !password) {
        console.log('❌ Please provide name, email, and password');
        console.log('Usage: node manageUsers.js create-admin <name> <email> <password>');
        return;
      }
      await createAdminUser(name, adminEmail, password);
      break;

    default:
      console.log('📖 Available commands:');
      console.log('======================');
      console.log('node manageUsers.js verify-admin <email>     - Verify specific admin email');
      console.log('node manageUsers.js verify-all               - Verify all existing emails');
      console.log('node manageUsers.js delete-all               - Delete all users (requires confirmation)');
      console.log('node manageUsers.js list                     - List all users');
      console.log('node manageUsers.js create-admin <name> <email> <password> - Create new admin user');
      console.log('\nExamples:');
      console.log('node manageUsers.js verify-admin admin@example.com');
      console.log('node manageUsers.js create-admin "Admin User" admin@example.com password123');
      break;
  }

  process.exit(0);
}

main().catch(console.error); 