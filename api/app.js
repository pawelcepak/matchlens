export default async function handler(req, res) {
  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const url = `${proto}://${host}/index.html?source=ml06`;
    const response = await fetch(url, { headers: { accept: 'text/html' } });
    if (!response.ok) {
      res.status(502).send('Nie udało się załadować aplikacji.');
      return;
    }
    let html = await response.text();
    html = html
      .replace('<title>MatchLens 0.5</title>', '<title>MatchLens 0.6</title>')
      .replace('MatchLens <span class="muted">0.5</span>', 'MatchLens <span class="muted">0.6</span>')
      .replace('Advanced Model — ważona forma, rating siły ligi, home/away, H2H i porównanie z rynkiem.', 'Explainable Model — pokazuje skąd bierze prognozę i pozwala sprawdzić model na historii.')
      .replace('</body>', '<script src="/v06.js?v=0603"></script></body>');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).send(html);
  } catch (error) {
    res.status(500).send('Błąd aplikacji: ' + (error?.message || 'unknown'));
  }
}
