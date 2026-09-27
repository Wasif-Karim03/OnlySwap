/**
 * Welcome (A02) imagery. The board calls for a real campus photo with no
 * university names or marks (CLAUDE.md rule 11) and real item photos; the
 * owner supplies them (OWNER_TODO). Until then the hero shows the neutral
 * photo backdrop and the items use the kit's drawn stand-ins.
 *
 * To add the hero: put the photo at assets/images/welcome/hero.jpg and set
 * WELCOME_HERO = require('../../../assets/images/welcome/hero.jpg').
 */
export const WELCOME_HERO: number | null = null;

export const WELCOME_ITEMS: readonly number[] = [
  require('../../../assets/images/welcome/item-fridge.jpg') as number,
  require('../../../assets/images/welcome/item-books.jpg') as number,
  require('../../../assets/images/welcome/item-monitor.jpg') as number,
];
