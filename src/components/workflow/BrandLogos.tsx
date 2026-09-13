/**
 * ============================================================================
 * SAMJUNIORS OS — CANONICAL BRAND IDENTITY LOGOS (Phase 4.3C)
 * ============================================================================
 *
 * Official, flat brand marks for external services that may appear in
 * workflow presentations. These belong to the ENTITY IDENTITY axis of the
 * frozen execution language — they are identity glyphs, NOT execution-state
 * treatments (see execution-language.ts §3: color = runtime state, never
 * authority; brand marks carry the service's own brand identity).
 *
 * Rendering contract (founder-approved reference):
 *   - ONLY the logo itself: no outer chrome, rings, glow, gradients or
 *     decorative filters baked into the mark (except gradients that are part
 *     of the official brand mark itself, e.g. Telegram's disc).
 *   - Flat vector fills, geometric precision, crisp edges.
 *   - Rendered inside the clean 'brand' IconContainer disc (dark charcoal,
 *     thin border, subtle shadow) for open-shaped marks, or standalone for
 *     self-shaped marks (Telegram / WhatsApp already carry their own disc).
 *   - The service NAME renders below the glyph — never inside it.
 *
 * Entity-identity precedence (locked):
 *   Service keyword matching is a LAST-RESORT fallback for genuinely
 *   unmatched external nodes. It must NEVER be consulted for known company
 *   entities (agents, founder, gates, vault) — agent identity is resolved
 *   strictly BEFORE any activity/service keyword matching.
 */

import React from 'react';

export interface BrandLogoProps {
  /** Rendered edge length in px (logos are square). */
  size?: number;
  /** Accessible label — when omitted the mark is aria-hidden. */
  title?: string;
  className?: string;
}

const BrandSvg: React.FC<{
  size: number;
  title?: string;
  className?: string;
  viewBox: string;
  children: React.ReactNode;
}> = ({ size, title, className, viewBox, children }) => (
  <svg
    width={size}
    height={size}
    viewBox={viewBox}
    className={className}
    role={title ? 'img' : 'presentation'}
    aria-label={title}
    aria-hidden={title ? undefined : true}
    focusable="false"
    shapeRendering="geometricPrecision"
  >
    {title ? <title>{title}</title> : null}
    {children}
  </svg>
);

/* --------------------------------------------------------------- Google "G" */

/** Google's multicolor "G" mark (official brand colors). */
export const GoogleLogo: React.FC<BrandLogoProps> = ({ size = 24, title = 'Google', className }) => (
  <BrandSvg size={size} title={title} className={className} viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
    />
  </BrandSvg>
);

/* ------------------------------------------------------------ Google Gemini */

/** Google Gemini 4-point sparkle (official logomark with brand gradient). */
export const GeminiLogo: React.FC<BrandLogoProps> = ({ size = 24, title = 'Google Gemini', className }) => (
  <BrandSvg size={size} title={title} className={className} viewBox="0 0 24 24">
    <defs>
      <linearGradient id="sj-gemini-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4285F4" />
        <stop offset="0.5" stopColor="#9B72CB" />
        <stop offset="1" stopColor="#D96570" />
      </linearGradient>
    </defs>
    <path
      fill="url(#sj-gemini-grad)"
      d="M12 24c0-6.627-5.373-12-12-12C6.627 12 12 6.627 12 0c0 6.627 5.373 12 12 12-6.627 0-12 5.373-12 12z"
    />
  </BrandSvg>
);

/* ----------------------------------------------------------------- Telegram */

/** Telegram official mark — blue gradient disc with the white paper plane. */
export const TelegramLogo: React.FC<BrandLogoProps> = ({ size = 24, title = 'Telegram', className }) => (
  <BrandSvg size={size} title={title} className={className} viewBox="0 0 240 240">
    <defs>
      <linearGradient id="sj-telegram-grad" x1="120" y1="240" x2="120" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#1d93d2" />
        <stop offset="1" stopColor="#38b0e3" />
      </linearGradient>
    </defs>
    <circle cx="120" cy="120" r="120" fill="url(#sj-telegram-grad)" />
    <path
      fill="#c8daea"
      d="M81.229 128.772l14.237 39.406s1.78 3.687 3.686 3.687 30.255-29.492 30.255-29.492l31.525-60.89L81.737 118.6Z"
    />
    <path
      fill="#a9c6d8"
      d="M100.106 138.878l-2.733 29.046s-1.144 8.9 7.754 0 17.415-15.763 17.415-15.763"
    />
    <path
      fill="#fff"
      d="M81.486 130.178 52.2 120.636s-3.5-1.42-2.373-4.64c.232-.664.7-1.229 2.1-2.2 6.489-4.523 120.106-45.36 120.106-45.36s3.208-1.081 5.1-.362a2.766 2.766 0 0 1 1.885 2.055 9.357 9.357 0 0 1 .254 2.585c-.009.752-.1 1.449-.169 2.542-.692 11.165-21.4 94.493-21.4 94.493s-1.239 4.876-5.678 5.043a8.13 8.13 0 0 1-5.85-2.043c-8.711-7.493-38.819-27.727-45.472-32.177a1.27 1.27 0 0 1-.546-.9c-.093-.469.417-1.05.417-1.05s52.426-46.6 53.821-51.492c.108-.379-.3-.566-.848-.4-3.482 1.281-63.844 39.4-70.506 43.607a3.21 3.21 0 0 1-2.187.348Z"
    />
  </BrandSvg>
);

/* ------------------------------------------------------------------- GitHub */

/** GitHub octocat mark (official Octicons geometry, brand-neutral fill). */
export const GitHubLogo: React.FC<BrandLogoProps> = ({ size = 24, title = 'GitHub', className }) => (
  <BrandSvg size={size} title={title} className={className} viewBox="0 0 256 249">
    <g fill="#f0f6fc">
      <path d="M127.505 0C57.095 0 0 57.085 0 127.505c0 56.336 36.534 104.13 87.196 120.99 6.372 1.18 8.712-2.766 8.712-6.134 0-3.04-.119-13.085-.173-23.739-35.473 7.713-42.958-15.044-42.958-15.044-5.8-14.738-14.157-18.656-14.157-18.656-11.568-7.914.872-7.752.872-7.752 12.804.9 19.546 13.14 19.546 13.14 11.372 19.493 29.828 13.857 37.104 10.6 1.144-8.242 4.449-13.866 8.095-17.05-28.32-3.225-58.092-14.158-58.092-63.014 0-13.92 4.981-25.295 13.138-34.224-1.324-3.212-5.688-16.18 1.235-33.743 0 0 10.707-3.427 35.073 13.07 10.17-2.826 21.078-4.242 31.914-4.29 10.836.048 21.752 1.464 31.942 4.29 24.337-16.497 35.029-13.07 35.029-13.07 6.94 17.563 2.574 30.531 1.25 33.743 8.175 8.929 13.122 20.303 13.122 34.224 0 48.972-29.828 59.756-58.22 62.912 4.573 3.957 8.648 11.717 8.648 23.612 0 17.06-.148 30.791-.148 34.991 0 3.393 2.295 7.369 8.759 6.117 50.634-16.879 87.122-64.656 87.122-120.973C255.009 57.085 197.922 0 127.505 0" />
    </g>
  </BrandSvg>
);

/* -------------------------------------------------------------------- Slack */

/** Slack official 2019 four-color mark. */
export const SlackLogo: React.FC<BrandLogoProps> = ({ size = 24, title = 'Slack', className }) => (
  <BrandSvg size={size} title={title} className={className} viewBox="0 0 2447.6 2452.5">
    <g clipRule="evenodd" fillRule="evenodd">
      <path
        fill="#36c5f0"
        d="m897.4 0c-135.3.1-244.8 109.9-244.7 245.2-.1 135.3 109.5 245.1 244.8 245.2h244.8v-245.1c.1-135.3-109.5-245.1-244.9-245.3.1 0 .1 0 0 0m0 654h-652.6c-135.3.1-244.9 109.9-244.8 245.2-.2 135.3 109.4 245.1 244.7 245.3h652.7c135.3-.1 244.9-109.9 244.8-245.2.1-135.4-109.5-245.2-244.8-245.3z"
      />
      <path
        fill="#2eb67d"
        d="m2447.6 899.2c.1-135.3-109.5-245.1-244.8-245.2-135.3.1-244.9 109.9-244.8 245.2v245.3h244.8c135.3-.1 244.9-109.9 244.8-245.3zm-652.7 0v-654c.1-135.2-109.4-245-244.7-245.2-135.3.1-244.9 109.9-244.8 245.2v654c-.2 135.3 109.4 245.1 244.7 245.3 135.3-.1 244.9-109.9 244.8-245.3z"
      />
      <path
        fill="#ecb22e"
        d="m1550.1 2452.5c135.3-.1 244.9-109.9 244.8-245.2.1-135.3-109.5-245.1-244.8-245.2h-244.8v245.2c-.1 135.2 109.5 245 244.8 245.2zm0-654.1h652.7c135.3-.1 244.9-109.9 244.8-245.2.2-135.3-109.4-245.1-244.7-245.3h-652.7c-135.3.1-244.9 109.9-244.8 245.2-.1 135.4 109.4 245.2 244.7 245.3z"
      />
      <path
        fill="#e01e5a"
        d="m0 1553.2c-.1 135.3 109.5 245.1 244.8 245.2 135.3-.1 244.9-109.9 244.8-245.2v-245.2h-244.8c-135.3.1-244.9 109.9-244.8 245.2zm652.7 0v654c-.2 135.3 109.4 245.1 244.7 245.3 135.3-.1 244.9-109.9 244.8-245.2v-653.9c.2-135.3-109.4-245.1-244.7-245.3-135.4 0-244.9 109.8-244.8 245.1 0 0 0 .1 0 0"
      />
    </g>
  </BrandSvg>
);

/* -------------------------------------------------------------------- Gmail */

/** Gmail official 2020 multicolor envelope mark. */
export const GmailLogo: React.FC<BrandLogoProps> = ({ size = 24, title = 'Gmail', className }) => (
  <BrandSvg size={size} title={title} className={className} viewBox="52 42 88 66">
    <path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6" />
    <path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15" />
    <path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2" />
    <path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92" />
    <path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2" />
  </BrandSvg>
);

/* ---------------------------------------------------------------- WhatsApp */

/** WhatsApp official mark — green disc with the white handset bubble. */
export const WhatsAppLogo: React.FC<BrandLogoProps> = ({ size = 24, title = 'WhatsApp', className }) => (
  <BrandSvg size={size} title={title} className={className} viewBox="0 0 32 32">
    <path
      fill="#25D366"
      d="M16 0C7.164 0 0 7.164 0 16c0 2.211.453 4.316 1.273 6.227L0 32l9.953-1.23C11.797 31.551 13.867 32 16 32c8.836 0 16-7.164 16-16S24.836 0 16 0z"
    />
    <path
      fill="#fff"
      d="M23.867 19.7c-.398-.2-2.352-1.16-2.715-1.293-.363-.133-.629-.199-.891.2-.266.398-1.027 1.293-1.262 1.559-.23.266-.461.3-.86.102-.398-.2-1.683-.621-3.203-1.977-1.184-1.055-1.984-2.356-2.215-2.754-.23-.399-.023-.614.176-.813.18-.179.398-.464.598-.695.199-.23.265-.398.398-.664.133-.266.066-.497-.035-.696-.098-.199-.887-2.136-1.215-2.922-.32-.769-.645-.664-.887-.676-.23-.012-.492-.012-.754-.012-.261 0-.683.098-1.043.496-.356.399-1.36 1.328-1.36 3.235s1.395 3.754 1.59 4.011c.199.267 2.738 4.18 6.633 5.86 3.895 1.68 3.895 1.12 4.598 1.051.699-.066 2.254-.918 2.57-1.808.32-.887.32-1.649.227-1.809-.094-.164-.325-.262-.723-.46z"
    />
  </BrandSvg>
);

/* ----------------------------------------------------------------- registry */

/**
 * SERVICE_BRANDS — canonical registry mapping service identities to their
 * official logo component + presentation treatment. Consumed by the entity
 * visual resolver (identity fallback tier) and the design-system specimen.
 */
export type ServiceBrandKey =
  | 'google'
  | 'gemini'
  | 'telegram'
  | 'github'
  | 'slack'
  | 'gmail'
  | 'whatsapp';

export interface ServiceBrandEntry {
  /** Official logo mark. */
  Logo: React.FC<BrandLogoProps>;
  /** Canonical display name (renders BELOW the glyph). */
  label: string;
  /** Canonical sub-label (service role, uppercase). */
  sublabel: string;
  /**
   * 'disc' — open-shaped mark rendered inside the clean brand disc
   * (dark charcoal, thin border — per the approved reference).
   * 'none' — self-shaped mark (carries its own disc) rendered standalone.
   */
  container: 'disc' | 'none';
}

export const SERVICE_BRANDS: Record<ServiceBrandKey, ServiceBrandEntry> = {
  google: { Logo: GoogleLogo, label: 'Google', sublabel: 'SEARCH SERVICE', container: 'disc' },
  gemini: { Logo: GeminiLogo, label: 'Google Gemini', sublabel: 'CHAT MODEL', container: 'disc' },
  telegram: { Logo: TelegramLogo, label: 'Telegram', sublabel: 'COMMUNICATION', container: 'none' },
  github: { Logo: GitHubLogo, label: 'GitHub', sublabel: 'VERSION CONTROL', container: 'disc' },
  slack: { Logo: SlackLogo, label: 'Slack', sublabel: 'TEAM CHAT', container: 'disc' },
  gmail: { Logo: GmailLogo, label: 'Gmail', sublabel: 'EXTERNAL SERVICE', container: 'disc' },
  whatsapp: { Logo: WhatsAppLogo, label: 'WhatsApp', sublabel: 'COMMUNICATION', container: 'none' },
};
