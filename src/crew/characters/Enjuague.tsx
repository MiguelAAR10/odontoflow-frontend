"use client";

// Geometry: official personajes-svg master; Enjuague/Escudo use the v10 recolor.
import { useCharacter } from "./useCharacter";
import type { CharacterProps } from "./types";

export function Enjuague(props: CharacterProps) {
  const { id, svgProps, title } = useCharacter("enjuague", props);
  return (
    <svg {...svgProps}>
      <title id={id("title")}>{title}</title>
      <defs>
        <linearGradient id={id("en-base")} data-part="en-base" gradientUnits="userSpaceOnUse" x1="230" y1="360" x2="620" y2="760">
          <stop offset="0" stopColor="#4ADE80" />
          <stop offset="0.4" stopColor="#0EA344" />
          <stop offset="1" stopColor="#0A8B39" />
        </linearGradient>
        <linearGradient id={id("en-shade-right")} data-part="en-shade-right" gradientUnits="userSpaceOnUse" x1="640" y1="0" x2="812" y2="0">
          <stop offset="0" stopColor="#077831" stopOpacity="0" />
          <stop offset="0.65" stopColor="#077831" stopOpacity="0.55" />
          <stop offset="1" stopColor="#045A25" stopOpacity="0.85" />
        </linearGradient>
        <linearGradient id={id("en-shade-bottom")} data-part="en-shade-bottom" gradientUnits="userSpaceOnUse" x1="0" y1="760" x2="0" y2="936">
          <stop offset="0" stopColor="#077831" stopOpacity="0" />
          <stop offset="1" stopColor="#077831" stopOpacity="0.75" />
        </linearGradient>
        <radialGradient id={id("en-shade-neck")} data-part="en-shade-neck" gradientUnits="userSpaceOnUse" cx="640" cy="360" r="120">
          <stop offset="0" stopColor="#077831" stopOpacity="0.8" />
          <stop offset="1" stopColor="#077831" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("en-panel")} data-part="en-panel" gradientUnits="userSpaceOnUse" x1="360" y1="450" x2="690" y2="800">
          <stop offset="0" stopColor="#077C33" />
          <stop offset="0.6" stopColor="#066E2D" />
          <stop offset="1" stopColor="#03481E" />
        </linearGradient>
        <linearGradient id={id("en-cap")} data-part="en-cap" gradientUnits="userSpaceOnUse" x1="520" y1="140" x2="760" y2="350">
          <stop offset="0" stopColor="#FCFCFC" />
          <stop offset="0.55" stopColor="#F1F1F1" />
          <stop offset="1" stopColor="#D4D4D4" />
        </linearGradient>
        <linearGradient id={id("en-cap-shade")} data-part="en-cap-shade" gradientUnits="userSpaceOnUse" x1="690" y1="0" x2="792" y2="0">
          <stop offset="0" stopColor="#CCCCCC" stopOpacity="0" />
          <stop offset="1" stopColor="#CCCCCC" stopOpacity="0.9" />
        </linearGradient>
        <linearGradient id={id("en-bubble")} data-part="en-bubble" gradientUnits="objectBoundingBox" x1="0.15" y1="0.1" x2="0.85" y2="0.9">
          <stop offset="0" stopColor="#2FD068" />
          <stop offset="0.55" stopColor="#1EC25A" />
          <stop offset="1" stopColor="#0EA143" />
        </linearGradient>
        <linearGradient id={id("en-star")} data-part="en-star" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD72B" />
          <stop offset="1" stopColor="#FFD118" />
        </linearGradient>
        <clipPath id={id("en-clip-body")} data-part="en-clip-body">
          <path d="M201 705 C207 630 276 566 292 500 C303 455 274 423 306 368 C319 346 338 328 361 317 C383 307 481 294 487 283 C495 268 515 238 540 228 L735 300 C738 330 730 352 723 372 C719 386 787 450 797 469 C806 487 810 509 808 529 C802 589 755 605 740 650 C719 708 718 785 700 846 C694 868 684 888 667 904 C642 927 605 935 572 934 C509 931 421 903 362 879 C319 861 265 835 234 800 C211 775 199 739 201 705 Z" />
        </clipPath>
        <clipPath id={id("en-clip-cap")} data-part="en-clip-cap">
          <path d="M478 254 C480 242 525 143 534 130 C542 117 551 110 567 108 C607 103 695 136 732 154 C754 165 787 184 790 211 C792 226 758 333 749 350 C745 359 742 364 731 366 C708 369 579 319 552 307 C537 300 500 284 488 274 C480 268 477 265 478 254 Z" />
        </clipPath>
        <filter id={id("en-grain")} data-part="en-grain" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
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
        <g id={id("bubbles")} data-part="bubbles">
          <g className="bubble" id={id("bubble-1")} data-part="bubble-1">
            <circle cx="208" cy="410" r="52" fill={`url(#${id("en-bubble")})`} />
            <ellipse cx="189" cy="389" rx="15" ry="9" fill="#FFFFFF" fillOpacity="0.75" transform="rotate(-35 189 389)" />
          </g>
          <g className="bubble" id={id("bubble-2")} data-part="bubble-2">
            <circle cx="256" cy="299" r="19" fill={`url(#${id("en-bubble")})`} />
            <ellipse cx="250" cy="292" rx="6" ry="4" fill="#FFFFFF" fillOpacity="0.75" transform="rotate(-35 250 292)" />
          </g>
          <g className="bubble" id={id("bubble-3")} data-part="bubble-3">
            <circle cx="785" cy="750" r="34" fill={`url(#${id("en-bubble")})`} />
            <ellipse cx="773" cy="737" rx="10" ry="6" fill="#FFFFFF" fillOpacity="0.75" transform="rotate(-35 773 737)" />
          </g>
          <g className="bubble" id={id("bubble-4")} data-part="bubble-4">
            <circle cx="832" cy="793" r="16" fill={`url(#${id("en-bubble")})`} />
            <ellipse cx="827" cy="787" rx="5" ry="3" fill="#FFFFFF" fillOpacity="0.75" transform="rotate(-35 827 787)" />
          </g>
        </g>
        <g id={id("sparkle-back")} data-part="sparkle-back">
          <path fill={`url(#${id("en-star")})`} d="M314.5 196.9 C317.1 192.3 322.8 191.9 325.9 196.1 C329.9 214.8 343.0 226.2 362.1 227.5 C366.7 230.1 367.1 235.8 362.9 238.9 C344.2 242.9 332.8 256.0 331.5 275.1 C328.9 279.7 323.2 280.1 320.1 275.9 C316.1 257.2 303.0 245.8 283.9 244.5 C279.3 241.9 278.9 236.2 283.1 233.1 C301.8 229.1 313.2 216.0 314.5 196.9 Z" />
        </g>
      </g>
      <g id={id("character")} data-part="character">
        <g id={id("character-body")} data-part="character-body">
          <path id={id("body-shape")} data-part="body-shape" fill={`url(#${id("en-base")})`} d="M201 705 C207 630 276 566 292 500 C303 455 274 423 306 368 C319 346 338 328 361 317 C383 307 481 294 487 283 C495 268 515 238 540 228 L735 300 C738 330 730 352 723 372 C719 386 787 450 797 469 C806 487 810 509 808 529 C802 589 755 605 740 650 C719 708 718 785 700 846 C694 868 684 888 667 904 C642 927 605 935 572 934 C509 931 421 903 362 879 C319 861 265 835 234 800 C211 775 199 739 201 705 Z" />
          <g id={id("body-shade")} data-part="body-shade" clipPath={`url(#${id("en-clip-body")})`}>
            <rect x="620" y="200" width="200" height="740" fill={`url(#${id("en-shade-right")})`} />
            <rect x="190" y="740" width="640" height="200" fill={`url(#${id("en-shade-bottom")})`} />
            <circle cx="640" cy="360" r="120" fill={`url(#${id("en-shade-neck")})`} />
          </g>
          <path id={id("panel")} data-part="panel" fill={`url(#${id("en-panel")})`} d="M300 600 C312 560 335 495 350 462 C355 450 362 444 374 444 C470 455 600 492 684 520 C706 528 724 544 722 568 C712 640 684 720 662 768 C652 790 634 806 610 806 C550 800 450 770 404 745 C376 728 344 700 322 672 C304 650 296 625 300 600 Z" />
          <g id={id("cap")} data-part="cap">
            <path id={id("cap-shape")} data-part="cap-shape" fill={`url(#${id("en-cap")})`} d="M478 254 C480 242 525 143 534 130 C542 117 551 110 567 108 C607 103 695 136 732 154 C754 165 787 184 790 211 C792 226 758 333 749 350 C745 359 742 364 731 366 C708 369 579 319 552 307 C537 300 500 284 488 274 C480 268 477 265 478 254 Z" />
            <g id={id("cap-shade")} data-part="cap-shade" clipPath={`url(#${id("en-clip-cap")})`}>
              <rect x="690" y="100" width="110" height="280" fill={`url(#${id("en-cap-shade")})`} />
              <rect fill="#FFFFFF" fillOpacity="0.7" x="-200" y="-70" width="400" height="66" transform="translate(650 150) rotate(22)" />
            </g>
            <rect id={id("cap-highlight")} data-part="cap-highlight" opacity="0.42" fill="#FFFFFF" x="-44" y="-9" width="88" height="18" rx="9" transform="translate(522 214) rotate(-66)" />
          </g>
        </g>
        <rect className="pj-grain" x="0" y="0" width="1024" height="1024" fill="#808080" clipPath={`url(#${id("en-clip-body")})`} filter={`url(#${id("en-grain")})`} opacity="0.32" />
        <g id={id("character-details")} data-part="character-details">
          <rect id={id("highlight-arc")} data-part="highlight-arc" fill="#FFFFFF" fillOpacity="0.85" x="-46" y="-13" width="92" height="26" rx="13" transform="translate(372 346) rotate(-28)" />
          <ellipse id={id("highlight-dot")} data-part="highlight-dot" fill="#FFFFFF" fillOpacity="0.7" cx="768" cy="508" rx="12" ry="26" transform="rotate(-8 768 508)" />
        </g>
        <g id={id("eyes")} data-part="eyes">
          <g id={id("eyes-state")} data-part="eyes-state">
            <g id={id("eye-left")} data-part="eye-left" transform="translate(450 582) rotate(19.3)">
              <rect className="eye" x="-31" y="-57" width="62" height="114" rx="31" fill="#020204" />
            </g>
            <g id={id("eye-right")} data-part="eye-right" transform="translate(550 613) rotate(18.8)">
              <rect className="eye" x="-31" y="-57" width="62" height="114" rx="31" fill="#020204" />
            </g>
          </g>
        </g>
      </g>
      <g id={id("decorations-front")} data-part="decorations-front">
        <g id={id("sparkle-front")} data-part="sparkle-front">
          <path fill={`url(#${id("en-star")})`} d="M822.3 621.5 C824.6 617.3 829.8 616.9 832.7 620.7 C836.3 637.7 848.2 648.1 865.5 649.3 C869.7 651.6 870.1 656.8 866.3 659.7 C849.3 663.3 838.9 675.2 837.7 692.5 C835.4 696.7 830.2 697.1 827.3 693.3 C823.7 676.3 811.8 665.9 794.5 664.7 C790.3 662.4 789.9 657.2 793.7 654.3 C810.7 650.7 821.1 638.8 822.3 621.5 Z" />
        </g>
      </g>
    </svg>
  );
}
