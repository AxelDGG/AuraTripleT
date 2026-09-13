// Tokens de diseño. Son los mismos valores de apps/web/public/css/tokens.css:
// si el rojo cambia en la web, cambia aquí y las dos plataformas siguen siendo
// el mismo producto.

export const color = {
  red: '#eb0029',
  red600: '#c8001f',
  red700: '#9e0018',
  red800: '#7a0012',
  redTint: '#fdecef',
  redTint2: '#fbd9de',
  rail: '#f7d2d7',
  rail2: '#f2bfc6',

  ink: '#1b1b20',
  ink2: '#3c3c45',
  muted: '#6e6e7a',
  muted2: '#9a9aa6',

  surface: '#ffffff',
  surface2: '#f4f4f7',
  surface3: '#e9e9ee',
  line: 'rgba(20, 20, 28, 0.10)',
  line2: 'rgba(20, 20, 28, 0.18)',

  green: '#0f8f4d',
  amber: '#b8770a',
  blue: '#1f5fbf',

  onRed: '#ffffff',
  onRedMuted: 'rgba(255, 255, 255, 0.78)',
};

// Paleta de gráficas: mismo contrato que --chart-1..8 de la web.
export const chartColors = [
  '#eb0029', '#1b1b20', '#e2758a', '#1f5fbf',
  '#b8770a', '#0f8f4d', '#6e6e7a', '#9e0018',
];

export const chartTokens = {
  grid: 'rgba(20, 20, 28, 0.08)',
  axis: '#6e6e7a',
  track: '#e9e9ee',
  positive: '#0f8f4d',
  negative: '#eb0029',
};

export const radius = { sm: 8, md: 12, lg: 18, xl: 24, pill: 999 };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Sombras: iOS usa shadow*, Android usa elevation. Se devuelven juntas para no
// repetir el condicional en cada componente.
export const shadow = {
  sm: {
    shadowColor: '#14141c',
    shadowOpacity: 0.10,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  md: {
    shadowColor: '#14141c',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  red: {
    shadowColor: '#eb0029',
    shadowOpacity: 0.45,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
};

// Manrope se carga con expo-font; mientras no esté lista, el sistema responde.
export const font = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
};

export const text = {
  h1: { fontSize: 24, lineHeight: 30, fontFamily: font.extrabold, color: color.ink },
  h2: { fontSize: 19, lineHeight: 25, fontFamily: font.bold, color: color.ink },
  h3: { fontSize: 16, lineHeight: 22, fontFamily: font.bold, color: color.ink },
  body: { fontSize: 14, lineHeight: 20, fontFamily: font.regular, color: color.ink2 },
  bodyStrong: { fontSize: 14, lineHeight: 20, fontFamily: font.semibold, color: color.ink },
  small: { fontSize: 12, lineHeight: 17, fontFamily: font.regular, color: color.muted },
  smallStrong: { fontSize: 12, lineHeight: 17, fontFamily: font.semibold, color: color.ink2 },
  tiny: { fontSize: 10.5, lineHeight: 14, fontFamily: font.semibold, color: color.muted },
  number: { fontSize: 20, lineHeight: 26, fontFamily: font.extrabold, color: color.ink },
};
