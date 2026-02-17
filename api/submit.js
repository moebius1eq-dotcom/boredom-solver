export default function handler(req) {
  return new Response('OK - ' + req.url, { status: 200 });
}
