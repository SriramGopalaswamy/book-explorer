# Browser Cache Clearing Guide

## Quick Reference: Force Refresh & Clear Cache

### 🔄 Hard Refresh (First Try This!)

**Windows/Linux:**
- Chrome/Edge/Firefox: `Ctrl + Shift + R`
- Or: `Ctrl + F5`

**Mac:**
- Chrome/Safari/Firefox: `Cmd + Shift + R`
- Safari alternative: `Option + Cmd + E` (empty cache) then `Cmd + R`

---

## 🧹 Complete Cache Clear by Browser

### Chrome / Edge

1. **Quick Method:**
   - Open DevTools (F12)
   - Right-click the refresh button (when DevTools is open)
   - Select "Empty Cache and Hard Reload"

2. **Complete Clear:**
   - Press `Ctrl + Shift + Delete` (or `Cmd + Shift + Delete` on Mac)
   - Select "Cached images and files"
   - Time range: "All time"
   - Click "Clear data"

3. **DevTools Method:**
   - F12 to open DevTools
   - Go to "Application" tab
   - In left sidebar: "Storage"
   - Click "Clear site data"

4. **Service Worker Check:**
   - F12 → Application tab → Service Workers
   - If any service worker listed: Click "Unregister"

### Firefox

1. **Hard Refresh:**
   - `Ctrl + Shift + R` (Windows/Linux)
   - `Cmd + Shift + R` (Mac)

2. **Complete Clear:**
   - Press `Ctrl + Shift + Delete` (or `Cmd + Shift + Delete` on Mac)
   - Select "Cached Web Content"
   - Time range: "Everything"
   - Click "Clear Now"

3. **Service Worker Check:**
   - F12 → Storage tab → Service Workers
   - Click "Unregister" for any workers

### Safari

1. **Empty Cache:**
   - Enable Develop menu: Safari → Preferences → Advanced → Show Develop menu
   - Develop → Empty Caches (or `Option + Cmd + E`)
   - Then `Cmd + R` to reload

2. **Complete Clear:**
   - Safari → Preferences → Privacy
   - Click "Manage Website Data"
   - Remove specific site or "Remove All"

---

## 🔍 Verification Checklist

After clearing cache, you should see:

- [ ] **Red banner** at bottom-left: "BUILD VERIFICATION v[timestamp] - FRONTEND REBUILT"
- [ ] **DevToolbar** button (purple) on right side of screen
- [ ] **Role Switcher** shows "🔴 ROLE SWITCHER ACTIVE 🔴" when DevToolbar is opened
- [ ] **Network tab** shows new requests (not 304 "Not Modified")
- [ ] **Console** shows no errors related to missing chunks/files

---

## 🚨 If Cache Clearing Doesn't Work

### 1. Incognito/Private Mode
- Open app in incognito/private browsing mode
- If it works here, it's definitely a cache issue
- Regular browser needs more aggressive clearing

### 2. Different Browser
- Try Chrome if using Firefox, or vice versa
- Fresh browser = no cache

### 3. Check Service Workers
```javascript
// In browser console, run:
navigator.serviceWorker.getRegistrations().then(function(registrations) {
  for(let registration of registrations) {
    registration.unregister();
    console.log('Service Worker unregistered');
  }
});
```

### 4. Force Disable Cache (DevTools)
- Open DevTools (F12)
- Go to Network tab
- Check "Disable cache" checkbox
- Keep DevTools open while testing

### 5. Clear Browser Data Completely
- Chrome: `chrome://settings/clearBrowserData`
- Firefox: `about:preferences#privacy`
- Edge: `edge://settings/clearBrowserData`

---

## 🔧 For Developers: Prevent Cache Issues

### Add Cache-Control Headers (Backend)

In `backend/src/server.js`, add before serving static files:

```javascript
// Prevent caching in development
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    next();
  });
}
```

### Add Version Query Params

In production builds, consider adding build hash to asset URLs:
```html
<script src="/assets/main.js?v=BUILD_HASH"></script>
```

---

## 📱 Mobile Browsers

### iOS Safari
1. Settings → Safari → Clear History and Website Data
2. Or: Settings → Safari → Advanced → Website Data → Remove All

### Android Chrome
1. Chrome menu → History → Clear browsing data
2. Select "Cached images and files"
3. Time range: "All time"

---

## ✅ Success Indicators

You'll know cache is cleared when:

1. **Network tab shows:**
   - Status 200 (not 304)
   - Size shows actual bytes (not "disk cache" or "memory cache")
   - New timestamps on requests

2. **Visual markers appear:**
   - Red verification banner visible
   - Updated text in DevToolbar
   - Console shows fresh logs

3. **Functionality works:**
   - Role switcher appears in DevToolbar
   - Features behave as expected
   - No "chunk load failed" errors

---

## 🆘 Still Not Working?

If you've cleared all caches and still see old behavior:

1. **Check the build is deployed:**
   - Verify `dist` folder exists on server
   - Check file timestamps in `dist/assets/`
   - Compare local build with deployed build

2. **Check server is restarted:**
   - Look for restart timestamp in server logs
   - Verify correct port and URL

3. **Check for proxy/CDN:**
   - If using Cloudflare, Nginx, or similar
   - May need to purge CDN cache
   - Check proxy configuration

4. **Verify correct environment:**
   - Production vs. development
   - Correct .env variables loaded
   - Right branch deployed

---

**Last Updated:** 2026-02-16  
**Related:** See DEPLOYMENT_VERIFICATION_REPORT.md for complete deployment troubleshooting
