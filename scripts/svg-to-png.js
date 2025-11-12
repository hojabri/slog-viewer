/**
 * Convert SVG to PNG using a headless approach
 * This script can be run manually to generate the icon.png file
 *
 * Requirements:
 * - macOS: Use built-in qlmanage or open the SVG in Preview and export as PNG
 * - Linux: Install rsvg-convert (librsvg2-bin package)
 * - Windows: Use Inkscape or online converter
 *
 * Manual conversion steps:
 * 1. Open icon.svg in a browser (Chrome/Firefox)
 * 2. Take a screenshot or use browser dev tools
 * 3. Or use an online converter: https://cloudconvert.com/svg-to-png
 * 4. Save as icon.png (128x128)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '..', 'icon.svg');
const pngPath = path.join(__dirname, '..', 'icon.png');

console.log('Converting SVG to PNG...');

try {
  // Try different conversion methods based on platform
  if (process.platform === 'darwin') {
    // macOS - try using qlmanage or sips
    try {
      console.log('Attempting conversion with sips...');
      execSync(`qlmanage -t -s 128 -o ${path.dirname(pngPath)} ${svgPath}`, { stdio: 'pipe' });
      const thumbPath = svgPath.replace('.svg', '.svg.png');
      if (fs.existsSync(thumbPath)) {
        fs.renameSync(thumbPath, pngPath);
        console.log('✓ Icon converted successfully!');
        process.exit(0);
      }
    } catch (e) {
      console.log('qlmanage failed, trying alternative method...');
    }
  }

  // If we get here, no automatic conversion worked
  console.log('\n⚠️  Automatic conversion not available.');
  console.log('\nPlease convert manually:');
  console.log('1. Open icon.svg in a web browser');
  console.log('2. Right-click and "Save Image As..." or take a screenshot');
  console.log('3. Save as icon.png (128x128 pixels)');
  console.log('\nOr use an online tool:');
  console.log('https://cloudconvert.com/svg-to-png');
  process.exit(1);
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}
