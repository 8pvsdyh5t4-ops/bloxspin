/* Startup progress represents completed readiness tasks, never a timed counter. */
(() => {
  const $ = id => document.getElementById(id);
  const completed = new Set();
  const stages = ['telegram', 'art', 'fonts', 'profile', 'screen'];
  function mark(stage) {
    completed.add(stage);
    $('loadingProgress').value = completed.size / stages.length * 100;
    $('loadingPercent').textContent = Math.round($('loadingProgress').value) + '%';
  }
  function deadline(promise, ms, message) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })]).finally(() => clearTimeout(timer));
  }
  const telegram = new Promise(resolve => {
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-web-app.js';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => resolve();
    document.head.append(script);
  });
  const telegramReady = deadline(telegram, 12000, 'Telegram не отвечает. Попробуй ещё раз.')
    .then(() => {
      // A missing SDK inside Telegram must not silently open a local account.
      if (!window.Telegram?.WebApp && /tgWebAppData=/.test(location.hash)) {
        throw new Error('Не удалось подключиться к Telegram. Повтори загрузку.');
      }
      mark('telegram');
    });
  const artwork = deadline(Promise.all([$('loadingArt').decode(), $('loadingLogo').decode()]), 20000, 'Изображение загружается слишком долго.')
    .then(() => mark('art'));
  const fonts = deadline(document.fonts.ready, 10000, 'Не удалось загрузить шрифты.')
    .then(() => mark('fonts'));
  // Observe both promises immediately, including when profile loading fails first.
  const assets = Promise.allSettled([artwork, fonts]);
  $('loadingRetry').onclick = () => location.reload();
  window.BloxBoot = {
    telegram: telegramReady,
    async finish() {
      mark('profile');
      const results = await assets;
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      mark('screen');
      $('loadingStatus').textContent = 'Готово!';
      document.querySelector('main').inert = false;
      document.querySelector('.nav').inert = false;
      document.body.classList.remove('booting');
      $('loadingScreen').classList.add('leaving');
      const remove = () => { $('loadingScreen').hidden = true; };
      $('loadingScreen').addEventListener('transitionend', remove, { once: true });
      setTimeout(remove, 500);
    },
    fail(error) {
      $('loadingStatus').textContent = error?.message || 'Не удалось загрузить игру.';
      $('loadingRetry').hidden = false;
      $('loadingRetry').focus();
    }
  };
})();
