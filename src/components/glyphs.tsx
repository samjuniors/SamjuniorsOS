"use client";

import React from "react";

export function GoogleG({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size}>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.4 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.2-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.4-4.7 7l7.6 5.9c4.4-4.1 6.8-10.1 6.8-17.4z" />
      <path fill="#FBBC05" d="M10.4 28.7a14.6 14.6 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.3 0-11.7-3.9-13.6-9.4l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function MemoryGlyph({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.6a4.2 4.2 0 0 1 4.2 4.2M21.4 12a4.2 4.2 0 0 1-4.2 4.2M12 21.4a4.2 4.2 0 0 1-4.2-4.2M2.6 12a4.2 4.2 0 0 1 4.2-4.2" />
      <path d="M12 2.6C7 2.6 2.6 7 2.6 12M21.4 12c0 5-4.4 9.4-9.4 9.4" opacity="0.5" />
    </svg>
  );
}

export function TriggerGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" strokeLinejoin="round" />
    </svg>
  );
}

export function AgentGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="4" y="7" width="16" height="11" rx="3" />
      <circle cx="9" cy="12.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12.5" r="1.3" fill="currentColor" stroke="none" />
      <path d="M12 3v4M2.5 11v4M21.5 11v4" strokeLinecap="round" />
    </svg>
  );
}

export function SheetGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M6 3h8l4 4v14H6z" strokeLinejoin="round" />
      <path d="M14 3v4h4M9 12h6M9 15.5h6M9 8.5h2" strokeLinecap="round" />
    </svg>
  );
}

export function SearchGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4.5 4.5" strokeLinecap="round" />
    </svg>
  );
}

export function LockGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="5" y="10" width="14" height="10" rx="2.5" />
      <path d="M8.5 10V7.5a3.5 3.5 0 1 1 7 0V10" />
    </svg>
  );
}

export function ShieldGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M12 3 5 6v6c0 4.2 3 7.7 7 9 4-1.3 7-4.8 7-9V6l-7-3z" strokeLinejoin="round" />
      <path d="m9 12 2.2 2.2L15.5 10" strokeLinecap="round" />
    </svg>
  );
}

export function TelegramGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true">
      <path d="M21.9 4.3 18.7 19c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9L18.2 6c.4-.3-.1-.5-.6-.2L6.5 12.7l-4.7-1.5c-1-.3-1-1 .2-1.5L20.5 2.8c.9-.3 1.6.2 1.4 1.5z" />
    </svg>
  );
}

/* ------------------------------------------------------------ Brand Mark Integration */

export interface BrandLogoProps {
  size?: number;
  title?: string;
  className?: string;
}

export const GoogleLogo: React.FC<BrandLogoProps> = ({ size = 24 }) => <GoogleG size={size} />;

export const GeminiLogo: React.FC<BrandLogoProps> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <defs>
      <linearGradient id="cvl-gemini-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4285F4" />
        <stop offset="0.5" stopColor="#9B72CB" />
        <stop offset="1" stopColor="#D96570" />
      </linearGradient>
    </defs>
    <path
      fill="url(#cvl-gemini-grad)"
      d="M12 24c0-6.627-5.373-12-12-12C6.627 12 12 6.627 12 0c0 6.627 5.373 12 12 12-6.627 0-12 5.373-12 12z"
    />
  </svg>
);

export const TelegramLogo: React.FC<BrandLogoProps> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 240 240" aria-hidden="true">
    <defs>
      <linearGradient id="cvl-tg-grad" x1="120" y1="240" x2="120" y2="0" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#1d93d2" />
        <stop offset="1" stopColor="#38b0e3" />
      </linearGradient>
    </defs>
    <circle cx="120" cy="120" r="120" fill="url(#cvl-tg-grad)" />
    <path fill="#c8daea" d="M81.229 128.772l14.237 39.406s1.78 3.687 3.686 3.687 30.255-29.492 30.255-29.492l31.525-60.89L81.737 118.6Z" />
    <path fill="#a9c6d8" d="M100.106 138.878l-2.733 29.046s-1.144 8.9 7.754 0 17.415-15.763 17.415-15.763" />
    <path fill="#fff" d="M81.486 130.178 52.2 120.636s-3.5-1.42-2.373-4.64c.232-.664.7-1.229 2.1-2.2 6.489-4.523 120.106-45.36 120.106-45.36s3.208-1.081 5.1-.362a2.766 2.766 0 0 1 1.885 2.055 9.357 9.357 0 0 1 .254 2.585c-.009.752-.1 1.449-.169 2.542-.692 11.165-21.4 94.493-21.4 94.493s-1.239 4.876-5.678 5.043a8.13 8.13 0 0 1-5.85-2.043c-8.711-7.493-38.819-27.727-45.472-32.177a1.27 1.27 0 0 1-.546-.9c-.093-.469.417-1.05.417-1.05s52.426-46.6 53.821-51.492c.108-.379-.3-.566-.848-.4-3.482 1.281-63.844 39.4-70.506 43.607a3.21 3.21 0 0 1-2.187.348Z" />
  </svg>
);

export const GitHubLogo: React.FC<BrandLogoProps> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 256 249" aria-hidden="true">
    <path fill="#f0f6fc" d="M127.505 0C57.095 0 0 57.085 0 127.505c0 56.336 36.534 104.13 87.196 120.99 6.372 1.18 8.712-2.766 8.712-6.134 0-3.04-.119-13.085-.173-23.739-35.473 7.713-42.958-15.044-42.958-15.044-5.8-14.738-14.157-18.656-14.157-18.656-11.568-7.914.872-7.752.872-7.752 12.804.9 19.546 13.14 19.546 13.14 11.372 19.493 29.828 13.857 37.104 10.6 1.144-8.242 4.449-13.866 8.095-17.05-28.32-3.225-58.092-14.158-58.092-63.014 0-13.92 4.981-25.295 13.138-34.224-1.324-3.212-5.688-16.18 1.235-33.743 0 0 10.707-3.427 35.073 13.07 10.17-2.826 21.078-4.242 31.914-4.29 10.836.048 21.752 1.464 31.942 4.29 24.337-16.497 35.029-13.07 35.029-13.07 6.94 17.563 2.574 30.531 1.25 33.743 8.175 8.929 13.122 20.303 13.122 34.224 0 48.972-29.828 59.756-58.22 62.912 4.573 3.957 8.648 11.717 8.648 23.612 0 17.06-.148 30.791-.148 34.991 0 3.393 2.295 7.369 8.759 6.117 50.634-16.879 87.122-64.656 87.122-120.973C255.009 57.085 197.922 0 127.505 0" />
  </svg>
);

export const SlackLogo: React.FC<BrandLogoProps> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 2447.6 2452.5" aria-hidden="true">
    <g clipRule="evenodd" fillRule="evenodd">
      <path fill="#36c5f0" d="m897.4 0c-135.3.1-244.8 109.9-244.7 245.2-.1 135.3 109.5 245.1 244.8 245.2h244.8v-245.1c.1-135.3-109.5-245.1-244.9-245.3.1 0 .1 0 0 0m0 654h-652.6c-135.3.1-244.9 109.9-244.8 245.2-.2 135.3 109.4 245.1 244.7 245.3h652.7c135.3-.1 244.9-109.9 244.8-245.2.1-135.4-109.5-245.2-244.8-245.3z" />
      <path fill="#2eb67d" d="m2447.6 899.2c.1-135.3-109.5-245.1-244.8-245.2-135.3.1-244.9 109.9-244.8 245.2v245.3h244.8c135.3-.1 244.9-109.9 244.8-245.3zm-652.7 0v-654c.1-135.2-109.4-245-244.7-245.2-135.3.1-244.9 109.9-244.8 245.2v654c-.2 135.3 109.4 245.1 244.7 245.3 135.3-.1 244.9-109.9 244.8-245.3z" />
      <path fill="#ecb22e" d="m1550.1 2452.5c135.3-.1 244.9-109.9 244.8-245.2.1-135.3-109.5-245.1-244.8-245.2h-244.8v245.2c-.1 135.2 109.5 245 244.8 245.2zm0-654.1h652.7c135.3-.1 244.9-109.9 244.8-245.2.2-135.3-109.4-245.1-244.7-245.3h-652.7c-135.3.1-244.9 109.9-244.8 245.2-.1 135.4 109.4 245.2 244.7 245.3z" />
      <path fill="#e01e5a" d="m0 1553.2c-.1 135.3 109.5 245.1 244.8 245.2 135.3-.1 244.9-109.9 244.8-245.2v-245.2h-244.8c-135.3.1-244.9 109.9-244.8 245.2zm652.7 0v654c-.2 135.3 109.4 245.1 244.7 245.3 135.3-.1 244.9-109.9 244.8-245.2v-653.9c.2-135.3-109.4-245.1-244.7-245.3-135.4 0-244.9 109.8-244.8 245.1 0 0 0 .1 0 0" />
    </g>
  </svg>
);

export const GmailLogo: React.FC<BrandLogoProps> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="52 42 88 66" aria-hidden="true">
    <path fill="#4285f4" d="M58 108h14V74L52 59v43c0 3.32 2.69 6 6 6" />
    <path fill="#34a853" d="M120 108h14c3.32 0 6-2.69 6-6V59l-20 15" />
    <path fill="#fbbc04" d="M120 48v26l20-15v-8c0-7.42-8.47-11.65-14.4-7.2" />
    <path fill="#ea4335" d="M72 74V48l24 18 24-18v26L96 92" />
    <path fill="#c5221f" d="M52 51v8l20 15V48l-5.6-4.2c-5.94-4.45-14.4-.22-14.4 7.2" />
  </svg>
);

export const WhatsAppLogo: React.FC<BrandLogoProps> = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <path fill="#25D366" d="M16 0C7.164 0 0 7.164 0 16c0 2.211.453 4.316 1.273 6.227L0 32l9.953-1.23C11.797 31.551 13.867 32 16 32c8.836 0 16-7.164 16-16S24.836 0 16 0z" />
    <path fill="#fff" d="M23.867 19.7c-.398-.2-2.352-1.16-2.715-1.293-.363-.133-.629-.199-.891.2-.266.398-1.027 1.293-1.262 1.559-.23.266-.461.3-.86.102-.398-.2-1.683-.621-3.203-1.977-1.184-1.055-1.984-2.356-2.215-2.754-.23-.399-.023-.614.176-.813.18-.179.398-.464.598-.695.199-.23.265-.398.398-.664.133-.266.066-.497-.035-.696-.098-.199-.887-2.136-1.215-2.922-.32-.769-.645-.664-.887-.676-.23-.012-.492-.012-.754-.012-.261 0-.683.098-1.043.496-.356.399-1.36 1.328-1.36 3.235s1.395 3.754 1.59 4.011c.199.267 2.738 4.18 6.633 5.86 3.895 1.68 3.895 1.12 4.598 1.051.699-.066 2.254-.918 2.57-1.808.32-.887.32-1.649.227-1.809-.094-.164-.325-.262-.723-.46z" />
  </svg>
);

export type ServiceBrandKey =
  | "google"
  | "gemini"
  | "telegram"
  | "github"
  | "slack"
  | "gmail"
  | "whatsapp";

export interface ServiceBrandEntry {
  Logo: React.FC<BrandLogoProps>;
  label: string;
  sublabel: string;
  container: "disc" | "none";
}

export const SERVICE_BRANDS: Record<ServiceBrandKey, ServiceBrandEntry> = {
  google: { Logo: GoogleLogo, label: "Google", sublabel: "SEARCH SERVICE", container: "disc" },
  gemini: { Logo: GeminiLogo, label: "Google Gemini", sublabel: "REASONING MODEL", container: "disc" },
  telegram: { Logo: TelegramLogo, label: "Telegram", sublabel: "INBOUND TRIGGER", container: "none" },
  github: { Logo: GitHubLogo, label: "GitHub", sublabel: "CODE HOSTING", container: "disc" },
  slack: { Logo: SlackLogo, label: "Slack", sublabel: "TEAM NOTIFICATION", container: "disc" },
  gmail: { Logo: GmailLogo, label: "Gmail", sublabel: "EXTERNAL DISPATCH", container: "disc" },
  whatsapp: { Logo: WhatsAppLogo, label: "WhatsApp", sublabel: "CLIENT MESSAGING", container: "none" },
};
