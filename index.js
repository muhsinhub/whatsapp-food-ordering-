const express = require('express');
const path = require('path');
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

let twilioClient = null;
try {
  const twilio = require('twilio');
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('Twilio client connected!');
  }
} catch (err) {
  console.log('Twilio error:', err.message);
}

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

app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const message = req.body.Body?.trim();
  const messageLower = message?.toLowerCase();

  if (!sessions[from]) {
    sessions[from] = { stage: 'welcome', cart: [], name: '' };
  }

  const session = sessions[from];
  let reply = '';

  if (messageLower === 'hi' || messageLower === 'hello' || messageLower === 'menu' || session.stage === 'welcome') {
    session.stage = 'ordering';
    session.cart = [];
    session.name = '';
    reply = `Welcome! Here is our menu:\n\n${formatMenu()}`;

  } else if (session.stage === 'ordering') {
    if (menu[messageLower]) {
      const item = menu[messageLower];
      const existing = session.cart.find(i => i.name === item.name);
      if (existing) {
        existing.qty += 1;
      } else {
        session.cart.push({ ...item, qty: 1 });
      }
      reply = `${item.name} added!\n\n*Your Order So Far*\n${formatCart(session.cart)}\n\nReply with a number to add another item or type *done* to confirm your order.`;

    } else if (messageLower === 'done') {
      if (session.cart.length === 0) {
        reply = 'Your cart is empty. Please select an item from the menu first.\n\n' + formatMenu();
      } else {
        session.stage = 'get_name';
        reply = 'Please enter your name so we can prepare your order.';
      }

    } else if (messageLower === 'clear') {
      session.cart = [];
      reply = `Cart cleared.\n\n${formatMenu()}`;
    } else {
      reply = `I did not understand that.\n\n${formatMenu()}`;
    }

  } else if (session.stage === 'get_name') {
    session.name = message;
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

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${reply}</Message>
</Response>`;

  res.type('text/xml');
  res.send(twiml);
});

// Mark order as ready and notify customer
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

  if (twilioClient && customerPhone) {
    try {
      await twilioClient.messages.create({
        from: 'whatsapp:+14155238886',
        to: customerPhone,
        body: `Hi ${customerName || 'there'}! Your order #${orderId} is ready for collection. Please come collect your order. Thank you!`
      });
      console.log('Notification sent to', customerPhone);
    } catch (err) {
      console.error('Twilio send error:', err.message);
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
