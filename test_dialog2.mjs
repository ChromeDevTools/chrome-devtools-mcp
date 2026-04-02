import puppeteer from 'puppeteer-core';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
  });
  const page = await browser.newPage();

  let savedDialog;
  page.on('dialog', dialog => {
    console.log('Dialog opened - first handler');
    savedDialog = dialog;
  });

  page.on('dialog', async dialog => {
    console.log('Dialog opened - second handler');
    await dialog.accept();
  });

  console.log('Evaluating alert...');
  await page.evaluate(() => alert('hello'));
  console.log('Evaluate finished. Saved dialog:', savedDialog?.message());

  await browser.close();
})();
