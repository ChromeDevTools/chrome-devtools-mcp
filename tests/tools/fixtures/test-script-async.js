async () => {
  await new Promise(res => setTimeout(res, 0));
  return 'async-works';
}
