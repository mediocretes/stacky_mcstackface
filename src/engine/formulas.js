// How a stored effect becomes a number at a given caster level, and how long a spell lasts.
//
// An effect slot stores base, formula and max, not a value. Damage and healing mostly scale
// with level, so the number a spell has depends on who casts it.
//
// An unimplemented formula is an ERROR, never "use the base": that would print a plausible
// number that is not a measurement. Callers that survey (rather than rank) catch it and
// list the spell as unreadable.

export const PERMANENT = 'permanent';

export class UnknownFormula extends Error {
  constructor(formula, context) {
    super(`effect formula ${formula} is not implemented${context ? ` (${context})` : ''}`);
    this.formula = formula;
  }
}

const half = (n) => Math.floor(n / 2);
const div = (n, d) => Math.floor(n / d);

// The amount a formula adds to |base| at this level, or null when the formula is unknown.
// Confidence: most are checked against independent renderings of named spells; 139 and
// 144 are flagged guesses, and 0 and 200 only ever sit on effects nothing compares.
export function increment(formula, level, ticks) {
  switch (formula) {
    case 100: return 0;
    case 101: return half(level);
    case 102: return level;
    case 103: return 2 * level;
    case 104: case 3: return 3 * level;
    case 105: return 4 * level;
    case 109: return div(level, 4);
    case 110: return div(level, 6);
    case 119: return div(level, 8);
    case 121: return div(level, 3);
    case 111: return level > 16 ? 6 * (level - 16) : 0;
    case 112: return level > 24 ? 8 * (level - 24) : 0;
    case 113: return level > 34 ? 10 * (level - 34) : 0;
    case 114: return level > 44 ? 15 * (level - 44) : 0;
    case 115: return level > 15 ? 7 * (level - 15) : 0;
    case 116: return level > 24 ? 10 * (level - 24) : 0;
    case 117: return level > 34 ? 13 * (level - 34) : 0;
    case 118: return level > 44 ? 20 * (level - 44) : 0;
    case 125: return level > 50 ? 2 * (level - 50) : 0;
    case 139: return level > 30 ? half(level - 30) : 0; // guess, untested
    case 144: return 10 * level + (level > 40 ? 20 * (level - 40) : 0); // guess, contradicted
    case 0: return 0; // only on stacking effects, which carry no magnitude
    case 200: return 0; // only on size effects, which are never ranked
    default:
      // Decays over the buff's life: the value at the END of the window, the conservative one.
      if (formula >= 1001 && formula <= 1999) return -((formula - 1000) * (ticks || 0));
      if (formula > 0 && formula < 100) return level * formula;
      return null;
  }
}

// The magnitude of one slot at one level. Where 0 < max < base the value scales DOWN toward
// max — that is every slow.
export function resolve(base, formula, max, level, { ticks = 0, strict = true, context } = {}) {
  const b = Math.abs(base);
  let inc = increment(formula, level, ticks);
  if (inc === null) {
    if (strict) throw new UnknownFormula(formula, context);
    inc = 0;
  }
  const m = max ? Math.abs(max) : null;
  let v;
  if (m !== null && m < b) v = Math.max(b - inc, m);
  else if (m !== null) v = Math.min(b + inc, m);
  else v = b + inc;
  return v < 0 ? 0 : v; // a decaying buff floors at nothing
}

// Ticks (6 s each), or PERMANENT. Formulas of 200 and up are literal tick counts.
export function durationTicks(formula, cap, level) {
  if (formula >= 200) return cap;
  let t;
  switch (formula) {
    case 0: t = 0; break;
    case 50: return PERMANENT;
    case 1: t = Math.max(half(level), 1); break;
    case 2: t = Math.max(half(level) + 5, 6); break;
    case 3: t = 30 * level; break;
    case 5: t = 2; break;
    case 6: t = half(level) + 2; break;
    case 7: t = level; break;
    case 8: t = level + 10; break;
    case 9: t = 2 * level + 10; break;
    case 10: t = 3 * level + 10; break;
    case 11: t = 30 * (level + 3); break;
    default: t = 0;
  }
  return cap > 0 ? Math.min(t, cap) : t;
}
