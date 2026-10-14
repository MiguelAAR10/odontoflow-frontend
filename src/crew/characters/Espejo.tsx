"use client";

// Geometry: official personajes-svg master; Enjuague/Escudo use the v10 recolor.
import { useCharacter } from "./useCharacter";
import type { CharacterProps } from "./types";

export function Espejo(props: CharacterProps) {
  const { id, svgProps, title } = useCharacter("espejo", props);
  return (
    <svg {...svgProps}>
      <title id={id("title")}>{title}</title>
      <defs>
        <linearGradient id={id("es-ring")} data-part="es-ring" gradientUnits="userSpaceOnUse" x1="360" y1="130" x2="660" y2="450">
          <stop offset="0" stopColor="#9453FC" />
          <stop offset="0.5" stopColor="#601FC9" />
          <stop offset="1" stopColor="#4916A1" />
        </linearGradient>
        <radialGradient id={id("es-ring-shade")} data-part="es-ring-shade" gradientUnits="userSpaceOnUse" cx="640" cy="430" r="200">
          <stop offset="0" stopColor="#2E0C6C" stopOpacity="0.85" />
          <stop offset="1" stopColor="#2E0C6C" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("es-glass")} data-part="es-glass" gradientUnits="userSpaceOnUse" x1="400" y1="170" x2="620" y2="410">
          <stop offset="0" stopColor="#FCFCFC" />
          <stop offset="0.55" stopColor="#F1F1F1" />
          <stop offset="1" stopColor="#DADADA" />
        </linearGradient>
        <linearGradient id={id("es-handle")} data-part="es-handle" gradientUnits="userSpaceOnUse" x1="-51" y1="0" x2="51" y2="0">
          <stop offset="0" stopColor="#8D4AFA" />
          <stop offset="0.45" stopColor="#6C27DC" />
          <stop offset="1" stopColor="#4B16A6" />
        </linearGradient>
        <linearGradient id={id("es-handle-shade")} data-part="es-handle-shade" gradientUnits="userSpaceOnUse" x1="0" y1="-120" x2="0" y2="280">
          <stop offset="0" stopColor="#2E0C6C" stopOpacity="0" />
          <stop offset="1" stopColor="#2E0C6C" stopOpacity="0.45" />
        </linearGradient>
        <linearGradient id={id("es-star")} data-part="es-star" gradientUnits="userSpaceOnUse" x1="718" y1="252" x2="810" y2="344">
          <stop offset="0" stopColor="#FFD31C" />
          <stop offset="0.5" stopColor="#FFCB0C" />
          <stop offset="1" stopColor="#FFC706" />
        </linearGradient>
        <linearGradient id={id("es-star-l")} data-part="es-star-l" gradientUnits="userSpaceOnUse" x1="306" y1="415" x2="370" y2="479">
          <stop offset="0" stopColor="#FFD31C" />
          <stop offset="0.5" stopColor="#FFCB0C" />
          <stop offset="1" stopColor="#FFC706" />
        </linearGradient>
        <clipPath id={id("es-clip-ring")} data-part="es-clip-ring">
          <circle cx="505" cy="282" r="181.5" />
        </clipPath>
        <clipPath id={id("es-clip-glass")} data-part="es-clip-glass">
          <circle cx="508" cy="285" r="140" />
        </clipPath>
        <clipPath id={id("es-clip-handle")} data-part="es-clip-handle">
          <path transform="translate(571 650) rotate(-14.6)" d="M-31 -330 H31 V-116.7 C43.1 -111.8 51 -100 51 -87 V224 C51 252.2 28.2 275 0 275 C-28.2 275 -51 252.2 -51 224 V-87 C-51 -100 -43.1 -111.8 -31 -116.7 Z" />
        </clipPath>
        <filter id={id("es-grain")} data-part="es-grain" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
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
          <path fill={`url(#${id("es-star-l")})`} d="M332.0 419.4 C333.8 416.2 337.8 415.9 340.1 418.9 C342.9 432.1 352.1 440.1 365.6 441.0 C368.8 442.8 369.1 446.8 366.1 449.1 C352.9 451.9 344.9 461.1 344.0 474.6 C342.2 477.8 338.2 478.1 335.9 475.1 C333.1 461.9 323.9 453.9 310.4 453.0 C307.2 451.2 306.9 447.2 309.9 444.9 C323.1 442.1 331.1 432.9 332.0 419.4 Z" />
        </g>
      </g>
      <g id={id("character")} data-part="character">
        <g id={id("character-body")} data-part="character-body">
          <g id={id("handle")} data-part="handle">
            <path id={id("handle-shape")} data-part="handle-shape" fill={`url(#${id("es-handle")})`} transform="translate(571 650) rotate(-14.6)" d="M-31 -330 H31 V-116.7 C43.1 -111.8 51 -100 51 -87 V224 C51 252.2 28.2 275 0 275 C-28.2 275 -51 252.2 -51 224 V-87 C-51 -100 -43.1 -111.8 -31 -116.7 Z" />
            <g id={id("handle-bands")} data-part="handle-bands" clipPath={`url(#${id("es-clip-handle")})`}>
              <g transform="translate(571 650) rotate(-14.6)">
                <rect fill={`url(#${id("es-handle-shade")})`} x="-60" y="-130" width="120" height="420" />
                <rect fill="#CCCCCC" x="-60" y="-130" width="120" height="48" />
                <rect fill="#320D74" x="-60" y="-82" width="120" height="34" />
                <rect fill="#A266FF" x="-60" y="-48" width="120" height="44" />
                <rect fill="#2E0C6C" fillOpacity="0.35" x="22" y="-130" width="40" height="420" />
                <rect fill="#FFFFFF" fillOpacity="0.35" x="-38" y="-20" width="12" height="220" rx="6" />
              </g>
            </g>
          </g>
          <circle id={id("body-shape")} data-part="body-shape" cx="505" cy="282" r="181.5" fill={`url(#${id("es-ring")})`} />
          <g id={id("body-shade")} data-part="body-shade" clipPath={`url(#${id("es-clip-ring")})`}>
            <circle cx="640" cy="430" r="200" fill={`url(#${id("es-ring-shade")})`} />
          </g>
          <circle id={id("glass-rim")} data-part="glass-rim" cx="508" cy="285" r="147" fill="#F2F2F2" />
          <circle id={id("glass")} data-part="glass" cx="508" cy="285" r="140" fill={`url(#${id("es-glass")})`} />
          <g id={id("glass-clip")} data-part="glass-clip" clipPath={`url(#${id("es-clip-glass")})`}>
            <g id={id("reflection")} data-part="reflection">
              <rect fill="#FFFFFF" fillOpacity="0.75" x="-220" y="-26" width="440" height="52" transform="translate(588 372) rotate(-42)" />
              <rect fill="#FFFFFF" fillOpacity="0.55" x="-220" y="-8" width="440" height="16" transform="translate(633 413) rotate(-42)" />
            </g>
          </g>
        </g>
        <rect className="pj-grain" x="0" y="0" width="1024" height="1024" fill="#808080" clipPath={`url(#${id("es-clip-ring")})`} filter={`url(#${id("es-grain")})`} opacity="0.32" />
        <rect className="pj-grain" x="0" y="0" width="1024" height="1024" fill="#808080" clipPath={`url(#${id("es-clip-handle")})`} filter={`url(#${id("es-grain")})`} opacity="0.32" />
        <g id={id("character-details")} data-part="character-details">
          <rect id={id("highlight-arc")} data-part="highlight-arc" fill="#FFFFFF" fillOpacity="0.8" x="-48" y="-11" width="96" height="22" rx="11" transform="translate(392 168) rotate(-45)" />
          <ellipse id={id("highlight-dot")} data-part="highlight-dot" fill="#FFFFFF" fillOpacity="0.8" cx="349" cy="236" rx="9" ry="16" transform="rotate(22 349 236)" />
        </g>
        <g id={id("eyes")} data-part="eyes">
          <g id={id("eyes-state")} data-part="eyes-state">
            <g id={id("eye-left")} data-part="eye-left" transform="translate(475 273) rotate(16.2)">
              <rect className="eye" x="-25" y="-47" width="50" height="94" rx="25" fill="#020204" />
            </g>
            <g id={id("eye-right")} data-part="eye-right" transform="translate(555 290) rotate(15.6)">
              <rect className="eye" x="-25" y="-47" width="50" height="94" rx="25" fill="#020204" />
            </g>
          </g>
        </g>
      </g>
      <g id={id("decorations-front")} data-part="decorations-front">
        <g id={id("sparkle-front")} data-part="sparkle-front">
          <path fill={`url(#${id("es-star")})`} d="M755.1 257.1 C757.8 252.3 763.8 251.9 767.1 256.3 C771.2 275.8 785.0 287.8 804.9 289.1 C809.7 291.8 810.1 297.8 805.7 301.1 C786.2 305.2 774.2 319.0 772.9 338.9 C770.2 343.7 764.2 344.1 760.9 339.7 C756.8 320.2 743.0 308.2 723.1 306.9 C718.3 304.2 717.9 298.2 722.3 294.9 C741.8 290.8 753.8 277.0 755.1 257.1 Z" />
        </g>
      </g>
    </svg>
  );
}
