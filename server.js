/**
 * StayBook — Full Stack Server
 * Replit Ready: runs on process.env.PORT automatically
 */

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const path = require('path');
const dns = require('dns').promises;

const app = express();
const PORT = process.env.PORT || 3001;

// ── Authentication ──────────────────────────────────────────
const USERS = {
  'admin': { password: 'admin123', name: 'Admin User' },
  'host': { password: 'host123', name: 'Host User' }
};

const VALID_TOKENS = new Set();

// Simple token generator
function generateToken() {
  return uuidv4();
}

// Auth middleware
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !VALID_TOKENS.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

// ── Middleware ──────────────────────────────────────────────
app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve login page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Serve protected main app
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve static files for public assets
app.use(express.static(path.join(__dirname, 'public')));

// ── Database ────────────────────────────────────────────────
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'staybook.db');
const db = new Database(DB_PATH);
console.log(`🗄️ Using DB at: ${DB_PATH}`);

db.exec(`
  CREATE TABLE IF NOT EXISTS bookings (
    id           TEXT PRIMARY KEY,
    guest_name   TEXT NOT NULL,
    guest_email  TEXT NOT NULL,
    guest_phone  TEXT DEFAULT '',
    check_in     TEXT NOT NULL,
    check_out    TEXT NOT NULL,
    check_in_time TEXT DEFAULT '14:00',
    check_out_time TEXT DEFAULT '11:00',
    guests       INTEGER DEFAULT 1,
    nights       INTEGER DEFAULT 1,
    amount       INTEGER DEFAULT 0,
    status       TEXT DEFAULT 'pending',
    color        TEXT DEFAULT '#0d9488',
    initials     TEXT DEFAULT '??',
    form_link    TEXT DEFAULT '',
    form_sent    INTEGER DEFAULT 0,
    form_sent_at TEXT DEFAULT NULL,
    host_notes   TEXT DEFAULT '',
    created_at   TEXT DEFAULT (datetime('now')),
    updated_at   TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS form_responses (
    id            TEXT PRIMARY KEY,
    booking_id    TEXT NOT NULL,
    response_data TEXT NOT NULL,
    submitted_at  TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (booking_id) REFERENCES bookings(id)
  );

  CREATE TABLE IF NOT EXISTS host_settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ── Seed demo data ──────────────────────────────────────────
const count = db.prepare('SELECT COUNT(*) as c FROM bookings').get();
if (count.c === 0) {
  console.log('🌱 Seeding demo data...');

  const ins = db.prepare(`
    INSERT INTO bookings
      (id,guest_name,guest_email,guest_phone,check_in,check_out,check_in_time,check_out_time,guests,nights,amount,status,color,initials,form_link,form_sent,form_sent_at,host_notes)
    VALUES
      (@id,@guest_name,@guest_email,@guest_phone,@check_in,@check_out,@check_in_time,@check_out_time,@guests,@nights,@amount,@status,@color,@initials,@form_link,@form_sent,@form_sent_at,@host_notes)
  `);

  const now = new Date().getFullYear();
  const nm = new Date().getMonth();

  // Use current month for demo bookings so they always show up
  const pad = n => String(n).padStart(2,'0');
  const date = (d) => `${now}-${pad(nm+1)}-${pad(d)}`;

  const seeds = [
    { id: uuidv4(), guest_name:'Sarah Mehta',  guest_email:'sarah.m@email.com',  guest_phone:'+91 98765 43210',
      check_in:date(6), check_out:date(8), check_in_time:'14:00', check_out_time:'11:00', guests:2, nights:3, amount:12500,
      status:'confirmed', color:'#0d9488', initials:'SM',
      form_link:'https://forms.gle/example', form_sent:1, form_sent_at:date(1)+'T10:00:00',
      host_notes:'Repeat guest. Very clean. ⭐⭐⭐⭐⭐' },
    { id: uuidv4(), guest_name:'Priya Kapoor', guest_email:'priya.k@email.com',  guest_phone:'+91 91234 56789',
      check_in:date(14), check_out:date(16), check_in_time:'15:00', check_out_time:'10:00', guests:3, nights:3, amount:12300,
      status:'confirmed', color:'#6366f1', initials:'PK',
      form_link:'https://forms.gle/example2', form_sent:1, form_sent_at:date(5)+'T14:00:00',
      host_notes:'First time guest. Verified ID.' },
    { id: uuidv4(), guest_name:'Rahul Desai',  guest_email:'rahul.d@email.com',  guest_phone:'+91 90000 11122',
      check_in:date(20), check_out:date(22), check_in_time:'16:00', check_out_time:'11:00', guests:4, nights:3, amount:13500,
      status:'pending', color:'#f59e0b', initials:'RD',
      form_link:'', form_sent:0, form_sent_at:null, host_notes:'' },
    { id: uuidv4(), guest_name:'Anjali Singh', guest_email:'anjali.s@email.com', guest_phone:'+91 99887 76655',
      check_in:date(25), check_out:date(27), check_in_time:'14:30', check_out_time:'11:30', guests:1, nights:3, amount:12300,
      status:'confirmed', color:'#ec4899', initials:'AS',
      form_link:'', form_sent:0, form_sent_at:null, host_notes:'' }
  ];

  seeds.forEach(b => ins.run(b));

  // Seed form responses for Sarah & Priya
  const sarahId = db.prepare("SELECT id FROM bookings WHERE guest_name='Sarah Mehta'").get()?.id;
  const priyaId = db.prepare("SELECT id FROM bookings WHERE guest_name='Priya Kapoor'").get()?.id;

  const insR = db.prepare(`INSERT INTO form_responses (id, booking_id, response_data) VALUES (?, ?, ?)`);

  if (sarahId) insR.run(uuidv4(), sarahId, JSON.stringify({
    'Purpose of stay': 'Leisure trip with family',
    'Estimated arrival time': '3:00 PM',
    'Special requests': 'Baby cot needed, quiet room preferred',
    'ID proof type': 'Aadhar Card',
    'Emergency contact': '+91 87654 32100',
    'Dietary restrictions': 'Vegetarian'
  }));

  if (priyaId) insR.run(uuidv4(), priyaId, JSON.stringify({
    'Purpose of stay': 'Business trip',
    'Estimated arrival time': '6:00 PM',
    'Special requests': 'Early check-in if possible',
    'ID proof type': 'Passport',
    'Emergency contact': '+91 76543 21098',
    'Dietary restrictions': 'None'
  }));

  // Default settings
  const insSetting = db.prepare("INSERT OR IGNORE INTO host_settings VALUES (?, ?)");
  insSetting.run('property_name', 'My Property');
  insSetting.run('price_per_night', '4100');
  insSetting.run('google_form_link', 'https://docs.google.com/forms/d/e/1FAIpQLSd2alh5nDBuQzWE34_8w5yCzINGE6hhHvy2NO-b44Noxz23yg/viewform?usp=header');

  console.log('✅ Demo data seeded!');
}

// Seed default email settings
const insSettingDefault = db.prepare("INSERT OR IGNORE INTO host_settings VALUES (?, ?)");
insSettingDefault.run('gmail_user', '');
insSettingDefault.run('gmail_app_password', '');

// ── Helpers ─────────────────────────────────────────────────
const COLORS = ['#0d9488','#6366f1','#f59e0b','#ec4899','#14b8a6','#8b5cf6','#f97316','#06b6d4'];
let colorIdx = db.prepare('SELECT COUNT(*) as c FROM bookings').get().c;
const nextColor = () => COLORS[colorIdx++ % COLORS.length];
const getInitials = name => name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

const withResponses = (b) => {
  const resp = db.prepare('SELECT * FROM form_responses WHERE booking_id = ? ORDER BY submitted_at DESC LIMIT 1').get(b.id);
  return {
    ...b,
    form_sent: !!b.form_sent,
    form_responded: !!resp,
    form_responses: resp ? JSON.parse(resp.response_data) : {}
  };
};

// ── ROUTES ──────────────────────────────────────────────────

// Authentication endpoints
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  
  const user = USERS[username];
  
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  
  const token = generateToken();
  VALID_TOKENS.add(token);
  
  res.json({
    success: true,
    token,
    username,
    name: user.name
  });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token) {
    VALID_TOKENS.delete(token);
  }
  
  res.json({ success: true });
});

app.get('/api/auth/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !VALID_TOKENS.has(token)) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  res.json({ success: true });
});

// Protected routes - require authentication
// GET /api/bookings
app.get('/api/bookings', requireAuth, (req, res) => {
  const { month, year } = req.query;
  let q = "SELECT * FROM bookings WHERE status != 'cancelled'";
  const p = [];
  if (month !== undefined && year !== undefined) {
    q += " AND strftime('%m', check_in) = ? AND strftime('%Y', check_in) = ?";
    p.push(String(parseInt(month) + 1).padStart(2, '0'), String(year));
  }
  q += ' ORDER BY check_in ASC';
  const rows = db.prepare(q).all(...p);
  res.json({ success: true, data: rows.map(withResponses) });
});

// GET /api/bookings/:id
app.get('/api/bookings/:id', requireAuth, (req, res) => {
  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ success: false, message: 'Not found' });
  res.json({ success: true, data: withResponses(b) });
});

// POST /api/bookings
app.post('/api/bookings', requireAuth, (req, res) => {
  const { guest_name, guest_email, guest_phone, check_in, check_out, check_in_time, check_out_time, guests, amount } = req.body || {};
  const requiredFields = {
    guest_name,
    guest_email,
    guest_phone,
    check_in,
    check_out,
    check_in_time,
    check_out_time,
    guests,
    amount
  };

  const missingFields = Object.entries(requiredFields)
    .filter(([, v]) => v === undefined || v === null || String(v).trim() === '')
    .map(([k]) => k);

  if (missingFields.length) {
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missingFields.join(', ')}`
    });
  }

  const parsedAmount = parseInt(amount, 10);
  if (Number.isNaN(parsedAmount) || parsedAmount <= 0)
    return res.status(400).json({ success: false, message: 'Amount is required and must be greater than 0' });

  const parsedGuests = parseInt(guests, 10);
  if (Number.isNaN(parsedGuests) || parsedGuests <= 0)
    return res.status(400).json({ success: false, message: 'Guests is required and must be greater than 0' });

  const newCheckIn = check_in_time;
  const newCheckOut = check_out_time;

  // Check for overlapping bookings with time consideration
  const overlap = db.prepare(`
    SELECT guest_name, check_in, check_out, check_in_time, check_out_time FROM bookings 
    WHERE status != 'cancelled' 
    AND NOT (
      (check_out < ? OR (check_out = ? AND check_out_time <= ?)) OR
      (check_in > ? OR (check_in = ? AND check_in_time >= ?))
    )
  `).get(check_in, check_in, newCheckIn, check_out, check_out, newCheckOut);

  if (overlap) {
    const overlapCheckIn = `${overlap.check_in} ${overlap.check_in_time}`;
    const overlapCheckOut = `${overlap.check_out} ${overlap.check_out_time}`;
    return res.status(409).json({ 
      success: false, 
      message: `Booking conflicts with ${overlap.guest_name} (${overlapCheckIn} to ${overlapCheckOut})` 
    });
  }

  const nights = Math.max(1, Math.ceil((new Date(check_out) - new Date(check_in)) / 86400000));
  const b = {
    id: uuidv4(), guest_name, guest_email,
    guest_phone,
    check_in, check_out,
    check_in_time,
    check_out_time,
    guests: parsedGuests,
    nights,
    amount: parsedAmount,
    status: 'pending',
    color: nextColor(),
    initials: getInitials(guest_name),
    form_link: '', form_sent: 0, form_sent_at: null, host_notes: ''
  };

  db.prepare(`
    INSERT INTO bookings (id,guest_name,guest_email,guest_phone,check_in,check_out,check_in_time,check_out_time,guests,nights,amount,status,color,initials,form_link,form_sent,host_notes)
    VALUES (@id,@guest_name,@guest_email,@guest_phone,@check_in,@check_out,@check_in_time,@check_out_time,@guests,@nights,@amount,@status,@color,@initials,@form_link,@form_sent,@host_notes)
  `).run(b);

  res.status(201).json({ success: true, data: { ...b, form_responded: false, form_responses: {} } });
});

// PATCH /api/bookings/:id
app.patch('/api/bookings/:id', requireAuth, (req, res) => {
  const { id } = req.params;
  if (!db.prepare('SELECT id FROM bookings WHERE id = ?').get(id))
    return res.status(404).json({ success: false, message: 'Not found' });

  const allowed = ['status','host_notes','form_link','guest_name','guest_email','guest_phone','amount'];
  const updates = {};
  allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
  if (!Object.keys(updates).length)
    return res.status(400).json({ success: false, message: 'Nothing to update' });

  updates.updated_at = new Date().toISOString();
  const set = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE bookings SET ${set} WHERE id = @id`).run({ ...updates, id });

  res.json({ success: true, data: withResponses(db.prepare('SELECT * FROM bookings WHERE id = ?').get(id)) });
});

// DELETE /api/bookings/:id  (cancel)
app.delete('/api/bookings/:id', requireAuth, (req, res) => {
  db.prepare("UPDATE bookings SET status='cancelled', updated_at=? WHERE id=?")
    .run(new Date().toISOString(), req.params.id);
  res.json({ success: true, message: 'Booking cancelled' });
});

// POST /api/bookings/:id/send-form
app.post('/api/bookings/:id/send-form', requireAuth, async (req, res) => {
  const { form_link } = req.body;
  if (!form_link) return res.status(400).json({ success: false, message: 'form_link required' });

  const b = db.prepare('SELECT * FROM bookings WHERE id = ?').get(req.params.id);
  if (!b) return res.status(404).json({ success: false, message: 'Booking not found' });

  // Get Gmail credentials from settings
  const gmailUser = db.prepare("SELECT value FROM host_settings WHERE key='gmail_user'").get()?.value;
  const gmailPass = db.prepare("SELECT value FROM host_settings WHERE key='gmail_app_password'").get()?.value;
  const propertyName = db.prepare("SELECT value FROM host_settings WHERE key='property_name'").get()?.value || 'StayBook';

  const smtpUser = String(gmailUser || '').trim();
  // Users often paste Gmail app password with spaces: "xxxx xxxx xxxx xxxx"
  const smtpPass = String(gmailPass || '').trim().replace(/\s+/g, '');

  if (!smtpUser || !smtpPass) {
    return res.status(400).json({ 
      success: false, 
      message: 'Gmail not configured. Go to Settings → add your Gmail address and App Password first.' 
    });
  }

  try {
    const mailOptions = {
      from: `"${propertyName}" <${smtpUser}>`,
      to: b.guest_email,
      subject: `${propertyName} — Please fill out your guest form`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <h2 style="color:#0d9488;margin-bottom:4px">Hello ${b.guest_name}! 👋</h2>
          <p style="color:#475569;font-size:15px;line-height:1.6">
            We're excited to host you at <strong>${propertyName}</strong>!<br>
            Please take a moment to fill out the guest form before your stay:
          </p>
          <div style="margin:24px 0">
            <a href="${form_link}" 
               style="background:#0d9488;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">
              📋 Fill Guest Form
            </a>
          </div>
          <div style="background:#f0fdfa;border-radius:10px;padding:16px;margin-top:16px">
            <p style="margin:0;font-size:13px;color:#475569"><strong>Your booking details:</strong></p>
            <p style="margin:6px 0 0;font-size:13px;color:#475569">
              📅 Check-in: ${b.check_in} at ${b.check_in_time || '14:00'}<br>
              📅 Check-out: ${b.check_out} at ${b.check_out_time || '11:00'}<br>
              👥 Guests: ${b.guests}
            </p>
          </div>
          <p style="color:#94a3b8;font-size:12px;margin-top:24px">Sent via StayBook</p>
        </div>
      `
    };

    // Resolve Gmail SMTP to IPv4 first (some cloud networks have broken IPv6 SMTP routing)
    let smtpHost = 'smtp.gmail.com';
    try {
      const lookedUp = await dns.lookup('smtp.gmail.com', { family: 4 });
      if (lookedUp?.address) smtpHost = lookedUp.address;
    } catch (e) {
      // Fallback to hostname if DNS lookup fails
    }

    // Try STARTTLS (587) first, then SSL (465)
    const smtpModes = [
      { host: smtpHost, port: 587, secure: false, requireTLS: true },
      { host: smtpHost, port: 465, secure: true }
    ];

    let sent = false;
    let lastErr = null;

    for (const mode of smtpModes) {
      try {
        const transporter = nodemailer.createTransport({
          ...mode,
          auth: { user: smtpUser, pass: smtpPass },
          connectionTimeout: 30000,
          greetingTimeout: 15000,
          socketTimeout: 30000,
          tls: { servername: 'smtp.gmail.com' }
        });

        await transporter.sendMail(mailOptions);
        sent = true;
        break;
      } catch (err) {
        lastErr = err;
        console.warn(`⚠️ SMTP send failed on port ${mode.port}:`, err.message);
      }
    }

    if (!sent) throw lastErr || new Error('SMTP send failed');

    // Update DB after successful send
    const now = new Date().toISOString();
    db.prepare("UPDATE bookings SET form_link=?, form_sent=1, form_sent_at=?, updated_at=? WHERE id=?")
      .run(form_link, now, now, req.params.id);

    console.log(`📧 Email sent to ${b.guest_email} with form link`);
    res.json({ success: true, message: `Form emailed to ${b.guest_email}` });
  } catch (err) {
    console.error('❌ Email send error:', err.message);
    res.status(500).json({ 
      success: false, 
      message: `Email failed: ${err.message}. Check your Gmail credentials in Settings.` 
    });
  }
});

// POST /api/submit-form/:booking_id  ← PUBLIC webhook (Google Form posts here)
app.post('/api/submit-form/:booking_id', (req, res) => {
  const { booking_id } = req.params;
  if (!db.prepare('SELECT id FROM bookings WHERE id = ?').get(booking_id))
    return res.status(404).json({ success: false, message: 'Booking not found' });

  const data = req.body;
  if (!data || !Object.keys(data).length)
    return res.status(400).json({ success: false, message: 'No form data' });

  db.prepare("INSERT INTO form_responses (id, booking_id, response_data) VALUES (?, ?, ?)")
    .run(uuidv4(), booking_id, JSON.stringify(data));

  db.prepare("UPDATE bookings SET status='confirmed', updated_at=? WHERE id=?")
    .run(new Date().toISOString(), booking_id);

  console.log(`📋 Form response received for booking ${booking_id}`);
  res.json({ success: true, message: 'Response saved' });
});

// GET /api/stats
app.get('/api/stats', requireAuth, (req, res) => {
  const { month, year } = req.query;
  const mm = String(parseInt(month ?? new Date().getMonth()) + 1).padStart(2, '0');
  const yy = String(year ?? new Date().getFullYear());

  const s = db.prepare(`
    SELECT COUNT(*) as total_bookings, SUM(nights) as total_nights, SUM(amount) as total_revenue,
      SUM(CASE WHEN status='confirmed' THEN 1 ELSE 0 END) as confirmed,
      SUM(CASE WHEN status='pending'   THEN 1 ELSE 0 END) as pending
    FROM bookings
    WHERE strftime('%m',check_in)=? AND strftime('%Y',check_in)=? AND status!='cancelled'
  `).get(mm, yy);

  const dim = new Date(parseInt(yy), parseInt(mm), 0).getDate();
  res.json({ success: true, data: {
    ...s,
    occupancy: s.total_nights ? Math.min(100, Math.round((s.total_nights / dim) * 100)) : 0
  }});
});

// GET /api/settings
app.get('/api/settings', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM host_settings').all();
  const out = {};
  rows.forEach(r => { out[r.key] = r.value; });
  res.json({ success: true, data: out });
});

// PATCH /api/settings
app.patch('/api/settings', requireAuth, (req, res) => {
  const upsert = db.prepare('INSERT OR REPLACE INTO host_settings (key, value) VALUES (?, ?)');
  Object.entries(req.body).forEach(([k, v]) => upsert.run(k, String(v)));
  res.json({ success: true, message: 'Settings updated' });
});

// Catch-all → redirect to login
app.get('*', (req, res) => {
  res.redirect('/');
});

// ── Start ────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏠 StayBook running on port ${PORT}`);
  console.log(`\n📡 API Endpoints:`);
  console.log(`   GET    /api/bookings`);
  console.log(`   POST   /api/bookings`);
  console.log(`   PATCH  /api/bookings/:id`);
  console.log(`   DELETE /api/bookings/:id`);
  console.log(`   POST   /api/bookings/:id/send-form`);
  console.log(`   POST   /api/submit-form/:booking_id  ← Google Forms webhook`);
  console.log(`   GET    /api/stats`);
  console.log(`   GET    /api/settings\n`);
});
