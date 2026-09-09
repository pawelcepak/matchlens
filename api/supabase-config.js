export async function GET() {
  const url = process.env.SUPABASE_URL || '';
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || '';
  const configured = Boolean(url && publishableKey);
  return new Response(JSON.stringify({ configured, url: configured ? url : null, publishableKey: configured ? publishableKey : null }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}
