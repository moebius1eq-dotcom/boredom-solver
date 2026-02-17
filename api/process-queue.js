export default async function handler(req) {
  const kvUrl = process.env.KV_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const resendApiKey = process.env.RESEND_API_KEY;
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!kvUrl || !kvToken) {
    return new Response('KV not configured', { status: 500 });
  }

  try {
    // Get all queue keys
    const keysRes = await fetch(`${kvUrl}/keys`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${kvToken}` 
      },
      body: JSON.stringify({ pattern: 'queue:*' })
    });
    const keysData = await keysRes.json();
    const queueKeys = keysData.result || [];
    
    let processed = 0;
    const now = Date.now();

    for (const key of queueKeys) {
      const itemRes = await fetch(`${kvUrl}/get/${key}`, {
        headers: { 'Authorization': `Bearer ${kvToken}` }
      });
      const itemData = await itemRes.json();
      const item = itemData.result;
      
      if (!item || item.status !== 'pending' || item.sendAt > now) continue;

      const { name, email, message } = item;
      
      // Generate AI response
      let autoReplyBody = 'Thanks for reaching out! We\'ll get back to you soon.';
      
      if (geminiApiKey) {
        try {
          const prompt = `You are the friendly customer service AI for "BoredomSolver". 
The user said: "${message}"
Their name: ${name || 'Anonymous'}

Write a short, friendly 2-3 sentence response. Be warm and helpful. Sign off as "— The BoredomSolver Team"`;

          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
              })
            }
          );

          if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            autoReplyBody = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || autoReplyBody;
          }
        } catch(e) {
          console.log('Gemini error:', e);
        }
      }

      // Send emails
      if (resendApiKey) {
        // Send to you (admin)
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`
          },
          body: JSON.stringify({
            from: 'BoredomSolver <onboarding@resend.dev>',
            to: 'moebius1eq@gmail.com',
            subject: name ? `Contact from ${name}` : 'New contact form submission',
            text: `Message: ${message}\n\nFrom: ${name || 'Anonymous'}\nEmail: ${email}`
          })
        });

        // Send AI response to user
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${resendApiKey}`
          },
          body: JSON.stringify({
            from: 'BoredomSolver <onboarding@resend.dev>',
            to: email,
            subject: 'Thanks for reaching out!',
            text: autoReplyBody
          })
        });
      }

      // Mark as sent
      item.status = 'sent';
      item.sentAt = now;
      await fetch(`${kvUrl}/set`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${kvToken}` 
        },
        body: JSON.stringify({ key, value: item })
      });

      processed++;
    }

    return new Response(`Processed ${processed} messages`, { status: 200 });
  } catch (e) {
    return new Response('Error: ' + e.message, { status: 500 });
  }
}
