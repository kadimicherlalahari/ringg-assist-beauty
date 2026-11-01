// Illustrated product packshots drawn as SVG (the sample data only has
// placeholder image URLs). Shape depends on category; colour on product.

const PALETTES: Record<string, [string, string, string]> = {
  "VB-001": ["#f6efe6", "#e9dcc9", "#b89a72"],
  "VB-002": ["#e8f0e3", "#cfdfc5", "#5e7d55"],
  "VB-003": ["#eef0f5", "#d9dde8", "#6b7590"],
  "VB-004": ["#fbeadb", "#f3c9a1", "#c2683f"],
  "VB-005": ["#f4eef0", "#e6d6dc", "#9b7383"],
  "VB-006": ["#e7f2ec", "#c8e2d2", "#4f8a68"],
  "VB-007": ["#fdf3dc", "#f6dfa6", "#c89221"],
  "VB-008": ["#f6e7dc", "#e4c4ad", "#a5704d"],
  "VB-009": ["#eaf1f4", "#cbdde6", "#4f7f96"],
  "VB-010": ["#efe9f4", "#d8cbe6", "#7d5f9b"],
  "VB-011": ["#fbe4e0", "#f2bdb4", "#c25b4c"],
  "VB-012": ["#ece8e4", "#d6cdc4", "#7a6a5c"],
  "VB-013": ["#f3ecdc", "#e2cf9f", "#8a6a23"],
  "VB-014": ["#e7f0e8", "#c5dcc8", "#4e7a56"],
  "VB-015": ["#f6ece0", "#e8d0b0", "#a7783d"],
  "VB-016": ["#fcefd9", "#f5d39a", "#c98a1c"],
  "VB-017": ["#e6efe9", "#c3d9cc", "#4b7a62"],
  "VB-018": ["#fbe8dc", "#f2c7a8", "#c2683f"],
};

export function ProductImage({ id, category, name, className = "" }: { id: string; category: string; name: string; className?: string }) {
  const [bg, mid, deep] = PALETTES[id] || ["#f6efe6", "#e9dcc9", "#b89a72"];
  const short = name.replace(/\(.*\)/, "").split(" ").slice(0, 3).join(" ");
  return (
    <svg viewBox="0 0 300 300" role="img" aria-label={name} className={`h-full w-full ${className}`}>
      <rect width="300" height="300" fill={bg} />
      <circle cx="230" cy="70" r="60" fill={mid} opacity="0.55" />
      <ellipse cx="150" cy="262" rx="78" ry="9" fill={deep} opacity="0.12" />
      <Pack category={category} mid={mid} deep={deep} />
      <text x="150" y="170" textAnchor="middle" fontSize="11" fontFamily="Georgia, serif" fill={deep} opacity="0.9">
        {short.length > 22 ? short.slice(0, 22) + "…" : short}
      </text>
    </svg>
  );
}

function Pack({ category, mid, deep }: { category: string; mid: string; deep: string }) {
  const label = <rect x="105" y="150" width="90" height="34" rx="6" fill="#fff" opacity="0.92" />;
  switch (category) {
    case "Serum":
    case "Treatment":
      return (
        <g>
          <rect x="135" y="62" width="30" height="28" rx="6" fill={deep} />
          <rect x="128" y="88" width="44" height="10" rx="3" fill={deep} opacity="0.85" />
          <rect x="108" y="96" width="84" height="160" rx="22" fill={mid} stroke={deep} strokeOpacity="0.25" />
          {label}
        </g>
      );
    case "Moisturiser":
    case "Eye care":
      return (
        <g>
          <rect x="92" y="118" width="116" height="26" rx="8" fill={deep} />
          <rect x="88" y="140" width="124" height="116" rx="20" fill={mid} stroke={deep} strokeOpacity="0.25" />
          {label}
        </g>
      );
    case "Lip care":
      return (
        <g>
          <rect x="128" y="70" width="44" height="70" rx="14" fill={mid} stroke={deep} strokeOpacity="0.3" />
          <rect x="122" y="136" width="56" height="120" rx="10" fill={deep} opacity="0.9" />
          {label}
        </g>
      );
    case "Kit":
      return (
        <g>
          <rect x="70" y="100" width="160" height="156" rx="16" fill={mid} stroke={deep} strokeOpacity="0.3" />
          <rect x="70" y="100" width="160" height="30" rx="16" fill={deep} opacity="0.85" />
          <rect x="142" y="100" width="16" height="156" fill={deep} opacity="0.25" />
          {label}
        </g>
      );
    case "Sunscreen":
    case "Cleanser":
    case "Body care":
    case "Conditioner":
      return (
        <g>
          <rect x="128" y="236" width="44" height="22" rx="4" fill={deep} />
          <path d="M112 70 h76 l-6 168 h-64 z" fill={mid} stroke={deep} strokeOpacity="0.25" />
          {label}
        </g>
      );
    default: // bottles: hair oil, shampoo
      return (
        <g>
          <rect x="138" y="52" width="24" height="26" rx="5" fill={deep} />
          <path d="M126 78 h48 v22 q24 10 24 40 v104 q0 12 -12 12 h-72 q-12 0 -12 -12 v-104 q0 -30 24 -40 z" fill={mid} stroke={deep} strokeOpacity="0.25" />
          {label}
        </g>
      );
  }
}
