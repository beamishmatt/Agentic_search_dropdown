import React from 'react';
import { MapPin } from 'lucide-react';

// A self-contained, realistic-looking city map. No mapping library, API key, or
// network dependency — the base is a hand-built vector scene (land, water,
// parks, and a full road network with casings) that reads like a real map.
// Pins are placed by normalized x/y (0–1). Pins that share a location group
// into one marker with a count badge; the place label shows on hover/selection.

export interface SyntheticMapPoint {
  id: string;
  x: number; // 0..1 across the map surface
  y: number; // 0..1 down the map surface
  label?: string;
  selected?: boolean;
}

interface SyntheticMapProps {
  points: SyntheticMapPoint[];
  district?: string;
  onSelect?: (id: string) => void;
  emptyLabel?: string;
}

interface MarkerGroup {
  key: string;
  x: number;
  y: number;
  label?: string;
  ids: string[];
  selected: boolean;
  representativeId: string;
}

// Collapse points that resolved to the same place into one marker, averaging
// their (jittered) positions so the group sits at the incident's center.
function groupPoints(points: SyntheticMapPoint[]): MarkerGroup[] {
  const groups = new Map<string, SyntheticMapPoint[]>();
  for (const p of points) {
    const key = p.label ?? `__${p.id}`;
    const arr = groups.get(key);
    if (arr) arr.push(p);
    else groups.set(key, [p]);
  }

  return [...groups.entries()].map(([key, members]) => {
    const x = members.reduce((s, m) => s + m.x, 0) / members.length;
    const y = members.reduce((s, m) => s + m.y, 0) / members.length;
    const selectedMember = members.find(m => m.selected);
    return {
      key,
      x,
      y,
      label: members[0].label,
      ids: members.map(m => m.id),
      selected: !!selectedMember,
      representativeId: (selectedMember ?? members[0]).id,
    };
  });
}

// ─── Base map geometry (viewBox 0 0 800 600) ──────────────────────────────────

const GRID_V = [0, 80, 180, 300, 420, 540, 660, 760, 800];
const GRID_H = [0, 70, 160, 250, 350, 460, 560, 600];
const ROADS_V = GRID_V.filter(x => x > 0 && x < 800);
const ROADS_H = GRID_H.filter(y => y > 0 && y < 600);

// City blocks — the land between roads, tinted slightly off the base so the
// grid reads as built-up blocks rather than empty space.
const BLOCKS: { x: number; y: number; w: number; h: number }[] = [];
for (let i = 0; i < GRID_V.length - 1; i++) {
  for (let j = 0; j < GRID_H.length - 1; j++) {
    BLOCKS.push({
      x: GRID_V[i] + 5,
      y: GRID_H[j] + 5,
      w: GRID_V[i + 1] - GRID_V[i] - 10,
      h: GRID_H[j + 1] - GRID_H[j] - 10,
    });
  }
}

// Water: a bay in the lower-right plus a river snaking down to meet it. Drawn
// on top of the road grid so streets appear to end cleanly at the shoreline.
const BAY = 'M 800,300 C 690,330 660,430 640,600 L 800,600 Z';
const RIVER = 'M 470,-30 C 520,120 470,250 560,340 C 630,410 650,470 660,600';

// ─── Theme palettes ───────────────────────────────────────────────────────────

interface MapPalette {
  containerBg: string;
  land: string;
  block: string;
  park: string;
  water: string;
  waterStroke: string;
  roadCasing: string;
  roadFill: string;
  arterialCasing: string;
  arterialFill: string;
  hwyCasing: string;
  hwyFill: string;
  waterLabel: string;
  parkLabel: string;
  chipBg: string;
  chipText: string;
}

const LIGHT: MapPalette = {
  containerBg: '#e9efe7', land: '#eef1ec', block: '#e4e2d9', park: '#c3e0a2',
  water: '#a4cde1', waterStroke: '#8fb9cf',
  roadCasing: '#d5dae0', roadFill: '#ffffff', arterialCasing: '#c8ced5', arterialFill: '#ffffff',
  hwyCasing: '#ecc35a', hwyFill: '#ffd873',
  waterLabel: '#5f93ad', parkLabel: '#6f9a54',
  chipBg: 'rgba(255,255,255,0.75)', chipText: '#475569',
};

const DARK: MapPalette = {
  containerBg: '#151b24', land: '#1c222d', block: '#232b38', park: '#26382b',
  water: '#132030', waterStroke: '#294056',
  roadCasing: '#2a3340', roadFill: '#3a4556', arterialCasing: '#374253', arterialFill: '#4c5a6f',
  hwyCasing: '#6d5a2b', hwyFill: '#b28a2e',
  waterLabel: '#6aa0bd', parkLabel: '#7fa564',
  chipBg: 'rgba(15,20,28,0.78)', chipText: '#cbd5e1',
};

// Follow the app theme: true when the map sits inside a `.dark` subtree.
function useIsDark(ref: React.RefObject<HTMLElement>): boolean {
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    const check = () => setDark(!!ref.current?.closest('.dark'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    if (document.body) obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [ref]);
  return dark;
}

export function SyntheticMap({ points, district, onSelect, emptyLabel = 'No results to plot.' }: SyntheticMapProps) {
  const [hoveredKey, setHoveredKey] = React.useState<string | null>(null);
  const groups = React.useMemo(() => groupPoints(points), [points]);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const c = useIsDark(containerRef) ? DARK : LIGHT;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', backgroundColor: c.containerBg }}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 800 600"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, display: 'block' }}
      >
        {/* Land */}
        <rect x="0" y="0" width="800" height="600" fill={c.land} />

        {/* City blocks */}
        {BLOCKS.map((b, i) => (
          <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="3" fill={c.block} />
        ))}

        {/* Parks */}
        <rect x="188" y="258" width="104" height="84" rx="6" fill={c.park} />
        <rect x="548" y="188" width="104" height="54" rx="6" fill={c.park} />
        <circle cx="150" cy="470" r="52" fill={c.park} />

        {/* Minor road casings, then fills */}
        {ROADS_V.map(x => <line key={`vc${x}`} x1={x} y1="0" x2={x} y2="600" stroke={c.roadCasing} strokeWidth="9" />)}
        {ROADS_H.map(y => <line key={`hc${y}`} x1="0" y1={y} x2="800" y2={y} stroke={c.roadCasing} strokeWidth="9" />)}
        {ROADS_V.map(x => <line key={`vf${x}`} x1={x} y1="0" x2={x} y2="600" stroke={c.roadFill} strokeWidth="5.5" />)}
        {ROADS_H.map(y => <line key={`hf${y}`} x1="0" y1={y} x2="800" y2={y} stroke={c.roadFill} strokeWidth="5.5" />)}

        {/* Arterials (wider roads) */}
        <line x1="420" y1="0" x2="420" y2="600" stroke={c.arterialCasing} strokeWidth="16" />
        <line x1="420" y1="0" x2="420" y2="600" stroke={c.arterialFill} strokeWidth="11" />
        <line x1="0" y1="250" x2="800" y2="250" stroke={c.arterialCasing} strokeWidth="16" />
        <line x1="0" y1="250" x2="800" y2="250" stroke={c.arterialFill} strokeWidth="11" />

        {/* Diagonal boulevard */}
        <line x1="-20" y1="120" x2="820" y2="520" stroke={c.arterialCasing} strokeWidth="14" />
        <line x1="-20" y1="120" x2="820" y2="520" stroke={c.arterialFill} strokeWidth="9" />

        {/* Highway (tinted) */}
        <line x1="-20" y1="540" x2="820" y2="150" stroke={c.hwyCasing} strokeWidth="18" />
        <line x1="-20" y1="540" x2="820" y2="150" stroke={c.hwyFill} strokeWidth="12" />

        {/* Water — bay + river, over the roads */}
        <path d={BAY} fill={c.water} />
        <path d={RIVER} fill="none" stroke={c.water} strokeWidth="26" strokeLinecap="round" />
        <path d={BAY} fill="none" stroke={c.waterStroke} strokeWidth="1.5" />

        {/* Labels */}
        <text x="726" y="560" textAnchor="end" fill={c.waterLabel} fontSize="15" fontFamily="'IBM Plex Sans', sans-serif" fontStyle="italic" fontWeight="600" letterSpacing="0.5">Pelican Bay</text>
        <text x="240" y="304" textAnchor="middle" fill={c.parkLabel} fontSize="10" fontFamily="'IBM Plex Sans', sans-serif" fontWeight="600">Waterfront Park</text>
      </svg>

      {district && (
        <div style={{ position: 'absolute', top: 10, left: 12, fontSize: 11, color: c.chipText, fontFamily: "'IBM Plex Sans', sans-serif", letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 700, backgroundColor: c.chipBg, padding: '3px 8px', borderRadius: 5, backdropFilter: 'blur(2px)' }}>
          {district}
        </div>
      )}

      {groups.map(g => {
        const showLabel = g.label && (hoveredKey === g.key || g.selected);
        return (
          <button
            key={g.key}
            onClick={() => onSelect?.(g.representativeId)}
            onMouseEnter={() => setHoveredKey(g.key)}
            onMouseLeave={() => setHoveredKey(prev => (prev === g.key ? null : prev))}
            title={g.label}
            style={{
              position: 'absolute',
              left: `${8 + g.x * 84}%`,
              top: `${10 + g.y * 78}%`,
              transform: 'translate(-50%, -100%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              zIndex: g.selected ? 3 : hoveredKey === g.key ? 2 : 1,
              filter: g.selected ? 'drop-shadow(0 3px 5px rgba(0,0,0,0.35))' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.25))',
              transition: 'filter 0.1s',
            }}
          >
            {showLabel && (
              <span
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: '50%',
                  transform: 'translate(-50%, -4px)',
                  whiteSpace: 'nowrap',
                  backgroundColor: '#111827',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 600,
                  padding: '3px 7px',
                  borderRadius: 5,
                  pointerEvents: 'none',
                }}
              >
                {g.label}
              </span>
            )}
            <MapPin
              size={g.selected ? 30 : 22}
              fill={g.selected ? '#fec62e' : '#dc2626'}
              color={g.selected ? '#92400e' : '#7f1d1d'}
              strokeWidth={1.5}
            />
            {g.ids.length > 1 && (
              <span
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -6,
                  minWidth: 16,
                  height: 16,
                  padding: '0 4px',
                  borderRadius: 99,
                  backgroundColor: '#111827',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: '16px',
                  textAlign: 'center',
                  border: '1.5px solid #fff',
                  boxSizing: 'border-box',
                }}
              >
                {g.ids.length}
              </span>
            )}
          </button>
        );
      })}

      {groups.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>{emptyLabel}</p>
        </div>
      )}
    </div>
  );
}
