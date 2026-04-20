console.log('Service Worker starting...');
console.warn('This is a warning from Service Worker');

setTimeout(() => {
  throw new Error('Intentional error from Service Worker');
}, 100);
