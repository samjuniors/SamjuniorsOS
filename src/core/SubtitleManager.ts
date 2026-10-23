import { SofiaSubtitleData } from '../types/sofia';

export interface WordInfo {
  word: string;
  charStart: number;
  charEnd: number;
  durationMs: number;
}

export interface ThoughtGroup {
  id: string;
  text: string;
  words: string[];
  wordInfos: WordInfo[];
  charStart: number;
  charEnd: number;
  pauseAfterMs: number;
  estimatedDurationMs: number;
}

/**
 * Calculates natural word duration matching human spoken cadence and voice playback (~190-210 WPM).
 * Short words take ~140-180ms, medium words ~190-250ms, longer words ~280-380ms.
 */
export function estimateWordDurationMs(word: string, isTerminal: boolean, speed: number = 1.0): number {
  const clean = word.replace(/[^a-zA-Z0-9]/g, '');
  const len = clean.length;
  // Syllables roughly 1 per 3.1 characters
  const syllables = Math.max(1, Math.round(len / 3.1));

  // Natural speech tempo: base 125ms + 40ms/syllable + 7ms/char
  let duration = 125 + syllables * 40 + len * 7;

  // Clause boundary breath pause (comma, semicolon)
  if (/[,;:]$/.test(word)) {
    duration += 70;
  } else if (isTerminal || /[.!?]$/.test(word)) {
    duration += 90;
  }

  return Math.round(duration / Math.max(0.5, Math.min(2.0, speed || 1.0)));
}

/**
 * Splits English spoken text into Thought Groups according to natural pause phrasing.
 */
export function segmentEnglishThoughtGroups(fullText: string, speed: number = 1.0): ThoughtGroup[] {
  if (!fullText || !fullText.trim()) return [];

  const regex = /(.*?)([,.!?;:—–\n]+(?:\s+|$)|$)/g;
  const thoughtGroups: ThoughtGroup[] = [];
  let match: RegExpExecArray | null;
  let counter = 0;

  while ((match = regex.exec(fullText)) !== null) {
    if (match.index === regex.lastIndex) {
      regex.lastIndex++;
    }
    const rawPhrase = (match[1] + match[2]).trim();
    if (!rawPhrase) continue;

    const groupStart = match.index;
    const groupEnd = groupStart + rawPhrase.length;

    const words = rawPhrase.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const wordInfos: WordInfo[] = [];
    let searchPos = groupStart;

    words.forEach((w, wIdx) => {
      const idx = fullText.indexOf(w, searchPos);
      const wStart = idx !== -1 ? idx : searchPos;
      const wEnd = wStart + w.length;
      searchPos = wEnd;

      const isLastWord = wIdx === words.length - 1;
      const durationMs = estimateWordDurationMs(w, isLastWord, speed);
      wordInfos.push({
        word: w,
        charStart: wStart,
        charEnd: wEnd,
        durationMs
      });
    });

    // Punctuation pause after phrase
    let pauseAfterMs = 70;
    if (/[.!?]$/.test(rawPhrase)) {
      pauseAfterMs = 130;
    } else if (/[,;:]$/.test(rawPhrase)) {
      pauseAfterMs = 80;
    }

    const estimatedDurationMs =
      wordInfos.reduce((acc, wi) => acc + wi.durationMs, 0) + pauseAfterMs;

    counter++;
    thoughtGroups.push({
      id: `tg-${Date.now()}-${counter}-${Math.random().toString(36).substring(2, 6)}`,
      text: rawPhrase,
      words,
      wordInfos,
      charStart: groupStart,
      charEnd: groupEnd,
      pauseAfterMs,
      estimatedDurationMs
    });
  }

  return thoughtGroups;
}

export class SubtitleManager {
  private fullText = '';
  private thoughtGroups: ThoughtGroup[] = [];
  private currentGroupIndex = -1;
  private currentThoughtGroup: ThoughtGroup | null = null;
  private currentSubtitleData: SofiaSubtitleData | null = null;

  private wordTimeout: any = null;
  private phraseHoldTimer: any = null;
  private phraseGapTimer: any = null;

  private liveStreamBuffer = '';
  private speed = 1.0;
  private totalAudioDurationMs: number | null = null;
  private turnStartTime = 0;

  private onUpdateCallback: (data: SofiaSubtitleData | null) => void;

  constructor(onUpdate: (data: SofiaSubtitleData | null) => void) {
    this.onUpdateCallback = onUpdate;
  }

  setSpeed(speed: number) {
    this.speed = Math.max(0.5, Math.min(2.0, speed || 1.0));
  }

  /**
   * Start rendering subtitles for a full turn of text.
   * If totalAudioDurationMs is known, timings are scaled to match the audio duration precisely.
   */
  startTurn(text: string, totalAudioDurationMs?: number) {
    this.clear();
    this.fullText = text.trim();
    this.turnStartTime = Date.now();
    this.totalAudioDurationMs = totalAudioDurationMs || null;

    const groups = segmentEnglishThoughtGroups(this.fullText, this.speed);
    if (groups.length === 0) return;

    if (this.totalAudioDurationMs && this.totalAudioDurationMs > 200) {
      this.scaleGroupsToDuration(groups, this.totalAudioDurationMs);
    }

    this.thoughtGroups = groups;
    this.currentGroupIndex = 0;
    this.playThoughtGroup(0);
  }

  /**
   * Dynamically adjusts total duration when audio buffer arrives after startTurn.
   */
  adjustTotalDuration(durationMs: number) {
    if (!durationMs || durationMs <= 150 || this.thoughtGroups.length === 0) return;
    this.totalAudioDurationMs = durationMs;

    const elapsed = Date.now() - this.turnStartTime;
    const remainingAudioMs = Math.max(150, durationMs - elapsed);

    const remainingGroups = this.thoughtGroups.slice(Math.max(0, this.currentGroupIndex));
    if (remainingGroups.length > 0) {
      this.scaleGroupsToDuration(remainingGroups, remainingAudioMs);
    }
  }

  private scaleGroupsToDuration(groups: ThoughtGroup[], targetDurationMs: number) {
    const totalEstimated = groups.reduce((sum, g) => sum + g.estimatedDurationMs, 0);
    if (totalEstimated <= 0) return;

    const scale = targetDurationMs / totalEstimated;
    const factor = Math.max(0.4, Math.min(2.2, scale));

    for (const g of groups) {
      g.pauseAfterMs = Math.round(g.pauseAfterMs * factor);
      for (const wi of g.wordInfos) {
        wi.durationMs = Math.max(70, Math.round(wi.durationMs * factor));
      }
      g.estimatedDurationMs =
        g.wordInfos.reduce((s, wi) => s + wi.durationMs, 0) + g.pauseAfterMs;
    }
  }

  /**
   * Word boundary event from Web Speech Synthesis (`SpeechSynthesisUtterance.onboundary`).
   * Gives exact millisecond-accurate sync with browser voice.
   */
  onCharBoundary(charIndex: number) {
    if (!this.fullText || this.thoughtGroups.length === 0) return;

    for (let gIdx = 0; gIdx < this.thoughtGroups.length; gIdx++) {
      const group = this.thoughtGroups[gIdx];
      if (charIndex >= group.charStart && charIndex <= group.charEnd + 4) {
        if (this.currentGroupIndex !== gIdx) {
          this.clearTimers();
          this.currentGroupIndex = gIdx;
          this.currentThoughtGroup = group;
        }

        for (let wIdx = 0; wIdx < group.wordInfos.length; wIdx++) {
          const wi = group.wordInfos[wIdx];
          if (charIndex >= wi.charStart && charIndex <= wi.charEnd + 2) {
            this.setWordActive(wIdx);
            return;
          }
        }
        return;
      }
    }
  }

  private setWordActive(wordIndex: number) {
    if (!this.currentThoughtGroup) return;

    this.clearTimers();
    const visibleCount = Math.min(wordIndex + 1, this.currentThoughtGroup.words.length);

    this.currentSubtitleData = {
      phraseId: this.currentThoughtGroup.id,
      text: this.currentThoughtGroup.text,
      words: this.currentThoughtGroup.words,
      visibleCount,
      activeIndex: wordIndex,
      isSpeaking: true
    };
    this.onUpdateCallback(this.currentSubtitleData);

    // Schedule next word
    if (wordIndex < this.currentThoughtGroup.wordInfos.length - 1) {
      const dur = this.currentThoughtGroup.wordInfos[wordIndex].durationMs;
      this.wordTimeout = setTimeout(() => {
        this.setWordActive(wordIndex + 1);
      }, dur);
    } else {
      // Last word in thought group: hold for spoken duration + brief pause
      const dur = this.currentThoughtGroup.wordInfos[wordIndex].durationMs;
      const holdTime = dur + this.currentThoughtGroup.pauseAfterMs;

      this.phraseHoldTimer = setTimeout(() => {
        this.completeCurrentThoughtGroup();
      }, holdTime);
    }
  }

  /**
   * Append live transcript chunk from Gemini Live API streaming session.
   * Displays words promptly without requiring punctuation delays.
   */
  appendLiveChunk(chunk: string) {
    this.liveStreamBuffer += chunk;

    // Check if buffer contains punctuation or has accumulated 3+ words
    const words = this.liveStreamBuffer.trim().split(/\s+/).filter(Boolean);
    const hasPunctuation = /[,.!?;:—–\n]/.test(this.liveStreamBuffer);

    if (hasPunctuation || words.length >= 4) {
      let segmentText = '';
      if (hasPunctuation) {
        const match = this.liveStreamBuffer.match(/(.*?)([,.!?;:—–\n]+)(\s+|$)/);
        if (match) {
          segmentText = (match[1] + match[2]).trim();
          this.liveStreamBuffer = this.liveStreamBuffer.substring(match[0].length);
        }
      } else {
        segmentText = words.slice(0, 4).join(' ');
        this.liveStreamBuffer = words.slice(4).join(' ');
      }

      if (segmentText) {
        const groups = segmentEnglishThoughtGroups(segmentText, this.speed);
        if (groups.length > 0) {
          this.thoughtGroups.push(...groups);
          if (this.currentGroupIndex === -1) {
            this.currentGroupIndex = 0;
            this.playThoughtGroup(0);
          }
        }
      }
    }
  }

  /**
   * Complete the turn when audio stops.
   */
  finishTurn() {
    // Flush any leftover text in live buffer
    if (this.liveStreamBuffer.trim()) {
      const leftover = this.liveStreamBuffer.trim();
      this.liveStreamBuffer = '';
      const groups = segmentEnglishThoughtGroups(leftover, this.speed);
      if (groups.length > 0) {
        this.thoughtGroups.push(...groups);
        if (this.currentGroupIndex === -1) {
          this.currentGroupIndex = 0;
          this.playThoughtGroup(0);
          return;
        }
      }
    }

    // Keep final subtitle visible for a clean reading pause (~300ms) then fade out
    if (this.currentSubtitleData) {
      this.currentSubtitleData = {
        ...this.currentSubtitleData,
        isSpeaking: false,
        visibleCount: this.currentSubtitleData.words.length
      };
      this.onUpdateCallback(this.currentSubtitleData);

      setTimeout(() => {
        this.clear();
      }, 300);
    } else {
      this.clear();
    }
  }

  private playThoughtGroup(index: number) {
    this.clearTimers();

    if (index >= this.thoughtGroups.length) {
      this.clear();
      return;
    }

    this.currentGroupIndex = index;
    const tg = this.thoughtGroups[index];
    this.currentThoughtGroup = tg;

    this.setWordActive(0);
  }

  private completeCurrentThoughtGroup() {
    this.clearTimers();

    if (this.currentSubtitleData) {
      this.currentSubtitleData = {
        ...this.currentSubtitleData,
        isSpeaking: false
      };
      this.onUpdateCallback(this.currentSubtitleData);
    }

    const nextIndex = this.currentGroupIndex + 1;
    if (nextIndex < this.thoughtGroups.length) {
      // Seamless tiny breath gap between clauses (~40ms)
      this.phraseGapTimer = setTimeout(() => {
        this.playThoughtGroup(nextIndex);
      }, 40);
    } else {
      this.onUpdateCallback(null);
      this.currentThoughtGroup = null;
      this.currentSubtitleData = null;
    }
  }

  clear() {
    this.clearTimers();
    this.thoughtGroups = [];
    this.currentGroupIndex = -1;
    this.currentThoughtGroup = null;
    this.currentSubtitleData = null;
    this.liveStreamBuffer = '';
    this.totalAudioDurationMs = null;
    this.onUpdateCallback(null);
  }

  private clearTimers() {
    if (this.wordTimeout) {
      clearTimeout(this.wordTimeout);
      this.wordTimeout = null;
    }
    if (this.phraseHoldTimer) {
      clearTimeout(this.phraseHoldTimer);
      this.phraseHoldTimer = null;
    }
    if (this.phraseGapTimer) {
      clearTimeout(this.phraseGapTimer);
      this.phraseGapTimer = null;
    }
  }

  destroy() {
    this.clear();
  }
}
