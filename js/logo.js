// The Swiss Baan Chiang amphora mark (from the brand guidelines' "Icon / Favicon" spec),
// hand-vectorised as SVG. Used wherever the brand's logomark appears in the app.

const VASE_BODY = `M27,9
  C22,12 19,15 20,15
  C22,20 30,26 37,33
  C30,38 22,42 18,48
  C13,54 12,58 12,60
  C12,66 14,72 16,76
  C20,84 25,88 28,90
  C25,92 23,93 24,95
  C25,98 30,100 38,101
  C44,103 56,103 62,101
  C70,100 75,98 76,95
  C77,93 75,92 72,90
  C75,88 80,84 84,76
  C86,72 88,66 88,60
  C88,58 87,54 82,48
  C78,42 70,38 63,33
  C70,26 78,20 80,15
  C81,15 78,12 73,9
  C66,6 34,6 27,9
  Z`;

const RIBBON_WHITE = `M14,47 C35,39 55,63 86,59 L86,77 C55,81 35,57 14,65 Z`;
const RIBBON_GOLD = `M14,51 C35,43 55,67 86,63 L86,73 C55,77 35,53 14,59 Z`;

let uid = 0;

/**
 * Returns an inline <svg> string of the amphora mark.
 * @param {{size?: number, className?: string, ribbon?: boolean}} opts
 *   ribbon: set false to render a flat single-colour silhouette (e.g. tiny sizes).
 */
export function vaseLogo({ size = 28, className = "", ribbon = true } = {}) {
  const id = "vaseGrad" + uid++;
  return `<svg class="logo-mark ${className}" width="${size}" height="${size}" viewBox="0 0 100 108" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${
      ribbon
        ? `<defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#f3d68f"/>
        <stop offset="50%" stop-color="#c9a15a"/>
        <stop offset="100%" stop-color="#a5793a"/>
      </linearGradient>
      <clipPath id="${id}-clip"><path d="${VASE_BODY}"/></clipPath>
    </defs>`
        : ""
    }
    <path d="${VASE_BODY}" fill="currentColor"/>
    ${
      ribbon
        ? `<g clip-path="url(#${id}-clip)">
      <path d="${RIBBON_WHITE}" fill="#fff"/>
      <path d="${RIBBON_GOLD}" fill="url(#${id})"/>
    </g>`
        : ""
    }
  </svg>`;
}
