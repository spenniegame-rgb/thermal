// Renders icon.svg to the iOS app icon (1024) and launch splash (2732).
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const svg = fs.readFileSync(__dirname + '/icon.svg', 'utf8');
  const b = await chromium.launch(); const p = await b.newPage();
  const draw = async (size, scale, out) => {
    await p.setViewportSize({width: size, height: size});
    const inner = svg.replace('width="512" height="512"', `width="${512*scale}" height="${512*scale}"`);
    await p.setContent(`<body style="margin:0;background:#0c0f16;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">${inner}</body>`);
    await p.screenshot({path: out, omitBackground: false});
  };
  const [ , , outDir] = process.argv;
  await draw(1024, 2, outDir + '/AppIcon-512@2x.png');
  await draw(2732, 1.1, outDir + '/splash.png');
  await b.close();
})();
