(() => {
  const nativeFetch = window.fetch.bind(window);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  window.fetch = async function matchLensFetch(input, init) {
    const url = typeof input === 'string' ? input : (input?.url || '');
    if (!url.includes('/api/football')) return nativeFetch(input, init);

    let response = await nativeFetch(input, init);
    for (let attempt = 1; response.status === 429 && attempt <= 10; attempt++) {
      // Football-Data Free allows 10 calls/minute. Temporal validation can need
      // two upstream calls per competition, so wait out the rolling window
      // instead of failing the whole validation batch.
      const retryAfter = Number(response.headers.get('retry-after'));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.max(6500, retryAfter * 1000)
        : 6500;
      await sleep(waitMs);
      response = await nativeFetch(input, init);
    }
    return response;
  };
})();