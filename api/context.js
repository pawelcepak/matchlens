const API_BASE = "https://v3.football.api-sports.io";

const CACHE = {
  health: 300,
  coverage: 21600,
  fixtures: 1800,
  injuries: 1800,
  stale: 3600
};

function json(data, status = 200, cacheSeconds = 0) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
    "cache-control": "no-store"
  };
  if (status === 200 && cacheSeconds > 0) {
    headers["cdn-cache-control"] = `public, max-age=${cacheSeconds}, stale-while-revalidate=${CACHE.stale}`;
    headers["vercel-cdn-cache-control"] = `public, max-age=${cacheSeconds}, stale-while-revalidate=${CACHE.stale}`;
    headers["vercel-cache-tag"] = "matchlens-api-football";
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function apiFootball(path, key) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "x-apisports-key": key,
      "Accept": "application/json"
    }
  });

  let body;
  try { body = await response.json(); }
  catch { body = null; }

  if (!response.ok) {
    const err = new Error(`API-Football HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }

  if (body?.errors && Object.keys(body.errors).length) {
    const err = new Error(Object.values(body.errors).join("; "));
    err.status = 502;
    throw err;
  }

  return {
    body,
    remaining: response.headers.get("x-ratelimit-requests-remaining"),
    limit: response.headers.get("x-ratelimit-requests-limit")
  };
}

function validYear(value) {
  return /^\d{4}$/.test(value) && Number(value) >= 2000 && Number(value) <= 2100;
}

function positiveInt(value) {
  return /^\d+$/.test(value) && Number(value) > 0;
}

export async function GET(request) {
  const key = process.env.API_FOOTBALL_KEY;
  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "health";

  // Health deliberately returns 200 when the second provider is not configured,
  // so optional integration does not inflate Vercel's application error rate.
  if (action === "health" && !key) {
    return json({
      ok: true,
      configured: false,
      provider: "API-Football",
      message: "API_FOOTBALL_KEY nie jest jeszcze ustawiony. Football-Data nadal działa niezależnie."
    });
  }

  if (!key) {
    return json({
      error: "API-Football nie jest skonfigurowane. Ustaw API_FOOTBALL_KEY w Vercel Environment Variables."
    }, 503);
  }

  try {
    if (action === "health") {
      const { body, remaining, limit } = await apiFootball("/status", key);
      return json({
        ok: true,
        configured: true,
        provider: "API-Football",
        account: body?.response || null,
        quota: { remaining, limit }
      }, 200, CACHE.health);
    }

    if (action === "coverage") {
      const league = url.searchParams.get("league") || "";
      const season = url.searchParams.get("season") || "";
      if (!positiveInt(league) || !validYear(season)) {
        return json({ error: "coverage wymaga poprawnych parametrów league i season." }, 400);
      }
      const { body, remaining, limit } = await apiFootball(`/leagues?id=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`, key);
      return json({ ok: true, response: body?.response || [], quota: { remaining, limit } }, 200, CACHE.coverage);
    }

    if (action === "fixtures") {
      const league = url.searchParams.get("league") || "";
      const season = url.searchParams.get("season") || "";
      if (!positiveInt(league) || !validYear(season)) {
        return json({ error: "fixtures wymaga poprawnych parametrów league i season." }, 400);
      }
      const { body, remaining, limit } = await apiFootball(`/fixtures?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`, key);
      return json({ ok: true, response: body?.response || [], quota: { remaining, limit } }, 200, CACHE.fixtures);
    }

    if (action === "injuries") {
      const league = url.searchParams.get("league") || "";
      const season = url.searchParams.get("season") || "";
      if (!positiveInt(league) || !validYear(season)) {
        return json({ error: "injuries wymaga poprawnych parametrów league i season." }, 400);
      }
      const { body, remaining, limit } = await apiFootball(`/injuries?league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`, key);
      return json({ ok: true, response: body?.response || [], quota: { remaining, limit } }, 200, CACHE.injuries);
    }

    return json({ error: "Nieobsługiwana akcja API-Football." }, 400);
  } catch (err) {
    const status = Number(err.status) || 502;
    if (status === 401 || status === 403) {
      return json({ error: "API-Football odrzuciło klucz. Sprawdź API_FOOTBALL_KEY w Vercel." }, status);
    }
    if (status === 429) {
      return json({ error: "Osiągnięto limit API-Football. Poczekaj na odnowienie limitu." }, 429);
    }
    return json({ error: err.message || "Błąd połączenia z API-Football." }, status >= 400 && status < 600 ? status : 502);
  }
}
