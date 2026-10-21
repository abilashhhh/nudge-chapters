"use client";

// Artwork for the cards you actually hold, redrawn from photos of them: the colours, the picture on each card and
// where its names sit. These are drawings in the cards' style, not the banks' artwork or logo files.
// Every drawing is a 320 × 202 box (a card's shape) and stretches to fill the card.

import { useId, type ReactNode } from "react";
import type { Art } from "@/lib/v2/card-skins";

function Box({ children }: { children: ReactNode }) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 320 202" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {children}
    </svg>
  );
}

/** Axis Bank's mark: a burgundy "A" made of two strokes. */
function AxisMark({ x, y, s = 1, light = true }: { x: number; y: number; s?: number; light?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M0 14 L7 0 L10 6 L5 14 Z" fill="#ae275f" />
      <path d="M8 14 L11 8 L14 14 Z" fill="#ae275f" />
      <text x="18" y="12" fontSize="10.5" fontWeight="700" letterSpacing="0.6" fill={light ? "#fff" : "#2a2a2a"} fontFamily="Arial, Helvetica, sans-serif">
        AXIS BANK
      </text>
    </g>
  );
}

function Sparkles({ pts, color }: { pts: [number, number, number][]; color: string }) {
  return (
    <>
      {pts.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={color} opacity={0.55 + (i % 3) * 0.15} />
      ))}
    </>
  );
}

/** The picture layer (behind the chip, numbers and labels). */
export function CardArt({ art }: { art: Art }) {
  const u = useId().replace(/:/g, "");
  switch (art) {
    case "axis-neo":
      // Black card with big glossy magenta sunglasses.
      return (
        <Box>
          <defs>
            <linearGradient id={`${u}r`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff7ad6" />
              <stop offset="0.45" stopColor="#d4198c" />
              <stop offset="1" stopColor="#4a0630" />
            </linearGradient>
            <radialGradient id={`${u}l`} cx="0.4" cy="0.35" r="0.8">
              <stop offset="0" stopColor="#c9c7d2" />
              <stop offset="0.6" stopColor="#6c6a78" />
              <stop offset="1" stopColor="#2a2930" />
            </radialGradient>
          </defs>
          <g transform="rotate(-18 190 120)">
            <ellipse cx="205" cy="105" rx="78" ry="52" fill={`url(#${u}l)`} />
            <ellipse cx="205" cy="105" rx="78" ry="52" fill="none" stroke={`url(#${u}r)`} strokeWidth="20" />
            <path d="M140 72 Q 200 40 268 70" stroke="#fff" strokeWidth="4" fill="none" opacity="0.55" strokeLinecap="round" />
            <ellipse cx="120" cy="190" rx="52" ry="30" fill={`url(#${u}l)`} />
            <ellipse cx="120" cy="190" rx="52" ry="30" fill="none" stroke={`url(#${u}r)`} strokeWidth="15" />
            <path d="M126 105 Q 112 140 118 160" stroke={`url(#${u}r)`} strokeWidth="12" fill="none" />
          </g>
          <AxisMark x={226} y={14} />
          <text x="304" y="40" fontSize="9" fontWeight="700" fill="#fff" opacity="0.9" textAnchor="end" fontFamily="Arial, sans-serif" letterSpacing="1">
            NEO
          </text>
        </Box>
      );
    case "axis-privilege":
      // Graphite card with a burgundy pyramid of fine lines.
      return (
        <Box>
          <defs>
            <linearGradient id={`${u}a`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d24786" />
              <stop offset="1" stopColor="#5e1534" />
            </linearGradient>
            <linearGradient id={`${u}b`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#8f2457" />
              <stop offset="1" stopColor="#2e0b1c" />
            </linearGradient>
            <pattern id={`${u}p`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(32)">
              <line x1="0" y1="0" x2="0" y2="7" stroke="#ff9cc8" strokeWidth="0.7" opacity="0.45" />
            </pattern>
          </defs>
          <polygon points="40,202 168,58 168,202" fill={`url(#${u}b)`} />
          <polygon points="40,202 168,58 168,202" fill={`url(#${u}p)`} />
          <polygon points="168,58 300,202 168,202" fill={`url(#${u}a)`} opacity="0.92" />
          <line x1="168" y1="58" x2="168" y2="202" stroke="#ffb3d5" strokeWidth="0.8" opacity="0.6" />
          <AxisMark x={224} y={14} />
          <text x="304" y="40" fontSize="8.5" fontWeight="700" fill="#fff" opacity="0.85" textAnchor="end" fontFamily="Arial, sans-serif" letterSpacing="1.4">
            PRIVILEGE
          </text>
        </Box>
      );
    case "axis-flipkart":
      // An original design for this card: deep navy with soft blue and gold arcs on the right, kept clear of the
      // chip, number and name. Only the card's name is written; no bank or shop logos are drawn.
      return (
        <Box>
          <defs>
            <linearGradient id={`${u}bg`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#0f1a3a" />
              <stop offset="1" stopColor="#070b18" />
            </linearGradient>
            <radialGradient id={`${u}glow`} cx="0.85" cy="0.2" r="0.7">
              <stop offset="0" stopColor="#3b6cff" stopOpacity="0.55" />
              <stop offset="1" stopColor="#3b6cff" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="320" height="202" fill={`url(#${u}bg)`} />
          <rect width="320" height="202" fill={`url(#${u}glow)`} />
          <g fill="none" strokeLinecap="round">
            <circle cx="300" cy="40" r="62" stroke="#5b8cff" strokeOpacity="0.35" strokeWidth="1.2" />
            <circle cx="300" cy="40" r="88" stroke="#5b8cff" strokeOpacity="0.22" strokeWidth="1.2" />
            <circle cx="300" cy="40" r="114" stroke="#5b8cff" strokeOpacity="0.14" strokeWidth="1.2" />
            <path d="M230 202 A 110 110 0 0 1 320 96" stroke="#f5c542" strokeOpacity="0.8" strokeWidth="3" />
          </g>
          <circle cx="262" cy="150" r="4" fill="#f5c542" opacity="0.9" />
          <text x="16" y="27" fontSize="13" fontWeight="700" letterSpacing="0.3" fill="#fff" fontFamily="Inter, Arial, Helvetica, sans-serif">
            Flipkart
          </text>
          <text x="16" y="40" fontSize="8" fontWeight="600" letterSpacing="1.6" fill="#fff" opacity="0.6" fontFamily="Inter, Arial, Helvetica, sans-serif">
            AXIS BANK
          </text>
        </Box>
      );
    case "amazon-pay":
      // Matte charcoal card, amazon pay wordmark with the orange smile, ICICI Bank in orange.
      return (
        <Box>
          <g transform="translate(206 14)">
            <text x="0" y="13" fontSize="15" fontWeight="700" fill="#fff" fontFamily="Arial, Helvetica, sans-serif" letterSpacing="-0.3">
              amazon
            </text>
            <text x="62" y="13" fontSize="15" fontWeight="400" fill="#fff" fontFamily="Arial, Helvetica, sans-serif">
              pay
            </text>
            <path d="M2 18 Q 30 28 56 18" stroke="#ff9900" strokeWidth="2.6" fill="none" strokeLinecap="round" />
            <path d="M51 15 L57 18 L52 22" stroke="#ff9900" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <g transform="translate(220 150)">
            <circle cx="6" cy="6" r="6" fill="#f37021" />
            <text x="3.8" y="9.6" fontSize="9" fontWeight="900" fontStyle="italic" fill="#fff" fontFamily="Arial, sans-serif">
              i
            </text>
            <text x="16" y="10" fontSize="11.5" fontWeight="800" fontStyle="italic" fill="#f37021" fontFamily="Arial, sans-serif">
              ICICI Bank
            </text>
          </g>
        </Box>
      );
    case "sbi-bpcl":
      // Black card with a golden fuel splash ending in a nozzle.
      return (
        <Box>
          <defs>
            <linearGradient id={`${u}g`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff2b0" />
              <stop offset="0.4" stopColor="#e7b84a" />
              <stop offset="1" stopColor="#8a5a12" />
            </linearGradient>
          </defs>
          <path d="M30 -5 C 70 40, 40 90, 95 120 S 130 170, 118 190" stroke={`url(#${u}g)`} strokeWidth="10" fill="none" strokeLinecap="round" />
          <path d="M12 0 C 60 50, 28 100, 86 128 S 112 172, 108 186" stroke={`url(#${u}g)`} strokeWidth="3" fill="none" opacity="0.8" />
          <path d="M48 -5 C 90 46, 66 92, 110 118" stroke={`url(#${u}g)`} strokeWidth="2" fill="none" opacity="0.6" />
          <Sparkles color="#ffd86b" pts={[[40, 30, 1.6], [70, 22, 1.1], [58, 64, 1.4], [92, 80, 1], [30, 96, 1.2], [118, 104, 1.5], [76, 140, 1], [134, 150, 1.3], [24, 60, 0.9]]} />
          {/* nozzle */}
          <g transform="translate(96 176) rotate(-28)">
            <rect x="0" y="0" width="34" height="11" rx="3" fill={`url(#${u}g)`} />
            <rect x="30" y="3" width="16" height="5" rx="2" fill={`url(#${u}g)`} />
            <path d="M6 11 Q 10 24 22 22" stroke={`url(#${u}g)`} strokeWidth="4" fill="none" />
          </g>
          <g transform="translate(216 124)">
            <circle cx="7" cy="7" r="7" fill="#2a8fd6" />
            <circle cx="7" cy="7" r="2.2" fill="#121213" />
            <rect x="6" y="7" width="2" height="7" fill="#121213" />
            <text x="18" y="12" fontSize="13" fontWeight="800" fill="#2a8fd6" fontFamily="Arial, sans-serif">
              SBI card
            </text>
          </g>
          <rect x="274" y="12" width="32" height="20" rx="3" fill="#fff" opacity="0.92" />
          <text x="290" y="25.5" fontSize="7" fontWeight="800" fill="#0a58a8" textAnchor="middle" fontFamily="Arial, sans-serif">
            BPCL
          </text>
        </Box>
      );
    case "hdfc-swiggy":
      // Orange-to-violet gradient with fine contour lines.
      return (
        <Box>
          <defs>
            <pattern id={`${u}c`} width="320" height="202" patternUnits="userSpaceOnUse">
              {Array.from({ length: 34 }, (_, i) => (
                <circle key={i} cx="360" cy="-60" r={60 + i * 9} fill="none" stroke="#fff" strokeWidth="0.6" opacity="0.18" />
              ))}
            </pattern>
          </defs>
          <rect width="320" height="202" fill={`url(#${u}c)`} />
          <g transform="translate(232 14)">
            <path d="M6 0 C 1 0 -1 5 1 8 L6 15 L11 8 C 13 5 11 0 6 0 Z" fill="#fff" />
            <text x="16" y="11" fontSize="11" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif" letterSpacing="0.8">
              SWIGGY
            </text>
          </g>
          <g transform="translate(232 128)">
            <rect x="0" y="0" width="74" height="20" rx="2" fill="#fff" />
            <rect x="4" y="4" width="12" height="12" fill="#ed232a" />
            <rect x="7" y="7" width="6" height="6" fill="#fff" />
            <rect x="9" y="4" width="2" height="12" fill="#004c8f" />
            <rect x="4" y="9" width="12" height="2" fill="#004c8f" />
            <text x="20" y="14" fontSize="8.5" fontWeight="800" fill="#004c8f" fontFamily="Arial, sans-serif">
              HDFC BANK
            </text>
          </g>
        </Box>
      );
    case "yes-ace":
      // Teal silk with soft folds and a big thin "ACE".
      return (
        <Box>
          <path d="M-10 140 C 60 90, 120 170, 200 110 S 300 40, 340 70 L 340 -10 L -10 -10 Z" fill="#fff" opacity="0.1" />
          <path d="M-10 170 C 80 120, 150 200, 230 140 S 310 100, 340 120 L 340 212 L -10 212 Z" fill="#0b4d61" opacity="0.22" />
          <path d="M120 -10 C 160 60, 230 30, 260 90 S 300 170, 340 160" stroke="#fff" strokeWidth="18" fill="none" opacity="0.08" />
          <text x="300" y="132" fontSize="34" fontWeight="200" fill="#fff" letterSpacing="5" textAnchor="end" fontFamily="'Helvetica Neue', Arial, sans-serif" opacity="0.95">
            ACE
          </text>
          <g transform="translate(240 14)">
            <path d="M0 4 L5 12 L14 0" stroke="#e1251b" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <text x="18" y="12" fontSize="10" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif" letterSpacing="0.4">
              YES BANK
            </text>
          </g>
        </Box>
      );
    case "onecard":
      // Matte black metal with a big "one" and BOBCARD.
      return (
        <Box>
          <rect x="216" y="0" width="1" height="202" fill="#fff" opacity="0.06" />
          <text x="14" y="46" fontSize="40" fontWeight="900" fill="#fff" opacity="0.14" fontFamily="'Arial Rounded MT Bold', Arial, sans-serif" letterSpacing="-2">
            one
          </text>
          <g transform="translate(240 14)">
            <path d="M0 2 L8 2 L12 7 L8 12 L0 12 L4 7 Z" fill="#f26522" />
            <text x="15" y="11.5" fontSize="9.5" fontWeight="900" fill="#fff" fontFamily="Arial, sans-serif" letterSpacing="0.6">
              BOBCARD
            </text>
          </g>
        </Box>
      );
    case "idfc-millennia":
      // Terracotta card with a blue character in round orange sunglasses.
      return (
        <Box>
          <defs>
            <radialGradient id={`${u}s`} cx="0.35" cy="0.35" r="0.8">
              <stop offset="0" stopColor="#8a2b22" />
              <stop offset="1" stopColor="#3a0f0b" />
            </radialGradient>
          </defs>
          {/* head and cap */}
          <path d="M10 210 C 0 120, 40 40, 120 30 C 190 22, 230 60, 220 120 C 215 160, 190 190, 170 212 Z" fill="#2f4ea8" />
          <path d="M40 70 C 70 20, 170 10, 214 60 C 180 54, 110 50, 40 70 Z" fill="#1c2f6e" />
          <path d="M150 60 C 190 52, 238 58, 262 70 C 230 76, 190 74, 150 70 Z" fill="#1c2f6e" />
          {/* face patch */}
          <path d="M70 150 C 80 120, 120 112, 150 128 C 170 140, 160 190, 130 206 L 80 206 Z" fill="#eef1f8" />
          {/* sunglasses */}
          <circle cx="95" cy="104" r="27" fill={`url(#${u}s)`} stroke="#ff6a3d" strokeWidth="6" />
          <circle cx="165" cy="104" r="27" fill={`url(#${u}s)`} stroke="#ff6a3d" strokeWidth="6" />
          <path d="M122 102 Q 130 96 138 102" stroke="#ff6a3d" strokeWidth="5" fill="none" />
          <path d="M84 92 Q 92 86 100 90" stroke="#fff" strokeWidth="2.5" fill="none" opacity="0.6" strokeLinecap="round" />
          <path d="M154 92 Q 162 86 170 90" stroke="#fff" strokeWidth="2.5" fill="none" opacity="0.6" strokeLinecap="round" />
          <g transform="translate(222 12)">
            <text x="0" y="9" fontSize="7.5" fontWeight="700" fill="#fff" letterSpacing="2" fontFamily="Arial, sans-serif">
              FIRST
            </text>
            <text x="-4" y="30" fontSize="20" fontStyle="italic" fill="#fff" fontFamily="'Brush Script MT', 'Segoe Script', cursive">
              Millennia
            </text>
            <rect x="72" y="-2" width="12" height="12" fill="none" stroke="#fff" strokeWidth="1.4" />
            <path d="M75 1 H81 M75 4 H79 M75 1 V8" stroke="#fff" strokeWidth="1.2" />
          </g>
        </Box>
      );
    case "kotak":
      // White on the left, burgundy to black on the right.
      return (
        <Box>
          <defs>
            <linearGradient id={`${u}k`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#9a1b3f" />
              <stop offset="0.5" stopColor="#5a0f26" />
              <stop offset="1" stopColor="#1a070d" />
            </linearGradient>
          </defs>
          <path d="M150 0 C 172 60, 168 140, 190 202 L 320 202 L 320 0 Z" fill={`url(#${u}k)`} />
          <text x="16" y="24" fontSize="8.5" fontWeight="700" fill="#666" letterSpacing="0.5" fontFamily="Arial, sans-serif">
            811 super
          </text>
          <g transform="translate(226 118)">
            <text x="0" y="16" fontSize="19" fontWeight="800" fill="#fff" fontFamily="Arial, Helvetica, sans-serif" letterSpacing="-0.5">
              kotak
            </text>
            <circle cx="62" cy="8" r="4.5" fill="#ed1c24" />
            <circle cx="72" cy="8" r="4.5" fill="#ed1c24" />
            <rect x="57.5" y="11" width="19" height="6" rx="2" fill="#ed1c24" />
          </g>
        </Box>
      );
    case "dhanlaxmi":
      // Blush pink with orchids on the right.
      return (
        <Box>
          {[
            [228, 92, 1],
            [258, 70, 0.8],
            [210, 128, 0.9],
            [272, 112, 0.75],
            [244, 140, 0.7],
          ].map(([x, y, k], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${k})`}>
              {[0, 72, 144, 216, 288].map((a) => (
                <ellipse key={a} cx="0" cy="-12" rx="7" ry="13" transform={`rotate(${a})`} fill={i % 2 ? "#e9a6dc" : "#cf6cbc"} opacity="0.9" />
              ))}
              <circle r="5" fill="#7a2a6e" />
              <circle r="2" fill="#f7d34a" />
            </g>
          ))}
          <path d="M150 210 C 180 160, 200 140, 228 92 M 210 128 C 230 120, 250 100, 258 70 M 200 160 C 220 150, 240 145, 272 112" stroke="#6f8f3a" strokeWidth="2" fill="none" />
          <g transform="translate(244 14)">
            <rect x="0" y="0" width="62" height="20" rx="2" fill="#6b2f87" />
            <text x="31" y="13" fontSize="7" fontWeight="700" fill="#fff" textAnchor="middle" fontFamily="Arial, sans-serif">
              Dhanlaxmi Bank
            </text>
          </g>
        </Box>
      );
    case "canara":
      // Sky blue with a large translucent triangle.
      return (
        <Box>
          <polygon points="120,-20 330,210 -60,210" fill="none" stroke="#fff" strokeWidth="26" opacity="0.16" />
          <polygon points="150,30 290,190 10,190" fill="#fff" opacity="0.07" />
          <path d="M-10 60 L 330 20 M -10 120 L 330 70" stroke="#fff" strokeWidth="1" opacity="0.25" />
          <g transform="translate(206 14)">
            <polygon points="0,14 8,0 16,14" fill="#ffcb05" />
            <polygon points="5,14 8,8 11,14" fill="#0a5ea8" />
            <text x="20" y="12" fontSize="11.5" fontWeight="800" fill="#fff" fontFamily="Georgia, 'Times New Roman', serif">
              Canara Bank
            </text>
          </g>
        </Box>
      );
    case "sbi-global":
      // Night blue with a glowing dotted globe.
      return (
        <Box>
          <defs>
            <radialGradient id={`${u}g`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#5aa8ff" stopOpacity="0.55" />
              <stop offset="0.7" stopColor="#2f6fd6" stopOpacity="0.2" />
              <stop offset="1" stopColor="#2f6fd6" stopOpacity="0" />
            </radialGradient>
            <clipPath id={`${u}c`}>
              <circle cx="176" cy="104" r="58" />
            </clipPath>
            <pattern id={`${u}d`} width="6" height="6" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="0.9" fill="#9fd0ff" />
            </pattern>
          </defs>
          <circle cx="176" cy="104" r="86" fill={`url(#${u}g)`} />
          <g clipPath={`url(#${u}c)`}>
            <rect x="110" y="40" width="140" height="130" fill={`url(#${u}d)`} opacity="0.35" />
            <path d="M140 70 C 160 60, 190 66, 196 84 C 200 98, 180 110, 168 120 C 158 128, 150 140, 140 132 C 128 120, 126 86, 140 70 Z" fill="#cfe6ff" opacity="0.75" />
            <path d="M196 120 C 210 112, 226 122, 222 140 C 218 152, 204 156, 196 146 Z" fill="#cfe6ff" opacity="0.6" />
          </g>
          <circle cx="176" cy="104" r="58" fill="none" stroke="#9fd0ff" strokeWidth="0.8" opacity="0.6" />
          <ellipse cx="176" cy="104" rx="96" ry="30" fill="none" stroke="#7fb6ff" strokeWidth="0.8" opacity="0.4" strokeDasharray="2 5" transform="rotate(-14 176 104)" />
          <Sparkles color="#bfe0ff" pts={[[80, 60, 1.6], [270, 70, 1.4], [250, 150, 1.2], [100, 150, 1.3], [60, 110, 1], [290, 120, 1]]} />
          <text x="16" y="24" fontSize="8" fontWeight="700" fill="#fff" opacity="0.85" letterSpacing="1.5" fontFamily="Arial, sans-serif">
            GLOBAL
          </text>
          <g transform="translate(262 12)">
            <circle cx="8" cy="8" r="8" fill="#29a8e0" />
            <circle cx="8" cy="8" r="2.6" fill="#0d1d45" />
            <rect x="7" y="8" width="2.2" height="8" fill="#0d1d45" />
            <text x="19" y="13" fontSize="12" fontWeight="900" fill="#fff" fontFamily="Arial, sans-serif">
              SBI
            </text>
          </g>
        </Box>
      );
    default:
      return null;
  }
}

/** Arts whose own logo sits top-right (so the card's name goes top-left without a separate issuer line). */
export const ART_LOGO_TOP: Partial<Record<Art, true>> = {
  "axis-neo": true, "axis-privilege": true, "amazon-pay": true, "hdfc-swiggy": true, "yes-ace": true, "onecard": true, "idfc-millennia": true, "canara": true, "sbi-bpcl": true,
};
