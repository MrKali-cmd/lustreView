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

const rootDir = path.join(__dirname, '..');
app.use(express.static(rootDir));

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

app.get('/api/collections', async (req, res) => {
  try {
    const rows = await sql('SELECT * FROM collections ORDER BY updated_at DESC');
    res.json(rows.map(mapRow));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/collections', (req, res) => {
  const payload = req.body || {};
  const now = new Date().toISOString().slice(0, 10);

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

  db.prepare(`
    INSERT INTO collections (
      id, name, label, tags, type, status, price, popular, rating, badge, image, description, updated_at
    ) VALUES (
      @id, @name, @label, @tags, @type, @status, @price, @popular, @rating, @badge, @image, @description, @updated_at
    )
  `).run(row);

  res.status(201).json(mapRow(row));
});

app.put('/api/collections/:id', (req, res) => {
  const payload = req.body || {};
  const now = new Date().toISOString().slice(0, 10);
  const id = req.params.id;

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

  db.prepare(`
    UPDATE collections SET
      name=@name,
      label=@label,
      tags=@tags,
      type=@type,
      status=@status,
      price=@price,
      popular=@popular,
      rating=@rating,
      badge=@badge,
      image=@image,
      description=@description,
      updated_at=@updated_at
    WHERE id=@id
  `).run(row);

  res.json(mapRow(row));
});

app.delete('/api/collections/:id', (req, res) => {
  db.prepare('DELETE FROM collections WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

app.get('/api/contact-messages', (req, res) => {
  const rows = db.prepare('SELECT * FROM contact_messages ORDER BY created_at DESC').all();
  res.json(rows.map(mapMessageRow));
});

app.post('/api/contact-messages', (req, res) => {
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

  db.prepare(`
    INSERT INTO contact_messages (
      id, name, phone, email, room_type, message, status, source, created_at, updated_at
    ) VALUES (
      @id, @name, @phone, @email, @room_type, @message, @status, @source, @created_at, @updated_at
    )
  `).run(row);

  res.status(201).json(mapMessageRow(row));
});

app.put('/api/contact-messages/:id', (req, res) => {
  const payload = req.body || {};
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(id);
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

  db.prepare(`
    UPDATE contact_messages SET
      name=@name,
      phone=@phone,
      email=@email,
      room_type=@room_type,
      message=@message,
      status=@status,
      source=@source,
      updated_at=@updated_at
    WHERE id=@id
  `).run(row);

  res.json(mapMessageRow(row));
});

app.delete('/api/contact-messages/:id', (req, res) => {
  db.prepare('DELETE FROM contact_messages WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

app.post('/api/contact-messages/:id/reply', async (req, res) => {
  const payload = req.body || {};
  const id = req.params.id;
  const existing = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(id);

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

  db.prepare(`
    UPDATE contact_messages SET
      status=@status,
      reply_message=@reply_message,
      replied_at=@replied_at,
      updated_at=@updated_at
    WHERE id=@id
  `).run(updated);

  return res.json({
    ...mapMessageRow(updated),
    emailDelivered,
    emailWarning
  });
});

app.listen(PORT, () => {
  console.log(`LustreView Blinds API running on http://localhost:${PORT}`);
});
