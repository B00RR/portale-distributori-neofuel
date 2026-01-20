/**
 * CLEANUP SCRIPT
 * This script forces the unregistration of all Service Workers and clearing of caches.
 * It is used to resolve sticky PWA cache issues in development.
 */
(async function () {
    console.log('[Cleanup] Starting aggressive cache cleanup...');

    if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
            console.log('[Cleanup] Unregistering SW:', registration);
            await registration.unregister();
        }
        if (registrations.length > 0) {
            console.log('[Cleanup] Service Workers unregistered.');
        }
    }

    if ('caches' in window) {
        const keys = await caches.keys();
        for (const key of keys) {
            console.log('[Cleanup] Deleting cache:', key);
            await caches.delete(key);
        }
    }

    console.log('[Cleanup] Done. If this persists, please close all tabs and reopen.');
})();
