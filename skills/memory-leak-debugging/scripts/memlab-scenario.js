// Memlab Scenario Template
module.exports = {
  // Required: The URL to load
  url: () => 'http://localhost:3000',

  // Required: Action to trigger the memory leak
  action: async (page) => {
    // Example: Click a button that causes a leak
    await page.click('#leak-button');
    // Wait for any animations or network requests to settle
    await new Promise(resolve => setTimeout(resolve, 1000));
  },

  // Required: Action to revert to the baseline state
  back: async (page) => {
    // Example: Click a back button or close a modal
    await page.click('#back-button');
    await new Promise(resolve => setTimeout(resolve, 1000));
  },

  // Optional: Function to run before taking the baseline snapshot
  // setup: async (page) => { ... },
};
