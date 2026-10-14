"use client";

// Geometry: official personajes-svg master; Enjuague/Escudo use the v10 recolor.
import { useCharacter } from "./useCharacter";
import type { CharacterProps } from "./types";

export function Hilo(props: CharacterProps) {
  const { id, svgProps, title } = useCharacter("hilo", props);
  return (
    <svg {...svgProps}>
      <title id={id("title")}>{title}</title>
      <defs>
        <linearGradient id={id("hl-lid")} data-part="hl-lid" gradientUnits="userSpaceOnUse" x1="480" y1="232" x2="519" y2="366">
          <stop offset="0" stopColor="#FFDC3A" />
          <stop offset="0.35" stopColor="#FFC300" />
          <stop offset="1" stopColor="#F5B000" />
        </linearGradient>
        <linearGradient id={id("hl-lid-inner")} data-part="hl-lid-inner" gradientUnits="userSpaceOnUse" x1="320" y1="420" x2="760" y2="300">
          <stop offset="0" stopColor="#D99500" />
          <stop offset="0.7" stopColor="#CF8D00" />
          <stop offset="1" stopColor="#E7A100" />
        </linearGradient>
        <linearGradient id={id("hl-side")} data-part="hl-side" gradientUnits="userSpaceOnUse" x1="360" y1="520" x2="800" y2="820">
          <stop offset="0" stopColor="#F9B800" />
          <stop offset="0.5" stopColor="#E39E00" />
          <stop offset="1" stopColor="#D39000" />
        </linearGradient>
        <linearGradient id={id("hl-face")} data-part="hl-face" gradientUnits="userSpaceOnUse" x1="430" y1="470" x2="830" y2="760">
          <stop offset="0" stopColor="#FFCE10" />
          <stop offset="0.38" stopColor="#FABA00" />
          <stop offset="1" stopColor="#F2AD00" />
        </linearGradient>
        <linearGradient id={id("hl-shade-bottom")} data-part="hl-shade-bottom" gradientUnits="userSpaceOnUse" x1="0" y1="640" x2="0" y2="850">
          <stop offset="0" stopColor="#CF8D00" stopOpacity="0" />
          <stop offset="0.6" stopColor="#CF8D00" stopOpacity="0.6" />
          <stop offset="1" stopColor="#C48400" stopOpacity="0.95" />
        </linearGradient>
        <radialGradient id={id("hl-shade-hinge")} data-part="hl-shade-hinge" gradientUnits="userSpaceOnUse" cx="760" cy="392" r="90">
          <stop offset="0" stopColor="#CF8D00" stopOpacity="0.75" />
          <stop offset="1" stopColor="#CF8D00" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("hl-thread")} data-part="hl-thread" gradientUnits="userSpaceOnUse" x1="200" y1="380" x2="430" y2="700">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.6" stopColor="#FAFAFA" />
          <stop offset="1" stopColor="#E2E2E2" />
        </linearGradient>
        <linearGradient id={id("hl-star-warm")} data-part="hl-star-warm" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD31C" />
          <stop offset="0.5" stopColor="#FFCB0C" />
          <stop offset="1" stopColor="#FFC706" />
        </linearGradient>
        <linearGradient id={id("hl-star-mint")} data-part="hl-star-mint" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD421" />
          <stop offset="0.5" stopColor="#FFC402" />
          <stop offset="1" stopColor="#F9B800" />
        </linearGradient>
        <clipPath id={id("hl-clip-body")} data-part="hl-clip-body">
          <path d="M430 476 L744 391 C770 384 812 383 828 400 C848 425 882 595 884 632 C887 677 868 716 836 747 C777 805 627 839 546 843 C509 845 469 835 439 811 C391 772 350 659 341 598 C336 562 349 547 370 521 C385 500 405 484 430 476 Z" />
        </clipPath>
        <filter id={id("hl-grain")} data-part="hl-grain" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="11" stitchTiles="stitch" result="n" />
          <feColorMatrix in="n" result="d" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1.5 0 0 0 -0.75" />
          <feColorMatrix in="n" result="w" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -1.5 0 0 0 0.75" />
          <feMerge>
            <feMergeNode in="d" />
            <feMergeNode in="w" />
          </feMerge>
        </filter>
      </defs>
      <g id={id("decorations-back")} data-part="decorations-back">
        <g id={id("sparkle-back")} data-part="sparkle-back">
          <path fill={`url(#${id("hl-star-warm")})`} d="M238.4 238.4 C241.0 234.0 246.0 234.0 248.6 238.4 C250.9 257.3 261.8 269.6 278.6 272.3 C282.5 275.1 282.5 280.9 278.6 283.7 C261.8 286.4 250.9 298.7 248.6 317.6 C246.0 322.0 241.0 322.0 238.4 317.6 C236.1 298.7 225.2 286.4 208.4 283.7 C204.5 280.9 204.5 275.1 208.4 272.3 C225.2 269.6 236.1 257.3 238.4 238.4 Z" />
        </g>
      </g>
      <g id={id("character")} data-part="character">
        <g id={id("lid")} data-part="lid">
          <path id={id("lid-shape")} data-part="lid-shape" fill={`url(#${id("hl-lid")})`} d="M372 513 C345 511 318 495 301 474 C286 454 273 405 274 380 C276 343 304 308 332 287 C384 250 615 190 681 184 C746 179 791 221 793 285 C794 323 793 360 789 396 L700 440 L430 525 Z" />
          <path id={id("lid-inner")} data-part="lid-inner" fill={`url(#${id("hl-lid-inner")})`} d="M372 342 L712 245 C740 238 758 258 759 290 L758 362 L420 520 L362 498 C333 486 317 460 318 430 C320 384 338 352 372 342 Z" />
        </g>
        <g id={id("thread")} data-part="thread">
          <path id={id("thread-edge")} data-part="thread-edge" fill="none" stroke="#D2D2D2" strokeWidth="41" strokeLinecap="round" strokeLinejoin="round" d="M540 482 C541 420 512 373 461 373 C410 373 368 405 350 440 C336 470 324 520 314 556 C300 610 270 668 199 669 C158 670 132 646 133 603" />
          <path id={id("thread-strand")} data-part="thread-strand" fill="none" stroke={`url(#${id("hl-thread")})`} strokeWidth="36" strokeLinecap="round" strokeLinejoin="round" d="M540 482 C541 420 512 373 461 373 C410 373 368 405 350 440 C336 470 324 520 314 556 C300 610 270 668 199 669 C158 670 132 646 133 603" />
        </g>
        <g id={id("character-body")} data-part="character-body">
          <path id={id("body-shape")} data-part="body-shape" fill={`url(#${id("hl-side")})`} d="M430 476 L744 391 C770 384 812 383 828 400 C848 425 882 595 884 632 C887 677 868 716 836 747 C777 805 627 839 546 843 C509 845 469 835 439 811 C391 772 350 659 341 598 C336 562 349 547 370 521 C385 500 405 484 430 476 Z" />
          <g id={id("body-shade")} data-part="body-shade" clipPath={`url(#${id("hl-clip-body")})`}>
            <rect x="330" y="620" width="570" height="240" fill={`url(#${id("hl-shade-bottom")})`} />
            <circle cx="760" cy="392" r="90" fill={`url(#${id("hl-shade-hinge")})`} />
          </g>
          <path id={id("body-face")} data-part="body-face" fill={`url(#${id("hl-face")})`} transform="translate(97.1 89) scale(0.8766 0.835)" d="M430 476 L744 391 C770 384 812 383 828 400 C848 425 882 595 884 632 C887 677 868 716 836 747 C777 805 627 839 546 843 C509 845 469 835 439 811 C391 772 350 659 341 598 C336 562 349 547 370 521 C385 500 405 484 430 476 Z" />
        </g>
        <rect className="pj-grain" x="0" y="0" width="1024" height="1024" fill="#808080" clipPath={`url(#${id("hl-clip-body")})`} filter={`url(#${id("hl-grain")})`} opacity="0.32" />
        <g id={id("character-details")} data-part="character-details">
          <rect id={id("highlight-arc")} data-part="highlight-arc" opacity="0.42" fill="#FFFFFF" x="-46" y="-11" width="92" height="22" rx="11" transform="translate(463 521) rotate(-42)" />
          <ellipse id={id("highlight-dot")} data-part="highlight-dot" opacity="0.42" fill="#FFFFFF" cx="318" cy="330" rx="12" ry="24" transform="rotate(38 318 330)" />
        </g>
        <g id={id("eyes")} data-part="eyes">
          <g id={id("eyes-state")} data-part="eyes-state">
            <g id={id("eye-left")} data-part="eye-left" transform="translate(638.3 601.8) rotate(-15.5)">
              <rect className="eye" x="-31" y="-56" width="62" height="112" rx="31" fill="#020204" />
            </g>
            <g id={id("eye-right")} data-part="eye-right" transform="translate(746.3 572.2) rotate(-15.8)">
              <rect className="eye" x="-31" y="-56" width="62" height="112" rx="31" fill="#020204" />
            </g>
          </g>
        </g>
      </g>
      <g id={id("decorations-front")} data-part="decorations-front">
        <g id={id("sparkle-front")} data-part="sparkle-front">
          <path fill={`url(#${id("hl-star-mint")})`} d="M912.8 480.2 C914.9 476.5 919.1 476.5 921.2 480.2 C923.1 496.1 932.0 506.5 945.8 508.7 C949.0 511.1 949.0 515.9 945.8 518.3 C932.0 520.5 923.1 530.9 921.2 546.8 C919.1 550.5 914.9 550.5 912.8 546.8 C910.9 530.9 902.0 520.5 888.2 518.3 C885.0 515.9 885.0 511.1 888.2 508.7 C902.0 506.5 910.9 496.1 912.8 480.2 Z" />
        </g>
      </g>
    </svg>
  );
}
