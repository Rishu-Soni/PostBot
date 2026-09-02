import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

import {
  notifyUser,
  sendPostPublishedEmail,
  sendReconnectLinkedInEmail,
  sendPublishFailedEmail,
  getActiveEmailProvider,
} from './src/services/notifier.js';

async function main() {
  console.log('====================================================');
  console.log(' ✉️  PostBot Email Notifier Manual Test Runner');
  console.log('====================================================\n');

  const args = process.argv.slice(2);
  const emailArg = args.find((a) => a.startsWith('--email='))?.split('=')[1];
  const targetEmail = emailArg || args.find((a) => a.includes('@')) || process.env.TEST_EMAIL_RECIPIENT;

  if (!targetEmail) {
    console.error('❌ No test recipient email address specified!');
    console.error('👉 Please specify an email address using one of the following methods:');
    console.error('   1. Command line argument: node test_notifier_manual.js your_email@example.com');
    console.error('   2. Option flag: node test_notifier_manual.js --email=your_email@example.com --all');
    console.error('   3. In .env: TEST_EMAIL_RECIPIENT=your_email@example.com\n');
    process.exit(1);
  }

  const activeProvider = getActiveEmailProvider();
  console.log(`👤 Target Recipient: ${targetEmail}`);
  console.log(`🔌 Active Provider:   ${activeProvider.toUpperCase()}`);
  if (activeProvider === 'resend') {
    const keyPreview = process.env.RESEND_API_KEY ? `${process.env.RESEND_API_KEY.substring(0, 7)}...` : 'NONE';
    console.log(`🔑 Resend API Key:    ${keyPreview}`);
    console.log(`📤 Sender (From):     ${process.env.EMAIL_FROM || 'PostBot <onboarding@resend.dev>'}`);
  } else if (activeProvider === 'sendgrid') {
    const keyPreview = process.env.SENDGRID_API_KEY ? `${process.env.SENDGRID_API_KEY.substring(0, 7)}...` : 'NONE';
    console.log(`🔑 SendGrid API Key:  ${keyPreview}`);
    console.log(`📤 Sender (From):     ${process.env.EMAIL_FROM || 'PostBot <notifications@yourdomain.com>'}`);
  } else {
    console.log('ℹ️  No RESEND_API_KEY or SENDGRID_API_KEY set in .env. Running in MOCK delivery mode.');
  }
  console.log('----------------------------------------------------\n');

  const runAll = args.includes('--all') || (!args.some((a) => a.startsWith('--type') || a.includes('published') || a.includes('reconnect') || a.includes('failed')));
  const runPublished = runAll || args.includes('--published') || args.includes('--type=published') || args.includes('--type=1');
  const runReconnect = runAll || args.includes('--reconnect') || args.includes('--type=reconnect') || args.includes('--type=2');
  const runFailed = runAll || args.includes('--failed') || args.includes('--type=failed') || args.includes('--type=3');

  const mockUser = {
    _id: 'usr_manual_test_001',
    name: targetEmail.split('@')[0],
    email: targetEmail,
  };

  const mockJourney = {
    _id: '65e01234567890abcdef1234',
    title: 'Building PostBot in Public',
  };

  const mockEntry = {
    _id: '65e01234567890abcdef5678',
    dayNumber: 3,
    topic: 'Automated Multi-Channel Email Alerts',
    generatedText: '🚀 PostBot Milestone Day 3: Replaced notifyUser stubs with real email notifications using Resend & SendGrid. Users get instant updates with live post links, reconnect warnings, and retry error alerts! #BuildingInPublic #AI #SaaS #NodeJS',
    generatedImageUrl: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80',
    linkedinPostUrn: 'urn:li:share:7169823456789012345',
  };

  // 1. Template 1: Post Published Today
  if (runPublished) {
    console.log('📧 [1/3] Testing Template 1: "Your post published today"...');
    try {
      const result = await sendPostPublishedEmail({
        user: mockUser,
        journey: mockJourney,
        entry: mockEntry,
        postUrn: mockEntry.linkedinPostUrn,
      });
      console.log('  ✅ Template 1 Sent Successfully:', result.id || 'Mock OK');
    } catch (err) {
      console.error('  ❌ Template 1 Failed:', err.message);
    }
    console.log('');
  }

  // 2. Template 2: We couldn\'t publish — reconnect LinkedIn
  if (runReconnect) {
    console.log('📧 [2/3] Testing Template 2: "We couldn\'t publish — reconnect LinkedIn"...');
    try {
      const reauthError = new Error('LinkedIn OAuth token expired or revoked. Please re-authenticate.');
      const result = await sendReconnectLinkedInEmail({
        user: mockUser,
        journey: mockJourney,
        entry: mockEntry,
        error: reauthError,
      });
      console.log('  ✅ Template 2 Sent Successfully:', result.id || 'Mock OK');
    } catch (err) {
      console.error('  ❌ Template 2 Failed:', err.message);
    }
    console.log('');
  }

  // 3. Template 3: Generation/publish failed after retries
  if (runFailed) {
    console.log('📧 [3/3] Testing Template 3: "Generation/publish failed after retries"...');
    try {
      const serverError = new Error('LinkedIn REST API 500 Internal Server Error: Gateway timeout after 3 retry attempts');
      const result = await sendPublishFailedEmail({
        user: mockUser,
        journey: mockJourney,
        entry: mockEntry,
        error: serverError,
        attempts: 3,
      });
      console.log('  ✅ Template 3 Sent Successfully:', result.id || 'Mock OK');
    } catch (err) {
      console.error('  ❌ Template 3 Failed:', err.message);
    }
    console.log('');
  }

  console.log('====================================================');
  console.log('🎉 Manual Email Notification Test Run Completed!');
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('Fatal error in test runner:', err);
  process.exit(1);
});
