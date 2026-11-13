// Scanning a product's barcode to create an ingredient from Open Food Facts.
//
// The camera picture is read with the browser's own barcode reader where there
// is one (Chrome on Android), otherwise with the bundled ZXing library (Safari
// on iPhone has no built-in reader). The barcode can also be typed.

import { h, openSheet, toast } from '../dom.js';
import { store } from '../../core/store.js';
import { cleanBarcode, lookupBarcode, LookupError } from '../../sync/foodfacts.js';
import { openFoodEditor } from './foodEditor.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const ZXING_SRC = 'js/vendor/zxing.min.js';
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

async function nativeDetector() {
  if (!('BarcodeDetector' in globalThis)) return null;
  try {
    const supported = await globalThis.BarcodeDetector.getSupportedFormats();
    const formats = FORMATS.filter((f) => supported.includes(f));
    return formats.length ? new globalThis.BarcodeDetector({ formats }) : null;
  } catch {
    return null;
  }
}

/** What happens with a barcode: your own ingredient if you have it, else Open Food Facts. */
async function handleBarcode(code, { close, setStatus }) {
  const mine = store.all('foods').find((f) => f.barcode === code);
  if (mine) {
    close();
    toast('Already in your foods');
    openFoodEditor({ food: mine });
    return;
  }
  setStatus('Looking up the product…', 'busy');
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
          ? 'Open Food Facts has this product but no nutrition values. Type them from the label'
          : 'This product isn’t in Open Food Facts yet. Type its values from the label',
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
  let reader = null;
  let timer = null;
  let done = false;
  let cameraOk = false; // the camera started at least once

  const video = h('video', { class: 'scan-video', playsinline: true, muted: true, autoplay: true });
  video.muted = true;
  const frame = h('div', { class: 'scan-frame' }, video, h('div', { class: 'scan-target', 'aria-hidden': 'true' }));
  const status = h('div', { class: 'scan-status', role: 'status' });
  const setStatus = (text, kind = '') => { status.textContent = text; status.className = `scan-status ${kind}`; };

  const codeInput = h('input', {
    class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: 'e.g. 8410000000000', 'aria-label': 'Barcode number',
  });
  const lookupBtn = h('button', { class: 'btn', type: 'button' }, 'Look up');

  function stop() {
    clearInterval(timer);
    timer = null;
    try { reader?.reset(); } catch { /* already stopped */ }
    reader = null;
    for (const t of stream?.getTracks() || []) t.stop();
    stream = null;
  }

  const sheet = openSheet({ title: 'Scan a product', onClose: () => { done = true; stop(); } });
  sheet.el.classList.add('sheet-tall');
  const close = () => { done = true; stop(); sheet.close(); };

  async function found(raw) {
    const code = cleanBarcode(raw);
    if (!code || done) return;
    stop();
    navigator.vibrate?.(40);
    const result = await handleBarcode(code, { close, setStatus });
    // Lookup failed: keep its message on screen, and keep scanning if the camera works.
    if (result === false && !done && cameraOk) start({ keepStatus: true });
  }

  async function start({ keepStatus = false } = {}) {
    if (!navigator.mediaDevices?.getUserMedia) {
      frame.classList.add('off');
      setStatus('The camera isn’t available here. Type the barcode below', 'error');
      return;
    }
    if (!keepStatus) setStatus('Point the camera at the barcode');
    frame.classList.remove('off');
    try {
      const detector = await nativeDetector();
      if (detector) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } });
        if (done) { stop(); return; }
        video.srcObject = stream;
        cameraOk = true;
        await video.play().catch(() => {});
        timer = setInterval(async () => {
          if (video.readyState < 2) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) found(codes[0].rawValue);
          } catch { /* keep trying */ }
        }, 250);
      } else {
        const ZXing = await loadZxing();
        if (done) return;
        const hints = new Map();
        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
          ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
        ]);
        reader = new ZXing.BrowserMultiFormatReader(hints, 300);
        await reader.decodeFromConstraints({ audio: false, video: { facingMode: { ideal: 'environment' } } }, video, (result) => {
          if (result) found(result.getText());
        });
        stream = video.srcObject;
        cameraOk = true;
        if (done) stop();
      }
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
    found(code);
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

