const express = require('express');
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Temporary in-memory storage
const sessions = {};
const orders = {};

// Sample restaurant menu
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

app.post('/webhook', (req, res) => {
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
        const orderId = Date.now();
        orders[orderId] = { from, cart: session.cart, time: new Date() };
        reply = `🎉 *Order Confirmed!*\n\n${formatCart(session.cart)}\n\nYour order ID is *#${orderId}*\nWe'll prepare it right away! Thank you 🙏`;
        session.cart = [];
        session.stage = 'welcome';
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

app.get('/', (req, res) => {
  res.send('WhatsApp Food Ordering Bot is running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
