// The Swiss Baan Chiang amphora mark — official brand artwork (see
// brand-assets/Logo Kelch.svg, rasterized via brand-assets/process-kelch.js
// into assets/logo-kelch.png, tight-cropped with a transparent background).
// Used wherever the brand's logomark appears in the app.
const ASPECT = 376 / 500; // assets/logo-kelch.png intrinsic width/height

export function vaseLogo({ size = 28, className = "" } = {}) {
  const height = size;
  const width = Math.round(size * ASPECT);
  return `<img class="logo-mark ${className}" src="assets/logo-kelch.png" width="${width}" height="${height}" alt="" style="display:block;" />`;
}

// The full "Swiss Baan Chiang" lettering, cropped to just the text row (no
// mountain glyph or subtitle) — for header/sidebar/login spots that show the
// wordmark instead of (or next to) the icon mark.
const WORDMARK_ASPECT = 1376 / 160; // assets/logo-wordmark-text.png intrinsic size

export function wordmarkLogo({ height = 22, className = "" } = {}) {
  const width = Math.round(height * WORDMARK_ASPECT);
  return `<img class="wordmark-mark ${className}" src="assets/logo-wordmark-text.png" width="${width}" height="${height}" alt="Swiss Baan Chiang" style="display:block;" />`;
}

// The full brand lockup (mountain graphic + "Swiss Baan Chiang" + "Green
// Retreat & Residence Hua Hin" subtitle) — for prominent, spacious spots like
// the backoffice login screen or the room-setup screen.
const FULL_ASPECT = 1552 / 500; // assets/logo-wordmark-full.png intrinsic size

export function fullLockup({ height = 120, className = "" } = {}) {
  const width = Math.round(height * FULL_ASPECT);
  return `<img class="wordmark-full ${className}" src="assets/logo-wordmark-full.png" width="${width}" height="${height}" alt="Swiss Baan Chiang — Green Retreat &amp; Residence Hua Hin" style="display:block;" />`;
}
