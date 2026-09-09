# MatchLens 0.9.9.1 — konfiguracja Supabase

MatchLens używa tego samego projektu Supabase/Auth co CHB, ale **nie używa tabel CHB**. Paper Betting ma własne tabele z prefiksem `matchlens_` i własne polityki RLS.

## 1. Utwórz tabele i funkcje

W Supabase otwórz SQL Editor, utwórz nowe zapytanie i uruchom całą zawartość pliku:

`supabase/matchlens_paper_betting.sql`

Skrypt tworzy:

- `matchlens_paper_accounts`
- `matchlens_coupons`
- `matchlens_coupon_legs`
- RLS ograniczające odczyt do `auth.uid()`
- atomowe RPC do stawiania, rozliczania, usuwania i resetowania kuponów

Przeglądarka nie może bezpośrednio zmienić salda — operacje bankrollu przechodzą przez RPC.

## 2. Dodaj MatchLens do dozwolonych redirectów Auth

Nie zmieniaj Site URL używanego przez CHB.

W konfiguracji Supabase Auth dodaj do Redirect URLs:

`https://matchlens-three.vercel.app/**`

Jeśli używasz innego głównego aliasu Vercel, dodaj również jego `/**`.

Provider GitHub może pozostać ten sam, którego używa CHB.

## 3. Dodaj publiczne dane Supabase do projektu MatchLens w Vercel

W projekcie Vercel MatchLens dodaj do Production:

- `SUPABASE_URL` — Project URL tego samego projektu Supabase
- `SUPABASE_PUBLISHABLE_KEY` — publishable key (ten sam typ klucza, którego CHB używa jako `VITE_SUPABASE_PUBLISHABLE_KEY`)

Nie używaj `service_role` ani secret key. Frontend potrzebuje wyłącznie klucza publicznego; bezpieczeństwo danych zapewniają Auth + RLS + RPC.

Po zapisaniu zmiennych wykonaj Redeploy najnowszego deploymentu.

## 4. Test

1. Otwórz MatchLens i zakładkę `Paper Betting ☁`.
2. Kliknij `Zaloguj przez GitHub`.
3. Po powrocie powinien pojawić się komunikat `Supabase • synchronizacja aktywna` i saldo 1000 zł.
4. Postaw testowy kupon za 20 zł. Saldo powinno spaść do 980 zł.
5. Otwórz tę samą stronę na innym urządzeniu i zaloguj się tym samym GitHubem — saldo i kupon powinny być identyczne.
6. Rozlicz testowy kupon. Zmiana powinna być widoczna po odświeżeniu na drugim urządzeniu.

Jeśli w przeglądarce istnieją kupony z lokalnej wersji 0.9.9, a konto chmurowe jest puste, MatchLens pokaże przycisk do ich jednorazowego przeniesienia do chmury.
