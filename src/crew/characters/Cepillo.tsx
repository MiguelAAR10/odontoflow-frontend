"use client";

// Geometry: official personajes-svg master; Enjuague/Escudo use the v10 recolor.
import { useCharacter } from "./useCharacter";
import type { CharacterProps } from "./types";

export function Cepillo(props: CharacterProps) {
  const { id, svgProps, title } = useCharacter("cepillo", props);
  return (
    <svg {...svgProps}>
      <title id={id("title")}>{title}</title>
      <defs>
        <linearGradient id={id("cp-base")} data-part="cp-base" gradientUnits="userSpaceOnUse" x1="250" y1="700" x2="481" y2="796">
          <stop offset="0" stopColor="#4F80FF" />
          <stop offset="0.14" stopColor="#184CE5" />
          <stop offset="0.5" stopColor="#123CC1" />
          <stop offset="1" stopColor="#0E32A8" />
        </linearGradient>
        <linearGradient id={id("cp-shade-right")} data-part="cp-shade-right" gradientUnits="userSpaceOnUse" x1="554" y1="231" x2="702" y2="293">
          <stop offset="0" stopColor="#0A2788" stopOpacity="0" />
          <stop offset="0.55" stopColor="#092580" stopOpacity="0.7" />
          <stop offset="1" stopColor="#071E6C" stopOpacity="0.95" />
        </linearGradient>
        <radialGradient id={id("cp-shade-neck")} data-part="cp-shade-neck" gradientUnits="userSpaceOnUse" cx="505" cy="405" r="78">
          <stop offset="0" stopColor="#082278" stopOpacity="0.8" />
          <stop offset="1" stopColor="#082278" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={id("cp-shade-tip")} data-part="cp-shade-tip" gradientUnits="userSpaceOnUse" cx="420" cy="905" r="120">
          <stop offset="0" stopColor="#0A2683" stopOpacity="0.75" />
          <stop offset="1" stopColor="#0A2683" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("cp-bristle")} data-part="cp-bristle" x1="0.25" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#F8F8F8" />
          <stop offset="0.82" stopColor="#E6E6E6" />
          <stop offset="1" stopColor="#D3D3D3" />
        </linearGradient>
        <linearGradient id={id("cp-star")} data-part="cp-star" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD31C" />
          <stop offset="0.5" stopColor="#FFCB0C" />
          <stop offset="1" stopColor="#FFC706" />
        </linearGradient>
        <linearGradient id={id("cp-bristle-tip")} data-part="cp-bristle-tip" gradientUnits="userSpaceOnUse" x1="640" y1="250" x2="812" y2="300">
          <stop offset="0" stopColor="#D0D0D0" stopOpacity="0" />
          <stop offset="0.6" stopColor="#D4D4D4" stopOpacity="0.25" />
          <stop offset="1" stopColor="#CCCCCC" stopOpacity="0.9" />
        </linearGradient>
        <clipPath id={id("cp-clip-b2")} data-part="cp-clip-b2">
          <path d="M609.4 213 L738.1 266.8 C766.1 278.6 779.3 310.7 767.6 338.7 C755.9 366.7 723.7 379.9 695.7 368.2 L568.2 314.9 Z" />
        </clipPath>
        <clipPath id={id("cp-clip-b3")} data-part="cp-clip-b3">
          <path d="M576.3 295.1 L709.6 362.5 C734.7 375.1 744.8 405.8 732.1 430.9 C719.5 455.9 688.8 466 663.8 453.3 L552.3 397 C544.4 393 540.7 383.2 544 375 Z" />
        </clipPath>
        <clipPath id={id("cp-clip-bristles")} data-part="cp-clip-bristles">
          <path d="M655.6 136 L771.1 172.9 C799.9 182.1 815.8 212.9 806.6 241.7 C797.4 270.6 766.6 286.5 737.7 277.3 L601.1 233.7 L637 144.8 C639.9 137.6 648.2 133.7 655.6 136 Z" />
          <path d="M609.4 213 L738.1 266.8 C766.1 278.6 779.3 310.7 767.6 338.7 C755.9 366.7 723.7 379.9 695.7 368.2 L568.2 314.9 Z" />
          <path d="M576.3 295.1 L709.6 362.5 C734.7 375.1 744.8 405.8 732.1 430.9 C719.5 455.9 688.8 466 663.8 453.3 L552.3 397 C544.4 393 540.7 383.2 544 375 Z" />
        </clipPath>
        <clipPath id={id("cp-clip-body")} data-part="cp-clip-body">
          <path d="M581 89 C611 86 641 101 657 128 C665 148 584 380 563 406 C552 414 545 428 546 450 C550 491 552 525 547 566 C537 635 509 715 484 780 C462 835 427 923 363 940 C314 952 257 923 238 876 C220 832 231 791 246 748 C272 677 309 596 349 531 C369 498 456 399 459 377 C449 361 442 351 441 330 C440 297 478 218 492 185 C511 142 526 95 581 89 Z" />
        </clipPath>
        <filter id={id("cp-grain")} data-part="cp-grain" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
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
          <path fill={`url(#${id("cp-star")})`} d="M306.1 235.4 C309.8 229.0 317.2 229.0 320.9 235.4 C324.3 262.9 340.3 280.8 364.8 284.7 C370.5 288.8 370.5 297.2 364.8 301.3 C340.3 305.2 324.3 323.1 320.9 350.6 C317.2 357.0 309.8 357.0 306.1 350.6 C302.7 323.1 286.7 305.2 262.2 301.3 C256.5 297.2 256.5 288.8 262.2 284.7 C286.7 280.8 302.7 262.9 306.1 235.4 Z" />
        </g>
        <g id={id("sparkle-back-2")} data-part="sparkle-back-2">
          <path fill={`url(#${id("cp-star")})`} d="M392.1 173.3 C394.1 170.0 397.9 170.0 399.9 173.3 C401.7 187.5 410.1 196.7 423.0 198.7 C426.0 200.9 426.0 205.1 423.0 207.3 C410.1 209.3 401.7 218.5 399.9 232.7 C397.9 236.0 394.1 236.0 392.1 232.7 C390.3 218.5 381.9 209.3 369.0 207.3 C366.0 205.1 366.0 200.9 369.0 198.7 C381.9 196.7 390.3 187.5 392.1 173.3 Z" />
        </g>
      </g>
      <g id={id("character")} data-part="character">
        <g id={id("character-body")} data-part="character-body">
          <path id={id("body-shape")} data-part="body-shape" fill={`url(#${id("cp-base")})`} d="M581 89 C611 86 641 101 657 128 C665 148 584 380 563 406 C552 414 545 428 546 450 C550 491 552 525 547 566 C537 635 509 715 484 780 C462 835 427 923 363 940 C314 952 257 923 238 876 C220 832 231 791 246 748 C272 677 309 596 349 531 C369 498 456 399 459 377 C449 361 442 351 441 330 C440 297 478 218 492 185 C511 142 526 95 581 89 Z" />
          <g id={id("body-shade")} data-part="body-shade" clipPath={`url(#${id("cp-clip-body")})`}>
            <rect x="220" y="80" width="460" height="880" fill={`url(#${id("cp-shade-right")})`} />
            <path id={id("head-side")} data-part="head-side" fill="#09237C" d="M618 152 C628 140 640 132 668 126 L566 412 L522 384 Z" />
            <circle cx="505" cy="405" r="78" fill={`url(#${id("cp-shade-neck")})`} />
            <circle cx="420" cy="905" r="120" fill={`url(#${id("cp-shade-tip")})`} />
          </g>
        </g>
        <rect className="pj-grain" x="0" y="0" width="1024" height="1024" fill="#808080" clipPath={`url(#${id("cp-clip-body")})`} filter={`url(#${id("cp-grain")})`} opacity="0.32" />
        <g id={id("character-details")} data-part="character-details">
          <g id={id("bristles")} data-part="bristles">
            <path id={id("bristle-3")} data-part="bristle-3" fill={`url(#${id("cp-bristle")})`} d="M576.3 295.1 L709.6 362.5 C734.7 375.1 744.8 405.8 732.1 430.9 C719.5 455.9 688.8 466 663.8 453.3 L552.3 397 C544.4 393 540.7 383.2 544 375 Z" />
            <path id={id("bristle-groove-3")} data-part="bristle-groove-3" fill="#DFDFDF" clipPath={`url(#${id("cp-clip-b3")})`} d="M603.8 226.9 L732.3 280.7 C760.3 292.4 773.5 324.6 761.8 352.6 C750.1 380.6 717.9 393.8 689.9 382.1 L562.6 328.8 Z" />
            <path id={id("bristle-2")} data-part="bristle-2" fill={`url(#${id("cp-bristle")})`} d="M609.4 213 L738.1 266.8 C766.1 278.6 779.3 310.7 767.6 338.7 C755.9 366.7 723.7 379.9 695.7 368.2 L568.2 314.9 Z" />
            <path id={id("bristle-groove-2")} data-part="bristle-groove-2" fill="#DFDFDF" clipPath={`url(#${id("cp-clip-b2")})`} d="M636.6 145.7 L766.5 187.2 C795.3 196.4 811.2 227.2 802 256 C792.8 284.9 762 300.8 733.2 291.6 L595.4 247.6 Z" />
            <path id={id("bristle-1")} data-part="bristle-1" fill={`url(#${id("cp-bristle")})`} d="M655.6 136 L771.1 172.9 C799.9 182.1 815.8 212.9 806.6 241.7 C797.4 270.6 766.6 286.5 737.7 277.3 L601.1 233.7 L637 144.8 C639.9 137.6 648.2 133.7 655.6 136 Z" />
            <rect id={id("bristle-shade")} data-part="bristle-shade" clipPath={`url(#${id("cp-clip-bristles")})`} x="540" y="120" width="290" height="360" fill={`url(#${id("cp-bristle-tip")})`} />
          </g>
          <rect id={id("highlight-arc")} data-part="highlight-arc" opacity="0.42" fill="#FFFFFF" x="-78" y="-11" width="156" height="22" rx="11" transform="translate(296 690) rotate(-65)" />
          <ellipse id={id("highlight-dot")} data-part="highlight-dot" opacity="0.42" fill="#FFFFFF" cx="520" cy="166" rx="11" ry="22" transform="rotate(23 520 166)" />
        </g>
        <g id={id("eyes")} data-part="eyes">
          <g id={id("eyes-state")} data-part="eyes-state">
            <g id={id("eye-left")} data-part="eye-left" transform="translate(394.2 560.3) rotate(22)">
              <rect className="eye" x="-22" y="-40" width="44" height="80" rx="22" fill="#020204" />
            </g>
            <g id={id("eye-right")} data-part="eye-right" transform="translate(469.4 587.5) rotate(21.2)">
              <rect className="eye" x="-22" y="-40" width="44" height="80" rx="22" fill="#020204" />
            </g>
          </g>
        </g>
      </g>
      <g id={id("decorations-front")} data-part="decorations-front">
        <g id={id("sparkle-front")} data-part="sparkle-front">
          <path fill={`url(#${id("cp-star")})`} d="M632.0 512.9 C634.7 508.0 640.3 508.0 643.0 512.9 C645.6 534.0 657.5 547.7 675.8 550.6 C680.0 553.8 680.0 560.2 675.8 563.4 C657.5 566.3 645.6 580.0 643.0 601.1 C640.3 606.0 634.7 606.0 632.0 601.1 C629.4 580.0 617.5 566.3 599.2 563.4 C595.0 560.2 595.0 553.8 599.2 550.6 C617.5 547.7 629.4 534.0 632.0 512.9 Z" />
        </g>
      </g>
    </svg>
  );
}
