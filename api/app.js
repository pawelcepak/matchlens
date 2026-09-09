export async function GET(request) {
  const url = new URL('/index.html', request.url);
  const response = await fetch(url, { headers: { accept: 'text/html' } });
  if (!response.ok) {
    return new Response('Nie udało się załadować aplikacji.', { status: 502 });
  }
  let html = await response.text();
  html = html.replace('</body>', '<script src="/v06.js"></script></body>');
  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
