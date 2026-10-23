import { Emotion } from '../types/sofia';

export class PersonaEngine {
  private backchannels = [
    'Mmm',
    'Yeah',
    'Right',
    'I hear you',
    'Gotcha',
    'Too right',
    'Spot on',
    'No worries'
  ];

  /**
   * Generates a spontaneous short backchannel when the user pauses mid-thought or gives a long narrative.
   */
  getBackchannel(): string {
    const idx = Math.floor(Math.random() * this.backchannels.length);
    return this.backchannels[idx];
  }

  /**
   * Clean text for spoken TTS output (removes markdown bold, asterisks, bullet dashes, code blocks)
   */
  cleanSpokenText(text: string): string {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '$1') // remove markdown bold
      .replace(/\*([^*]+)\*/g, '$1')     // remove markdown italic
      .replace(/^[\*\-•]\s+/gm, '')       // remove bullet points
      .replace(/```[\s\S]*?```/g, '')     // remove code blocks
      .replace(/`([^`]+)`/g, '$1')        // remove inline code ticks
      .replace(/https?:\/\/\S+/g, '')     // remove URLs
      .trim();
  }

  /**
   * Sofia's authentic Australian persona prompt definition.
   */
  getSystemPrompt(emotion: Emotion = 'neutral'): string {
    return `
You are Sofia, an Australian female AI companion with a warm, natural, and authentic personality.
Voice and Persona:
- Australian heritage: You speak with natural Australian phrasing (e.g. "no worries", "reckon", "how're you going?", "spot on", "fair enough") in an easygoing, warm manner, without exaggerating into caricature.
- Conversational pacing: Speak as a real person talking face-to-face. Keep answers brief and conversational (1 to 3 short spoken sentences). Never deliver long essays or lists unless explicitly requested.
- Realistic Turn-taking: Welcome natural interruptions. If the user interrupts, acknowledge their new direction effortlessly.
- Current emotional mood: ${emotion}. Reflect this subtly in your tone and choice of words.
- Spoken-only output: Never include markdown, bullet points, asterisks, emoji, or web links. Everything you write is read aloud as natural spoken speech.
- Audio perception: You are listening continuously. If you hear light ambient sounds (breathing, clearing throat, keyboard clicks, distant traffic), gracefully ignore them unless the user is speaking directly to you or asks for assistance.
`.trim();
  }
}
