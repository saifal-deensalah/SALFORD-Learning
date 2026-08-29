import { SCREEN, type ScreenId } from '../design/types';
import { inScreens } from './screen-config';
type Field = {
  key: string;
  label: string;
  placeholder: string;
  x: number;
  y: number;
  w: number;
  secure?: boolean;
  keyboard?: 'email-address' | 'number-pad' | 'default';
  max?: number;
};
// Every input in the supplied forms uses the same left inset and row spacing.
// Keep labels, spelling and dimensions from Figma while sharing that layout.
export function getFormFields(current: ScreenId) {
  let definitions: Omit<Field, 'x' | 'y' | 'w'>[] = [];
  let hiddenIds: number[] = [];
  if (inScreens(current, [SCREEN.login, SCREEN.signup])) {
    const signup = current === SCREEN.signup;
    hiddenIds = signup ? [1001, 1023, 1046] : [852, 874];
    definitions = [
      {
        key: 'email',
        label: 'Email address',
        placeholder: 'abc@email.com',
        keyboard: 'email-address',
        max: 254,
      },
      {
        key: 'password',
        label: 'Password',
        placeholder: signup ? 'Enter your password' : 'Enter you password',
        secure: true,
        max: 128,
      },
    ];
    if (signup) {
      definitions.push({
        key: 'confirm',
        label: 'Confirm password',
        placeholder: 'Confirm password',
        secure: true,
        max: 128,
      });
    }
  }
  return {
    fields: definitions.map(
      (field, index): Field => ({
        ...field,
        x: 72,
        y: 255 + index * 76,
        w: 240,
      }),
    ),
    hidden: new Set(hiddenIds.map(id => '1:' + id)),
  };
}
