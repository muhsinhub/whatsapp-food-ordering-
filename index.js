const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const sessions = {};

const menu = {
  '1': { name: 'Burger', price: 50 },
  '2': { name: 'Pizza', price: 80 },
  '3': { name: 'Chips', price: 30 },
  '4': { name: 'Coke', price: 20 },
};

function formatMenu() {
  let text = '🍽️ *Our Menu*\n\n';
  for (const [key, item] of Object.entries(menu)) {
    text += `${key}. ${item.name} - R${item.price}\n`;
  }
  text += '\nReply with the number of what you want to order.';
  return text;
}

function formatCart(cart) {
  let text = '🛒 *Your Order*\n\n';
  let total = 0;
  for (const item of cart) {
    text += `- ${item.name} x${item.qty} = R${item.price * item.qty}\n`;
    total += item.price * item.qty;
  }
  text += `\n*Total: R${total}*`;
  return text;
}

app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const message = req.body.Body?.trim().toLowerCase();

  if (!sessions[from]) {
    sessions[from] = { stage: 'welcome', cart: [] };
  }

  const session = sessions[from];
  let reply = '';

  if (message === 'hi' || message === 'hello' || message === 'menu' || session.stage === 'welcome') {
    session.stage = 'ordering';
    reply = `👋 Welcome to *QuickBite*!\n\n${formatMenu()}`;
  } else if (session.stage === 'ordering') {
    if (menu[message]) {
      const item = menu[message];
      const existing = session.cart.find(i => i.name === item.name);
      if (existing) {
        existing.qty += 1;
      } else {
        session.cart.push({ ...item, qty: 1 });
      }
      reply = `✅ *${item.name}* added to your order!\n\n${formatCart(session.cart)}\n\nReply with:\n- A number to add more items\n- *done* to confirm order\n- *clear* to start over`;
    } else if (message === 'done') {
      if (session.cart.length === 0) {
        reply = '❌ Your cart is empty! Reply with the menu number to add items.';
      } else {
        const total = session.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);

        const { data, error } = await supabase
          .from('orders')
          .insert([{
            customer_phone: from,
            items: JSON.stringify(session.cart),
            total: total,
            status: 'new'
          }])
          .select();

        if (error) {
          console.error('Supabase error:', error);
          reply = '❌ Something went wrong. Please try again.';
        } else {
          const orderId = data[0].id;
          reply = `🎉 *Order Confirmed!*\n\n${formatCart(session.cart)}\n\nYour order ID is *#${orderId}*\nWe'll prepare it right away! Thank you 🙏`;
          session.cart = [];
          session.stage = 'welcome';
        }
      }
    } else if (message === 'clear') {
      session.cart = [];
      reply = `🗑️ Cart cleared!\n\n${formatMenu()}`;
    } else {
      reply = `❓ I didn't understand that.\n\n${formatMenu()}`;
    }
  }

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${reply}</Message>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/orders', async (req, res) => {
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
    cart: JSON.parse(order.items),
    total: order.total,
    status: order.status,
    time: order.created_at
  }));

  res.json({ orders });
});

app.get('/', (req, res) => {
  res.send('WhatsApp Food Ordering Bot is running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
