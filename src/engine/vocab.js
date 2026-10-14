// The whole vocabulary: the desktop tool's (spec.js, generated) and this page's additions.
import { SPEC as BASE } from './spec.js';
import { EXTRA } from './spec-extra.js';

export const SPEC = {
  ...BASE,
  roles: { ...BASE.roles, ...EXTRA.roles },
  wants: { ...BASE.wants, ...EXTRA.wants },
};
