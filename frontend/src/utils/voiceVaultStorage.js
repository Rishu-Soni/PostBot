// Client-side storage and utilities for Voice DNA, Layout Templates, and Drafts

export const DEFAULT_VOICE_DNA = {
  role: 'Senior Founder / CEO',
  targetAudience: 'B2B SaaS Founders, VPs of Engineering, Early-stage Investors',
  baseTone: 'Direct & Contrarian',
  antiRules: [
    'No generic AI hooks ("In today\'s fast-paced world...", "Let\'s dive in")',
    'No excessive emojis or hashtag spam',
    'Prefer short, punchy paragraphs (1–2 sentences max per line)',
  ],
  customAntiRule: '',
};

export const ROLE_PRESETS = [
  'Senior Founder / CEO',
  'Product Builder / Indie Hacker',
  'Engineering Leader',
  'Growth / GTM Operator',
];

export const TONE_PRESETS = [
  'Direct & Contrarian',
  'Tactical & Data-Backed',
  'Transparent Builder',
  'Conversational & Story-Driven',
];

export const BUILT_IN_LAYOUT_TEMPLATES = [
  {
    id: 'metric-teardown',
    name: 'The Metric Teardown',
    category: 'Built-in',
    description: 'Hard numbers hook followed by breakdown, fixes, and takeaway',
    skeleton: '[1-line metric hook] -> [The bottleneck] -> [3 bullet fixes] -> [Result + takeaway]',
    structureSummary: 'Hook with % or $ metric, 1-line problem statement, 3 bulleted insights, concluding takeaway.',
  },
  {
    id: 'contrarian-rant',
    name: 'The Contrarian Rant',
    category: 'Built-in',
    description: 'Sharp challenge to conventional wisdom with real-world contrast',
    skeleton: '[Unpopular opinion hook] -> [Why common advice fails] -> [What actually works] -> [1-line mic drop]',
    structureSummary: 'Provocative contrarian statement, debunking status quo, proof of the alternative, decisive final line.',
  },
  {
    id: 'founder-micro-story',
    name: 'The Founder Micro-Story',
    category: 'Built-in',
    description: 'Vulnerable narrative about a specific mistake or turning point',
    skeleton: '[Specific moment in time] -> [The conflict/mistake] -> [The pivot] -> [Lesson learned]',
    structureSummary: 'Timestamp or situational opener, tension/mistake, turning moment, universal founder insight.',
  },
  {
    id: 'tactical-framework',
    name: 'The Tactical Framework',
    category: 'Built-in',
    description: 'Actionable blueprint or step-by-step system for instant application',
    skeleton: '[Big promise hook] -> [Numbered step-by-step breakdown] -> [Save/Bookmark CTA]',
    structureSummary: 'High-leverage outcome promise, 3-5 numbered action steps, frictionless bookmark/save CTA.',
  },
];

const STORAGE_KEYS = {
  VOICE_DNA: 'postbot_voice_dna',
  CUSTOM_TEMPLATES: 'postbot_custom_templates',
  BRAIN_DUMP_DRAFT: 'postbot_brain_dump_draft',
  WEEKLY_GOAL_DRAFT: 'postbot_weekly_goal_draft',
};

export const getVoiceDNA = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.VOICE_DNA);
    if (!raw) return DEFAULT_VOICE_DNA;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_VOICE_DNA,
      ...parsed,
      antiRules: Array.isArray(parsed.antiRules) ? parsed.antiRules : DEFAULT_VOICE_DNA.antiRules,
    };
  } catch (e) {
    console.error('Failed to parse voice DNA from localStorage:', e);
    return DEFAULT_VOICE_DNA;
  }
};

export const saveVoiceDNA = (dna) => {
  try {
    localStorage.setItem(STORAGE_KEYS.VOICE_DNA, JSON.stringify(dna));
  } catch (e) {
    console.error('Failed to save voice DNA to localStorage:', e);
  }
};

export const getCustomTemplates = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.CUSTOM_TEMPLATES);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('Failed to parse custom templates:', e);
    return [];
  }
};

export const saveCustomTemplate = ({ name, referencePost }) => {
  try {
    const existing = getCustomTemplates();
    const cleanPost = (referencePost || '').trim();
    const lines = cleanPost.split('\n').filter((l) => l.trim().length > 0);
    const firstLine = lines[0] || 'Hook';
    const hasBullets = /^[•\-*\d.]/m.test(cleanPost);

    const newTemplate = {
      id: `custom-${Date.now()}`,
      name: name.trim() || 'Custom Cloned Template',
      category: 'Cloned Style',
      description: `Cloned rhythm from sample (${lines.length} sections, ${hasBullets ? 'bulleted' : 'paragraph'} format)`,
      skeleton: `[Hook like: "${firstLine.slice(0, 45)}..."] -> [Body rhythm: ${lines.length} sections] -> [Cloned CTA]`,
      referenceSample: cleanPost,
      createdAt: new Date().toISOString(),
    };

    const updated = [newTemplate, ...existing];
    localStorage.setItem(STORAGE_KEYS.CUSTOM_TEMPLATES, JSON.stringify(updated));
    return newTemplate;
  } catch (e) {
    console.error('Failed to save custom template:', e);
    return null;
  }
};

export const deleteCustomTemplate = (templateId) => {
  try {
    const existing = getCustomTemplates();
    const updated = existing.filter((t) => t.id !== templateId);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_TEMPLATES, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.error('Failed to delete custom template:', e);
    return [];
  }
};

export const getAllLayoutTemplates = () => {
  const custom = getCustomTemplates();
  return [...BUILT_IN_LAYOUT_TEMPLATES, ...custom];
};

export const getBrainDumpDraft = () => {
  try {
    return localStorage.getItem(STORAGE_KEYS.BRAIN_DUMP_DRAFT) || '';
  } catch {
    return '';
  }
};

export const saveBrainDumpDraft = (text) => {
  try {
    localStorage.setItem(STORAGE_KEYS.BRAIN_DUMP_DRAFT, text);
  } catch {}
};

export const getWeeklyGoalDraft = () => {
  try {
    return localStorage.getItem(STORAGE_KEYS.WEEKLY_GOAL_DRAFT) || '';
  } catch {
    return '';
  }
};

export const saveWeeklyGoalDraft = (text) => {
  try {
    localStorage.setItem(STORAGE_KEYS.WEEKLY_GOAL_DRAFT, text);
  } catch {}
};

export const clearDrafts = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.BRAIN_DUMP_DRAFT);
    localStorage.removeItem(STORAGE_KEYS.WEEKLY_GOAL_DRAFT);
  } catch {}
};
