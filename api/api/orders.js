const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  const orders = data.map(order => ({
    id: order.id,
    from: order.customer_phone,
    name: order.customer_name,
    cart: JSON.parse(order.items),
    total: order.total,
    status: order.status,
    time: order.created_at
  }));

  res.json({ orders });
}
