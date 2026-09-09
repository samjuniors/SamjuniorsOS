'use client';

import React, { useState } from 'react';
import { motion } from 'motion/react';
import {
  UserPlus,
  Sparkles,
  Shield,
  Layers,
  Zap,
  CheckCircle2,
  AlertCircle,
  Cpu,
  Fingerprint,
  Tag,
  Plus,
  X,
  ArrowRight,
} from 'lucide-react';
import { CustomAIEmployeeDraft } from '@/lib/training/types';
import { TrainingStore } from '@/lib/training/training-store';
import { PersonaTone } from '@/types/os';
import { playOSSound, dispatchOSNotification } from '@/components/os/IconHelper';

interface CustomEmployeeOnboarderViewProps {
  onEmployeeCreated?: (agentId: string) => void;
  onCancel?: () => void;
}

const AVATAR_PALETTES = [
  { label: 'Indigo / Purple', val: 'from-purple-500 via-indigo-600 to-indigo-800', hex: '#818cf8' },
  { label: 'Cyan / Sky', val: 'from-sky-500 via-blue-600 to-indigo-800', hex: '#38bdf8' },
  { label: 'Emerald / Teal', val: 'from-emerald-500 via-teal-600 to-cyan-800', hex: '#34d399' },
  { label: 'Amber / Rose', val: 'from-amber-500 via-orange-600 to-rose-800', hex: '#f59e0b' },
  { label: 'Fuchsia / Pink', val: 'from-fuchsia-500 via-pink-600 to-rose-800', hex: '#e879f9' },
];

export const CustomEmployeeOnboarderView: React.FC<CustomEmployeeOnboarderViewProps> = ({
  onEmployeeCreated,
  onCancel,
}) => {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('Engineering & Operations');
  const [callsign, setCallsign] = useState('');
  const [clearanceLevel, setClearanceLevel] = useState('L3 - Senior Specialist');
  const [selectedPaletteIndex, setSelectedPaletteIndex] = useState(0);
  const [executiveMandate, setExecutiveMandate] = useState('');
  const [systemInstruction, setSystemInstruction] = useState('');
  const [primarySkills, setPrimarySkills] = useState<string[]>([
    'Automated Verification',
    'Root Cause Analysis',
    'Safe Mock Execution',
  ]);
  const [skillInput, setSkillInput] = useState('');
  const [baseTone, setBaseTone] = useState<PersonaTone>('professional');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleAddSkill = () => {
    if (skillInput.trim() && !primarySkills.includes(skillInput.trim())) {
      setPrimarySkills([...primarySkills, skillInput.trim()]);
      setSkillInput('');
    }
  };

  const handleRemoveSkill = (skill: string) => {
    setPrimarySkills(primarySkills.filter((s) => s !== skill));
  };

  const handleOnboardSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !role.trim() || !executiveMandate.trim()) {
      setErrorMsg('Please fill in employee name, role title, and executive mandate.');
      playOSSound('alert');
      return;
    }

    const palette = AVATAR_PALETTES[selectedPaletteIndex];
    const draft: CustomAIEmployeeDraft = {
      name: name.trim(),
      role: role.trim(),
      department,
      callsign: callsign.trim() || name.split(' ')[0].toUpperCase(),
      clearanceLevel,
      avatarColor: palette.val,
      accentColor: palette.hex,
      systemInstruction:
        systemInstruction.trim() ||
        `You are ${name.trim()}, ${role.trim()} in SamJuniors OS. Executive mandate: ${executiveMandate.trim()}`,
      executiveMandate: executiveMandate.trim(),
      primarySkills,
      prohibitedActions: [
        'Never execute live external payment mutations',
        'Never expose system secrets or API credentials',
        'Never fabricate metrics or TAM numbers',
      ],
      baseTone,
    };

    const res = TrainingStore.onboardCustomEmployee(draft);
    if (res.success) {
      playOSSound('celebration');
      dispatchOSNotification({
        title: `AI Employee Onboarded: ${name}`,
        message: `Custom skill tree generated. Ready for calibration and live orchestrator activation.`,
        type: 'agent',
      });
      if (onEmployeeCreated) onEmployeeCreated(res.agentId);
    }
  };

  const palette = AVATAR_PALETTES[selectedPaletteIndex];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="os-glass-card rounded-2xl p-6 border border-white/10 bg-gradient-to-r from-[#121324] via-[#10121d] to-[#0c0d16] shadow-2xl">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300">
            <UserPlus className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">AI Employee Onboarding Wizard</h3>
            <p className="text-xs text-slate-400">
              Provision custom specialized AI agents with dedicated skill trees, constitutional boundaries, and orchestration directives.
            </p>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-500/40 text-rose-200 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Grid: Form (8 cols) & Live Card Preview (4 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form */}
        <form onSubmit={handleOnboardSubmit} className="lg:col-span-8 space-y-5">
          <div className="os-glass-card rounded-2xl p-6 border border-white/10 bg-[#10121d] shadow-xl space-y-5">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              1. Employee Identity & Governance Clearance
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Marcus Sterling"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#151726] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Role Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Chief Security Officer & Cloud Auditor"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-[#151726] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Department</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full bg-[#151726] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Executive Council">Executive Council</option>
                  <option value="Engineering & Operations">Engineering & Operations</option>
                  <option value="Security & Compliance">Security & Compliance</option>
                  <option value="Growth & Customer Operations">Growth & Customer Operations</option>
                  <option value="Legal & Regulatory">Legal & Regulatory</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1">Clearance Level</label>
                <select
                  value={clearanceLevel}
                  onChange={(e) => setClearanceLevel(e.target.value)}
                  className="w-full bg-[#151726] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="L1 - Junior Associate">L1 - Junior Associate</option>
                  <option value="L2 - Certified Practitioner">L2 - Certified Practitioner</option>
                  <option value="L3 - Senior Specialist">L3 - Senior Specialist</option>
                  <option value="L4 - Lead Architect">L4 - Lead Architect</option>
                  <option value="L5 - Executive Council Member">L5 - Executive Council Member</option>
                </select>
              </div>
            </div>

            {/* Avatar Palette Choice */}
            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-2">Avatar Visual Theme</label>
              <div className="flex items-center space-x-3">
                {AVATAR_PALETTES.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedPaletteIndex(idx)}
                    className={`w-9 h-9 rounded-xl bg-gradient-to-br ${p.val} border-2 transition ${
                      selectedPaletteIndex === idx ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-60'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Executive Mandate */}
            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1">
                Executive Mandate & Primary Responsibility *
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Guarantee 100% zero-vulnerability cloud deployment, audit dependency CVEs, and enforce safe mock invariants."
                value={executiveMandate}
                onChange={(e) => setExecutiveMandate(e.target.value)}
                className="w-full bg-[#151726] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {/* Specialized Capabilities Chips */}
            <div>
              <label className="text-[11px] font-bold text-slate-300 block mb-1">Primary Specialized Capabilities</label>
              <div className="flex items-center space-x-2 mb-2">
                <input
                  type="text"
                  placeholder="Add capability (e.g. Zero-Trust Access Control)"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSkill();
                    }
                  }}
                  className="flex-1 bg-[#151726] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleAddSkill}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white text-xs font-semibold flex items-center space-x-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {primarySkills.map((skill) => (
                  <span
                    key={skill}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center space-x-1.5"
                  >
                    <span>{skill}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(skill)}
                      className="text-indigo-400 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Submit Action */}
            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-white/10">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center space-x-2 shadow-lg shadow-emerald-600/30 transition cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Onboard Employee & Generate Skill Tree</span>
              </button>
            </div>
          </div>
        </form>

        {/* Live Card Preview */}
        <div className="lg:col-span-4 space-y-4">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">Live Employee Preview</h4>

          <div className="os-glass-card rounded-2xl p-5 border border-white/10 bg-[#10121d] shadow-xl space-y-4">
            <div className="flex items-center space-x-3">
              <div
                className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${palette.val} flex items-center justify-center text-white text-lg font-bold shadow-lg border border-white/20`}
              >
                {name ? name.split(' ').map((n) => n[0]).join('') : 'AI'}
              </div>
              <div>
                <h5 className="text-sm font-bold text-white">{name || 'Employee Name'}</h5>
                <p className="text-xs text-slate-400">{role || 'Role Title'}</p>
                <span className="text-[10px] font-mono text-emerald-400 mt-1 block">{clearanceLevel}</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Executive Mandate</span>
              <p className="text-xs text-slate-300 line-clamp-3">
                {executiveMandate || 'Mandate will appear here once defined...'}
              </p>
            </div>

            <div className="space-y-1.5 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Capabilities ({primarySkills.length})</span>
              <div className="flex flex-wrap gap-1">
                {primarySkills.map((s, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded text-[10px] bg-white/5 text-slate-300 border border-white/5">
                    {s}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[11px] flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Constitutional Safe Mock Sandbox Enabled</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
