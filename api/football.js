const ALLOWED_COMPETITIONS = new Set([
  "DED","PL","PD","BL1","SA","FL1","PPL","ELC","BSA","CL","WC","EC"
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    }
  });
}

async function footballFetch(path, token) {
  const response = await fetch(`https://api.football-data.org/v4${path}`, {
    headers: {
      "X-Auth-Token": token,
      "Accept": "application/json"
    }
  });

  let body;
  try { body = await response.json(); }
  catch { body = { message: `Football-Data HTTP ${response.status}` }; }

  if (!response.ok) {
    const err = new Error(body?.message || `Football-Data HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return body;
}

export async function GET(request) {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  if (!token) {
    return json({ error: "Brak sekretu FOOTBALL_DATA_TOKEN w Vercel. Dodaj go w Project Settings → Environment Variables i wykonaj Redeploy." }, 500);
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "health";

  try {
    if (action === "health") {
      const data = await footballFetch("/competitions/DED", token);
      return json({ ok: true, competition: data?.name || "Eredivisie" });
    }

    if (action !== "matches") {
      return json({ error: "Nieobsługiwana akcja." }, 400);
    }

    const competition = (url.searchParams.get("competition") || "").toUpperCase();
    const seasonRaw = url.searchParams.get("season") || "";
    const includePrevious = url.searchParams.get("includePrevious") === "1";

    if (!ALLOWED_COMPETITIONS.has(competition)) {
      return json({ error: "Niedozwolony kod rozgrywek." }, 400);
    }
    if (!/^\d{4}$/.test(seasonRaw)) {
      return json({ error: "Sezon musi być czterocyfrowym rokiem rozpoczęcia, np. 2026." }, 400);
    }

    const season = Number(seasonRaw);
    if (season < 2000 || season > 2100) {
      return json({ error: "Nieprawidłowy sezon." }, 400);
    }

    const current = await footballFetch(
      `/competitions/${encodeURIComponent(competition)}/matches?season=${season}`,
      token
    );

    let matches = (current.matches || []).map(m => ({ ...m, seasonStart: season }));
    let previousSeasonLoaded = false;
    let previousSeasonWarning = null;

    if (includePrevious) {
      try {
        const previous = await footballFetch(
          `/competitions/${encodeURIComponent(competition)}/matches?season=${season - 1}`,
          token
        );
        matches = matches.concat(
          (previous.matches || []).map(m => ({ ...m, seasonStart: season - 1 }))
        );
        previousSeasonLoaded = true;
      } catch (err) {
        previousSeasonWarning =
          err.status === 403
            ? "Twój plan Football-Data nie udostępnił poprzedniego sezonu."
            : `Nie udało się pobrać poprzedniego sezonu: ${err.message}`;
      }
    }

    return json({
      ok: true,
      matches,
      meta: {
        competition,
        season,
        previousSeasonLoaded,
        previousSeasonWarning
      }
    });
  } catch (err) {
    const status = Number(err.status) || 502;
    if (status === 401) return json({ error: "Football-Data odrzuciło token (401). Sprawdź wartość FOOTBALL_DATA_TOKEN." }, 401);
    if (status === 403) return json({ error: "Football-Data zwróciło 403 — ta operacja lub dane mogą nie być dostępne w Twoim planie." }, 403);
    if (status === 429) return json({ error: "Przekroczono limit zapytań Football-Data. Odczekaj chwilę i spróbuj ponownie." }, 429);
    return json({ error: err.message || "Błąd połączenia z Football-Data." }, status >= 400 && status < 600 ? status : 502);
  }
}
