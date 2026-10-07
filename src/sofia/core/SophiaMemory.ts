/**
 * core/SophiaMemory.ts
 *
 * Persistent episodic & story memory for Sofia.
 * Remembers current active story, scene progression, user facts, and recent conversation topics
 * so Sofia never forgets what she was doing and can recall past context seamlessly.
 */

export interface StoryState {
  title: string;
  genre?: string;
  characters?: string[];
  summary?: string;
  currentScene?: string;
  lastSpokenText?: string;
  isOngoing: boolean;
  updatedAt: number;
}

export interface MemoryData {
  activeStory: StoryState | null;
  recentTopics: string[];
  userFacts: Record<string, string>;
  lastTask: string | null;
  activePanel: string | null;
  updatedAt: number;
}

const STORAGE_KEY = 'sophia:memory:v1';

class SophiaMemoryManager {
  private data: MemoryData;

  constructor() {
    this.data = this.load();
  }

  private load(): MemoryData {
    if (typeof window === 'undefined' || !window.localStorage) {
      return this.defaultData();
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch (e) {
      console.warn('[SophiaMemory] Failed to load from localStorage:', e);
    }
    return this.defaultData();
  }

  private defaultData(): MemoryData {
    return {
      activeStory: null,
      recentTopics: [],
      userFacts: {},
      lastTask: null,
      activePanel: null,
      updatedAt: Date.now(),
    };
  }

  private save() {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      this.data.updatedAt = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('[SophiaMemory] Failed to save to localStorage:', e);
    }
  }

  // ─── Story Memory ─────────────────────────────────────────────────────────

  setStory(story: Partial<StoryState> & { title: string }) {
    this.data.activeStory = {
      title: story.title,
      genre: story.genre || 'fantasy',
      characters: story.characters || [],
      summary: story.summary || '',
      currentScene: story.currentScene || '',
      lastSpokenText: story.lastSpokenText || '',
      isOngoing: story.isOngoing !== undefined ? story.isOngoing : true,
      updatedAt: Date.now(),
    };
    this.save();
  }

  updateStoryProgress(currentScene: string, lastSpokenText?: string) {
    if (this.data.activeStory) {
      this.data.activeStory.currentScene = currentScene;
      if (lastSpokenText) {
        this.data.activeStory.lastSpokenText = lastSpokenText;
      }
      this.data.activeStory.updatedAt = Date.now();
      this.save();
    }
  }

  completeStory() {
    if (this.data.activeStory) {
      this.data.activeStory.isOngoing = false;
      this.save();
    }
  }

  getStory(): StoryState | null {
    return this.data.activeStory;
  }

  clearStory() {
    this.data.activeStory = null;
    this.save();
  }

  // ─── Topics & Context ─────────────────────────────────────────────────────

  addTopic(topic: string) {
    const trimmed = topic.trim();
    if (!trimmed) return;
    this.data.recentTopics = [
      trimmed,
      ...this.data.recentTopics.filter((t) => t.toLowerCase() !== trimmed.toLowerCase()),
    ].slice(0, 10);
    this.save();
  }

  setUserFact(key: string, value: string) {
    this.data.userFacts[key] = value;
    this.save();
  }

  getUserFacts(): Record<string, string> {
    return { ...this.data.userFacts };
  }

  setLastTask(task: string | null) {
    this.data.lastTask = task;
    this.save();
  }

  setActivePanel(panel: string | null) {
    this.data.activePanel = panel;
    this.save();
  }

  // ─── System Prompt Context ────────────────────────────────────────────────

  getMemoryContext(): string {
    const parts: string[] = [];

    if (this.data.activeStory && this.data.activeStory.isOngoing) {
      parts.push(
        `[ACTIVE STORY IN PROGRESS: "${this.data.activeStory.title}". ` +
        `Current Scene: "${this.data.activeStory.currentScene || 'beginning'}". ` +
        `Summary: "${this.data.activeStory.summary || 'ongoing'}". ` +
        `If the user asks "what happened", "continue", or asks for the story, do NOT start over from the beginning! Continue smoothly from where you left off until complete.]`
      );
    }

    if (this.data.recentTopics.length > 0) {
      parts.push(`[RECENT TOPICS DISCUSSED: ${this.data.recentTopics.slice(0, 5).join(', ')}]`);
    }

    if (Object.keys(this.data.userFacts).length > 0) {
      const factsStr = Object.entries(this.data.userFacts)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      parts.push(`[KNOWN USER PREFERENCES & FACTS: ${factsStr}]`);
    }

    if (this.data.lastTask) {
      parts.push(`[PREVIOUS ACTIVITY: ${this.data.lastTask}]`);
    }

    return parts.join('\n');
  }
}

export const sophiaMemory = new SophiaMemoryManager();
