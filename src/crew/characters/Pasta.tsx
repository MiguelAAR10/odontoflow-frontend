"use client";

// Geometry: official personajes-svg master; Enjuague/Escudo use the v10 recolor.
import { useCharacter } from "./useCharacter";
import type { CharacterProps } from "./types";

export function Pasta(props: CharacterProps) {
  const { id, svgProps, title } = useCharacter("pasta", props);
  return (
    <svg {...svgProps}>
      <title id={id("title")}>{title}</title>
      <defs>
        <linearGradient id={id("ps-base")} data-part="ps-base" gradientUnits="userSpaceOnUse" x1="300" y1="550" x2="670" y2="674">
          <stop offset="0" stopColor="#FF5A45" />
          <stop offset="0.09" stopColor="#E62922" />
          <stop offset="0.4" stopColor="#D71E1D" />
          <stop offset="1" stopColor="#CA191A" />
        </linearGradient>
        <linearGradient id={id("ps-shade-right")} data-part="ps-shade-right" gradientUnits="userSpaceOnUse" x1="702" y1="235" x2="815" y2="273">
          <stop offset="0" stopColor="#8F0C12" stopOpacity="0" />
          <stop offset="0.5" stopColor="#880B11" stopOpacity="0.6" />
          <stop offset="1" stopColor="#62070C" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id={id("ps-shade-cap")} data-part="ps-shade-cap" gradientUnits="userSpaceOnUse" x1="606" y1="236" x2="597" y2="288">
          <stop offset="0" stopColor="#62070C" stopOpacity="0.7" />
          <stop offset="1" stopColor="#62070C" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("ps-band")} data-part="ps-band" gradientUnits="userSpaceOnUse" x1="260" y1="640" x2="760" y2="520">
          <stop offset="0" stopColor="#EFEFEF" />
          <stop offset="0.6" stopColor="#E4E4E4" />
          <stop offset="1" stopColor="#DBDBDB" />
        </linearGradient>
        <linearGradient id={id("ps-seal")} data-part="ps-seal" gradientUnits="userSpaceOnUse" x1="300" y1="720" x2="560" y2="960">
          <stop offset="0" stopColor="#E0221E" />
          <stop offset="0.3" stopColor="#C9181A" />
          <stop offset="1" stopColor="#980E13" />
        </linearGradient>
        <linearGradient id={id("ps-arm-left")} data-part="ps-arm-left" gradientUnits="userSpaceOnUse" x1="215" y1="380" x2="330" y2="500">
          <stop offset="0" stopColor="#F1372A" />
          <stop offset="0.55" stopColor="#D21C1C" />
          <stop offset="1" stopColor="#970D13" />
        </linearGradient>
        <linearGradient id={id("ps-arm-right")} data-part="ps-arm-right" gradientUnits="userSpaceOnUse" x1="700" y1="560" x2="850" y2="610">
          <stop offset="0" stopColor="#970D13" />
          <stop offset="0.35" stopColor="#D21C1C" />
          <stop offset="1" stopColor="#C41719" />
        </linearGradient>
        <linearGradient id={id("ps-cap")} data-part="ps-cap" gradientUnits="userSpaceOnUse" x1="500" y1="120" x2="725" y2="200">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#F4F4F4" />
          <stop offset="1" stopColor="#DFDFDF" />
        </linearGradient>
        <linearGradient id={id("ps-star")} data-part="ps-star" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD72B" />
          <stop offset="0.6" stopColor="#FFD72B" />
          <stop offset="1" stopColor="#FFD72B" />
        </linearGradient>
        <clipPath id={id("ps-clip-body")} data-part="ps-clip-body">
          <path d="M476 204 L709 250 L710 264 C739 281 757 300 756 335 C745 400 676 715 655 857 L645 885 L250 795 L241 735 C284 571 337 413 398 257 C416 222 438 209 476 204 Z" />
        </clipPath>
        <clipPath id={id("ps-clip-cap")} data-part="ps-clip-cap">
          <path d="M561 77 C622 74 683 90 713 118 C723 128 725 144 723 159 L711 247 C709 258 702 263 692 262 C640 258 560 236 500 213 C490 209 485 201 488 192 L526 101 C532 87 545 78 561 77 Z" />
        </clipPath>
        <filter id={id("ps-grain")} data-part="ps-grain" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
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
          <path fill={`url(#${id("ps-star")})`} d="M328.5 188.5 C331.3 184.0 336.7 184.0 339.5 188.5 C342.0 207.8 353.7 220.4 371.8 223.2 C376.0 226.1 376.0 231.9 371.8 234.8 C353.7 237.6 342.0 250.2 339.5 269.5 C336.7 274.0 331.3 274.0 328.5 269.5 C326.0 250.2 314.3 237.6 296.2 234.8 C292.0 231.9 292.0 226.1 296.2 223.2 C314.3 220.4 326.0 207.8 328.5 188.5 Z" />
        </g>
      </g>
      <g id={id("character")} data-part="character">
        <g id={id("arm-left")} data-part="arm-left">
          <path fill={`url(#${id("ps-arm-left")})`} d="M299 531 C267 512 246 500 225 467 C211 445 198 413 209 387 C219 365 244 354 267 364 C296 377 300 418 330 438 L362 470 L342 548 Z" />
        </g>
        <g id={id("arm-right")} data-part="arm-right">
          <path fill={`url(#${id("ps-arm-right")})`} d="M712 553 C740 551 770 530 797 525 C825 520 851 536 850 566 C849 598 817 620 791 632 C759 646 727 649 693 650 L662 640 L684 540 Z" />
        </g>
        <g id={id("character-body")} data-part="character-body">
          <path id={id("body-shape")} data-part="body-shape" fill={`url(#${id("ps-base")})`} d="M476 204 L709 250 L710 264 C739 281 757 300 756 335 C745 400 676 715 655 857 L645 885 L250 795 L241 735 C284 571 337 413 398 257 C416 222 438 209 476 204 Z" />
          <g id={id("body-shade")} data-part="body-shade" clipPath={`url(#${id("ps-clip-body")})`}>
            <path id={id("band")} data-part="band" fill={`url(#${id("ps-band")})`} d="M230 676 C300 610 380 570 470 543 C560 517 690 502 770 412 L790 545 C720 590 680 612 610 627 C520 645 430 655 366 695 C326 720 296 748 238 800 Z" />
            <rect x="560" y="200" width="240" height="700" fill={`url(#${id("ps-shade-right")})`} />
            <path fill={`url(#${id("ps-shade-cap")})`} d="M470 196 C540 228 640 256 720 262 L720 300 C640 296 540 272 450 236 Z" />
          </g>
          <path id={id("body-base")} data-part="body-base" fill={`url(#${id("ps-seal")})`} d="M657 842 C655 862 663 881 659 900 C656 917 646 925 630 927 C577 933 293 846 242 816 C228 808 219 800 219 783 C219 765 232 748 242 733 C380 765 520 805 657 842 Z" />
        </g>
        <g id={id("cap")} data-part="cap">
          <path id={id("cap-shape")} data-part="cap-shape" fill={`url(#${id("ps-cap")})`} d="M561 77 C622 74 683 90 713 118 C723 128 725 144 723 159 L711 247 C709 258 702 263 692 262 C640 258 560 236 500 213 C490 209 485 201 488 192 L526 101 C532 87 545 78 561 77 Z" />
          <g id={id("cap-ridges")} data-part="cap-ridges" clipPath={`url(#${id("ps-clip-cap")})`}>
            <path fill="#E1E1E1" d="M514.5 253.9 L569.3 111.2 C571.5 105.5 568.7 99.2 563 97 C557.3 94.8 551 97.7 548.8 103.3 L494 246.1 Z" />
            <path fill="#DADADA" d="M573 272.3 L627.2 123.4 C629.4 117.1 626.2 110.3 620 108 C613.8 105.7 606.9 108.9 604.6 115.2 L550.5 264.1 Z" />
            <path fill="#CCCCCC" d="M653.2 294.3 L687.6 138.7 C689.3 131.1 684.5 123.7 677 122 C669.5 120.3 662 125.1 660.3 132.6 L625.8 288.3 Z" />
          </g>
        </g>
        <rect className="pj-grain" x="0" y="0" width="1024" height="1024" fill="#808080" clipPath={`url(#${id("ps-clip-body")})`} filter={`url(#${id("ps-grain")})`} opacity="0.32" />
        <g id={id("character-details")} data-part="character-details">
          <rect id={id("highlight-arc")} data-part="highlight-arc" opacity="0.42" fill="#FFFFFF" x="-58" y="-13" width="116" height="26" rx="13" transform="translate(395 345) rotate(-71.8)" />
          <ellipse id={id("highlight-dot")} data-part="highlight-dot" opacity="0.42" fill="#FFFFFF" cx="432" cy="250" rx="13" ry="22" transform="rotate(35 432 250)" />
        </g>
        <g id={id("eyes")} data-part="eyes">
          <g id={id("eyes-state")} data-part="eyes-state">
            <g id={id("eye-left")} data-part="eye-left" transform="translate(486.8 368.6) rotate(18.3)">
              <rect className="eye" x="-29" y="-52" width="58" height="104" rx="29" fill="#020204" />
            </g>
            <g id={id("eye-right")} data-part="eye-right" transform="translate(591.8 394.1) rotate(17.8)">
              <rect className="eye" x="-29" y="-52" width="58" height="104" rx="29" fill="#020204" />
            </g>
          </g>
        </g>
      </g>
      <g id={id("decorations-front")} data-part="decorations-front">
        <g id={id("sparkle-front")} data-part="sparkle-front">
          <path fill={`url(#${id("ps-star")})`} d="M743.5 697.5 C746.3 693.0 751.7 693.0 754.5 697.5 C757.0 716.9 768.7 729.5 786.8 732.1 C791.0 735.1 791.0 740.9 786.8 743.9 C768.7 746.5 757.0 759.1 754.5 778.5 C751.7 783.0 746.3 783.0 743.5 778.5 C741.0 759.1 729.3 746.5 711.2 743.9 C707.0 740.9 707.0 735.1 711.2 732.1 C729.3 729.5 741.0 716.9 743.5 697.5 Z" />
        </g>
      </g>
    </svg>
  );
}
