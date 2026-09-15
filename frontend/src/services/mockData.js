/**
 * Mock Data Store for Local Testing & Demo Mode
 * Persists test state in localStorage so the user can test the entire application
 * even if the local MongoDB or external AI APIs are not running.
 */

const STORAGE_KEYS = {
  USER: 'postbot_mock_user',
  BATCHES: 'postbot_mock_batches',
  POSTS: 'postbot_mock_posts',
  TRANSACTIONS: 'postbot_mock_transactions',
  NOTIFICATIONS: 'postbot_mock_notifications',
  IS_DEMO: 'postbot_demo_mode',
};

const INITIAL_USER = {
  _id: 'user-test-alex-founder',
  name: 'Alex Founder (Test Account)',
  email: 'test@postbot.io',
  creditBalance: 100,
  timezone: 'America/New_York',
  defaultPostTime: '09:00',
  linkedin: {
    isConnected: true, // Always true to permit testing scheduling and posting
    connectedAt: '2026-09-10T12:00:00.000Z',
    linkedinUserId: 'test-linkedin-member-123',
  },
  notificationPrefs: {
    email: 'test@postbot.io',
    phone: '+15551234567',
    emailEnabled: true,
    smsEnabled: true,
  },
};

const INITIAL_BATCHES = [
  {
    _id: 'batch-demo-draft',
    userId: 'user-test-alex-founder',
    theme: 'Bootstrapping B2B SaaS to $10k MRR',
    recommendedDayCount: 5,
    finalDayCount: 5,
    status: 'draft',
    brainDump: 'Shipped self-hosted billing engine. 80% of founders fail silently on OAuth token expiration. Fixed caching and doubled conversions.',
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    _id: 'batch-demo-active',
    userId: 'user-test-alex-founder',
    theme: 'Founder Authority & High-Converting Hooks',
    recommendedDayCount: 5,
    finalDayCount: 5,
    status: 'active',
    confirmedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
  },
];

const INITIAL_POSTS = [
  // Draft batch posts
  {
    _id: 'post-draft-1',
    userId: 'user-test-alex-founder',
    batchId: 'batch-demo-draft',
    dayIndex: 1,
    caption: 'Why 80% of SaaS automation fails silently.\n\nHere is what we learned after monitoring 10,000 background jobs:\n- Always handle token refresh before expiration\n- Idempotency keys prevent duplicate posts\n- Alert users via SMS on critical failure',
    hashtags: ['#SaaS', '#Bootstrapping', '#Founders'],
    image: {
      url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80',
      source: 'stock',
      stockProvider: 'unsplash',
    },
    status: 'pending',
  },
  {
    _id: 'post-draft-2',
    userId: 'user-test-alex-founder',
    batchId: 'batch-demo-draft',
    dayIndex: 2,
    caption: 'Why pricing too low kills B2B retention faster than bugs.\n\nWhen a customer pays $10/mo, they treat you like a toy.\nWhen they pay $150/mo, they integrate your tool into daily operations.\n\nDouble your price this week.',
    hashtags: ['#Pricing', '#B2B', '#Growth'],
    image: {
      url: 'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=800&q=80',
      source: 'stock',
      stockProvider: 'unsplash',
    },
    status: 'pending',
  },
  {
    _id: 'post-draft-3',
    userId: 'user-test-alex-founder',
    batchId: 'batch-demo-draft',
    dayIndex: 3,
    caption: 'Our 3-step framework for turning raw notes into weekly LinkedIn authority:\n\n1. Write down customer objections verbatim\n2. Extract 1 core mental model\n3. Deliver 3 actionable bullets with no fluff',
    hashtags: ['#ContentStrategy', '#PersonalBranding'],
    image: {
      url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=800&q=80',
      source: 'ai',
      aiProvider: 'openai',
    },
    status: 'pending',
  },
  {
    _id: 'post-draft-4',
    userId: 'user-test-alex-founder',
    batchId: 'batch-demo-draft',
    dayIndex: 4,
    caption: 'Zero to $10k MRR without ad spend:\n\n- 5 high-signal posts per week\n- 15 thoughtful comments on industry leaders\n- Direct outreach to warm profile viewers\n\nConsistency beats ad budget every single time.',
    hashtags: ['#Marketing', '#OrganicReach', '#Founders'],
    image: {
      url: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=800&q=80',
      source: 'stock',
      stockProvider: 'unsplash',
    },
    status: 'pending',
  },
  {
    _id: 'post-draft-5',
    userId: 'user-test-alex-founder',
    batchId: 'batch-demo-draft',
    dayIndex: 5,
    caption: 'Friday Founder Reflection:\n\nWhat worked this week:\n✓ Shipped batch content engine\n✓ Onboarded 12 early beta founders\n\nWhat failed:\n✗ Delayed onboarding email triggers\n\nLesson: Ship early, fix fast.',
    hashtags: ['#BuildInPublic', '#StartupLife'],
    image: {
      url: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=800&q=80',
      source: 'user_upload',
    },
    status: 'pending',
  },

  // Active batch posts
  {
    _id: 'post-active-1',
    userId: 'user-test-alex-founder',
    batchId: 'batch-demo-active',
    dayIndex: 1,
    caption: 'The #1 founder habit that unlocked 200k impressions on LinkedIn:\n\nDocument instead of create.',
    hashtags: ['#Founder', '#Growth'],
    image: {
      url: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=800&q=80',
      source: 'stock',
    },
    status: 'posted',
    linkedinPostId: 'urn:li:share:72409988112233',
    postedAt: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
    scheduledTime: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
  },
  {
    _id: 'post-active-2',
    userId: 'user-test-alex-founder',
    batchId: 'batch-demo-active',
    dayIndex: 2,
    caption: 'Stop writing generic advice. Share the specific numbers and the specific bug that cost you $2,000.',
    hashtags: ['#SaaS', '#Transparency'],
    image: {
      url: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80',
      source: 'stock',
    },
    status: 'posted',
    linkedinPostId: 'urn:li:share:72409988114455',
    postedAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    scheduledTime: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  },
  {
    _id: 'post-active-3',
    userId: 'user-test-alex-founder',
    batchId: 'batch-demo-active',
    dayIndex: 3,
    caption: 'Scheduled for tomorrow: The 5-point checklist before confirming any content batch.',
    hashtags: ['#Content', '#Workflow'],
    image: {
      url: 'https://images.unsplash.com/photo-1542744094-3a31f272c490?auto=format&fit=crop&w=800&q=80',
      source: 'stock',
    },
    status: 'pending',
    scheduledTime: new Date(Date.now() + 22 * 3600 * 1000).toISOString(),
  },
  {
    _id: 'post-active-4',
    userId: 'user-test-alex-founder',
    batchId: 'batch-demo-active',
    dayIndex: 4,
    caption: 'Scheduled for Day 4: Why email and SMS notification redundancies save founder sanity.',
    hashtags: ['#DevOps', '#Automation'],
    image: {
      url: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80',
      source: 'stock',
    },
    status: 'pending',
    scheduledTime: new Date(Date.now() + 46 * 3600 * 1000).toISOString(),
  },
  {
    _id: 'post-active-5',
    userId: 'user-test-alex-founder',
    batchId: 'batch-demo-active',
    dayIndex: 5,
    caption: 'Scheduled for Day 5: Weekly recap of client wins.',
    hashtags: ['#FridayWins'],
    image: {
      url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80',
      source: 'stock',
    },
    status: 'pending',
    scheduledTime: new Date(Date.now() + 70 * 3600 * 1000).toISOString(),
  },
];

const INITIAL_TRANSACTIONS = [
  {
    _id: 'tx-1',
    userId: 'user-test-alex-founder',
    reason: 'purchase',
    amount: 100,
    balanceAfter: 100,
    note: 'Initial welcome balance for testing all PostBot features',
    createdAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
  },
  {
    _id: 'tx-2',
    userId: 'user-test-alex-founder',
    reason: 'generation',
    amount: -5,
    balanceAfter: 95,
    note: 'Generated 5 posts for batch "Founder Authority & High-Converting Hooks"',
    createdAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
  },
  {
    _id: 'tx-3',
    userId: 'user-test-alex-founder',
    reason: 'regeneration',
    amount: -1,
    balanceAfter: 94,
    note: 'AI image synthesis for Day 3 of batch',
    createdAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
  },
  {
    _id: 'tx-4',
    userId: 'user-test-alex-founder',
    reason: 'refund',
    amount: 1,
    balanceAfter: 95,
    note: 'Automated refund for temporary upstream image generation timeout',
    createdAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
  },
];

const INITIAL_NOTIFICATIONS = [
  {
    _id: 'notif-1',
    userId: 'user-test-alex-founder',
    type: 'low_stock',
    channels: ['email', 'sms'],
    message: 'Welcome to PostBot! You have 95 test credits ready to generate and test weekly batches.',
    deliveryStatus: 'sent',
    resolved: false,
    createdAt: new Date(Date.now() - 10 * 3600 * 1000).toISOString(),
  },
  {
    _id: 'notif-2',
    userId: 'user-test-alex-founder',
    type: 'token_expired',
    channels: ['email'],
    message: 'LinkedIn token refreshed automatically. Your automated scheduling is fully active.',
    deliveryStatus: 'sent',
    resolved: true,
    createdAt: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
  },
];

class MockStore {
  constructor() {
    this.init();
  }

  init() {
    if (!localStorage.getItem(STORAGE_KEYS.USER)) {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(INITIAL_USER));
    }
    if (!localStorage.getItem(STORAGE_KEYS.BATCHES)) {
      localStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(INITIAL_BATCHES));
    }
    if (!localStorage.getItem(STORAGE_KEYS.POSTS)) {
      localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(INITIAL_POSTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.TRANSACTIONS)) {
      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(INITIAL_TRANSACTIONS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) {
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(INITIAL_NOTIFICATIONS));
    }
  }

  isDemoMode() {
    return localStorage.getItem(STORAGE_KEYS.IS_DEMO) === 'true';
  }

  setDemoMode(val) {
    if (val) {
      localStorage.setItem(STORAGE_KEYS.IS_DEMO, 'true');
      localStorage.setItem('postbot_token', 'demo-test-jwt-token');
      this.init();
    } else {
      localStorage.removeItem(STORAGE_KEYS.IS_DEMO);
    }
  }

  getUser() {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || JSON.stringify(INITIAL_USER));
  }

  updateUser(updates) {
    const user = this.getUser();
    const updated = {
      ...user,
      ...updates,
      notificationPrefs: {
        ...user.notificationPrefs,
        ...(updates.notificationPrefs || {}),
      },
    };
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(updated));
    return updated;
  }

  getBatches(status) {
    const batches = JSON.parse(localStorage.getItem(STORAGE_KEYS.BATCHES) || '[]');
    if (status && status !== 'all') {
      return batches.filter((b) => b.status === status);
    }
    return batches;
  }

  getBatchById(batchId) {
    const batches = this.getBatches();
    const batch = batches.find((b) => b._id === batchId) || null;
    const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS) || '[]').filter(
      (p) => p.batchId === batchId
    );
    return { batch, posts };
  }

  createBatch(batchData) {
    const batches = this.getBatches();
    const newBatch = {
      _id: `batch-${Date.now()}`,
      userId: this.getUser()._id,
      theme: batchData.theme || 'Weekly Thought Leadership',
      recommendedDayCount: 5,
      finalDayCount: 5,
      status: 'draft',
      brainDump: batchData.brainDump,
      createdAt: new Date().toISOString(),
    };
    batches.unshift(newBatch);
    localStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(batches));
    return { batchId: newBatch._id, recommendedDayCount: 5 };
  }

  updateDayCount(batchId, finalDayCount) {
    const batches = this.getBatches();
    const batch = batches.find((b) => b._id === batchId);
    if (batch) {
      batch.finalDayCount = finalDayCount;
      localStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(batches));
    }

    // Generate posts for this batch
    let posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS) || '[]');
    posts = posts.filter((p) => p.batchId !== batchId);

    const sampleAngles = [
      'The silent killer of B2B growth: ignoring user onboarding dropoffs.',
      'How to double your MRR with 1 simple pricing shift.',
      'Our contrarian take on hiring vs automation in early stage startups.',
      'Why you should build in public even when you are failing.',
      'The exact 5-step framework we used to scale to 10k users.',
      'What separating signal from noise looks like for technical founders.',
      'Weekly retrospective: numbers, failures, and takeaways.',
    ];

    const sampleImages = [
      'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=80',
    ];

    const newPosts = [];
    for (let i = 1; i <= finalDayCount; i++) {
      newPosts.push({
        _id: `post-${batchId}-${i}`,
        userId: this.getUser()._id,
        batchId,
        dayIndex: i,
        caption: `${sampleAngles[(i - 1) % sampleAngles.length]}\n\n1. Measure twice, cut once\n2. Talk to 5 customers daily\n3. Protect your focus\n\nWhat is your biggest bottleneck this week?`,
        hashtags: ['#Founders', '#SaaS', '#Bootstrapping'],
        image: {
          url: sampleImages[(i - 1) % sampleImages.length],
          source: i % 2 === 0 ? 'ai' : 'stock',
          stockProvider: 'unsplash',
        },
        status: 'pending',
      });
    }

    posts.push(...newPosts);
    localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(posts));

    // Deduct credits
    const user = this.getUser();
    user.creditBalance = Math.max(0, user.creditBalance - finalDayCount);
    this.updateUser({ creditBalance: user.creditBalance });

    // Record ledger transaction
    const txs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRANSACTIONS) || '[]');
    txs.unshift({
      _id: `tx-${Date.now()}`,
      userId: user._id,
      reason: 'generation',
      amount: -finalDayCount,
      balanceAfter: user.creditBalance,
      note: `Generated ${finalDayCount} posts for batch "${batch?.theme || 'Content Batch'}"`,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(txs));

    return { batch, posts: newPosts };
  }

  confirmBatch(batchId) {
    const batches = this.getBatches();
    const batch = batches.find((b) => b._id === batchId);
    if (batch) {
      batch.status = 'active';
      batch.confirmedAt = new Date().toISOString();
      localStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(batches));
    }

    const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS) || '[]');
    posts.forEach((p) => {
      if (p.batchId === batchId) {
        p.scheduledTime = new Date(Date.now() + p.dayIndex * 24 * 3600 * 1000).toISOString();
      }
    });
    localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(posts));

    return { batch, scheduledPostsCount: posts.filter((p) => p.batchId === batchId).length };
  }

  cancelBatch(batchId) {
    let batches = this.getBatches();
    batches = batches.filter((b) => b._id !== batchId);
    localStorage.setItem(STORAGE_KEYS.BATCHES, JSON.stringify(batches));

    let posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS) || '[]');
    posts = posts.filter((p) => p.batchId !== batchId);
    localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(posts));
    return { success: true };
  }

  updatePost(postId, updates) {
    const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS) || '[]');
    const post = posts.find((p) => p._id === postId);
    if (post) {
      if (updates.caption !== undefined) post.caption = updates.caption;
      if (updates.hashtags !== undefined) post.hashtags = updates.hashtags;
      localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(posts));
    }
    return post;
  }

  regeneratePost(postId, part) {
    const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS) || '[]');
    const post = posts.find((p) => p._id === postId);
    if (post) {
      if (part === 'caption' || part === 'whole') {
        post.caption = `[Freshly Revamped Hook]: The fastest way to build authority is by publishing what others only whisper.\n\n3 high-leverage principles:\n- Share counter-intuitive data\n- Give away your best frameworks\n- Keep paragraphs under 3 lines\n\nDrop a comment if you agree!`;
      }
      if (part === 'hashtags' || part === 'whole') {
        post.hashtags = ['#Innovation', '#Leadership', '#TechFounders', '#ScaleUp'];
      }
      if (part === 'image' || part === 'whole') {
        post.image = {
          url: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80',
          source: 'ai',
          aiProvider: 'dall-e-3',
        };
      }
      localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(posts));
    }

    // Deduct 1 credit
    const user = this.getUser();
    user.creditBalance = Math.max(0, user.creditBalance - 1);
    this.updateUser({ creditBalance: user.creditBalance });

    // Ledger entry
    const txs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRANSACTIONS) || '[]');
    txs.unshift({
      _id: `tx-${Date.now()}`,
      userId: user._id,
      reason: 'regeneration',
      amount: -1,
      balanceAfter: user.creditBalance,
      note: `AI regeneration (${part}) for Day ${post?.dayIndex || 1}`,
      createdAt: new Date().toISOString(),
    });
    localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(txs));

    return post;
  }

  uploadImage(postId, file) {
    const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS) || '[]');
    const post = posts.find((p) => p._id === postId);
    if (post) {
      post.image = {
        url: URL.createObjectURL(file),
        source: 'user_upload',
      };
      localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(posts));
    }
    return post;
  }

  postNow(postId) {
    const posts = JSON.parse(localStorage.getItem(STORAGE_KEYS.POSTS) || '[]');
    const post = posts.find((p) => p._id === postId);
    if (post) {
      post.status = 'posted';
      post.linkedinPostId = `urn:li:share:${Date.now()}`;
      post.postedAt = new Date().toISOString();
      post.failureReason = null;
      localStorage.setItem(STORAGE_KEYS.POSTS, JSON.stringify(posts));
    }
    return post;
  }

  getTransactions(page = 1, limit = 15) {
    const txs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRANSACTIONS) || '[]');
    const start = (page - 1) * limit;
    const paginated = txs.slice(start, start + limit);
    return { transactions: paginated, total: txs.length, page, limit };
  }

  getNotifications(resolved) {
    let notifs = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS) || '[]');
    if (resolved !== undefined && resolved !== 'all') {
      const boolVal = String(resolved) === 'true';
      notifs = notifs.filter((n) => n.resolved === boolVal);
    }
    return { notifications: notifs, total: notifs.length };
  }

  resolveNotification(id) {
    const notifs = JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS) || '[]');
    const target = notifs.find((n) => n._id === id);
    if (target) {
      target.resolved = true;
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(notifs));
    }
    return target;
  }
}

export const mockStore = new MockStore();
