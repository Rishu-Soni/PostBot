import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

import User from './src/models/User.js';
import DailyEntry from './src/models/DailyEntry.js';
import {
  publishEntry,
  LinkedInPublishError,
} from './src/services/linkedinPublisher.js';
import { LinkedInReauthRequiredError } from './src/services/linkedinAuth.js';

async function main() {
  console.log('====================================================');
  console.log(' LinkedIn PostBot Manual Publishing Test Runner');
  console.log('====================================================\n');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/postbot';
  console.log(`Connecting to MongoDB at: ${mongoUri}...`);

  try {
    await mongoose.connect(mongoUri);
    console.log(' Connected to MongoDB successfully.\n');
  } catch (err) {
    console.error(`❌ MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }

  try {
    // 1. Locate a user with connected LinkedIn credentials
    const targetEmail = process.env.TEST_USER_EMAIL || process.argv[2];
    let user;

    if (targetEmail) {
      user = await User.findOne({ email: targetEmail });
      if (!user) {
        console.error(`❌ User with email "${targetEmail}" was not found in database.`);
        process.exit(1);
      }
    } else {
      user = await User.findOne({
        'linkedin.accessTokenEnc': { $exists: true, $ne: null },
        'linkedin.memberId': { $exists: true, $ne: null },
      });
    }

    if (!user) {
      console.warn('⚠️ No user with connected LinkedIn credentials was found in the database.');
      console.warn('👉 Please start the app (`npm run dev`), sign in, and connect your LinkedIn profile at http://localhost:5173/settings');
      console.warn('   Or run: node test_publish_manual.js <your_email@example.com>\n');
      process.exit(1);
    }

    console.log(`👤 Using user: ${user.name} (${user.email})`);
    console.log(`🔗 LinkedIn Member ID: ${user.linkedin?.memberId}`);
    console.log(`🔑 Access Token Expiration: ${user.linkedin?.accessTokenExpiresAt || 'N/A'}\n`);

    // Parse command line options
    const args = process.argv.slice(2);
    const isTextOnly = args.includes('--text-only');
    const isImageOnly = args.includes('--with-image');

    // 2. Find or construct a DailyEntry to publish
    let entry = null;
    const entryIdArg = args.find((a) => a.startsWith('--entry='));
    if (entryIdArg) {
      const entryId = entryIdArg.split('=')[1];
      entry = await DailyEntry.findById(entryId);
    }

    if (!entry) {
      // Find a real generated entry or create a test object
      entry = await DailyEntry.findOne({ status: 'generated' });
    }

    if (!entry) {
      console.log('ℹ️ No generated DailyEntry found in DB. Using a temporary test entry payload...');
      entry = {
        topic: 'Building PostBot in Public',
        generatedText: `🚀 Testing PostBot automated LinkedIn publishing! Today's milestone: integrating LinkedIn REST API (/rest/posts & /rest/images) with automated token refreshing. #${Date.now()} #BuildingInPublic #AI #SaaS #NodeJS`,
        generatedImageUrl: isTextOnly
          ? undefined
          : 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80',
        status: 'generated',
      };
    } else if (isTextOnly) {
      // Temporarily strip image for text-only test
      entry.generatedImageUrl = undefined;
    } else if (isImageOnly && !entry.generatedImageUrl) {
      entry.generatedImageUrl = 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80';
    }

    console.log('----------------------------------------------------');
    console.log('📝 Entry to Publish:');
    console.log(`Topic: ${entry.topic || 'N/A'}`);
    console.log(`Commentary:\n${entry.generatedText}`);
    console.log(`Image URL: ${entry.generatedImageUrl || '[TEXT-ONLY POST - No Image]'}`);
    console.log('----------------------------------------------------\n');

    console.log('⏳ Calling publishEntry(userId, entry)...');
    const postUrn = await publishEntry(user._id, entry);

    console.log('\n🎉 SUCCESS! LinkedIn post created successfully.');
    console.log(`📌 Post URN: ${postUrn}`);
    console.log(`🌐 LinkedIn Activity URL: https://www.linkedin.com/feed/update/${postUrn}\n`);

  } catch (error) {
    if (error instanceof LinkedInReauthRequiredError) {
      console.error('\n🔒 LinkedInReauthRequiredError Caught:');
      console.error(`Message: ${error.message}`);
      console.error('👉 The user must reconnect their LinkedIn account via OAuth.');
    } else if (error instanceof LinkedInPublishError) {
      console.error('\n❌ LinkedInPublishError Caught:');
      console.error(`Message: ${error.message}`);
      console.error(`HTTP Status: ${error.status || 'N/A'}`);
      console.error('LinkedIn Error Response:', JSON.stringify(error.linkedinError, null, 2));
    } else {
      console.error('\n❌ Unexpected Error:', error);
    }
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

main();
