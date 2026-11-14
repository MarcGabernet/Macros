# Macros

A food and macro tracker that runs in the browser and installs on an iPhone
home screen. No build step, no dependencies: plain HTML, CSS and JavaScript.

## What it does

- **Foods** come in three kinds. In the code they are all one thing, a *food*,
  that differs only in what it may be made of:
  - **Product**: has its own values (typed, or filled in by scanning). Names and
    barcodes are unique.
  - **Meal**: built from products only. Never from meals, never typed directly.
  Older data with dishes is converted on load (`js/core/migrate.js`).
- **One unit** of a food is either a weight (for example 100 g) or one piece
  (1 egg), optionally with a weight. Values are typed as amounts, or as a
  percentage of the unit when the unit has a weight.
- **Logging**: add what you ate in grams, in units, or as a percentage of a
  unit or meal.
- **Day**: macros on top (progress rings once a target is set), then
  minerals and vitamins, a "Current weight" weigh-in and what you ate.
- **Scan products**: the camera button in the middle scans a product's
  barcode and looks it up in [Open Food Facts](https://world.openfoodfacts.org)
  (free, open data; only the barcode is sent). A new product opens filled in
  per 100 g, to check and save. Saved products remember their barcode, so
  scanning it again finds yours. The barcode can also be typed.
- **Calendar**: week or month, with daily, weekly and monthly totals and
  graphs of weight, calories and each macro.
- **Nutrients**: a fixed list in `js/core/nutrients.js` (EU label order, with
  "of which" sub-nutrients). In Settings each can be switched off (hidden, values
  kept), given a daily target, and where it makes sense shown in another unit.
  Each shows its EU daily reference; protein's follows your body weight.

## Try it on this computer

```bash
python -m http.server 5173
```

Then open <http://localhost:5173>.

## Put it on your iPhone (free)

1. Upload this folder to a free static host: GitHub Pages, Netlify or
   Cloudflare Pages. Any of them gives you an `https://` address.
2. Open that address in **Safari** on the iPhone.
3. Tap **Share**, then **Add to Home Screen**.

Updating: upload the changed files again. The app picks them up the next time
it is opened with a connection. It also opens offline.

## Where the data lives

On the device, in the browser's storage for the app, and in Google Drive
once connected (below).

## Google Drive sync

The data is one file (`macros.json`) in Drive's hidden app-data folder: the
app sees only its own files there, and nothing shows up among your normal
Drive files. Changes upload a few seconds after you make them, and when two
devices have both changed, their records are merged (the newest copy of each
wins). The first time a device that already has data connects to a Drive that
also has data, the app asks which of the two to keep.

It needs a one-time setup in its own Google Cloud project:

1. **Project**: at <https://console.cloud.google.com/>, open the project
   picker at the top, **New project**, name it `Macros`, **Create**, and
   select it.
2. **Drive API**: **APIs & Services > Library**, search **Google Drive API**,
   **Enable**.
3. **Consent screen**: **APIs & Services > OAuth consent screen** (also called
   **Google Auth Platform**). App name `Macros`, your email as support and
   developer contact, audience **External**.
   - **Data access / Scopes**: add `.../auth/drive.appdata` and
     `.../auth/userinfo.email`.
   - **Audience / Test users**: add your own Google account. Leave the app in
     **Testing**: only listed test users can sign in, which is what you want
     for a personal app.
4. **Client ID**: **APIs & Services > Credentials > Create credentials >
   OAuth client ID**, type **Web application**, name `Macros web`.
   - **Authorized JavaScript origins**: `http://localhost:5173`, plus the
     site once it is online, e.g. `https://yourname.github.io`.
   - **Authorized redirect URIs**: `http://localhost:5173/`, plus the app's
     exact online address ending in `/`, e.g.
     `https://yourname.github.io/macros/`. Settings in the app shows the
     address it uses.
5. Copy the **Client ID** into `js/config.js` (`GOOGLE_CLIENT_ID`). It is not
   a secret. The client secret is not used: leave it in Google Cloud.
6. Open the app, **Settings > Google Drive > Connect**. On Google's screen,
   tick the **Google Drive** permission: Google lets you untick it, and the
   app can't save without it.

Google's sign-in for web pages lasts about an hour. When it runs out, the app
asks Google for a fresh one as it opens (a quick bounce to Google and back).
If Google wants you to choose an account, a "Reconnect" bar appears instead.

## How the code is organised

```
index.html, css/app.css      the page and its styling
js/config.js                 Google client ID, file name, version
js/texts.js                   every text the app shows, in English, Catalan and Spanish
js/core/schema.js            what the data looks like: kinds of food, nutrients, units
js/core/calc.js              all nutrition maths (pure functions)
js/core/store.js             reading and saving the data on this device
js/core/merge.js             merging two copies of the data
js/core/dates.js, format.js  days, and turning numbers into text
js/sync/google.js            Google sign-in and Drive calls
js/sync/foodfacts.js         product lookup by barcode (Open Food Facts)
js/vendor/zxing-wasm-*       zxing-wasm 3.1.6 barcode reader (MIT; ZXing C++, Apache 2.0),
                             for phones without a built-in one (Safari on iPhone)
js/sync/engine.js            when to upload, download and merge
js/ui/                       the screens (views/) and shared pieces
sw.js, manifest.webmanifest  offline use and the home-screen app
```

To add something new:

- **A nutrient**: one line in `CATALOG` in `js/core/nutrients.js`. Its name goes in `js/texts.js` (`nutrient.<id>`, `.short`).
- **A language**: add it to `LANGUAGES` in `js/texts.js` and a text for it in
  each entry (missing ones fall back to English). It appears in Settings > General.
- **A kind of food** (say, a "day plan" made of meals): one entry in `KINDS`
  in `js/core/schema.js`, listing what it may contain.
- **A new field on foods or log entries**: records are plain objects, so add
  the field where it is edited and shown; saving and sync carry it
  along unchanged.
