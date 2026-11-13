// Scanning a product's barcode to create an ingredient from Open Food Facts.
//
// How a barcode is read, so that a blurry frame can't produce a wrong number:
// - the camera is asked for an HD picture with continuous autofocus;
// - only the part of the picture inside the on-screen frame is read;
// - it's read with the browser's own reader where there is one (Chrome on
//   Android), otherwise with the bundled ZXing library (Safari on iPhone);
// - a number is accepted only once the same one has been read several times in
//   a row and its check digit is valid.
// The barcode can also be typed.

import { h, openSheet, toast } from '../dom.js';
import { store } from '../../core/store.js';
import { cleanBarcode, isValidBarcode, toLookupCode, lookupBarcode, LookupError } from '../../sync/foodfacts.js';
import { openFoodEditor } from './foodEditor.js';

// Food packaging uses EAN-13 / EAN-8 (and UPC-A in the US). The short UPC-E is left
// out: it's rare on food here and the format most prone to false reads.
const NATIVE_FORMATS = ['ean_13', 'ean_8', 'upc_a'];
const ZXING_SRC = 'js/vendor/zxing.min.js';
const SCAN_EVERY = 140;        // ms between attempts
const SAME_READS_NEEDED = 3;   // identical readings before a number is trusted
const MAX_CROP_WIDTH = 1280;   // px: enough detail without slowing the phone down

let zxingLoading = null;

function loadZxing() {
  if (globalThis.ZXing) return Promise.resolve(globalThis.ZXing);
  zxingLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = ZXING_SRC;
    s.onload = () => (globalThis.ZXing ? resolve(globalThis.ZXing) : reject(new Error('Barcode reader failed to load')));
    s.onerror = () => { zxingLoading = null; reject(new Error('Barcode reader failed to load')); };
    document.head.append(s);
  });
  return zxingLoading;
}

/** A function that reads one canvas and resolves to the barcode text, or null. */
async function makeDecoder() {
  if ('BarcodeDetector' in globalThis) {
    try {
      const supported = await globalThis.BarcodeDetector.getSupportedFormats();
      const formats = NATIVE_FORMATS.filter((f) => supported.includes(f));
      if (formats.length) {
        const detector = new globalThis.BarcodeDetector({ formats });
        return async (canvas) => (await detector.detect(canvas))[0]?.rawValue || null;
      }
    } catch { /* fall back to ZXing */ }
  }
  const ZXing = await loadZxing();
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A]);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  const reader = new ZXing.MultiFormatReader();
  reader.setHints(hints);
  return async (canvas) => {
    try {
      const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(canvas)));
      return reader.decode(bitmap).getText();
    } catch {
      return null; // nothing readable in this frame
    }
  };
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
  if (!product || !product.nutrientCount) {
    openFoodEditor({
      kind: 'ingredient', onSaved,
      initial: {
        kind: 'ingredient', name: product?.name || '', barcode: code, unit: { type: 'mass', grams: 100 }, values: {},
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
      kind: 'ingredient', name: product.name, barcode: code, unit: { type: 'mass', grams: 100 }, values: product.values,
      sourceNote: `Filled in from Open Food Facts, per 100 g${product.packageGrams ? ` (pack: ${product.packageGrams} g)` : ''}. Check the values against the label before saving`,
    },
  });
}

export function openScanner() {
  let stream = null;
  let timer = null;
  let busy = false;
  let done = false;
  let cameraOk = false; // the camera started at least once
  let reads = [];       // recent readings, newest last

  const video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true });
  video.muted = true;
  const target = h('div', { class: 'scan-target', 'aria-hidden': 'true' });
  const frame = h('div', { class: 'scan-frame' }, video, target);
  const status = h('div', { class: 'scan-status', role: 'status' });
  const setStatus = (text, kind = '') => { status.textContent = text; status.className = `scan-status ${kind}`; };
  const crop = document.createElement('canvas');
  const ctx = crop.getContext('2d', { willReadFrequently: true });

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

  /** Copy the part of the camera picture inside the on-screen frame into `crop`. */
  function grabTarget() {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return false;
    const f = frame.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    // The video fills the frame like `object-fit: cover`.
    const scale = Math.max(f.width / vw, f.height / vh);
    const ox = (f.width - vw * scale) / 2;
    const oy = (f.height - vh * scale) / 2;
    // A little margin around the drawn frame, in case the barcode pokes out.
    const mx = t.width * 0.08;
    const my = t.height * 0.25;
    let sx = (t.left - f.left - mx - ox) / scale;
    let sy = (t.top - f.top - my - oy) / scale;
    let sw = (t.width + 2 * mx) / scale;
    let sh = (t.height + 2 * my) / scale;
    sx = Math.max(0, sx); sy = Math.max(0, sy);
    sw = Math.min(vw - sx, sw); sh = Math.min(vh - sy, sh);
    const k = Math.min(1, MAX_CROP_WIDTH / sw);
    crop.width = Math.round(sw * k);
    crop.height = Math.round(sh * k);
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, crop.width, crop.height);
    return true;
  }

  /** Accept a number only after SAME_READS_NEEDED identical, valid readings in a row. */
  function consider(raw) {
    const code = raw && cleanBarcode(raw);
    if (!code || !isValidBarcode(code)) return null;
    const norm = toLookupCode(code);
    if (reads.length && reads[reads.length - 1] !== norm) reads = [];
    reads.push(norm);
    if (reads.length >= SAME_READS_NEEDED) return norm;
    setStatus('Hold still…');
    return null;
  }

  async function start({ keepStatus = false } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) {
      frame.classList.add('off');
      setStatus('The camera isn’t available here. Type the barcode below', 'error');
      return;
    }
    if (!keepStatus) setStatus('Point the camera at the barcode');
    frame.classList.remove('off');
    reads = [];
    try {
      const decode = await makeDecoder();
      if (done) return;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      if (done) { stop(); return; }
      // Keep refocusing as the phone moves (where the camera supports it).
      const track = stream.getVideoTracks()[0];
      try { await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* not supported */ }
      video.srcObject = stream;
      cameraOk = true;
      await video.play().catch(() => {});
      timer = setInterval(async () => {
        if (busy || done || video.readyState < 2) return;
        busy = true;
        try {
          if (grabTarget()) {
            const code = consider(await decode(crop));
            if (code) found(code);
          }
        } finally {
          busy = false;
        }
      }, SCAN_EVERY);
    } catch (err) {
      stop();
      frame.classList.add('off');
      const denied = err?.name === 'NotAllowedError' || err?.name === 'SecurityError';
      setStatus(denied
        ? 'Camera access was not allowed. Allow it in your browser settings, or type the barcode below'
        : 'The camera couldn’t start. Type the barcode below', 'error');
    }
  }

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
    h('div', { class: 'field' },
      h('div', { class: 'field-label' }, 'Or type the number under the barcode'),
      h('div', { class: 'scan-manual' }, codeInput, lookupBtn)),
    h('p', { class: 'scan-credit' }, 'Product data from Open Food Facts (openfoodfacts.org), shared under the Open Database License. Only the barcode number is sent'));
  start();
  return sheet;
}

// For tests: the steps a camera frame goes through, without a camera.
export const _test = { makeDecoder };
