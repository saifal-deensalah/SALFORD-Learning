export interface DesignNode {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  background?: string;
  image?: string;
  radius?: number;
  clip?: boolean;
  horizontal?: boolean;
  svg?: string;
  text?: string;
  fontSize?: number;
  color?: string;
  matrix?: number[];
  children?: DesignNode[];
}

export const SCREEN = {
  splash: '37',
  welcome: '47',
  onboarding1: '420',
  onboarding2: '561',
  onboarding3: '804',
  login: '818',
  google: '894',
  signup: '985',
  home: '1066',
  search: '1189',
  details: '1345',
  courses: '1479',
  profile: '1824',
  plans: '1874',
  payment: '1951',
  success: '2086',
  player: '2231',
  navigation: '2314',
} as const;
export type ScreenId = (typeof SCREEN)[keyof typeof SCREEN];

export const theme = {
  background: '#F8F1F1',
  ink: '#1C1C1C',
  teal: '#087E8B',
  navy: '#0B3954',
  muted: '#81818D',
  white: '#FFFFFF',
  orange: '#FFAD33',
  danger: '#A62E43',
};
