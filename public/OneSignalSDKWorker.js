// OneSignal's worker bundle, registered at a sub-scope ("/push/onesignal/")
// via serviceWorkerParam in OneSignal.init() so it coexists with /sw.js,
// which controls the root scope for the app's PWA/offline caching.
importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
