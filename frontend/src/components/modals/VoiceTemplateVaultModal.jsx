import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  ShieldAlert,
  Sliders,
  Layers,
  Copy,
  Plus,
  Trash2,
  Check,
  ChevronDown,
  Info,
  BookOpen,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import {
  ROLE_PRESETS,
  TONE_PRESETS,
  BUILT_IN_LAYOUT_TEMPLATES,
  getVoiceDNA,
  saveVoiceDNA,
  getCustomTemplates,
  saveCustomTemplate,
  deleteCustomTemplate,
} from '../../utils/voiceVaultStorage';

const STANDARD_ANTI_RULES = [
  'No generic AI hooks ("In today\'s fast-paced world...", "Let\'s dive in")',
  'No excessive emojis or hashtag spam',
  'Prefer short, punchy paragraphs (1–2 sentences max per line)',
];

export const VoiceTemplateVaultModal = ({ isOpen, onClose, onSaved }) => {
  const [activeTab, setActiveTab] = useState('voice'); // 'voice' | 'templates'

  // Tab 1: Voice DNA Form State
  const [role, setRole] = useState('Senior Founder / CEO');
  const [isCustomRole, setIsCustomRole] = useState(false);
  const [customRoleText, setCustomRoleText] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [baseTone, setBaseTone] = useState('Direct & Contrarian');
  const [selectedAntiRules, setSelectedAntiRules] = useState(STANDARD_ANTI_RULES);
  const [customAntiRule, setCustomAntiRule] = useState('');

  // Tab 2: Custom Template Creator State
  const [customTemplates, setCustomTemplates] = useState([]);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplatePost, setNewTemplatePost] = useState('');
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);

  // Load existing profile & templates on open
  useEffect(() => {
    if (isOpen) {
      const dna = getVoiceDNA();
      if (ROLE_PRESETS.includes(dna.role)) {
        setRole(dna.role);
        setIsCustomRole(false);
      } else {
        setRole('Custom');
        setIsCustomRole(true);
        setCustomRoleText(dna.role || '');
      }
      setTargetAudience(dna.targetAudience || '');
      setBaseTone(dna.baseTone || 'Direct & Contrarian');
      setSelectedAntiRules(Array.isArray(dna.antiRules) ? dna.antiRules : STANDARD_ANTI_RULES);
      setCustomAntiRule(dna.customAntiRule || '');

      setCustomTemplates(getCustomTemplates());
    }
  }, [isOpen]);

  const toggleAntiRule = (ruleText) => {
    setSelectedAntiRules((prev) =>
      prev.includes(ruleText) ? prev.filter((r) => r !== ruleText) : [...prev, ruleText]
    );
  };

  const handleSaveVoiceDNA = () => {
    const finalRole = isCustomRole ? customRoleText.trim() || 'Founder / Builder' : role;
    const updatedDNA = {
      role: finalRole,
      targetAudience: targetAudience.trim(),
      baseTone,
      antiRules: selectedAntiRules,
      customAntiRule: customAntiRule.trim(),
    };
    saveVoiceDNA(updatedDNA);
    if (onSaved) onSaved(updatedDNA);
    onClose();
  };

  const handleCreateCustomTemplate = (e) => {
    e.preventDefault();
    if (!newTemplateName.trim() || !newTemplatePost.trim()) return;

    const created = saveCustomTemplate({
      name: newTemplateName,
      referencePost: newTemplatePost,
    });
    if (created) {
      setCustomTemplates(getCustomTemplates());
      setNewTemplateName('');
      setNewTemplatePost('');
      setIsAddingTemplate(false);
      if (onSaved) onSaved(getVoiceDNA());
    }
  };

  const handleDeleteCustomTemplate = (id) => {
    const updated = deleteCustomTemplate(id);
    setCustomTemplates(updated);
    if (onSaved) onSaved(getVoiceDNA());
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      maxWidth="max-w-3xl"
      showClose={true}
    >
      <div className="space-y-6">
        {/* Header with Title and Tabs */}
        <div className="border-b border-border-light pb-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-brand-soft text-brand">
              <Sliders className="w-5 h-5" />
            </span>
            <h2 className="text-xl font-extrabold text-ink tracking-tight">
              Voice DNA &amp; Template Vault
            </h2>
          </div>
          <p className="text-xs text-[#64748B] leading-relaxed">
            Configure your persistent writing profile, tone guardrails, and cloned caption layouts. These are applied automatically across all weekly batches.
          </p>

          {/* Tab Navigation */}
          <div className="flex items-center gap-2 mt-4">
            <button
              type="button"
              onClick={() => setActiveTab('voice')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'voice'
                  ? 'bg-brand text-white shadow-xs'
                  : 'bg-surface text-[#64748B] hover:text-ink hover:bg-slate-100 border border-border-warm'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>1. Voice &amp; Identity DNA</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('templates')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'templates'
                  ? 'bg-brand text-white shadow-xs'
                  : 'bg-surface text-[#64748B] hover:text-ink hover:bg-slate-100 border border-border-warm'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>2. Layout Templates &amp; Clones ({BUILT_IN_LAYOUT_TEMPLATES.length + customTemplates.length})</span>
            </button>
          </div>
        </div>

        {/* TAB 1: Voice & Identity DNA */}
        {activeTab === 'voice' && (
          <div className="space-y-5 animate-fade-in">
            {/* Identity & Audience */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Role / Identity */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center justify-between">
                  <span>Your Role / Identity</span>
                </label>
                <div className="relative">
                  <select
                    value={isCustomRole ? 'Custom' : role}
                    onChange={(e) => {
                      if (e.target.value === 'Custom') {
                        setIsCustomRole(true);
                      } else {
                        setIsCustomRole(false);
                        setRole(e.target.value);
                      }
                    }}
                    className="w-full appearance-none bg-white border border-border-warm rounded-xl px-3.5 py-2.5 text-xs text-ink font-medium focus:border-brand focus:ring-2 focus:ring-brand/15 shadow-2xs pr-10 cursor-pointer"
                  >
                    {ROLE_PRESETS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                    <option value="Custom">Custom Role...</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#64748B]">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
                {isCustomRole && (
                  <input
                    type="text"
                    value={customRoleText}
                    onChange={(e) => setCustomRoleText(e.target.value)}
                    placeholder="e.g. AI Systems Architect & Founder"
                    className="w-full mt-1.5 bg-white border border-border-warm rounded-xl px-3 py-2 text-xs text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 shadow-2xs font-medium"
                  />
                )}
              </div>

              {/* Target Reader / Audience */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                  Target Reader / Audience
                </label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g. B2B SaaS Founders, VPs of Eng, Seed Investors"
                  className="w-full bg-white border border-border-warm rounded-xl px-3.5 py-2.5 text-xs text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 shadow-2xs font-medium"
                />
              </div>
            </div>

            {/* Default Voice Tone */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                Default Voice Tone
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {TONE_PRESETS.map((t) => {
                  const isSelected = baseTone === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setBaseTone(t)}
                      className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'border-brand bg-brand-soft text-brand ring-2 ring-brand/15'
                          : 'border-border-warm bg-white text-ink hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{t}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-brand" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Anti-Cringe / Never Do Rules */}
            <div className="space-y-2 pt-2 border-t border-border-light">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-coral" />
                <span className="text-xs font-bold uppercase tracking-wider text-ink">
                  Anti-Cringe &amp; Guardrail Rules
                </span>
              </div>
              <p className="text-[11px] text-[#64748B]">
                PostBot strictly instructs the LLM to avoid these patterns on every post:
              </p>

              <div className="space-y-2">
                {STANDARD_ANTI_RULES.map((rule) => {
                  const isChecked = selectedAntiRules.includes(rule);
                  return (
                    <label
                      key={rule}
                      onClick={() => toggleAntiRule(rule)}
                      className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-blue-50/50 border-brand/40 text-ink font-medium'
                          : 'bg-white border-border-warm text-[#64748B]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="rounded border-border-warm text-brand focus:ring-brand/20 w-4 h-4"
                      />
                      <span>{rule}</span>
                    </label>
                  );
                })}
              </div>

              {/* Custom Anti Rule */}
              <div className="pt-1">
                <input
                  type="text"
                  value={customAntiRule}
                  onChange={(e) => setCustomAntiRule(e.target.value)}
                  placeholder="Add custom rule (e.g., Never use buzzwords like 'synergy' or 'game-changer')"
                  className="w-full bg-white border border-border-warm rounded-xl px-3.5 py-2 text-xs text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 placeholder:text-[#94A3B8]"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-border-light flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#64748B] hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveVoiceDNA}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-brand text-white hover:bg-brand-hover shadow-xs transition-all cursor-pointer"
              >
                Save Voice DNA Profile
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: Caption Layout Templates */}
        {activeTab === 'templates' && (
          <div className="space-y-5 animate-fade-in">
            {/* Built-in Skeletons Section */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                  Pre-Loaded Structural Skeletons ({BUILT_IN_LAYOUT_TEMPLATES.length})
                </span>
                <span className="text-[11px] text-brand font-semibold flex items-center gap-1">
                  <Info className="w-3.5 h-3.5" />
                  Auto-matched to post angles
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {BUILT_IN_LAYOUT_TEMPLATES.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="p-3 rounded-xl border border-border-warm bg-white hover:border-brand/40 transition-all space-y-1.5 shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-ink">{tmpl.name}</span>
                      <span className="text-[10px] uppercase font-bold text-brand bg-brand-soft px-2 py-0.5 rounded">
                        Built-in
                      </span>
                    </div>
                    <p className="text-[11px] text-[#64748B] line-clamp-1">{tmpl.description}</p>
                    <div className="p-2 rounded-lg bg-surface font-mono text-[10px] text-ink-muted border border-border-light leading-relaxed">
                      {tmpl.skeleton}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom / Cloned Templates Section */}
            <div className="space-y-3 pt-2 border-t border-border-light">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-ink block">
                    Your Cloned Caption Templates ({customTemplates.length})
                  </span>
                  <span className="text-[11px] text-[#64748B]">
                    Paste reference posts you love. The AI replicates their line breaks, rhythm, and hook structure.
                  </span>
                </div>
                {!isAddingTemplate && (
                  <button
                    type="button"
                    onClick={() => setIsAddingTemplate(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-brand text-white hover:bg-brand-hover transition-colors shadow-2xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Clone a Post</span>
                  </button>
                )}
              </div>

              {/* Add Custom Template Box */}
              {isAddingTemplate && (
                <form
                  onSubmit={handleCreateCustomTemplate}
                  className="p-4 rounded-xl border border-brand/40 bg-brand-soft/40 space-y-3 animate-fade-in"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-brand flex items-center gap-1.5">
                      <Copy className="w-3.5 h-3.5" />
                      Paste Reference Post to Clone Layout
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsAddingTemplate(false)}
                      className="text-xs text-[#64748B] hover:text-ink"
                    >
                      Cancel
                    </button>
                  </div>

                  <input
                    type="text"
                    required
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="Template Name (e.g. Justin Welsh Short List Style)"
                    className="w-full bg-white border border-border-warm rounded-lg px-3 py-2 text-xs text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 font-medium shadow-2xs"
                  />

                  <textarea
                    rows={4}
                    required
                    value={newTemplatePost}
                    onChange={(e) => setNewTemplatePost(e.target.value)}
                    placeholder="Paste the caption here... The AI extracts the line-break rhythm, sentence length, and bullet formatting without copying the topic."
                    className="w-full bg-white border border-border-warm rounded-lg p-3 text-xs text-ink focus:border-brand focus:ring-2 focus:ring-brand/15 shadow-2xs resize-none font-normal"
                  />

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingTemplate(false)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#64748B] hover:bg-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newTemplateName.trim() || !newTemplatePost.trim()}
                      className="px-4 py-1.5 rounded-lg text-xs font-bold bg-brand text-white hover:bg-brand-hover disabled:opacity-50 cursor-pointer shadow-2xs"
                    >
                      Save Cloned Template
                    </button>
                  </div>
                </form>
              )}

              {/* List of Custom Templates */}
              {customTemplates.length === 0 && !isAddingTemplate ? (
                <div className="p-4 rounded-xl border border-dashed border-border-warm text-center space-y-1 bg-surface/50">
                  <p className="text-xs text-[#64748B]">No custom cloned templates saved yet.</p>
                  <p className="text-[11px] text-[#94A3B8]">
                    Click &ldquo;Clone a Post&rdquo; to paste a creator caption you love.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {customTemplates.map((t) => (
                    <div
                      key={t.id}
                      className="p-3 rounded-xl border border-border-warm bg-white flex items-start justify-between gap-3 shadow-2xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-ink">{t.name}</span>
                          <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded">
                            Custom Cloned
                          </span>
                        </div>
                        <p className="text-[11px] text-[#64748B] font-mono">{t.skeleton}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomTemplate(t.id)}
                        className="text-[#94A3B8] hover:text-coral p-1 rounded transition-colors cursor-pointer"
                        title="Delete template"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-border-light flex items-center justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-brand text-white hover:bg-brand-hover shadow-xs transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
