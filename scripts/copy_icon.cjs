const fs = require('fs');
const path = require('path');

const src192 = String.raw`C:\Users\loren\.gemini\antigravity\brain\646f4398-917e-4ccf-ac48-da545847078c\icon_192_generated_1766425858744.png`;
const src512 = String.raw`C:\Users\loren\.gemini\antigravity\brain\646f4398-917e-4ccf-ac48-da545847078c\icon_512_generated_1766425864421.png`;

const destDesktop = String.raw`c:\Users\loren\OneDrive\Desktop\programma pompe\anteprima_icona.png`;
const dest192 = String.raw`c:\Users\loren\OneDrive\Desktop\programma pompe\public\icons\icon-192x192.png`;
const dest512 = String.raw`c:\Users\loren\OneDrive\Desktop\programma pompe\public\icons\icon-512x512.png`;

try {
    // Copy 192
    if (fs.existsSync(src192)) {
        fs.copyFileSync(src192, dest192);
        console.log(`Copied 192: ${dest192}`);
    } else {
        console.error(`Source 192 not found: ${src192}`);
    }

    // Copy 512
    if (fs.existsSync(src512)) {
        fs.copyFileSync(src512, dest512);
        console.log(`Copied 512: ${dest512}`);

        // Copy 512 to Desktop
        fs.copyFileSync(src512, destDesktop);
        console.log(`Copied to desktop: ${destDesktop}`);
    } else {
        console.error(`Source 512 not found: ${src512}`);
    }

} catch (err) {
    console.error('Error copying:', err);
}
