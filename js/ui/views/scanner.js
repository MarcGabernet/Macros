// Scanning a product's barcode to create an ingredient from Open Food Facts.
//
// Two ways to read the barcode:
// - Live: the camera picture is read several times a second. A number is
//   accepted once the same valid one (check digit) has been read twice.
// - Photo: a still photo taken with the phone's own camera (sharp, full
//   resolution, autofocus), read once. The most reliable on iPhone.
// Reading uses the browser's own barcode reader where there is one (Chrome on
// Android), otherwise zxing-wasm (the C++ ZXing, which copes far better with real
// camera pictures than the JavaScript one); the barcode can also be typed.

import { h, icon, openSheet, toast } from '../dom.js';
import { store } from '../../core/store.js';
import { cleanBarcode, isValidBarcode, toLookupCode, lookupBarcode, LookupError } from '../../sync/foodfacts.js';
import { openFoodEditor } from './foodEditor.js';

const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a'];
const WASM_FORMATS = ['EAN13', 'EAN8', 'UPCA'];
const VENDOR = 'js/vendor/';
const SCAN_EVERY = 250;       // ms between attempts: slower, but each one gets a fresh, settled frame
const SAME_READS_NEEDED = 2;  // identical valid readings before a live number is trusted
const MAX_SIDE = 1600;        // px: longest side of what's handed to the reader

let engineLoading = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Barcode reader failed to load'));
    document.head.append(s);
  });
}

/** The reading engine: (canvas) => Promise<string|null>. Loaded once. */
function loadEngine() {
  engineLoading ??= (async () => {
    if ('BarcodeDetector' in globalThis) {
      try {
        const supported = await globalThis.BarcodeDetector.getSupportedFormats();
        const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
        if (formats.length) {
          const detector = new globalThis.BarcodeDetector({ formats });
          return async (canvas) => (await detector.detect(canvas)).map((r) => r.rawValue);
        }
      } catch { /* use zxing-wasm */ }
    }
    if (!globalThis.ZXingWASM) await loadScript(`${VENDOR}zxing-wasm-reader.js`);
    const Z = globalThis.ZXingWASM;
    Z.prepareZXingModule({
      overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? new URL(VENDOR + path, document.baseURI).href : prefix + path) },
    });
    const options = { tryHarder: true, tryRotate: true, tryDownscale: true, formats: WASM_FORMATS, maxNumberOfSymbols: 4 };
    return async (canvas) => {
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const results = await Z.readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), options);
      return results.filter((r) => r.isValid !== false).map((r) => r.text);
    };
  })().catch((err) => { engineLoading = null; throw err; });
  return engineLoading;
}

/** The first valid product barcode among the texts read, in lookup form, or null. */
function pickCode(texts) {
  for (const t of texts || []) {
    const code = cleanBarcode(t);
    if (code && isValidBarcode(code)) return toLookupCode(code);
  }
  return null;
}

/** Draw a picture source onto a canvas, no larger than MAX_SIDE. */
function toCanvas(source, sw, sh, sx = 0, sy = 0, canvas = document.createElement('canvas')) {
  const k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  canvas.width = Math.max(1, Math.round(sw * k));
  canvas.height = Math.max(1, Math.round(sh * k));
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Read a still photo: the whole picture, then its middle band at higher detail. */
async function readPhoto(file) {
  const decode = await loadEngine();
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  const { width: w, height: h0 } = bitmap;
  const attempts = [
    [0, 0, w, h0],
    [w * 0.1, h0 * 0.25, w * 0.8, h0 * 0.5],
    [w * 0.2, h0 * 0.35, w * 0.6, h0 * 0.3],
  ];
  for (const [sx, sy, sw, sh] of attempts) {
    const code = pickCode(await decode(toCanvas(bitmap, sw, sh, sx, sy)));
    if (code) return code;
  }
  return null;
}

/** What happens with a barcode: your own ingredient if you have it, else Open Food Facts. */
async function handleBarcode(code, { close, setStatus }) {
  const mine = store.all('foods').find((f) => f.barcode && toLookupCode(f.barcode) === code);
  if (mine) {
    close();
    toast('Already in your foods');
    openFoodEditor({ food: mine });
    return;
  }
  setStatus(`Looking up ${code}…`, 'busy');
  let product;
  try {
    product = await lookupBarcode(code);
  } catch (err) {
    setStatus(err instanceof LookupError ? err.message : 'Something went wrong looking it up', 'error');
    return false;
  }
  close();
  const onSaved = () => toast('Saved to your ingredients');
  const base = { kind: 'ingredient', barcode: code, unit: { type: 'mass', grams: 100 }, imageUrl: product?.imageUrl || null };
  if (!product || !product.nutrientCount) {
    openFoodEditor({
      kind: 'ingredient', onSaved,
      initial: {
        ...base, name: product?.name || '', values: {},
        sourceNote: product
          ? `Open Food Facts has barcode ${code} but no nutrition values. Type them from the label`
          : `Barcode ${code} isn’t in Open Food Facts yet. If it doesn’t match the number on the pack, close this and scan again; otherwise type the values from the label`,
      },
    });
    return;
  }
  openFoodEditor({
    kind: 'ingredient', onSaved,
    initial: {
      ...base, name: product.name, values: product.values,
      sourceNote: `Filled in from Open Food Facts, per 100 g${product.packageGrams ? ` (pack: ${product.packageGrams} g)` : ''}. Check the values against the label before saving`,
    },
  });
}

export function openScanner() {
  let stream = null;
  let timer = null;
  let busy = false;
  let done = false;
  let cameraOk = false;
  let last = null;   // the last number read live
  let count = 0;     // how many times in a row

  const video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true });
  video.muted = true;
  const target = h('div', { class: 'scan-target', 'aria-hidden': 'true' });
  const frame = h('div', { class: 'scan-frame' }, video, target);
  const status = h('div', { class: 'scan-status', role: 'status' });
  const setStatus = (text, kind = '') => { status.textContent = text; status.className = `scan-status ${kind}`; };
  const work = document.createElement('canvas');

  const photoInput = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const photoBtn = h('button', { class: 'btn btn-block', type: 'button', onClick: () => photoInput.click() }, icon('camera', 18), 'Take a photo of the barcode');
  const codeInput = h('input', {
    class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'e.g. 8410000000000', 'aria-label': 'Barcode number',
  });
  const lookupBtn = h('button', { class: 'btn', type: 'button' }, 'Look up');

  function stop() {
    clearInterval(timer);
    timer = null;
    for (const t of stream?.getTracks() || []) t.stop();
    stream = null;
    video.srcObject = null;
  }

  const sheet = openSheet({ title: 'Scan a product', onClose: () => { done = true; stop(); } });
  sheet.el.classList.add('sheet-tall');
  const close = () => { done = true; stop(); sheet.close(); };

  async function found(code) {
    if (done) return;
    stop();
    navigator.vibrate?.(40);
    const result = await handleBarcode(code, { close, setStatus });
    // Lookup failed: keep its message on screen, and keep scanning if the camera works.
    if (result === false && !done && cameraOk) start({ keepStatus: true });
  }

  /** The part of the live picture inside the on-screen frame (with a margin), or the whole picture. */
  function grab(whole) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return null;
    if (whole) return toCanvas(video, vw, vh, 0, 0, work);
    const f = frame.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    const scale = Math.max(f.width / vw, f.height / vh); // the video covers the frame
    const ox = (f.width - vw * scale) / 2;
    const oy = (f.height - vh * scale) / 2;
    const mx = t.width * 0.12;
    const my = t.height * 0.5;
    const sx = Math.max(0, (t.left - f.left - mx - ox) / scale);
    const sy = Math.max(0, (t.top - f.top - my - oy) / scale);
    const sw = Math.min(vw - sx, (t.width + 2 * mx) / scale);
    const sh = Math.min(vh - sy, (t.height + 2 * my) / scale);
    return toCanvas(video, sw, sh, sx, sy, work);
  }

  async function start({ keepStatus = false } = {}) {
    last = null; count = 0;
    if (!navigator.mediaDevices?.getUserMedia) {
      frame.classList.add('off');
      setStatus('Live scanning isn’t available here. Take a photo of the barcode or type it', 'error');
      return;
    }
    if (!keepStatus) setStatus('Loading the barcode reader…');
    frame.classList.remove('off');
    try {
      const decode = await loadEngine();
      if (done) return;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (done) { stop(); return; }
      const track = stream.getVideoTracks()[0];
      try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* not supported */ }
      video.srcObject = stream;
      cameraOk = true;
      await video.play().catch(() => {});
      if (!keepStatus) setStatus('Fit the barcode inside the frame and hold still');
      let tick = 0;
      timer = setInterval(async () => {
        if (busy || done || video.readyState < 2) return;
        busy = true;
        try {
          // Mostly the framed area; every third try the whole picture, in case the barcode sits elsewhere.
          const canvas = grab(++tick % 3 === 0);
          const code = canvas ? pickCode(await decode(canvas)) : null;
          if (!code || done) return;
          count = code === last ? count + 1 : 1;
          last = code;
          if (count >= SAME_READS_NEEDED) found(code);
          else setStatus(`Reading ${code}… hold still`);
        } catch { /* a frame that couldn't be read */ } finally {
          busy = false;
        }
      }, SCAN_EVERY);
    } catch (err) {
      stop();
      frame.classList.add('off');
      const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
      setStatus(denied
        ? 'Camera access was not allowed. Take a photo of the barcode or type it below'
        : 'Live scanning couldn’t start. Take a photo of the barcode or type it below', 'error');
    }
  }

  photoInput.addEventListener('change', async () => {
    const file = photoInput.files?.[0];
    photoInput.value = '';
    if (!file) return;
    stop();
    setStatus('Reading the photo…', 'busy');
    try {
      const code = await readPhoto(file);
      if (code) { found(code); return; }
      setStatus('No barcode found in the photo. Try closer, with the barcode flat and well lit', 'error');
    } catch {
      setStatus('That photo couldn’t be read', 'error');
    }
    if (cameraOk && !done) start({ keepStatus: true });
  });

  const submitTyped = () => {
    const code = cleanBarcode(codeInput.value);
    if (!code) { setStatus('A barcode has 8 to 14 digits', 'error'); return; }
    if (!isValidBarcode(code)) { setStatus('That number doesn’t look right: check the digits', 'error'); return; }
    found(toLookupCode(code));
  };
  lookupBtn.addEventListener('click', submitTyped);
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitTyped(); });

  sheet.body.append(
    frame,
    status,
    photoBtn, photoInput,
    h('div', { class: 'field' },
      h('div', { class: 'field-label' }, 'Or type the number under the barcode'),
      h('div', { class: 'scan-manual' }, codeInput, lookupBtn)),
    h('p', { class: 'scan-credit' }, 'Product data from Open Food Facts (openfoodfacts.org), shared under the Open Database License. Only the barcode number is sent'));
  start();
  return sheet;
}

// For tests: read a picture without the camera.
export const _test = { loadEngine, readPhoto, pickCode };
