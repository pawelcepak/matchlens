# MatchLens v0.4 — Hosted Edition

MatchLens 0.4 to statystyczny analizator meczu uruchamiany jako normalna strona WWW na Vercel.

## Co zmieniło się względem 0.3

- token Football-Data **nie trafia do frontendu**;
- frontend łączy się tylko z `/api/football`;
- Vercel Function dodaje `X-Auth-Token` po stronie serwera;
- działa z normalnego adresu HTTPS na Androidzie, Windowsie i Linuxie;
- aplikacja może spróbować połączyć wybrany sezon z poprzednim;
- jeśli poprzedni sezon jest niedostępny w planie API, aplikacja jawnie o tym informuje;
- prognoza 1X2 nadal jest blokowana przy zbyt małej próbce;
- zakładka Diagnostyka sprawdza backend, sekret i Football-Data.

## Wymagany sekret Vercel

Nazwa:

FOOTBALL_DATA_TOKEN

Wartość:

Twój token z football-data.org

Nie zapisuj tokenu w GitHubie, `index.html`, plikach JavaScript ani README.

## Struktura

- `index.html` — frontend
- `api/football.js` — Vercel Function / proxy
- `package.json` — projekt ESM dla funkcji Node.js
- `.gitignore` — ignorowanie lokalnych sekretów

## Lokalny test przez Vercel CLI (opcjonalny)

1. `npm i -g vercel`
2. `vercel link`
3. utwórz `.env.local`:
   `FOOTBALL_DATA_TOKEN=TWÓJ_TOKEN`
4. `vercel dev`
5. otwórz adres pokazany w terminalu.

`.env.local` jest ignorowany przez Git.
