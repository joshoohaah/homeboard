// Turns every icon field on the admin page into a picture button. Without JavaScript the text field still works.
const MAX_RESULTS = 150;

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}
const picture = (name) => el('img', { src: `/icons/${name}.svg`, alt: '', width: 24, height: 24, loading: 'lazy' });
const label = (name) => name.replaceAll('-', ' ');

const search = el('input', { type: 'search', placeholder: 'Search, e.g. soccer, dentist, band', ariaLabel: 'Search icons' });
const results = el('div', { className: 'icons' });
const close = el('button', { type: 'button', textContent: 'Cancel', onclick: () => dialog.close() });
const none = el('button', { type: 'button', textContent: 'No icon (dot)', onclick: () => choose('') });
const dialog = el('dialog', { ariaLabel: 'Choose an icon' }, el('div', { className: 'bar' }, search, none, close), results);
document.body.append(dialog);

let index = null;
let current = null;

function choose(name) {
  current.input.value = name;
  paint(current);
  dialog.close();
}
function paint({ input, button }) {
  const name = input.value;
  button.replaceChildren(...(name ? [picture(name)] : ['No icon']));
  button.ariaLabel = name ? `Icon: ${label(name)}. Change` : 'Choose an icon';
  button.title = name ? label(name) : 'Choose an icon';
}
const tile = (name) => el('button', {
  type: 'button', title: label(name), ariaLabel: label(name), onclick: () => choose(name),
  className: name === current.input.value ? 'tile chosen' : 'tile',
}, picture(name));
const section = (title, names) => [el('h3', { textContent: title }), el('div', { className: 'tiles' }, ...names.map(tile))];

function draw() {
  const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) {
    results.replaceChildren(...Object.entries(index.groups).flatMap(([group, names]) => section(group, names)));
    return;
  }
  const common = new Set(Object.values(index.groups).flat());
  const found = index.all.filter(([, text]) => words.every((w) => text.includes(w))).map(([name]) => name)
    .sort((a, b) => common.has(b) - common.has(a) || a.length - b.length);
  const title = found.length > MAX_RESULTS ? `First ${MAX_RESULTS} of ${found.length}` : `${found.length} found`;
  results.replaceChildren(...section(title, found.slice(0, MAX_RESULTS)));
}

async function open(field) {
  current = field;
  search.value = '';
  dialog.showModal();
  try {
    if (!index) {
      results.textContent = 'Loading icons…';
      const res = await fetch('/admin/icons.json');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      index = await res.json();
    }
    draw();
    search.focus();
  } catch (err) {
    results.textContent = `Icons could not be loaded (${err.message}). Close this and try again.`;
  }
}

search.addEventListener('input', () => index && draw());
for (const input of document.querySelectorAll('input[name=icon]')) {
  const field = { input, button: el('button', { type: 'button', className: 'pick' }) };
  input.type = 'hidden';
  input.after(field.button);
  field.button.addEventListener('click', () => open(field));
  paint(field);
}
