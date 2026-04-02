import puppeteer from 'puppeteer-core';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
  });
  const page = await browser.newPage();

  page.on('dialog', async dialog => {
    console.log('Dialog opened');
    await dialog.accept();
  });

  console.log('Evaluating alert...');
  await page.evaluate(() => alert('hello'));
  console.log('Evaluate finished');

  await browser.close();
})();
