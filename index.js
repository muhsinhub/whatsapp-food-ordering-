const express = require('express');
const path = require('path');
const fetch = require('node-fetch');
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

let supabase = null;
try {
  const { createClient } = require('@supabase/supabase-js');
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
    console.log('Supabase connected!');
  }
} catch (err) {
  console.log('Supabase error:', err.message);
}

const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'quickbite123';
const ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const PHONE_NUMBER_ID = process.env.META_PHONE_NUMBER_ID;

const sessions = {};
const orders = [];

const menu = {
  '1': { name: 'Burger', price: 50 },
  '2': { name: 'Pizza', price: 80 },
  '3': { name: 'Chips', price: 30 },
  '4': { name: 'Coke', price: 20 },
};

function formatMenu() {
  let text = '*Our Menu*\n\n';
  for (const [key, item] of Object.entries(menu)) {
    text += `${key}. ${item.name} - R${item.price}\n`;
  }
  text += '\nReply with the number of what you want to order.';
  return text;
}

function formatCart(cart) {
  let text = '';
  let total = 0;
  for (const item of cart) {
    text += `- ${item.name} x${item.qty} = R${item.price * item.qty}\n`;
    total += item.price * item.qty;
  }
  text += `\nTotal: R${total}`;
  return text;
}

async function sendMessage(to, body) {
  const url = `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`;
  
  const response = await fetch(url, {
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

  const data = await response.json();
  console.log('Meta response:', JSON.stringify(data));
  return data;
}

// Webhook verification
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified!');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook handler
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  const body = req.body;
  if (body.object !== 'whatsapp_business_account') return;

  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const messages = value?.messages;

  if (!messages || messages.length === 0) return;

  const message = messages[0];
  const from = message.from;
  const text = message.text?.body?.trim();
  const textLower = text?.toLowerCase();

  if (!text) return;

  if (!sessions[from]) {
    sessions[from] = { stage: 'welcome', cart: [], name: '' };
  }

  const session = sessions[from];
  let reply = '';

  if (textLower === 'hi' || textLower === 'hello' || textLower === 'menu' || session.stage === 'welcome') {
    session.stage = 'ordering';
    session.cart = [];
    session.name = '';
    reply = `Welcome! Here is our menu:\n\n${formatMenu()}`;

  } else if (session.stage === 'ordering') {
    if (menu[textLower]) {
      const item = menu[textLower];
      const existing = session.cart.find(i => i.name === item.name);
      if (existing) {
        existing.qty += 1;
      } else {
        session.cart.push({ ...item, qty: 1 });
      }
      reply = `${item.name} added!\n\n*Your Order So Far*\n${formatCart(session.cart)}\n\nReply with a number to add another item or type *done* to confirm your order.`;

    } else if (textLower === 'done') {
      if (session.cart.length === 0) {
        reply = 'Your cart is empty. Please select an item from the menu first.\n\n' + formatMenu();
      } else {
        session.stage = 'get_name';
        reply = 'Please enter your name so we can prepare your order.';
      }

    } else if (textLower === 'clear') {
      session.cart = [];
      reply = `Cart cleared.\n\n${formatMenu()}`;
    } else {
      reply = `I did not understand that.\n\n${formatMenu()}`;
    }

  } else if (session.stage === 'get_name') {
    session.name = text;
    const total = session.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    let orderId;

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('orders')
          .insert([{
            customer_phone: from,
            customer_name: session.name,
            items: JSON.stringify(session.cart),
            total: total,
            status: 'new'
          }])
          .select();

        if (error) {
          console.error('Supabase insert error:', error.message);
          orderId = Date.now();
          orders.push({ id: orderId, from, name: session.name, cart: [...session.cart], time: new Date() });
        } else {
          orderId = data[0].id;
        }
      } catch (err) {
        console.error('Supabase exception:', err.message);
        orderId = Date.now();
        orders.push({ id: orderId, from, name: session.name, cart: [...session.cart], time: new Date() });
      }
    } else {
      orderId = Date.now();
      orders.push({ id: orderId, from, name: session.name, cart: [...session.cart], time: new Date() });
    }

    const orderSummary = formatCart(session.cart);
    const confirmedName = session.name;
    session.cart = [];
    session.stage = 'welcome';

    reply = `Thank you ${confirmedName}, your order has been placed!\n\n*Order Summary*\n\nOrder ID: #${orderId}\n\n${orderSummary}\n\nWe will notify you when your order is ready for collection.`;
  }

  if (reply) {
    await sendMessage(from, reply);
  }
});

app.post('/ready/:id', async (req, res) => {
  const orderId = req.params.id;
  let customerPhone = null;
  let customerName = null;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .update({ status: 'ready' })
        .eq('id', orderId)
        .select();

      if (error) {
        console.error('Supabase update error:', error.message);
        return res.status(500).json({ success: false });
      }

      customerPhone = data[0].customer_phone;
      customerName = data[0].customer_name;
    } catch (err) {
      console.error('Supabase exception:', err.message);
      return res.status(500).json({ success: false });
    }
  }

  if (customerPhone) {
    try {
      await sendMessage(
        customerPhone,
        `Hi ${customerName || 'there'}! Your order #${orderId} is ready for collection. Please come collect your order. Thank you!`
      );
    } catch (err) {
      console.error('Send error:', err.message);
    }
  }

  res.json({ success: true });
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/orders', async (req, res) => {
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase fetch error:', error.message);
        return res.json({ orders });
      }

      const dbOrders = data.map(order => ({
        id: order.id,
        from: order.customer_phone,
        name: order.customer_name,
        cart: JSON.parse(order.items),
        total: order.total,
        status: order.status,
        time: order.created_at
      }));

      return res.json({ orders: dbOrders });
    } catch (err) {
      console.error('Supabase fetch exception:', err.message);
      return res.json({ orders });
    }
  }
  res.json({ orders });
});

app.get('/', (req, res) => {
  res.send('WhatsApp Food Ordering Bot is running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
