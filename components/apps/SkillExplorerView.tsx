'use client';

import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  Lock,
  ShieldCheck,
  Cpu,
  Layers,
  FileText,
  FileCheck,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Briefcase,
  FlaskConical,
  Boxes,
  Coins,
  ChevronDown,
  ChevronUp,
  Info,
  ExternalLink,
} from 'lucide-react';
import { STRUCTURED_SKILLS, getAllSkills, ROLE_SKILL_ASSIGNMENTS } from '@/lib/skills/skill-registry';
import { StructuredSkillDefinition, SkillRequiredInput } from '@/types/capabilities';
import { SkillInspectionModal } from '@/components/hq/SkillInspectionModal';

interface DepartmentMeta {
  id: 'Operations' | 'Research' | 'Product' | 'Finance';
  name: string;
  shortName: string;
  roleId: 'coo' | 'researcher' | 'pm' | 'finance';
  agentName: string;
  agentRole: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: {
    badge: string;
    border: string;
    bg: string;
    text: string;
    pill: string;
  };
  description: string;
}

const DEPARTMENTS: DepartmentMeta[] = [
  {
    id: 'Operations',
    name: 'Executive Operations & Orchestration',
    shortName: 'Operations',
    roleId: 'coo',
    agentName: 'Victoria Vance',
    agentRole: 'Chief Operating Officer',
    icon: Briefcase,
    accentColor: {
      badge: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
      border: 'border-indigo-500/30 hover:border-indigo-500/50',
      bg: 'bg-indigo-950/20',
      text: 'text-indigo-400',
      pill: 'bg-indigo-500/20 text-indigo-200 border-indigo-500/30',
    },
    description: 'Autonomous directive decomposition, multi-agent dependency scheduling, compliance gating, and executive report synthesis.',
  },
  {
    id: 'Research',
    name: 'Strategic Intelligence & Deep Tech',
    shortName: 'Research',
    roleId: 'researcher',
    agentName: 'Dr. Aris Thorne',
    agentRole: 'Chief Research Scientist',
    icon: FlaskConical,
    accentColor: {
      badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
      border: 'border-sky-500/30 hover:border-sky-500/50',
      bg: 'bg-sky-950/20',
      text: 'text-sky-400',
      pill: 'bg-sky-500/20 text-sky-200 border-sky-500/30',
    },
    description: 'Empirical market problem validation, competitor teardowns, technical stack reconnaissance, and citation-backed intelligence briefs.',
  },
  {
    id: 'Product',
    name: 'Product Architecture & User Experience',
    shortName: 'Product',
    roleId: 'pm',
    agentName: 'Elena Rostova',
    agentRole: 'Head of Product Architecture',
    icon: Boxes,
    accentColor: {
      badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
      border: 'border-emerald-500/30 hover:border-emerald-500/50',
      bg: 'bg-emerald-950/20',
      text: 'text-emerald-400',
      pill: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30',
    },
    description: 'Modular PRD formulation, user story decomposition, testable acceptance criteria, state transition modeling, and human-in-the-loop escalation guardrails.',
  },
  {
    id: 'Finance',
    name: 'Capital Planning & Unit Economics',
    shortName: 'Finance',
    roleId: 'finance',
    agentName: 'Marcus Sterling',
    agentRole: 'Chief Financial Officer',
    icon: Coins,
    accentColor: {
      badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
      border: 'border-amber-500/30 hover:border-amber-500/50',
      bg: 'bg-amber-950/20',
      text: 'text-amber-400',
      pill: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
    },
    description: 'Workload compute burn modeling, token attribution, tiered packaging simulation, gross margin stress-testing, and runway audit.',
  },
];

export const SkillExplorerView: React.FC = () => {
  const [selectedDepartment, setSelectedDepartment] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [inspectingSkill, setInspectingSkill] = useState<StructuredSkillDefinition | Readonly<StructuredSkillDefinition> | null>(null);
  const [expandedProcedures, setExpandedProcedures] = useState<Record<string, boolean>>({});

  const allSkills = useMemo(() => getAllSkills(), []);

  // Filter skills based on department and search query
  const filteredDepartments = useMemo(() => {
    return DEPARTMENTS.map((dept) => {
      const deptSkills = (ROLE_SKILL_ASSIGNMENTS[dept.roleId] || [])
        .map((id) => STRUCTURED_SKILLS[id])
        .filter(Boolean) as StructuredSkillDefinition[];

      const matchedSkills = deptSkills.filter((sk) => {
        if (!sk) return false;
        if (selectedDepartment !== 'all' && dept.id !== selectedDepartment) {
          return false;
        }

        if (!searchQuery.trim()) return true;

        const q = searchQuery.toLowerCase();
        const matchesName = sk.name.toLowerCase().includes(q);
        const matchesId = sk.id.toLowerCase().includes(q);
        const matchesPurpose = sk.purpose.toLowerCase().includes(q);
        const matchesOutput = sk.outputFormat.toLowerCase().includes(q);
        const matchesInputs = sk.requiredInputs.some((inp: any) => {
          const name = typeof inp === 'string' ? inp : inp.name || '';
          const desc = typeof inp === 'object' && inp?.description ? inp.description : '';
          return name.toLowerCase().includes(q) || desc.toLowerCase().includes(q);
        });
        const matchesTools = sk.allowedTools.some((t) => t.toLowerCase().includes(q));

        return matchesName || matchesId || matchesPurpose || matchesOutput || matchesInputs || matchesTools;
      });

      return {
        ...dept,
        skills: matchedSkills,
        totalDeptSkills: deptSkills.length,
      };
    }).filter((dept) => {
      if (selectedDepartment !== 'all' && dept.id !== selectedDepartment) {
        return false;
      }
      // If searching, only show department if it has matched skills
      if (searchQuery.trim()) {
        return dept.skills.length > 0;
      }
      return true;
    });
  }, [selectedDepartment, searchQuery]);

  const totalMatchedSkills = useMemo(() => {
    return filteredDepartments.reduce((acc, d) => acc + d.skills.length, 0);
  }, [filteredDepartments]);

  const toggleProcedure = (skillId: string) => {
    setExpandedProcedures((prev) => ({
      ...prev,
      [skillId]: !prev[skillId],
    }));
  };

  return (
    <div className="space-y-6">
      {/* Skill Explorer Header & Overview Banner */}
      <div className="os-glass-card rounded-2xl p-5 border border-white/10 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <BookOpen className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-white tracking-wide">
                Skill Explorer & Governance Directory
              </h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> Immutable Runtime
              </span>
            </div>
            <p className="text-xs text-slate-400 max-w-3xl leading-relaxed">
              Explore all first-class reusable skills in SamJuniors OS organized by department. AI Employees
              autonomously select and execute these skills based on Founder directives without manual tool prompting.
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-center">
              <span className="text-xs font-bold text-white block">{allSkills.length}</span>
              <span className="text-[9px] font-mono text-slate-400 uppercase">Total Skills</span>
            </div>
            <div className="px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-center">
              <span className="text-xs font-bold text-indigo-300 block">{DEPARTMENTS.length}</span>
              <span className="text-[9px] font-mono text-slate-400 uppercase">Departments</span>
            </div>
            <div className="px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-center">
              <span className="text-xs font-bold text-emerald-400 block">100%</span>
              <span className="text-[9px] font-mono text-slate-400 uppercase">Immutable</span>
            </div>
          </div>
        </div>

        {/* Filter Bar & Search Input */}
        <div className="pt-3 border-t border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Department Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              id="skill-explorer-filter-all"
              onClick={() => setSelectedDepartment('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selectedDepartment === 'all'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
              }`}
            >
              All Departments ({allSkills.length})
            </button>
            {DEPARTMENTS.map((dept) => {
              const deptSkillsCount = (ROLE_SKILL_ASSIGNMENTS[dept.roleId] || []).length;
              const isActive = selectedDepartment === dept.id;
              const DeptIcon = dept.icon;

              return (
                <button
                  key={dept.id}
                  id={`skill-explorer-filter-${dept.id.toLowerCase()}`}
                  onClick={() => setSelectedDepartment(dept.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10'
                  }`}
                >
                  <DeptIcon className="w-3.5 h-3.5" />
                  <span>{dept.shortName}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/30 text-slate-300">
                    {deptSkillsCount}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              id="skill-explorer-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search skills, inputs, tools..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 hover:text-white"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Zero State if Search yields nothing */}
      {filteredDepartments.length === 0 && (
        <div className="p-8 rounded-2xl bg-black/30 border border-white/10 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-slate-500 mx-auto" />
          <h4 className="text-sm font-bold text-white">No matching skills found</h4>
          <p className="text-xs text-slate-400">
            No skill definitions matched your query &ldquo;{searchQuery}&rdquo;. Try searching by skill name,
            purpose keyword, or reset the filter.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedDepartment('all');
            }}
            className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors"
          >
            Reset Filters
          </button>
        </div>
      )}

      {/* Departments & Skills Sections */}
      <div className="space-y-6">
        {filteredDepartments.map((dept) => {
          const DeptIcon = dept.icon;

          return (
            <div
              key={dept.id}
              id={`department-section-${dept.id.toLowerCase()}`}
              className="space-y-3"
            >
              {/* Department Header Banner */}
              <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <div className={`p-2.5 rounded-xl border ${dept.accentColor.badge}`}>
                    <DeptIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h4 className="text-sm font-bold text-white">{dept.name}</h4>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase font-semibold ${dept.accentColor.badge}`}>
                        {dept.id}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Assigned to <span className="font-semibold text-slate-200">{dept.agentName}</span> ({dept.agentRole}) • {dept.description}
                    </p>
                  </div>
                </div>

                <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2 self-start sm:self-auto">
                  <span className="px-2.5 py-1 rounded-lg bg-black/40 border border-white/10">
                    {dept.skills.length} of {dept.totalDeptSkills} Skill(s)
                  </span>
                </div>
              </div>

              {/* Skills Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {dept.skills.map((skill) => {
                  const isExpanded = !!expandedProcedures[skill.id];

                  return (
                    <div
                      key={skill.id}
                      id={`skill-card-${skill.id}`}
                      className="rounded-2xl bg-slate-900/90 border border-white/10 hover:border-white/20 transition-all p-5 flex flex-col justify-between space-y-4 shadow-lg"
                    >
                      {/* Skill Header */}
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                              <span className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded border uppercase ${dept.accentColor.badge}`}>
                                {skill.category}
                              </span>
                              <span className="text-[10px] font-mono text-slate-400 bg-black/40 px-2 py-0.5 rounded border border-white/5">
                                {skill.id}
                              </span>
                              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                <Lock className="w-2.5 h-2.5" /> Immutable
                              </span>
                            </div>
                            <h3 className="text-sm font-bold text-white pt-1">{skill.name}</h3>
                          </div>

                          <button
                            id={`inspect-skill-btn-${skill.id}`}
                            onClick={() => setInspectingSkill(skill)}
                            className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 text-[11px] font-semibold border border-indigo-500/30 flex items-center gap-1 transition-colors flex-shrink-0"
                            title="Inspect complete skill specification"
                          >
                            <span>Inspect</span>
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>

                        {/* Purpose Callout */}
                        <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <Info className="w-3 h-3 text-indigo-400" />
                            <span>Purpose & Strategic Intent</span>
                          </div>
                          <p className="text-xs text-slate-200 leading-relaxed">{skill.purpose}</p>
                        </div>

                        {/* Required Inputs Display */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <span className="flex items-center gap-1.5">
                              <Layers className="w-3 h-3 text-sky-400" />
                              <span>Required Inputs ({skill.requiredInputs.length})</span>
                            </span>
                            <span className="text-[9px] font-mono font-normal text-slate-500">Contract Schema</span>
                          </div>

                          <div className="space-y-1.5">
                            {skill.requiredInputs.map((inp: any, idx) => {
                              const inputName = typeof inp === 'string' ? inp : inp.name;
                              const isReq = typeof inp === 'string' ? true : inp.required;
                              const inputType = typeof inp === 'string' ? 'string' : (inp.type || 'string');
                              const inputDesc = typeof inp === 'string' ? '' : inp.description;

                              return (
                                <div
                                  key={inputName || idx}
                                  className="p-2 rounded-lg bg-black/40 border border-white/5 flex flex-col gap-1 text-xs"
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                      <span className="font-mono font-bold text-indigo-200 text-[11px]">
                                        {inputName}
                                      </span>
                                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/5 border border-white/10 text-slate-400">
                                        {inputType}
                                      </span>
                                    </div>
                                    <span
                                      className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-semibold ${
                                        isReq
                                          ? 'bg-rose-500/15 text-rose-300 border border-rose-500/20'
                                          : 'bg-slate-700/30 text-slate-400'
                                      }`}
                                    >
                                      {isReq ? 'REQUIRED' : 'OPTIONAL'}
                                    </span>
                                  </div>
                                  {inputDesc && (
                                    <p className="text-[11px] text-slate-400 leading-snug">{inputDesc}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Output Format Display */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            <FileCheck className="w-3 h-3 text-emerald-400" />
                            <span>Deliverable & Output Format</span>
                          </div>
                          <div className="p-2.5 rounded-lg bg-emerald-950/20 border border-emerald-500/20 text-xs text-emerald-200/90 leading-relaxed font-sans">
                            {skill.outputFormat}
                          </div>
                        </div>

                        {/* Allowed Tools & Procedure Summary */}
                        <div className="pt-2 border-t border-white/5 space-y-2">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                              Permitted Tools:
                            </span>
                            <div className="flex items-center gap-1 flex-wrap justify-end">
                              {skill.allowedTools.length > 0 ? (
                                skill.allowedTools.map((t) => (
                                  <span
                                    key={t}
                                    className="px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20 text-sky-300 font-mono text-[10px]"
                                  >
                                    {t}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[10px] font-mono text-slate-400 italic">
                                  Pure Analytical Reasoning (Zero external mutations)
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Accordion for Step-by-Step Procedure */}
                          <div className="pt-1">
                            <button
                              onClick={() => toggleProcedure(skill.id)}
                              className="w-full flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-200 py-1"
                            >
                              <span className="font-semibold flex items-center gap-1">
                                <span>Execution Procedure ({skill.procedure.length} Steps)</span>
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                              )}
                            </button>

                            {isExpanded && (
                              <div className="mt-1.5 p-3 rounded-lg bg-black/40 border border-white/5 space-y-1.5 text-xs">
                                {skill.procedure.map((step, idx) => (
                                  <div key={idx} className="flex items-start space-x-2 text-[11px] text-slate-300">
                                    <span className="w-4 h-4 rounded-full bg-indigo-500/20 text-indigo-300 font-mono text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5">
                                      {idx + 1}
                                    </span>
                                    <span className="leading-snug">{step}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs">
                        <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          <span>Audited by Council</span>
                        </span>

                        <button
                          onClick={() => setInspectingSkill(skill)}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1 transition-colors"
                        >
                          <span>Full Specification</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Skill Inspection Modal */}
      {inspectingSkill && (
        <SkillInspectionModal
          skill={inspectingSkill}
          onClose={() => setInspectingSkill(null)}
          assignedRoleName={
            DEPARTMENTS.find((d) => d.id === inspectingSkill.category)?.agentRole
          }
          assignedEmployeeName={
            DEPARTMENTS.find((d) => d.id === inspectingSkill.category)?.agentName
          }
        />
      )}
    </div>
  );
};
