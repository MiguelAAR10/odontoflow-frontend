"use client";

// Geometry: official personajes-svg master; Enjuague/Escudo use the v10 recolor.
import { useCharacter } from "./useCharacter";
import type { CharacterProps } from "./types";

export function Escudo(props: CharacterProps) {
  const { id, svgProps, title } = useCharacter("escudo", props);
  return (
    <svg {...svgProps}>
      <title id={id("title")}>{title}</title>
      <defs>
        <linearGradient id={id("sc-base")} data-part="sc-base" gradientUnits="userSpaceOnUse" x1="250" y1="200" x2="700" y2="760">
          <stop offset="0" stopColor="#9AA3B2" />
          <stop offset="0.45" stopColor="#6B7584" />
          <stop offset="1" stopColor="#525B69" />
        </linearGradient>
        <linearGradient id={id("sc-facet")} data-part="sc-facet" gradientUnits="userSpaceOnUse" x1="620" y1="200" x2="720" y2="800">
          <stop offset="0" stopColor="#3D4552" />
          <stop offset="0.55" stopColor="#2A2F37" />
          <stop offset="1" stopColor="#22262D" />
        </linearGradient>
        <linearGradient id={id("sc-panel")} data-part="sc-panel" gradientUnits="userSpaceOnUse" x1="320" y1="290" x2="690" y2="720">
          <stop offset="0" stopColor="#FBFBFB" />
          <stop offset="0.5" stopColor="#F1F1F1" />
          <stop offset="1" stopColor="#E0E0E0" />
        </linearGradient>
        <radialGradient id={id("sc-panel-fold")} data-part="sc-panel-fold" gradientUnits="userSpaceOnUse" cx="700" cy="560" r="170">
          <stop offset="0" stopColor="#BDBDBD" stopOpacity="0.7" />
          <stop offset="1" stopColor="#BDBDBD" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={id("sc-arm")} data-part="sc-arm" gradientUnits="userSpaceOnUse" x1="130" y1="340" x2="290" y2="560">
          <stop offset="0" stopColor="#8A94A3" />
          <stop offset="1" stopColor="#4B5563" />
        </linearGradient>
        <linearGradient id={id("sc-arm-back")} data-part="sc-arm-back" gradientUnits="userSpaceOnUse" x1="720" y1="640" x2="850" y2="810">
          <stop offset="0" stopColor="#5F6877" />
          <stop offset="1" stopColor="#363D49" />
        </linearGradient>
        <linearGradient id={id("sc-star")} data-part="sc-star" gradientUnits="userSpaceOnUse" x1="140" y1="150" x2="270" y2="290">
          <stop offset="0" stopColor="#FFD72B" />
          <stop offset="1" stopColor="#FFD118" />
        </linearGradient>
        <linearGradient id={id("sc-star-r")} data-part="sc-star-r" gradientUnits="userSpaceOnUse" x1="845" y1="550" x2="935" y2="700">
          <stop offset="0" stopColor="#FFD72B" />
          <stop offset="1" stopColor="#FFD118" />
        </linearGradient>
        <clipPath id={id("sc-clip-body")} data-part="sc-clip-body">
          <path d="M217 539 C220 481 223 395 239 341 C249 305 266 257 284 225 C297 203 306 202 330 201 C437 196 495 155 584 141 C601 138 607 142 619 152 C643 173 666 198 690 220 C752 276 809 294 866 337 C882 350 889 370 887 390 C883 437 851 521 831 565 C804 624 762 684 721 734 C673 792 570 841 498 860 C474 867 432 876 409 867 C386 859 351 823 335 804 C302 767 271 720 251 675 C234 636 215 582 217 539 Z" />
        </clipPath>
        <clipPath id={id("sc-clip-panel")} data-part="sc-clip-panel">
          <path d="M293 399 C300 360 318 296 343 279 C352 274 368 273 382 272 C440 266 520 248 566 235 C574 233 578 236 583 241 C640 300 690 340 762 372 C778 380 788 390 784 410 C760 490 712 590 670 630 C610 690 530 745 468 768 C448 776 430 780 418 774 C340 700 286 600 283 500 C282 467 286 432 293 399 Z" />
        </clipPath>
        <filter id={id("sc-grain")} data-part="sc-grain" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
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
          <path fill={`url(#${id("sc-star")})`} d="M207.4 149.6 C210.3 144.3 216.8 143.9 220.3 148.7 C224.8 169.9 239.8 182.9 261.4 184.4 C266.7 187.3 267.1 193.8 262.3 197.3 C241.1 201.8 228.1 216.8 226.6 238.4 C223.7 243.7 217.2 244.1 213.7 239.3 C209.2 218.1 194.2 205.1 172.6 203.6 C167.3 200.7 166.9 194.2 171.7 190.7 C192.9 186.2 205.9 171.2 207.4 149.6 Z" />
        </g>
        <g id={id("sparkle-back-small")} data-part="sparkle-back-small">
          <path fill={`url(#${id("sc-star")})`} d="M160.8 236.0 C162.4 233.2 165.9 232.9 167.8 235.5 C170.2 247.0 178.3 254.0 190.0 254.8 C192.8 256.4 193.1 259.9 190.5 261.8 C179.0 264.2 172.0 272.3 171.2 284.0 C169.6 286.8 166.1 287.1 164.2 284.5 C161.8 273.0 153.7 266.0 142.0 265.2 C139.2 263.6 138.9 260.1 141.5 258.2 C153.0 255.8 160.0 247.7 160.8 236.0 Z" />
        </g>
      </g>
      <g id={id("character")} data-part="character">
        <g id={id("character-body")} data-part="character-body">
          <g id={id("arm-right")} data-part="arm-right">
            <ellipse fill={`url(#${id("sc-arm-back")})`} cx="779" cy="721" rx="99" ry="66" transform="rotate(60 779 721)" />
          </g>
          <g id={id("arm-left")} data-part="arm-left">
            <ellipse fill={`url(#${id("sc-arm")})`} cx="204" cy="448" rx="119" ry="70" transform="rotate(55 204 448)" />
          </g>
          <path id={id("body-shape")} data-part="body-shape" fill={`url(#${id("sc-base")})`} d="M217 539 C220 481 223 395 239 341 C249 305 266 257 284 225 C297 203 306 202 330 201 C437 196 495 155 584 141 C601 138 607 142 619 152 C643 173 666 198 690 220 C752 276 809 294 866 337 C882 350 889 370 887 390 C883 437 851 521 831 565 C804 624 762 684 721 734 C673 792 570 841 498 860 C474 867 432 876 409 867 C386 859 351 823 335 804 C302 767 271 720 251 675 C234 636 215 582 217 539 Z" />
          <g id={id("body-shade")} data-part="body-shade" clipPath={`url(#${id("sc-clip-body")})`}>
            <path fill={`url(#${id("sc-facet")})`} d="M606 110 L574 238 L428 780 L404 900 L940 900 L940 110 Z" />
          </g>
          <path id={id("panel")} data-part="panel" fill={`url(#${id("sc-panel")})`} d="M293 399 C300 360 318 296 343 279 C352 274 368 273 382 272 C440 266 520 248 566 235 C574 233 578 236 583 241 C640 300 690 340 762 372 C778 380 788 390 784 410 C760 490 712 590 670 630 C610 690 530 745 468 768 C448 776 430 780 418 774 C340 700 286 600 283 500 C282 467 286 432 293 399 Z" />
          <circle id={id("panel-fold")} data-part="panel-fold" cx="700" cy="560" r="170" fill={`url(#${id("sc-panel-fold")})`} clipPath={`url(#${id("sc-clip-panel")})`} />
        </g>
        <rect className="pj-grain" x="0" y="0" width="1024" height="1024" fill="#808080" clipPath={`url(#${id("sc-clip-body")})`} filter={`url(#${id("sc-grain")})`} opacity="0.32" />
        <g id={id("character-details")} data-part="character-details">
          <rect id={id("highlight-arc")} data-part="highlight-arc" fill="#FFFFFF" fillOpacity="0.7" x="-50" y="-10" width="100" height="20" rx="10" transform="translate(266 292) rotate(-62)" />
          <ellipse id={id("highlight-dot")} data-part="highlight-dot" fill="#FFFFFF" fillOpacity="0.7" cx="249" cy="378" rx="9" ry="16" transform="rotate(20 249 378)" />
        </g>
        <g id={id("eyes")} data-part="eyes">
          <g id={id("eyes-state")} data-part="eyes-state">
            <g id={id("eye-left")} data-part="eye-left" transform="translate(437 462) rotate(18.6)">
              <rect className="eye" x="-35" y="-67" width="70" height="134" rx="35" fill="#020204" />
            </g>
            <g id={id("eye-right")} data-part="eye-right" transform="translate(555 494) rotate(18.5)">
              <rect className="eye" x="-35" y="-67" width="70" height="134" rx="35" fill="#020204" />
            </g>
          </g>
        </g>
      </g>
      <g id={id("decorations-front")} data-part="decorations-front">
        <g id={id("sparkle-front")} data-part="sparkle-front">
          <path fill={`url(#${id("sc-star-r")})`} d="M887.8 553.3 C890.5 548.3 896.8 547.9 900.2 552.5 C904.5 572.9 918.9 585.3 939.7 586.8 C944.7 589.5 945.1 595.8 940.5 599.2 C920.1 603.5 907.7 617.9 906.2 638.7 C903.5 643.7 897.2 644.1 893.8 639.5 C889.5 619.1 875.1 606.7 854.3 605.2 C849.3 602.5 848.9 596.2 853.5 592.8 C873.9 588.5 886.3 574.1 887.8 553.3 Z" />
        </g>
        <g id={id("sparkle-front-small")} data-part="sparkle-front-small">
          <path fill={`url(#${id("sc-star-r")})`} d="M893.2 669.8 C894.6 667.2 897.9 666.9 899.7 669.3 C901.9 679.9 909.4 686.4 920.2 687.2 C922.8 688.6 923.1 691.9 920.7 693.7 C910.1 695.9 903.6 703.4 902.8 714.2 C901.4 716.8 898.1 717.1 896.3 714.7 C894.1 704.1 886.6 697.6 875.8 696.8 C873.2 695.4 872.9 692.1 875.3 690.3 C885.9 688.1 892.4 680.6 893.2 669.8 Z" />
        </g>
      </g>
    </svg>
  );
}
