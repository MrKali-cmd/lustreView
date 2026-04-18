﻿const path = require('path');
const express = require('express');
const cors = require('cors');
const { neon } = require('@neondatabase/serverless');
require('dotenv').config();
const nodemailer = require('nodemailer');
const sessionStateHandler = require('../api/session-state.js');

const app = express();
const PORT = process.env.PORT || 3000;
const sql = neon(process.env.DATABASE_URL);

app.use(cors());
app.use(express.json());

if (process.env.NODE_ENV !== 'production') {
  const rootDir = path.join(__dirname, '..');
  app.use(express.static(rootDir));
}

app.all('/api/session-state', (req, res) => sessionStateHandler(req, res));

const mapRow = (row) => ({
  id: row.id,
  name: row.name,
  label: row.label,
  tags: row.tags,
  type: row.type,
  status: row.status,
  price: row.price,
  popular: row.popular,
  rating: row.rating,
  badge: row.badge,
  image: row.image,
  description: row.description,
  updatedAt: row.updated_at
});

const mapMessageRow = (row) => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  email: row.email || row.phone,
  roomType: row.room_type,
  message: row.message,
  status: row.status,
  source: row.source,
  replyMessage: row.reply_message || '',
  repliedAt: row.replied_at || '',
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const getMailConfigError = () => {
  const missing = [];
  if (!process.env.SMTP_HOST) missing.push('SMTP_HOST');
  if (!process.env.SMTP_USER) missing.push('SMTP_USER');
  if (!process.env.SMTP_PASS) missing.push('SMTP_PASS');
  if (!process.env.MAIL_FROM) missing.push('MAIL_FROM');
  return missing.length ? `SMTP is not configured. Missing: ${missing.join(', ')}.` : '';
};

const sendReplyEmail = async ({ to, subject, html, text }) => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
  return await transporter.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, html, text });
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

app.get('/api/collections', async (req, res) => {
  try {
    const rows = await sql('SELECT * FROM collections ORDER BY updated_at DESC');
    res.json(rows.map(mapRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/collections', async (req, res) => {
  const payload = req.body || {};
  const now = new Date().toISOString().slice(0, 10);

  try {
    const row = {
      id: payload.id || `col-${Date.now()}`,
      name: payload.name,
      label: payload.label,
      tags: payload.tags,
      type: payload.type,
      status: payload.status || 'Draft',
      price: Number(payload.price) || 0,
      popular: Number(payload.popular) || 0,
      rating: Number(payload.rating) || 0,
      badge: payload.badge || '',
      image: payload.image,
      description: payload.description,
      updated_at: payload.updatedAt || now
    };

    await sql(
      `INSERT INTO collections (id, name, label, tags, type, status, price, popular, rating, badge, image, description, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [row.id, row.name, row.label, row.tags, row.type, row.status, row.price, row.popular, row.rating, row.badge, row.image, row.description, row.updated_at]
    );

    res.status(201).json(mapRow(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/collections/:id', async (req, res) => {
  const payload = req.body || {};
  const now = new Date().toISOString().slice(0, 10);
  const id = req.params.id;

  try {
    const row = {
      id,
      name: payload.name,
      label: payload.label,
      tags: payload.tags,
      type: payload.type,
      status: payload.status || 'Draft',
      price: Number(payload.price) || 0,
      popular: Number(payload.popular) || 0,
      rating: Number(payload.rating) || 0,
      badge: payload.badge || '',
      image: payload.image,
      description: payload.description,
      updated_at: payload.updatedAt || now
    };

    await sql(
      `UPDATE collections SET name=$1, label=$2, tags=$3, type=$4, status=$5, price=$6, popular=$7, rating=$8, badge=$9, image=$10, description=$11, updated_at=$12 WHERE id=$13`,
      [row.name, row.label, row.tags, row.type, row.status, row.price, row.popular, row.rating, row.badge, row.image, row.description, row.updated_at, id]
    );

    res.json(mapRow(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/collections/:id', async (req, res) => {
  try {
    await sql('DELETE FROM collections WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/contact-messages', async (req, res) => {
  try {
    const rows = await sql('SELECT * FROM contact_messages ORDER BY created_at DESC');
    res.json(rows.map(mapMessageRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contact-messages', async (req, res) => {
  const payload = req.body || {};
  const now = new Date().toISOString();
  const gmailPattern = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;

  const row = {
    id: `msg-${Date.now()}`,
    name: String(payload.name || '').trim(),
    phone: String(payload.phone || payload.email || '').trim(),
    email: String(payload.email || payload.phone || '').trim(),
    room_type: String(payload.roomType || '').trim(),
    message: String(payload.message || '').trim(),
    status: 'New',
    source: String(payload.source || 'website'),
    created_at: now,
    updated_at: now
  };

  if (!row.name || !row.phone || !row.room_type || !row.message) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!row.email || !gmailPattern.test(row.email)) {
    return res.status(400).json({ error: 'Only Gmail addresses are allowed' });
  }

  try {
    await sql(
      `INSERT INTO contact_messages (id, name, phone, email, room_type, message, status, source, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [row.id, row.name, row.phone, row.email, row.room_type, row.message, row.status, row.source, row.created_at, row.updated_at]
    );
    res.status(201).json(mapMessageRow(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/contact-messages/:id', async (req, res) => {
  const payload = req.body || {};
  const id = req.params.id;
  const rows = await sql('SELECT * FROM contact_messages WHERE id = $1', [id]);
  const existing = rows[0];
  const messageData = payload.messageData && typeof payload.messageData === 'object' ? payload.messageData : null;

  if (!existing && !messageData) {
    return res.status(404).json({ error: 'Message not found' });
  }

  const row = {
    id,
    name: payload.name !== undefined ? String(payload.name).trim() : (existing?.name || String(messageData?.name || '').trim()),
    phone: payload.phone !== undefined ? String(payload.phone).trim() : (existing?.phone || String(messageData?.phone || '').trim()),
    email: payload.email !== undefined ? String(payload.email).trim() : (existing?.email || existing?.phone || String(messageData?.email || messageData?.phone || '').trim()),
    room_type: payload.roomType !== undefined ? String(payload.roomType).trim() : (existing?.room_type || String(messageData?.roomType || messageData?.room_type || '').trim()),
    message: payload.message !== undefined ? String(payload.message).trim() : (existing?.message || String(messageData?.message || '').trim()),
    status: payload.status || existing?.status || 'New',
    source: payload.source || existing?.source || String(messageData?.source || 'admin-panel').trim(),
    created_at: existing?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    await sql(
      `UPDATE contact_messages SET name=$1, phone=$2, email=$3, room_type=$4, message=$5, status=$6, source=$7, updated_at=$8 WHERE id=$9`,
      [row.name, row.phone, row.email, row.room_type, row.message, row.status, row.source, row.updated_at, id]
    );
    res.json(mapMessageRow(row));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/contact-messages/:id', async (req, res) => {
  try {
    await sql('DELETE FROM contact_messages WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contact-messages/:id/reply', async (req, res) => {
  const payload = req.body || {};
  const id = req.params.id;
  const rows = await sql('SELECT * FROM contact_messages WHERE id = $1', [id]);
  const existing = rows[0];

  if (!existing) {
    return res.status(404).json({ error: 'Message not found' });
  }

  const replyMessage = String(payload.reply || '').trim();
  if (!replyMessage) {
    return res.status(400).json({ error: 'Reply text is required' });
  }

  const recipient = String(existing.email || '').trim();
  if (!recipient || !recipient.includes('@')) {
    return res.status(400).json({ error: 'Recipient email is missing or invalid' });
  }

  const replySubject = payload.subject
    ? String(payload.subject).trim()
    : `Reply from LustreView Blinds for ${existing.room_type}`;

  const replyHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.7; color: #222;">
      <h2 style="margin: 0 0 16px;">LustreView Blinds</h2>
      <p>Hello ${escapeHtml(existing.name)},</p>
      <p>${escapeHtml(replyMessage).replace(/\n/g, '<br>')}</p>
      <p style="margin-top: 24px;">Best regards,<br>LustreView Blinds team</p>
    </div>
  `;

  const replyText = `Hello ${existing.name},\n\n${replyMessage}\n\nBest regards,\nLustreView Blinds team`;
  let emailDelivered = false;
  let emailWarning = getMailConfigError();

  if (!emailWarning) {
    try {
      const delivery = await sendReplyEmail({
        to: recipient,
        subject: replySubject,
        html: replyHtml,
        text: replyText
      });
      emailDelivered = delivery.delivered;
      emailWarning = delivery.reason || '';
    } catch (error) {
      emailWarning = error.message || 'Failed to send email';
    }
  }

  const updated = {
    id,
    name: existing.name,
    phone: existing.phone,
    email: existing.email,
    room_type: existing.room_type,
    message: existing.message,
    status: 'Replied',
    source: existing.source,
    reply_message: replyMessage,
    replied_at: new Date().toISOString(),
    created_at: existing.created_at,
    updated_at: new Date().toISOString()
  };

  try {
    await sql(
      `UPDATE contact_messages SET status=$1, reply_message=$2, replied_at=$3, updated_at=$4 WHERE id=$5`,
      [updated.status, updated.reply_message, updated.replied_at, updated.updated_at, id]
    );
    return res.json({
      ...mapMessageRow(updated),
      emailDelivered,
      emailWarning
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`LustreView Blinds API running on http://localhost:${PORT}`);
  });
}

module.exports = app;
