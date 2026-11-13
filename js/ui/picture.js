// A food's picture: a photo or an emoji, shown as a small round avatar in lists.
//
// Stored on the food as `image`:
//   { kind: 'emoji', value: '🍌' }
//   { kind: 'photo', data: 'data:image/jpeg;base64,…' }  (a small square JPEG, ~15 KB)
// Photos are kept inside the data (not as links) so they show offline and
// travel with the Drive file like everything else.

import { h, icon, openSheet } from './dom.js';

const PHOTO_SIZE = 256;      // px, square
const PHOTO_QUALITY = 0.78;

// A few common foods to pick from; any other emoji can be typed.
export const FOOD_EMOJIS = [
  '🍎', '🍌', '🍊', '🍓', '🍇', '🍐', '🍑', '🍍', '🥝', '🥑', '🍅', '🥕',
  '🥦', '🥬', '🥒', '🌽', '🥔', '🧅', '🍄', '🥜', '🌰', '🫘', '🍞', '🥐',
  '🥖', '🥯', '🧀', '🥚', '🍳', '🥓', '🥩', '🍗', '🍖', '🐟', '🦐', '🍤',
  '🍚', '🍝', '🍜', '🍲', '🥗', '🍕', '🍔', '🌮', '🌯', '🥪', '🥣', '🥛',
  '🧈', '🍯', '🍫', '🍪', '🍰', '🍦', '☕', '🍵', '🧃', '🥤', '🍷', '🍺',
];

/** Turn any picture (file, blob or image element) into a small square JPEG data URL. */
export async function toPhotoData(source) {
  const bitmap = source instanceof Blob
    ? await createImageBitmap(source, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(source))
    : source;
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // transparent product cut-outs get a white background
  ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
  // Centre crop to a square.
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  return canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
}

/** Download a picture (e.g. a product photo from Open Food Facts) as photo data, or null. */
export async function photoFromUrl(url) {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    return { kind: 'photo', data: await toPhotoData(await res.blob()) };
  } catch {
    return null;
  }
}

const isImage = (image) => image && ((image.kind === 'photo' && image.data) || (image.kind === 'emoji' && image.value));

/** The round picture for a food; without one, its initial. */
export function avatar(food, size = 40) {
  const image = isImage(food?.image) ? food.image : null;
  const el = h('span', { class: `avatar${image ? '' : ' empty'}`, style: { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.55)}px` }, 'aria-hidden': 'true' });
  if (image?.kind === 'photo') el.append(h('img', { src: image.data, alt: '' }));
  else if (image?.kind === 'emoji') el.textContent = image.value;
  else el.textContent = (food?.name || '?').trim().charAt(0).toUpperCase() || '?';
  return el;
}

/** The first emoji in some text, or null. */
function firstEmoji(text) {
  const seg = globalThis.Intl?.Segmenter ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map((s) => s.segment) : [...text];
  return seg.find((g) => /\p{Extended_Pictographic}/u.test(g)) || null;
}

/** Choose an emoji: a grid of food emojis, or type any other. */
function openEmojiPicker(onPick) {
  const sheet = openSheet({ title: 'Choose an emoji' });
  const typed = h('input', {
    class: 'input emoji-input', type: 'text', autocomplete: 'off', placeholder: 'Or type any emoji', 'aria-label': 'Type an emoji',
    onInput: () => { const e = firstEmoji(typed.value); if (e) { sheet.close(); onPick(e); } },
  });
  sheet.body.append(
    h('div', { class: 'emoji-grid' }, FOOD_EMOJIS.map((e) => h('button', {
      class: 'emoji-btn', type: 'button', 'aria-label': e, onClick: () => { sheet.close(); onPick(e); },
    }, e))),
    typed);
}

/**
 * The picture control at the top of the food editor: the current picture and
 * buttons to take a photo, choose one from the library, pick an emoji or remove it.
 * `get()` returns the current image; `onChange(image|null)` is called on every change.
 */
export function pictureField({ get, onChange, getName }) {
  const camInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const libInput = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const preview = h('div', { class: 'picture-preview' });
  const note = h('div', { class: 'field-hint' });
  const removeBtn = h('button', { class: 'btn btn-small btn-danger-ghost', type: 'button', onClick: () => { onChange(null); paint(); } }, 'Remove');

  function paint() {
    preview.replaceChildren(avatar({ image: get(), name: getName() }, 72));
    removeBtn.hidden = !get();
  }

  async function usePhoto(input) {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    note.textContent = 'Preparing the photo…';
    try {
      onChange({ kind: 'photo', data: await toPhotoData(file) });
      note.textContent = '';
    } catch {
      note.textContent = 'That picture couldn’t be used';
    }
    paint();
  }
  camInput.addEventListener('change', () => usePhoto(camInput));
  libInput.addEventListener('change', () => usePhoto(libInput));

  const el = h('div', { class: 'picture-field' },
    preview,
    h('div', { class: 'picture-actions' },
      h('div', { class: 'btn-row wrap' },
        h('button', { class: 'btn btn-small', type: 'button', onClick: () => camInput.click() }, icon('camera', 16), 'Photo'),
        h('button', { class: 'btn btn-small', type: 'button', onClick: () => libInput.click() }, 'Library'),
        h('button', { class: 'btn btn-small', type: 'button', onClick: () => openEmojiPicker((e) => { onChange({ kind: 'emoji', value: e }); paint(); }) }, 'Emoji'),
        removeBtn),
      note),
    camInput, libInput);
  paint();
  return { el, paint, setNote: (t) => { note.textContent = t; } };
}
