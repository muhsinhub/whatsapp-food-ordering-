const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;

async function sendMessage(to, body) {
  const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to,
      type: 'text',
      text: { body: body }
    })
  });
}

export default async function handler(req, res) {
  const { id } = req.query;

  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'ready' })
    .eq('id', id)
    .select();

  if (error) {
    return res.status(500).json({ success: false });
  }

  const customerPhone = data[0].customer_phone;
  const customerName = data[0].customer_name;

  await sendMessage(
    customerPhone,
    `Hi ${customerName || 'there'}! Your order #${id} is ready for collection. Please come collect your order. Thank you!`
  );

  res.json({ success: true });
}
