import { Alert } from 'react-native';
import rawScreens from '../design/screens.json';
import manifest from '../design/manifest.json';
import type { DesignNode, ScreenId } from '../design/types';
export const screens = rawScreens as unknown as Record<ScreenId, DesignNode>;
export const screenIds = new Set(manifest.map(f => f.id));
export const findNode = (
  root: DesignNode,
  id: string,
): DesignNode | undefined => {
  if (root.id === id) {
    return root;
  }
  for (const child of root.children || []) {
    const found = findNode(child, id);
    if (found) {
      return found;
    }
  }
};
export const FLOATS: Record<string, string> = {
  '1066': '1:1185',
  '1189': '1:1249',
  '1345': '1:1385',
  '1479': '1:1575',
  '1824': '1:1844',
  '2231': '1:2286',
};
export type Panel =
  | ''
  | 'filters'
  | 'bookmarks'
  | 'history'
  | 'certificates'
  | 'settings'
  | 'notifications'
  | 'forgot'
  | 'profile'
  | 'gallery';
export const notice = (message: string) => Alert.alert('SALFORD', message);
export const inScreens = (id: ScreenId, list: ScreenId[]) => list.includes(id);
export const defaultProfile = {
  name: 'Muhammad Ahmed',
  email: 'mahmed1212@gmail.com',
};
