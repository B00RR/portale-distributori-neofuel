const fs = require('fs');
const path = require('path');

const src = String.raw`C:\Users\loren\.gemini\antigravity\brain\646f4398-917e-4ccf-ac48-da545847078c\neofuel_pwa_icon_final_gradients_1766421828349.png`;
const destDesktop = String.raw`c:\Users\loren\OneDrive\Desktop\programma pompe\anteprima_icona.png`;
const dest192 = String.raw`c:\Users\loren\OneDrive\Desktop\programma pompe\public\icons\icon-192x192.png`;
const dest512 = String.raw`c:\Users\loren\OneDrive\Desktop\programma pompe\public\icons\icon-512x512.png`;

try {
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, destDesktop);
        console.log('Copied to desktop: ' + destDesktop);

        fs.copyFileSync(src, dest192);
        console.log('Copied 192x192: ' + dest192);

        fs.copyFileSync(src, dest512);
        console.log('Copied 512x512: ' + dest512);
    } else {
        console.error('Source not found: ' + src);
    }
} catch (err) {
    console.error('Error copying:', err);
}
