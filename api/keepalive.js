const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Runs on a daily Vercel cron (see vercel.json "crons").
// Makes a tiny read against the database so Supabase counts it as
// activity and never auto-pauses the project from inactivity.
module.exports = async function handler(req, res) {
  try {
    const { error } = await supabase
      .from('sessions')
      .select('phone')
      .limit(1);

    if (error) {
      console.error('Keepalive query error:', error.message);
      return res.status(500).json({ ok: false, error: error.message });
    }

    console.log('Keepalive ping OK', new Date().toISOString());
    return res.status(200).json({ ok: true, time: new Date().toISOString() });
  } catch (err) {
    console.error('Keepalive exception:', err.message);
    return res.status(500).json({ ok: false });
  }
};
