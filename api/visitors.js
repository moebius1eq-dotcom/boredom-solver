export default async function handler(req) {
  const kvUrl = process.env.KV_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!kvUrl || !kvToken) {
    return new Response(JSON.stringify({ visitors: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const kv = {
    async get(key) {
      const res = await fetch(`${kvUrl}/get/${key}`, {
        headers: { Authorization: `Bearer ${kvToken}` }
      });
      const data = await res.json();
      return data.result;
    }
  };
  
  const visitors = await kv.get('visitors') || [];

  return new Response(JSON.stringify({ visitors }), {
    status: 200,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}