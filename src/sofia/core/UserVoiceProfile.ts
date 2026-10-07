/**
 * core/UserVoiceProfile.ts
 *
 * User Voiceprint Identification & Selective Crowd Filter for Sofia.
 *
 * Purpose:
 *   1. Remembers the user's unique vocal characteristics (pitch/F0, harmonic profile, timbre).
 *   2. Rejects background crowd noise, bystanders, and diffuse conversations so Sofia responds
 *      ONLY to the enrolled user even in crowded or noisy spaces ("hear from other ear but keep responding to me").
 *   3. Prevents speaker self-interruption (hiccups) by filtering out speaker reverberation.
 */

export interface VoiceprintFeatures {
  f0: number; // Fundamental frequency in Hz (0 if unvoiced)
  harmonicity: number; // Harmonicity confidence 0.0 - 1.0 (voicing strength)
  rms: number; // Signal energy
  spectralCentroid: number; // Spectral brightness / timbre in Hz
  midBandRatio: number; // 300 - 3400 Hz formant ratio
  isVoiced: boolean;
}

export interface UserVoiceProfileData {
  enrolled: boolean;
  name: string;
  f0Mean: number;
  f0Min: number;
  f0Max: number;
  spectralCentroid: number;
  harmonicRatio: number;
  sampleCount: number;
  confidence: number;
  lastUpdated: number;
}

const STORAGE_KEY = 'sophia:user-voice-profile';
const MIN_ENROLLMENT_SAMPLES = 12;

export class UserVoiceProfile extends EventTarget {
  private profile: UserVoiceProfileData;
  private recentMatches: boolean[] = [];
  private speechHangoverFrames = 0;
  private readonly maxHangoverFrames = 8; // ~500ms hangover to retain natural sentence pauses

  constructor() {
    super();
    this.profile = this.loadProfile();
  }

  get isEnrolled(): boolean {
    return this.profile.enrolled && this.profile.confidence >= 0.6;
  }

  get profileData(): UserVoiceProfileData {
    return { ...this.profile };
  }

  // ─── Persistence ────────────────────────────────────────────────────────────

  private loadProfile(): UserVoiceProfileData {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (typeof d.f0Mean === 'number' && d.f0Mean > 50) {
          return d;
        }
      }
    } catch {
      /* ignore */
    }
    return {
      enrolled: false,
      name: 'Primary User',
      f0Mean: 0,
      f0Min: 999,
      f0Max: 0,
      spectralCentroid: 0,
      harmonicRatio: 0,
      sampleCount: 0,
      confidence: 0,
      lastUpdated: 0,
    };
  }

  saveProfile() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
      this.dispatchEvent(new CustomEvent('profile-updated', { detail: this.profile }));
    } catch {
      /* ignore */
    }
  }

  resetProfile() {
    this.profile = {
      enrolled: false,
      name: 'Primary User',
      f0Mean: 0,
      f0Min: 999,
      f0Max: 0,
      spectralCentroid: 0,
      harmonicRatio: 0,
      sampleCount: 0,
      confidence: 0,
      lastUpdated: 0,
    };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    this.dispatchEvent(new CustomEvent('profile-reset'));
  }

  // ─── Feature Extraction (Pitch & Spectral) ─────────────────────────────────

  extractFeatures(pcm: Int16Array, sampleRate: number = 16000): VoiceprintFeatures {
    const len = pcm.length;
    if (len === 0) {
      return { f0: 0, harmonicity: 0, rms: 0, spectralCentroid: 0, midBandRatio: 0, isVoiced: false };
    }

    // 1. RMS Energy & Convert to normalized float
    let sumSquares = 0;
    const floatBuf = new Float32Array(len);
    for (let i = 0; i < len; i++) {
      const s = pcm[i] / 32768.0;
      floatBuf[i] = s;
      sumSquares += s * s;
    }
    const rms = Math.sqrt(sumSquares / len);

    if (rms < 0.012) {
      return { f0: 0, harmonicity: 0, rms, spectralCentroid: 0, midBandRatio: 0, isVoiced: false };
    }

    // 2. Pitch Detection via Normalized Autocorrelation
    // Pitch range: 75 Hz (lag ~213 at 16kHz) to 340 Hz (lag ~47 at 16kHz)
    const minLag = Math.floor(sampleRate / 340); // ~47
    const maxLag = Math.floor(sampleRate / 75);  // ~213

    let bestLag = 0;
    let maxCorr = 0;
    const norm = sumSquares;

    for (let lag = minLag; lag <= maxLag && lag < len / 2; lag++) {
      let corr = 0;
      for (let i = 0; i < len - lag; i++) {
        corr += floatBuf[i] * floatBuf[i + lag];
      }
      const normCorr = corr / (norm + 1e-6);
      if (normCorr > maxCorr) {
        maxCorr = normCorr;
        bestLag = lag;
      }
    }

    const f0 = bestLag > 0 ? sampleRate / bestLag : 0;
    const isVoiced = maxCorr > 0.38 && f0 >= 75 && f0 <= 340;

    // 3. Spectral Centroid Approximation via Zero-Crossing & Energy Distribution
    let zeroCrossings = 0;
    for (let i = 1; i < len; i++) {
      if ((floatBuf[i] >= 0 && floatBuf[i - 1] < 0) || (floatBuf[i] < 0 && floatBuf[i - 1] >= 0)) {
        zeroCrossings++;
      }
    }
    const zcrRate = zeroCrossings / len;
    const spectralCentroid = zcrRate * (sampleRate / 2);

    // Human speech has high mid-band formant presence
    const midBandRatio = isVoiced ? Math.min(1.0, maxCorr * 1.2) : 0.3;

    return {
      f0: isVoiced ? f0 : 0,
      harmonicity: maxCorr,
      rms,
      spectralCentroid,
      midBandRatio,
      isVoiced,
    };
  }

  // ─── Enrollment / Adaptation ───────────────────────────────────────────────

  enrollFrame(features: VoiceprintFeatures) {
    if (!features.isVoiced || features.rms < 0.025 || features.harmonicity < 0.45) return;

    const p = this.profile;
    const n = p.sampleCount;

    if (n === 0) {
      p.f0Mean = features.f0;
      p.f0Min = features.f0;
      p.f0Max = features.f0;
      p.spectralCentroid = features.spectralCentroid;
      p.harmonicRatio = features.harmonicity;
      p.sampleCount = 1;
      p.confidence = 0.2;
    } else {
      // Exponential moving average for voiceprint calibration
      const alpha = Math.max(0.08, 1 / (n + 1));
      p.f0Mean = p.f0Mean * (1 - alpha) + features.f0 * alpha;
      p.f0Min = Math.min(p.f0Min, features.f0);
      p.f0Max = Math.max(p.f0Max, features.f0);
      p.spectralCentroid = p.spectralCentroid * (1 - alpha) + features.spectralCentroid * alpha;
      p.harmonicRatio = p.harmonicRatio * (1 - alpha) + features.harmonicity * alpha;
      p.sampleCount++;
      p.confidence = Math.min(1.0, p.sampleCount / MIN_ENROLLMENT_SAMPLES);
    }

    if (p.sampleCount >= MIN_ENROLLMENT_SAMPLES && !p.enrolled) {
      p.enrolled = true;
      p.confidence = Math.max(p.confidence, 0.85);
    }

    p.lastUpdated = Date.now();
    this.saveProfile();
  }

  // ─── Speaker Evaluation & Crowd Filtering ───────────────────────────────────

  /**
   * Evaluates if incoming audio matches the enrolled user's voiceprint.
   * Returns a match score from 0.0 (crowd/stranger/noise) to 1.0 (enrolled user).
   */
  evaluateSpeaker(features: VoiceprintFeatures): {
    isUser: boolean;
    matchScore: number;
    reason: 'enrolled_user' | 'learning_user' | 'crowd_murmur' | 'different_speaker' | 'silence';
  } {
    if (features.rms < 0.015) {
      return { isUser: false, matchScore: 0, reason: 'silence' };
    }

    // If unvoiced (whisper, sibilance, or ambient murmur):
    if (!features.isVoiced) {
      // Check if we are within speech hangover (user paused between words)
      if (this.speechHangoverFrames > 0) {
        this.speechHangoverFrames--;
        return { isUser: true, matchScore: 0.6, reason: 'enrolled_user' };
      }
      return { isUser: false, matchScore: 0.15, reason: 'crowd_murmur' };
    }

    // Auto-enroll if not enrolled yet:
    if (!this.isEnrolled) {
      this.enrollFrame(features);
      this.speechHangoverFrames = this.maxHangoverFrames;
      return { isUser: true, matchScore: 0.8, reason: 'learning_user' };
    }

    // Compare with enrolled profile:
    const p = this.profile;

    // 1. Pitch distance (log scale ratio)
    const pitchRatio = features.f0 / p.f0Mean;
    const pitchDist = Math.abs(Math.log2(pitchRatio)); // 0 = exact match, 1 = octave off

    // User's voice typically varies within ±30% (approx 0.45 octaves)
    const pitchScore = Math.max(0, 1.0 - pitchDist * 2.2);

    // 2. Harmonicity & Timbre score
    const harmonicDiff = Math.abs(features.harmonicity - p.harmonicRatio);
    const harmonicScore = Math.max(0, 1.0 - harmonicDiff * 1.5);

    // 3. Combined match score
    const matchScore = pitchScore * 0.7 + harmonicScore * 0.3;
    const isMatch = matchScore >= 0.42;

    if (isMatch) {
      this.speechHangoverFrames = this.maxHangoverFrames;
      // Gently refine voiceprint
      this.enrollFrame(features);
      this.recentMatches.push(true);
      if (this.recentMatches.length > 20) this.recentMatches.shift();
      return { isUser: true, matchScore, reason: 'enrolled_user' };
    }

    // Non-matching speaker detected (crowd member, bystander, stranger):
    this.recentMatches.push(false);
    if (this.recentMatches.length > 20) this.recentMatches.shift();

    if (this.speechHangoverFrames > 0) {
      this.speechHangoverFrames--;
      return { isUser: true, matchScore: 0.5, reason: 'enrolled_user' };
    }

    return {
      isUser: false,
      matchScore,
      reason: pitchDist > 0.6 ? 'different_speaker' : 'crowd_murmur',
    };
  }

  /**
   * Decision Gate for audio chunk transmission:
   * Returns true if frame should be sent to Gemini / Speech brain, false if suppressed.
   */
  shouldForwardChunk(
    pcm: Int16Array,
    isSofiaSpeaking: boolean,
    asrInterruptionEnabled: boolean,
    crowdFilterEnabled: boolean
  ): boolean {
    const features = this.extractFeatures(pcm);

    // ── Scenario A: Sofia is actively speaking ──────────────────────────────
    if (isSofiaSpeaking) {
      // If barge-in is disabled, NEVER forward mic audio during speech (completely eliminates hiccups)
      if (!asrInterruptionEnabled) {
        return false;
      }
      // If barge-in is enabled, require HIGH CONFIDENCE that the enrolled user is speaking directly to her
      const evalResult = this.evaluateSpeaker(features);
      return evalResult.isUser && features.rms > 0.06;
    }

    // ── Scenario B: Standby / Listening ─────────────────────────────────────
    if (!crowdFilterEnabled) {
      // Crowd filter off: normal audio transmission
      return true;
    }

    // Crowd filter ON: only forward if it is the enrolled user
    const evalResult = this.evaluateSpeaker(features);
    return evalResult.isUser || features.rms < 0.012; // allow quiet background frames for VAD calibration
  }
}

export const userVoiceProfile = new UserVoiceProfile();
