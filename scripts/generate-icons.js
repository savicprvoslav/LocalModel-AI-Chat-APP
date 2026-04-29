/**
 * Generate themed app icons + splash from SVG templates.
 * Run: `node scripts/generate-icons.js`
 *
 * Produces:
 *   assets/icon.png            1024x1024  (iOS app icon)
 *   assets/adaptive-icon.png   1024x1024  (Android foreground layer, transparent bg)
 *   assets/splash-icon.png     1024x1024  (splash centerpiece)
 *   assets/favicon.png         48x48      (web favicon, unused on mobile but kept)
 *
 * Theme: warm-dark canvas (#161412) with a bone-cream mark (#ECE6D8).
 * The mark is a `>` chevron — the prompt sigil from the composer.
 */
const sharp = require('sharp');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');

// Bone (#ECE6D8) chevron `>` against canvas (#161412), used for icon + splash.
const filledIconSVG = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#161412" rx="184" ry="184"/>
  <g stroke="#ECE6D8" stroke-width="80" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <polyline points="380,300 700,512 380,724"/>
  </g>
</svg>
`;

// Same chevron over transparent background (Android adaptive foreground).
const adaptiveSVG = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <g stroke="#ECE6D8" stroke-width="80" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <polyline points="380,300 700,512 380,724"/>
  </g>
</svg>
`;

async function main() {
  await sharp(Buffer.from(filledIconSVG(1024)))
    .png()
    .toFile(path.join(ASSETS, 'icon.png'));
  console.log('  ✓ assets/icon.png');

  await sharp(Buffer.from(adaptiveSVG(1024)))
    .png()
    .toFile(path.join(ASSETS, 'adaptive-icon.png'));
  console.log('  ✓ assets/adaptive-icon.png');

  await sharp(Buffer.from(filledIconSVG(1024)))
    .png()
    .toFile(path.join(ASSETS, 'splash-icon.png'));
  console.log('  ✓ assets/splash-icon.png');

  await sharp(Buffer.from(filledIconSVG(48)))
    .png()
    .toFile(path.join(ASSETS, 'favicon.png'));
  console.log('  ✓ assets/favicon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
