import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const META = fileURLToPath(new URL('../node_modules/@mdi/svg/meta.json', import.meta.url));

/** Shown first in the picker; search covers the whole Material Design Icons pack. */
export const ICON_GROUPS = Object.fromEntries(Object.entries({
  Family: 'heart-circle heart home-heart home account account-heart human-male-female-child baby-face-outline face-woman face-man star flower turtle penguin dog cat paw rabbit fish',
  School: 'school food-apple-outline book-open-variant pencil bag-personal bus-school bell calculator flask palette library certificate',
  Sports: 'soccer basketball baseball football volleyball tennis hockey-sticks golf swim run bike karate kabaddi weight-lifter gymnastics ski skateboarding trophy medal whistle',
  'Music and clubs': 'music guitar-acoustic piano trumpet saxophone violin microphone drama-masks dance-ballroom chess-knight gamepad-variant camera',
  Work: 'briefcase-outline laptop hospital-box tools hard-hat clock-outline email-outline phone',
  Health: 'stethoscope tooth pill needle glasses scissors-cutting',
  'Home and errands': 'trash-can-outline recycle cash credit-card cart broom wrench washing-machine bed car silverware-fork-knife pizza coffee grill',
  Travel: 'airplane train ferry tent beach bag-suitcase map-marker palm-tree island campfire',
  Celebrations: 'cake-variant party-popper gift balloon pine-tree halloween egg-easter food-turkey firework candle church flag leaf snowflake weather-sunny',
}).map(([group, names]) => [group, names.split(' ')]));

// Words people look for that the pack does not use.
const EXTRA = {
  kabaddi: 'wrestling', karate: 'wrestling martial arts', 'food-apple-outline': 'teacher', 'bag-personal': 'backpack',
  school: 'graduation cap', tooth: 'dentist orthodontist', stethoscope: 'doctor', 'hospital-box': 'nurse shift', flower: 'garden',
  'trash-can-outline': 'garbage bin', 'cake-variant': 'birthday', trumpet: 'band', violin: 'orchestra', microphone: 'choir', 'bag-suitcase': 'trip vacation',
};

let index;

/** @returns {Promise<{ groups: Record<string, string[]>, all: [string, string][] }>} names with their search words */
export function iconIndex() {
  index ??= readFile(META, 'utf8').then((text) => ({
    groups: ICON_GROUPS,
    all: JSON.parse(text).filter((i) => !i.deprecated).map(({ name, aliases, tags }) =>
      [name, [name, ...aliases, ...tags, EXTRA[name] ?? ''].join(' ').replaceAll('-', ' ').toLowerCase()]),
  })).catch((err) => { index = undefined; throw err; });
  return index;
}
