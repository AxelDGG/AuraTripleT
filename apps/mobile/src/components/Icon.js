// Iconografía propia, portada de apps/web/public/js/icons.js a react-native-svg.
//
// No usamos una librería de íconos: el reto pide que los componentes sean del
// equipo, y además así el trazo de la app es idéntico al de la web. Toda la
// geometría vive sobre un lienzo de 24x24 con trazo de 1.7.

import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { color } from '../theme/tokens';

// Cada ícono es una lista de primitivas: ['p', d] · ['c', cx, cy, r] · ['r', x, y, w, h, rx]
const ICONS = {
  // --- Navegación inferior ---
  accounts: [['p', 'M3.5 8.2A2.7 2.7 0 0 1 6.2 5.5h10.3A2.5 2.5 0 0 1 19 8'], ['r', 3.5, 8, 17, 10.5, 2.6], ['c', 16.3, 13.2, 1.2]],
  transfers: [['p', 'M4 8.5h13.5M14 5l3.5 3.5L14 12'], ['p', 'M20 15.5H6.5M10 12l-3.5 3.5L10 19']],
  chat: [['p', 'M20.5 11.8c0 4-3.8 7.2-8.5 7.2-1 0-2-.15-2.9-.42L4 20.5l1.5-3.6A6.9 6.9 0 0 1 3.5 11.8c0-4 3.8-7.3 8.5-7.3s8.5 3.3 8.5 7.3Z']],
  investments: [['p', 'M4 19.5V4'], ['p', 'M4 19.5h16'], ['p', 'M7.5 16.2l3.6-4.4 3 2.4 4.4-6']],
  services: [['r', 4.5, 3, 12.5, 18, 2.4], ['p', 'M8 8h5.5M8 11.6h5.5M8 15.2h3.5'], ['c', 17.4, 16.6, 3.2], ['p', 'm19.8 19 2 2']],

  // --- Interfaz ---
  location: [['p', 'M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z'], ['c', 12, 10, 2.6]],
  logout: [['p', 'M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M15 8l5 4-5 4M20 12H9']],
  search: [['c', 10.5, 10.5, 6.5], ['p', 'm15.4 15.4 4.6 4.6']],
  mic: [['r', 9, 3, 6, 11, 3], ['p', 'M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6']],
  close: [['p', 'M18 6 6 18M6 6l12 12']],
  chevron: [['p', 'm6 9 6 6 6-6']],
  chevronLeft: [['p', 'm14 6-6 6 6 6']],
  chevronRight: [['p', 'm10 6 6 6-6 6']],
  send: [['p', 'M3 11.5 21 3l-8.5 18-2.3-7.2L3 11.5Z']],
  sparkle: [['fp', 'M12 3l1.9 5.4L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.6L12 3Z']],
  folder: [['p', 'M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2l2 2.5h7.8A2.5 2.5 0 0 1 21 10v7a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17V7.5Z']],
  clock: [['c', 12, 12, 8.5], ['p', 'M12 7.2V12l3.2 2']],
  history: [['p', 'M3.8 12a8.2 8.2 0 1 0 2.6-6'], ['p', 'M3.6 3.8v3.4h3.4'], ['p', 'M12 7.6V12l3 1.8']],
  layers: [['p', 'm12 3.5 8.2 4.3-8.2 4.3-8.2-4.3L12 3.5Z'], ['p', 'm3.8 12.2 8.2 4.3 8.2-4.3'], ['p', 'm3.8 16.4 8.2 4.3 8.2-4.3']],
  user: [['c', 12, 8.2, 3.6], ['p', 'M4.8 20c.9-3.5 3.8-5.4 7.2-5.4s6.3 1.9 7.2 5.4']],
  phone: [['p', 'M7 3.8h3l1.4 3.6-2 1.4a10.5 10.5 0 0 0 5.8 5.8l1.4-2 3.6 1.4v3a2 2 0 0 1-2.2 2C11.4 18.4 5.6 12.6 5 5.9A2 2 0 0 1 7 3.8Z']],
  card: [['r', 3, 5.5, 18, 13, 2.6], ['p', 'M3 10h18M6.5 14.6h3.6']],
  exchange: [['p', 'M4 8.5h13.5M14 5l3.5 3.5L14 12'], ['p', 'M20 15.5H6.5M10 12l-3.5 3.5L10 19']],
  target: [['c', 12, 12, 8], ['c', 12, 12, 4], ['fc', 12, 12, 0.9]],
  check: [['p', 'm4.5 12.5 5 5 10-11']],
  alert: [['c', 12, 12, 8.5], ['p', 'M12 7.5v5.2M12 16.2v.1']],
  refresh: [['p', 'M20 12a8 8 0 1 1-2.4-5.7'], ['p', 'M20.4 3.6v4.2h-4.2']],
  eye: [['p', 'M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z'], ['c', 12, 12, 3]],
  eyeOff: [['p', 'M9.9 5.9A9.6 9.6 0 0 1 12 5.8c6 0 9.5 6.2 9.5 6.2a17 17 0 0 1-3.3 4'], ['p', 'M6.2 7.6A16.6 16.6 0 0 0 2.5 12S6 18.2 12 18.2c1.6 0 3-.4 4.2-1'], ['p', 'M4 4l16 16'], ['p', 'M9.9 10a3 3 0 0 0 4.2 4.2']],

  // --- Seguridad ---
  lock: [['r', 4.5, 10.5, 15, 10, 2.4], ['p', 'M8 10.5V7.8a4 4 0 0 1 8 0v2.7'], ['fc', 12, 15.5, 1.2]],
  fingerprint: [
    ['p', 'M5 10.5a7.6 7.6 0 0 1 14-1.6'],
    ['p', 'M8.2 11.2a3.9 3.9 0 0 1 7.7.7c0 2.6-.4 5-1.2 7'],
    ['p', 'M11.2 11.9a.9.9 0 0 1 1.8 0c0 3.4-.6 6.5-1.7 9.1'],
    ['p', 'M6.6 14.4c.4 2.2.2 4.4-.6 6.4'],
    ['p', 'M19.2 13.2a19 19 0 0 1-1.1 7'],
  ],
  face: [
    ['p', 'M4 8.6V6.4A2.4 2.4 0 0 1 6.4 4h2.2M15.4 4h2.2A2.4 2.4 0 0 1 20 6.4v2.2M20 15.4v2.2a2.4 2.4 0 0 1-2.4 2.4h-2.2M8.6 20H6.4A2.4 2.4 0 0 1 4 17.6v-2.2'],
    ['fc', 9.4, 10.6, 0.95],
    ['fc', 14.6, 10.6, 0.95],
    ['p', 'M9.2 14.6a3.6 3.6 0 0 0 5.6 0'],
  ],
  shield: [['p', 'M12 3.2 19 6v5.4c0 4.2-2.8 7.6-7 9.4-4.2-1.8-7-5.2-7-9.4V6l7-2.8Z'], ['p', 'm8.8 12 2.2 2.2 4.2-4.4']],

  // --- Glifos de gráfica (tarjetas de sugerencia) ---
  chartBar: [['p', 'M4 20V10M9.3 20V4M14.7 20v-7M20 20v-11']],
  chartLine: [['p', 'M3.5 16.5 9 10.5l3.6 3.4L20.5 6'], ['p', 'M15.8 6h4.7v4.6']],
  chartArea: [['p', 'M3.5 15 8.5 9.6l3.8 3.2 4.4-5.4 3.8 3.4'], ['p', 'M3.5 15v4.5h17V10.8']],
  chartPie: [['p', 'M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12V3.5Z'], ['p', 'M14.6 3.9A8.5 8.5 0 0 1 20.1 9.4']],
  chartStack: [['p', 'M4 20h16'], ['r', 5.5, 12, 4, 5.5, 1], ['r', 14.5, 7, 4, 10.5, 1]],
  wallet: [['p', 'M3.5 8.2A2.7 2.7 0 0 1 6.2 5.5h10.3A2.5 2.5 0 0 1 19 8'], ['r', 3.5, 8, 17, 10.5, 2.6], ['c', 16.3, 13.2, 1.2]],
};

export const hasIcon = (name) => Boolean(ICONS[name]);

export function Icon({ name, size = 22, color: stroke = color.ink, strokeWidth = 1.7, style }) {
  const parts = ICONS[name];
  if (!parts) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style}>
      {parts.map((part, index) => {
        const [kind] = part;
        if (kind === 'p') {
          return (
            <Path
              key={index}
              d={part[1]}
              fill="none"
              stroke={stroke}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        }
        if (kind === 'fp') return <Path key={index} d={part[1]} fill={stroke} />;
        if (kind === 'c') {
          return (
            <Circle key={index} cx={part[1]} cy={part[2]} r={part[3]} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
          );
        }
        if (kind === 'fc') return <Circle key={index} cx={part[1]} cy={part[2]} r={part[3]} fill={stroke} />;
        return (
          <Rect
            key={index}
            x={part[1]}
            y={part[2]}
            width={part[3]}
            height={part[4]}
            rx={part[5]}
            fill="none"
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
        );
      })}
    </Svg>
  );
}

export default Icon;
