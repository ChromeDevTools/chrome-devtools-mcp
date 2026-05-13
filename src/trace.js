import puppeteer from 'puppeteer';

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // Create a Chrome DevTools Protocol session to enable CPU throttling
  // const client = await page.target().createCDPSession();
  // console.log('Enabling 20x CPU throttling...');
  // await client.send('Emulation.setCPUThrottlingRate', { rate: 20 });

  await page.emulateCPUThrottling(20);

  const url = 'https://heise.de';
  const tracePath = 'trace.json';

  console.log(`Starting performance trace for ${url}...`);
  await page.tracing.start({
    path: tracePath,
    categories: [
      '-*',
      'blink.console',
      'blink.user_timing',
      'devtools.timeline',
      'disabled-by-default-devtools.screenshot',
      'disabled-by-default-devtools.timeline',
      'disabled-by-default-devtools.timeline.invalidationTracking',
      'disabled-by-default-devtools.timeline.frame',
      'disabled-by-default-devtools.timeline.stack',
      'disabled-by-default-v8.cpu_profiler',
      'disabled-by-default-v8.cpu_profiler.hires',
      'latencyInfo',
      'loading',
      'disabled-by-default-lighthouse',
      'v8.execute',
      'v8',
    ]
  });

  console.log(`Navigating to ${url}...`);
  try {
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 60000
    });
  } catch (error) {
    console.error(`Error navigating to ${url}: ${error.message}`);
  }

  console.log('Stopping trace...');
  await page.tracing.stop();

  console.log(`Trace saved to ${tracePath}`);

  await browser.close();
  console.log('Browser closed.');
})();
