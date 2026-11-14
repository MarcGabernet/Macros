// Settings that belong to the app itself, not to your data.

// Google Drive sync needs an OAuth client ID of type "Web application" from
// Google Cloud (see README.md, "Google Drive sync"). Paste it between the
// quotes. It is not a secret: it only names the app to Google.
// While it is empty the app works normally and keeps data on this device only.
export const GOOGLE_CLIENT_ID = '989027319635-5cmbkqf4qe5kupg7clh8t3vkn8dlvuca.apps.googleusercontent.com';

// The name of the data file in Drive's hidden app-data folder.
export const DRIVE_FILE_NAME = 'macros.json';

// Shown at the bottom of Settings.
export const APP_VERSION = '0.4.1';
