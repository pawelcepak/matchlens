# MatchLens v0.5 — Advanced Model

MatchLens 0.5 to statystyczny analizator meczu uruchamiany jako normalna strona WWW na Vercel.

## Architektura

- token Football-Data **nie trafia do frontendu**;
- frontend łączy się tylko z `/api/football`;
- Vercel Function dodaje `X-Auth-Token` po stronie serwera;
- działa z normalnego adresu HTTPS na Androidzie, Windowsie i Linuxie;
- aplikacja może spróbować połączyć wybrany sezon z poprzednim;
- jeśli poprzedni sezon jest niedostępny w planie API, aplikacja jawnie o tym informuje;
- prognoza 1X2 jest blokowana przy zbyt małej próbce;
- zakładka Diagnostyka sprawdza backend, sekret i Football-Data.

## Wymagany sekret Vercel

Nazwa:

`FOOTBALL_DATA_TOKEN`

Wartość:

Twój token z football-data.org

Nie zapisuj tokenu w GitHubie, `index.html`, plikach JavaScript ani README.

## Struktura

- `index.html` — frontend
- `api/football.js` — Vercel Function / proxy
- `package.json` — projekt ESM dla funkcji Node.js
- `.gitignore` — ignorowanie lokalnych sekretów

## Nowości 0.5

- ważona forma — nowsze mecze mają większą wagę;
- rating siły drużyn liczony z całej pobranej ligi;
- H2H jako mała korekta;
- osobny wpływ home/away;
- opcjonalne kursy 1/X/2 i usuwanie marży;
- porównanie MODEL vs RYNEK;
- ostrzeżenie przy dużej rozbieżności;
- TOP 5 najbardziej prawdopodobnych dokładnych wyników z modelu Poissona.

## Lokalny test przez Vercel CLI — opcjonalny

1. `npm i -g vercel`
2. `vercel link`
3. utwórz `.env.local` z `FOOTBALL_DATA_TOKEN=TWÓJ_TOKEN`
4. `vercel dev`
5. otwórz adres pokazany w terminalu.

`.env.local` jest ignorowany przez Git.
