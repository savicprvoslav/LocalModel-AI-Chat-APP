export type ColorTokens = {
  bg: { canvas: string; elevated: string; subtle: string };
  border: { subtle: string; default: string };
  text: { primary: string; secondary: string; tertiary: string; quiet: string };
  accent: { warm: string; inverse: string };
};

export const darkTokens: ColorTokens = {
  bg: {
    canvas: '#161412',
    elevated: '#1F1C18',
    subtle: 'rgba(236,230,216,0.04)'
  },
  border: {
    subtle: 'rgba(236,230,216,0.10)',
    default: 'rgba(236,230,216,0.18)'
  },
  text: {
    primary: '#ECE6D8',
    secondary: 'rgba(236,230,216,0.55)',
    tertiary: 'rgba(236,230,216,0.45)',
    quiet: 'rgba(236,230,216,0.30)'
  },
  accent: {
    warm: '#E89A4F',
    inverse: '#ECE6D8'
  }
};

export const lightTokens: ColorTokens = {
  bg: {
    canvas: '#F8F5EE',
    elevated: '#FFFEF8',
    subtle: 'rgba(26,24,20,0.04)'
  },
  border: {
    subtle: 'rgba(26,24,20,0.06)',
    default: 'rgba(26,24,20,0.18)'
  },
  text: {
    primary: '#1A1814',
    secondary: 'rgba(26,24,20,0.55)',
    tertiary: 'rgba(26,24,20,0.45)',
    quiet: 'rgba(26,24,20,0.30)'
  },
  accent: {
    warm: '#C66A1E',
    inverse: '#1A1814'
  }
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radii = { sm: 2, md: 4, lg: 8 } as const;
