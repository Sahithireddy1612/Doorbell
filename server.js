import express from 'express';
import dotenv from 'dotenv';
import pkg from 'pg';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import QRCode from 'qrcode';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { createCanvas, loadImage } from 'canvas';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import mqtt from 'mqtt';
import { google } from 'googleapis';


import twilio from 'twilio';

const AccessToken = twilio.jwt.AccessToken;
const VideoGrant = AccessToken.VideoGrant;

dotenv.config();
const { Pool } = pkg;
const app = express();

const API_KEY = 'doorbell123'; // simple protection
const mqttClient = mqtt.connect('mqtt://broker.hivemq.com');
let mqttConnected = false;

mqttClient.on('connect', () => {
  console.log('Ã¢Å“â€¦ MQTT connected to broker.hivemq.com');
  mqttConnected = true;
});

mqttClient.on('error', (err) => {
  console.error('Ã¢ÂÅ’ MQTT connection error:', err);
  mqttConnected = false;
});

mqttClient.on('close', () => {
  console.log('Ã¢Å¡ Ã¯Â¸Â MQTT connection closed');
  mqttConnected = false;
});

mqttClient.on('reconnect', () => {
  console.log('Ã°Å¸â€â€ž MQTT reconnecting...');
});


const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ssl: { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static folder for QR images
const qrDir = path.resolve('./qrcodes');
if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir);
app.use('/qrcodes', express.static(qrDir));

// Multer for uploads
const upload = multer({ dest: 'uploads/' });

// AWS S3 client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Mailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: +process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

const JWT_SECRET = process.env.JWT_SECRET || 'Door_Bell';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '2h';

// new codes server.js (Update existing code or add this)

// app.post('/api/agent/login', async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     console.log('Agent login attempt:', { email, password });
//     if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

//     const q = `SELECT agent_id, agent_name, agent_email, password, role
//                FROM qr_portal.qr_agents WHERE LOWER(agent_email) = LOWER($1)`;
//     const { rows } = await pool.query(q, [email]);
//     console.log('Database query result:', rows);
//     if (!rows.length) return res.status(401).json({ message: 'Invalid credentials' });

//     const agent = rows[0];
//     if (password !== agent.password) {
//       console.log('Password mismatch for:', email);
//       return res.status(401).json({ message: 'Invalid credentials' });
//     }

//     // Ã¢Å“â€¦ Return role in lowercase for consistency
//     const payload = {
//       id: agent.agent_id,
//       email: agent.agent_email,
//       name: agent.agent_name,
//       role: 'agent', // Always lowercase
//     };

//     const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
//     console.log('Login successful for:', email);
//     return res.json({ token, user: payload });
//   } catch (err) {
//     console.error('Agent login error:', err.stack);
//     return res.status(500).json({ message: 'Internal server error' });
//   }
// });

// app.post('/api/owner/login', async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     console.log('Owner login attempt:', { email, password });
    
//     if (!email || !password) {
//       return res.status(400).json({ message: 'Email and password required' });
//     }

//     const q = `SELECT owner_id, owner_name, owner_email, password
//                FROM qr_portal.t_master_owner_details 
//                WHERE LOWER(owner_email) = LOWER($1)`;
    
//     const { rows } = await pool.query(q, [email]);
    
//     console.log('Ã¢Å“â€¦ Database query result:', rows);
    
//     if (!rows.length) {
//       console.log('Ã¢ÂÅ’ No owner found with email:', email);
//       return res.status(401).json({ message: 'Invalid credentials' });
//     }

//     const owner = rows[0];
    
//     console.log('Ã°Å¸â€Â Owner found:', {
//       owner_id: owner.owner_id,
//       owner_name: owner.owner_name,
//       owner_email: owner.owner_email
//     });
    
//     if (password !== owner.password) {
//       console.log('Ã¢ÂÅ’ Password mismatch for:', email);
//       return res.status(401).json({ message: 'Invalid credentials' });
//     }

//     // Ã¢Å“â€¦ CRITICAL FIX: Use owner_id as the id field in JWT
//     const payload = {
//       id: owner.owner_id,           // Ã¢Å“â€¦ This must match the database column
//       email: owner.owner_email,
//       name: owner.owner_name,
//       role: 'owner',
//     };

//     console.log('Ã°Å¸Å½Â« JWT Payload:', payload);

//     const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    
//     console.log('Ã¢Å“â€¦ Login successful for:', email, 'with owner_id:', owner.owner_id);
    
//     return res.json({ 
//       token, 
//       user: payload 
//     });
    
//   } catch (err) {
//     console.error('Ã¢ÂÅ’ Owner login error:', err.stack);
//     return res.status(500).json({ message: 'Internal server error' });
//   }
// });
// server.js - FIXED AUTH MIDDLEWARE WITH DEBUGGING

// Add this new endpoint to your server.js
// This replaces the need for separate /agent/login and /owner/login on frontend

// Add this new endpoint to your server.js
// This replaces the need for separate /agent/login and /owner/login on frontend

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Ã°Å¸â€Â Unified login attempt:', { 
      email, 
      password: '****', 
      rawEmail: JSON.stringify(email), 
      rawPassword: JSON.stringify(password) 
    });

    if (!email || !password) {
      console.log('Ã¢ÂÅ’ Missing email or password');
      return res.status(400).json({ message: 'Email and password required' });
    }

    // Normalize email for query
    const normalizedEmail = email.trim().toLowerCase();
    console.log('Ã°Å¸â€Â Normalized email for query:', normalizedEmail);

    // Check Agent
    const agentQuery = `
      SELECT agent_id, agent_name, agent_email, password, role
      FROM qr_portal.qr_agents 
      WHERE LOWER(agent_email) = $1
    `;
    const { rows: agentRows } = await pool.query(agentQuery, [normalizedEmail]);
    console.log('Ã°Å¸â€Â Agent query result:', { found: agentRows.length > 0, email: normalizedEmail });

    // Check Owner
    const ownerQuery = `
      SELECT owner_id, owner_name, owner_email, password
      FROM qr_portal.t_master_owner_details 
      WHERE LOWER(owner_email) = $1
    `;
    const { rows: ownerRows } = await pool.query(ownerQuery, [normalizedEmail]);
    console.log('Ã°Å¸â€Â Owner query result:', { found: ownerRows.length > 0, email: normalizedEmail });

    // Warn if email exists in both tables
    if (agentRows.length > 0 && ownerRows.length > 0) {
      console.warn('Ã¢Å¡ Ã¯Â¸Â Duplicate email found in both agent and owner tables:', normalizedEmail);
    }

    // Try Agent authentication
    if (agentRows.length > 0) {
      const agent = agentRows[0];
      console.log('Ã°Å¸â€Â Agent found:', { agent_id: agent.agent_id, agent_email: agent.agent_email });
      if (password === agent.password) {
        const payload = {
          id: agent.agent_id,
          email: agent.agent_email,
          name: agent.agent_name,
          role: 'agent',
        };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        console.log('Ã¢Å“â€¦ Agent login successful:', email);
        return res.json({ 
          token, 
          user: payload,
          message: 'Agent login successful' 
        });
      } else {
        console.log('Ã¢ÂÅ’ Invalid password for agent:', email);
        // Continue to owner check
      }
    }

    // Try Owner authentication
    if (ownerRows.length > 0) {
      const owner = ownerRows[0];
      console.log('Ã°Å¸â€Â Owner found:', { 
        owner_id: owner.owner_id, 
        owner_email: owner.owner_email, 
        stored_password: '****' 
      });
      console.log('Ã°Å¸â€Â Password comparison:', { 
        provided: '****', 
        stored: '****', 
        matches: password === owner.password 
      });
      if (password === owner.password) {
        const payload = {
          id: owner.owner_id,
          email: owner.owner_email,
          name: owner.owner_name,
          role: 'owner',
        };
        const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        console.log('Ã¢Å“â€¦ Owner login successful:', email);
        return res.json({ 
          token, 
          user: payload,
          message: 'Owner login successful' 
        });
      } else {
        console.log('Ã¢ÂÅ’ Invalid password for owner:', email);
      }
    }

    // No successful authentication
    console.log('Ã¢ÂÅ’ No valid credentials found for email:', normalizedEmail);
    return res.status(401).json({ message: 'Invalid email or password' });

  } catch (err) {
    console.error('Ã¢ÂÅ’ Unified login error:', err.message, err.stack);
    return res.status(500).json({ 
      message: 'Internal server error',
      error: err.message 
    });
  }
});

const authMiddleware = (req, res, next) => {
  const header = req.headers.authorization;
  
  console.log('Ã°Å¸â€Â Auth middleware - Authorization header:', header ? 'Present' : 'Missing');
  
  if (!header) {
    console.log('Ã¢ÂÅ’ No authorization header');
    return res.status(401).json({ message: 'No token' });
  }
  
  const [type, token] = header.split(' ');
  
  if (type !== 'Bearer') {
    console.log('Ã¢ÂÅ’ Invalid token type:', type);
    return res.status(401).json({ message: 'Invalid token type' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    console.log('Ã¢Å“â€¦ Token decoded successfully:', {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
      name: decoded.name
    });
    
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Ã¢ÂÅ’ Token verification failed:', err.message);
    return res.status(401).json({ message: 'Invalid token' });
  }
};

/* ----------------------- AGENT DASHBOARD STATS ----------------------- */
app.get('/api/agent/dashboard-stats', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const statsQuery = `
      WITH counts AS (
        SELECT 
          (SELECT COUNT(*) FROM qr_portal.t_master_owner_details) AS total_owners,
          (SELECT COUNT(*) FROM qr_portal.t_master_owner_details WHERE created_at >= NOW() - INTERVAL '7 days') AS recent_owners,
          (SELECT COUNT(*) FROM qr_portal.qr_agents) AS total_agents
      )
      SELECT total_owners, recent_owners, total_agents FROM counts;
    `;
    const { rows: statsRows } = await pool.query(statsQuery);
    const stats = statsRows[0];

    const description = `Your system currently has ${stats.total_owners} total customers, with ${stats.recent_owners} new customers added in the last 7 days. There are ${stats.total_agents} active agents managing the system. ${
      stats.recent_owners > 0 ? `Recent activity shows a growth of ${((stats.recent_owners / stats.total_owners) * 100).toFixed(1)}% in new customers this week.` : 'No new customers were added this week.'
    }`;

    const activityQuery = `
      SELECT owner_id, owner_name, owner_email, created_at
      FROM qr_portal.t_master_owner_details
      ORDER BY created_at DESC
      LIMIT 10
    `;
    const { rows: activityRows } = await pool.query(activityQuery);
    const activities = activityRows.map(owner => ({
      id: owner.owner_id,
      type: 'owner_created',
      message: `New customer added: ${owner.owner_name}`,
      email: owner.owner_email,
      timestamp: owner.created_at
    }));

    return res.json({
      success: true,
      stats: {
        totalOwners: parseInt(stats.total_owners),
        recentOwners: parseInt(stats.recent_owners),
        totalAgents: parseInt(stats.total_agents),
      },
      description,
      activities
    });
  } catch (err) {
    console.error('dashboard stats error', err);
    return res.status(500).json({ message: 'Failed to fetch dashboard data' });
  }
});

app.get('/api/agent/owners-with-stats', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Ã¢Å“â€¦ FIXED: Removed updated_at
    const ownersQuery = `
      SELECT 
        owner_id,
        owner_name,
        owner_email,
        owner_phone,
        ssid,
        dev_password,
        accesspoint_url,
        password,
        google_client_id,
        google_client_secret,
        google_refresh_token,
        google_access_token,
        google_token_expiry,
        created_at
      FROM qr_portal.t_master_owner_details
      ORDER BY created_at DESC
    `;
    
    const { rows: owners } = await pool.query(ownersQuery);

    // Get summary statistics
    const statsQuery = `
      SELECT 
        COUNT(*) as total_owners,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_owners,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as monthly_owners,
        COUNT(CASE WHEN google_refresh_token IS NOT NULL THEN 1 END) as google_connected_count,
        COUNT(CASE WHEN google_token_expiry < NOW() THEN 1 END) as expired_tokens
      FROM qr_portal.t_master_owner_details
    `;
    
    const { rows: statsRows } = await pool.query(statsQuery);
    const stats = statsRows[0];

    // Add metadata to each owner
    const ownersWithMetadata = owners.map(owner => ({
      ...owner,
      google_drive_connected: !!owner.google_refresh_token,
      account_age_days: Math.floor((Date.now() - new Date(owner.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      google_token_expired: owner.google_token_expiry 
        ? new Date(owner.google_token_expiry) < new Date() 
        : null,
    }));

    console.log(`Ã¢Å“â€¦ Fetched ${owners.length} owners with statistics`);
    
    return res.json({
      success: true,
      count: owners.length,
      stats: {
        total_owners: parseInt(stats.total_owners),
        recent_owners: parseInt(stats.recent_owners),
        monthly_owners: parseInt(stats.monthly_owners),
        google_connected: parseInt(stats.google_connected_count),
        expired_tokens: parseInt(stats.expired_tokens),
      },
      owners: ownersWithMetadata,
    });
  } catch (err) {
    console.error('Ã¢ÂÅ’ Owners with stats fetch error:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to fetch owners with statistics',
      error: err.message 
    });
  }
});

/* ----------------------- SEARCH OWNERS ----------------------- */
app.get('/api/agent/owners/search', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { q } = req.query;
    
    if (!q || q.trim() === '') {
      return res.status(400).json({ 
        success: false,
        message: 'Search query required' 
      });
    }

    const searchTerm = `%${q}%`;
    
    // Ã¢Å“â€¦ FIXED: Removed updated_at
    const query = `
      SELECT 
        owner_id,
        owner_name,
        owner_email,
        owner_phone,
        ssid,
        dev_password,
        accesspoint_url,
        password,
        google_client_id,
        google_client_secret,
        google_refresh_token,
        google_access_token,
        google_token_expiry,
        created_at
      FROM qr_portal.t_master_owner_details
      WHERE 
        LOWER(owner_name) LIKE LOWER($1) OR
        LOWER(owner_email) LIKE LOWER($1) OR
        owner_phone LIKE $1 OR
        LOWER(ssid) LIKE LOWER($1)
      ORDER BY created_at DESC
    `;
    
    const { rows } = await pool.query(query, [searchTerm]);
    
    const ownersWithMetadata = rows.map(owner => ({
      ...owner,
      google_drive_connected: !!owner.google_refresh_token,
      account_age_days: Math.floor((Date.now() - new Date(owner.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      google_token_expired: owner.google_token_expiry 
        ? new Date(owner.google_token_expiry) < new Date() 
        : null,
    }));

    console.log(`Ã¢Å“â€¦ Search "${q}" returned ${rows.length} results`);
    
    return res.json({
      success: true,
      count: rows.length,
      search_query: q,
      owners: ownersWithMetadata,
    });
  } catch (err) {
    console.error('Ã¢ÂÅ’ Owner search error:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to search owners',
      error: err.message 
    });
  }
});

/* ----------------------- UPDATE OWNER DETAILS ----------------------- */
app.put('/api/agent/owner/:ownerId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { ownerId } = req.params;
    const {
      owner_name,
      owner_email,
      owner_phone,
      ssid,
      dev_password,
      accesspoint_url,
      google_client_id,
      google_client_secret
    } = req.body;

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCounter = 1;

    if (owner_name !== undefined) {
      updates.push(`owner_name = $${paramCounter++}`);
      values.push(owner_name);
    }
    if (owner_email !== undefined) {
      updates.push(`owner_email = $${paramCounter++}`);
      values.push(owner_email);
    }
    if (owner_phone !== undefined) {
      updates.push(`owner_phone = $${paramCounter++}`);
      values.push(owner_phone);
    }
    if (ssid !== undefined) {
      updates.push(`ssid = $${paramCounter++}`);
      values.push(ssid);
    }
    if (dev_password !== undefined) {
      updates.push(`dev_password = $${paramCounter++}`);
      values.push(dev_password);
    }
    if (accesspoint_url !== undefined) {
      updates.push(`accesspoint_url = $${paramCounter++}`);
      values.push(accesspoint_url);
    }
    if (google_client_id !== undefined) {
      updates.push(`google_client_id = $${paramCounter++}`);
      values.push(google_client_id);
    }
    if (google_client_secret !== undefined) {
      updates.push(`google_client_secret = $${paramCounter++}`);
      values.push(google_client_secret);
    }

    if (updates.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'No fields to update' 
      });
    }

    // Ã¢Å“â€¦ REMOVED: updated_at = NOW() since column doesn't exist
    values.push(ownerId);

    const query = `
      UPDATE qr_portal.t_master_owner_details
      SET ${updates.join(', ')}
      WHERE owner_id = $${paramCounter}
      RETURNING *
    `;

    const { rows } = await pool.query(query, values);

    if (!rows.length) {
      return res.status(404).json({ 
        success: false,
        message: 'Owner not found' 
      });
    }

    console.log(`Ã¢Å“â€¦ Updated owner ${ownerId}`);

    return res.json({
      success: true,
      message: 'Owner updated successfully',
      owner: rows[0],
    });
  } catch (err) {
    console.error('Ã¢ÂÅ’ Owner update error:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to update owner',
      error: err.message 
    });
  }
});

/* ----------------------- DELETE OWNER ----------------------- */
app.delete('/api/agent/owner/:ownerId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { ownerId } = req.params;

    const query = `
      DELETE FROM qr_portal.t_master_owner_details
      WHERE owner_id = $1
      RETURNING owner_id, owner_name, owner_email
    `;

    const { rows } = await pool.query(query, [ownerId]);

    if (!rows.length) {
      return res.status(404).json({ 
        success: false,
        message: 'Owner not found' 
      });
    }

    console.log(`Ã¢Å“â€¦ Deleted owner ${ownerId}: ${rows[0].owner_name}`);

    return res.json({
      success: true,
      message: 'Owner deleted successfully',
      deleted_owner: rows[0],
    });
  } catch (err) {
    console.error('Ã¢ÂÅ’ Owner delete error:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to delete owner',
      error: err.message 
    });
  }
});

app.get('/api/agent/owners', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Ã¢Å“â€¦ FIXED: Removed updated_at from SELECT since it doesn't exist in your table
    const query = `
      SELECT 
        owner_id,
        owner_name,
        owner_email,
        owner_phone,
        ssid,
        dev_password,
        accesspoint_url,
        password,
        google_client_id,
        google_client_secret,
        google_refresh_token,
        google_access_token,
        google_token_expiry,
        created_at
      FROM qr_portal.t_master_owner_details
      ORDER BY created_at DESC
    `;
    
    const { rows } = await pool.query(query);
    
    console.log(`Ã¢Å“â€¦ Fetched ${rows.length} owners with complete details`);
    
    // Add computed fields for each owner
    const ownersWithMetadata = rows.map(owner => ({
      ...owner,
      // Check if Google Drive is connected
      google_drive_connected: !!owner.google_refresh_token,
      // Calculate account age in days
      account_age_days: Math.floor((Date.now() - new Date(owner.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      // Check if token is expired (if exists)
      google_token_expired: owner.google_token_expiry 
        ? new Date(owner.google_token_expiry) < new Date() 
        : null,
    }));
    
    return res.json({
      success: true,
      count: rows.length,
      owners: ownersWithMetadata,
    });
  } catch (err) {
    console.error('Ã¢ÂÅ’ Owners fetch error:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to fetch owners',
      error: err.message 
    });
  }
});


app.get('/api/agent/agents-count', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'agent') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const query = `SELECT COUNT(*) as total FROM qr_portal.qr_agents`;
    const { rows } = await pool.query(query);
    const totalAgents = parseInt(rows[0].total);

    return res.json({
      success: true,
      totalAgents,
    });
  } catch (err) {
    console.error('agents count error', err);
    return res.status(500).json({ message: 'Failed to fetch agents count' });
  }
});

// Truncated Twilio and registration endpoints remain unchanged
app.post('/api/agent/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    const re = /\S+@\S+\.\S+/;
    if (!re.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const checkQuery = `SELECT agent_id FROM qr_portal.qr_agents WHERE agent_email = $1`;
    const checkResult = await pool.query(checkQuery, [email]);
    if (checkResult.rows.length > 0) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const insertQuery = `
      INSERT INTO qr_portal.qr_agents (agent_name, agent_email, password, role)
      VALUES ($1, $2, $3, $4)
      RETURNING agent_id, agent_name, agent_email, role
    `;
    const { rows } = await pool.query(insertQuery, [name, email, password, 'agent']);
    const agent = rows[0];

    const payload = {
      id: agent.agent_id,
      email: agent.agent_email,
      name: agent.agent_name,
      role: agent.role,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    return res.json({ token, agent: payload });
  } catch (err) {
    console.error('register error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});
// Profile endpoint
app.get('/api/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    console.log('Fetching profile for agent:', userId);

    const q = `
      SELECT agent_id, agent_name, agent_email, role, created_at
      FROM qr_portal.qr_agents
      WHERE agent_id = $1
    `;
    const { rows } = await pool.query(q, [userId]);
    if (!rows.length) {
      console.log('Agent not found:', userId);
      return res.status(404).json({ message: 'Agent not found' });
    }

    const agent = rows[0];
    const profileData = {
      name: agent.agent_name,
      email: agent.agent_email,
      role: agent.role,
      phone: null, // Not available in schema
      joinedDate: agent.created_at ? agent.created_at.toISOString() : null,
      lastLogin: null, // Not available in schema
    };

    console.log('Profile data sent:', profileData);
    return res.json({ data: profileData });
  } catch (err) {
    console.error('Profile fetch error:', err.stack);
    return res.status(500).json({ message: 'Internal server error', error: err.message });
  }
});



/* ----------------------- OWNER DASHBOARD STATS ----------------------- */
// Add this to your server.js after the agent dashboard endpoint

app.get('/api/owner/dashboard-stats', authMiddleware, async (req, res) => {
  try {
    console.log('Ã°Å¸â€œÅ  Dashboard request from user:', req.user);
    
    // Check if user is an owner
    if (req.user.role !== 'owner') {
      console.log('Ã¢ÂÅ’ Access denied - user is not owner, role:', req.user.role);
      return res.status(403).json({ message: 'Access denied' });
    }

    const ownerId = req.user.id;
    
    console.log('Ã°Å¸â€Â Looking for owner with ID:', ownerId);

    // Get owner details
    const ownerQuery = `
      SELECT owner_id, owner_name, owner_email, owner_phone, 
             ssid, created_at, google_refresh_token
      FROM qr_portal.t_master_owner_details
      WHERE owner_id = $1
    `;
    
    const { rows: ownerRows } = await pool.query(ownerQuery, [ownerId]);
    
    console.log('Ã°Å¸â€Â Database query result:', ownerRows);
    
    if (!ownerRows.length) {
      console.log('Ã¢ÂÅ’ Owner not found in database with ID:', ownerId);
      return res.status(404).json({ 
        message: 'Owner not found',
        debug: { searchedId: ownerId }
      });
    }

    const owner = ownerRows[0];
    
    console.log('Ã¢Å“â€¦ Owner found:', owner.owner_name);

    // Calculate stats for this owner
    const stats = {
      devicesConnected: 3,
      videosToday: 0,
      accountAgeDays: Math.floor(
        (Date.now() - new Date(owner.created_at).getTime()) / (1000 * 60 * 60 * 24)
      ),
      googleDriveConnected: !!owner.google_refresh_token,
    };

    // Mock recent activity
    const activities = [
      {
        id: 1,
        type: 'visitor',
        message: 'Visitor at front door',
        timestamp: new Date(Date.now() - 5 * 60 * 1000),
      },
      {
        id: 2,
        type: 'package',
        message: 'Package delivery recorded',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    ];

    const description = `Welcome back, ${owner.owner_name}! Your DoorBell system has been active for ${stats.accountAgeDays} days. ${
      stats.googleDriveConnected
        ? 'Your Google Drive is connected and videos are being saved automatically.'
        : 'Connect Google Drive to automatically save your doorbell videos.'
    }`;

    console.log('Ã¢Å“â€¦ Sending dashboard data for:', owner.owner_name);

    return res.json({
      success: true,
      owner: {
        name: owner.owner_name,
        email: owner.owner_email,
        phone: owner.owner_phone,
        ssid: owner.ssid,
      },
      stats: {
        devicesConnected: stats.devicesConnected,
        videosToday: stats.videosToday,
        accountAgeDays: stats.accountAgeDays,
        googleDriveConnected: stats.googleDriveConnected,
      },
      description,
      activities,
    });
  } catch (err) {
    console.error('Ã¢ÂÅ’ Owner dashboard stats error:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to fetch dashboard data',
      error: err.message 
    });
  }
});

// Add this debug endpoint to server.js temporarily

app.get('/api/debug/check-owner', authMiddleware, async (req, res) => {
  try {
    console.log('Ã°Å¸â€Â Debug - JWT decoded user:', req.user);
    
    const ownerId = req.user.id;
    
    // Try to find with the ID from JWT
    const query1 = `
      SELECT owner_id, owner_name, owner_email 
      FROM qr_portal.t_master_owner_details 
      WHERE owner_id = $1
    `;
    const result1 = await pool.query(query1, [ownerId]);
    
    // Also try to find by email as backup
    const query2 = `
      SELECT owner_id, owner_name, owner_email 
      FROM qr_portal.t_master_owner_details 
      WHERE owner_email = $1
    `;
    const result2 = await pool.query(query2, [req.user.email]);
    
    // Get all owners to see what IDs exist
    const query3 = `
      SELECT owner_id, owner_email 
      FROM qr_portal.t_master_owner_details 
      LIMIT 5
    `;
    const result3 = await pool.query(query3);
    
    return res.json({
      jwtUser: req.user,
      searchById: {
        searched: ownerId,
        searchType: typeof ownerId,
        found: result1.rows.length > 0,
        result: result1.rows
      },
      searchByEmail: {
        searched: req.user.email,
        found: result2.rows.length > 0,
        result: result2.rows
      },
      sampleOwners: result3.rows,
      diagnosis: {
        problem: result1.rows.length === 0 ? 'Owner ID from JWT not found in database' : 'No problem detected',
        possibleCause: result2.rows.length > 0 && result1.rows.length === 0 
          ? 'ID type mismatch - JWT has different ID than database' 
          : 'Unknown'
      }
    });
  } catch (err) {
    console.error('Debug error:', err);
    return res.status(500).json({ error: err.message });
  }
});
/* ----------------------- OWNER PROFILE ENDPOINT ----------------------- */
app.get('/api/owner/profile', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ message: 'Access denied' });
    }

    const ownerId = req.user.id;

    const query = `
      SELECT owner_id, owner_name, owner_email, owner_phone, 
             ssid, created_at, google_refresh_token,
             google_client_id, google_client_secret
      FROM qr_portal.t_master_owner_details
      WHERE owner_id = $1
    `;
    
    const { rows } = await pool.query(query, [ownerId]);
    
    if (!rows.length) {
      return res.status(404).json({ message: 'Owner not found' });
    }

    const owner = rows[0];

    const profileData = {
      name: owner.owner_name,
      email: owner.owner_email,
      phone: owner.owner_phone,
      role: 'owner',
      ssid: owner.ssid,
      joinedDate: owner.created_at ? owner.created_at.toISOString() : null,
      googleDriveConnected: !!owner.google_refresh_token,
      googleClientConfigured: !!(owner.google_client_id && owner.google_client_secret),
    };

    return res.json({ 
      success: true,
      data: profileData 
    });
  } catch (err) {
    console.error('Ã¢ÂÅ’ Owner profile fetch error:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: err.message 
    });
  }
});

/* ----------------------- FETCH OWNER'S GOOGLE DRIVE FILES ----------------------- */
app.get('/api/owner/drive-files', authMiddleware, async (req, res) => {
  try {
    // Verify user is an owner
    if (req.user.role !== 'owner') {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied - Owner only' 
      });
    }

    const ownerId = req.user.id;
    console.log('Ã°Å¸â€œÂ Fetching Google Drive files for owner:', ownerId);

    // Get owner's Google credentials
    const { rows } = await pool.query(
      `SELECT google_client_id, google_client_secret, google_refresh_token, 
              google_access_token, google_token_expiry, owner_name
       FROM qr_portal.t_master_owner_details WHERE owner_id=$1`,
      [ownerId]
    );
    
    if (!rows.length) {
      return res.status(404).json({ 
        success: false,
        message: 'Owner not found' 
      });
    }

    const owner = rows[0];
    
    // Check if Google Drive is connected
    if (!owner.google_client_id || !owner.google_refresh_token) {
      return res.status(400).json({ 
        success: false,
        message: 'Google Drive not connected',
        needsAuth: true
      });
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      owner.google_client_id,
      owner.google_client_secret,
      `${process.env.BACKEND_URL}/api/owner/google-callback`
    );

    // Set credentials
    oauth2Client.setCredentials({
      refresh_token: owner.google_refresh_token,
      access_token: owner.google_access_token,
      expiry_date: owner.google_token_expiry ? new Date(owner.google_token_expiry).getTime() : null
    });

    // Refresh access token if expired
    if (oauth2Client.isTokenExpiring()) {
      console.log('Ã°Å¸â€â€ž Refreshing expired Google access token...');
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      // Update tokens in database
      await pool.query(
        `UPDATE qr_portal.t_master_owner_details 
         SET google_access_token=$1, google_token_expiry=$2 
         WHERE owner_id=$3`,
        [credentials.access_token, new Date(credentials.expiry_date), ownerId]
      );
      
      oauth2Client.setCredentials(credentials);
      console.log('Ã¢Å“â€¦ Token refreshed successfully');
    }

    // Initialize Google Drive API
    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Fetch files from Google Drive
    const response = await drive.files.list({
      pageSize: 100, // Adjust as needed
      fields: 'nextPageToken, files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink, iconLink, owners, parents)',
      orderBy: 'createdTime desc', // Most recent first
      q: "trashed=false" // Only show non-trashed files
    });

    const files = response.data.files;
    
    console.log(`Ã¢Å“â€¦ Found ${files.length} files in Google Drive`);

    // Format file data
    const formattedFiles = files.map(file => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size ? parseInt(file.size) : null,
      sizeFormatted: file.size ? formatBytes(parseInt(file.size)) : 'N/A',
      createdTime: file.createdTime,
      modifiedTime: file.modifiedTime,
      webViewLink: file.webViewLink,
      webContentLink: file.webContentLink,
      thumbnailLink: file.thumbnailLink,
      iconLink: file.iconLink,
      isVideo: file.mimeType?.startsWith('video/'),
      isImage: file.mimeType?.startsWith('image/'),
      isDocument: file.mimeType?.includes('document') || file.mimeType?.includes('pdf'),
      owners: file.owners,
      parents: file.parents
    }));

    // Get storage quota info
    let storageInfo = null;
    try {
      const aboutResponse = await drive.about.get({
        fields: 'storageQuota, user'
      });
      
      storageInfo = {
        limit: aboutResponse.data.storageQuota?.limit,
        usage: aboutResponse.data.storageQuota?.usage,
        usageInDrive: aboutResponse.data.storageQuota?.usageInDrive,
        usageFormatted: formatBytes(parseInt(aboutResponse.data.storageQuota?.usage || 0)),
        limitFormatted: formatBytes(parseInt(aboutResponse.data.storageQuota?.limit || 0)),
        userEmail: aboutResponse.data.user?.emailAddress
      };
    } catch (quotaErr) {
      console.warn('Ã¢Å¡ Ã¯Â¸Â Could not fetch storage quota:', quotaErr.message);
    }

    return res.json({
      success: true,
      count: files.length,
      files: formattedFiles,
      storageInfo,
      ownerName: owner.owner_name,
      nextPageToken: response.data.nextPageToken || null
    });

  } catch (err) {
    console.error('Ã¢ÂÅ’ Google Drive files fetch error:', err);
    
    // Handle specific Google API errors
    if (err.code === 401 || err.message?.includes('invalid_grant')) {
      return res.status(401).json({ 
        success: false,
        message: 'Google Drive authorization expired. Please reconnect.',
        needsReauth: true,
        error: err.message
      });
    }

    return res.status(500).json({ 
      success: false,
      message: 'Failed to fetch Google Drive files',
      error: err.message 
    });
  }
});

/* ----------------------- FETCH SPECIFIC FILE FROM GOOGLE DRIVE ----------------------- */
app.get('/api/owner/drive-files/:fileId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied' 
      });
    }

    const ownerId = req.user.id;
    const { fileId } = req.params;

    console.log('Ã°Å¸â€œâ€ž Fetching specific file:', fileId);

    // Get owner's Google credentials
    const { rows } = await pool.query(
      `SELECT google_client_id, google_client_secret, google_refresh_token, 
              google_access_token, google_token_expiry
       FROM qr_portal.t_master_owner_details WHERE owner_id=$1`,
      [ownerId]
    );
    
    if (!rows.length) {
      return res.status(404).json({ 
        success: false,
        message: 'Owner not found' 
      });
    }

    const owner = rows[0];
    
    if (!owner.google_client_id || !owner.google_refresh_token) {
      return res.status(400).json({ 
        success: false,
        message: 'Google Drive not connected' 
      });
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      owner.google_client_id,
      owner.google_client_secret,
      `${process.env.BACKEND_URL}/api/owner/google-callback`
    );

    oauth2Client.setCredentials({
      refresh_token: owner.google_refresh_token,
      access_token: owner.google_access_token,
      expiry_date: owner.google_token_expiry ? new Date(owner.google_token_expiry).getTime() : null
    });

    if (oauth2Client.isTokenExpiring()) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await pool.query(
        `UPDATE qr_portal.t_master_owner_details 
         SET google_access_token=$1, google_token_expiry=$2 
         WHERE owner_id=$3`,
        [credentials.access_token, new Date(credentials.expiry_date), ownerId]
      );
      oauth2Client.setCredentials(credentials);
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Get file metadata
    const fileResponse = await drive.files.get({
      fileId: fileId,
      fields: 'id, name, mimeType, size, createdTime, modifiedTime, webViewLink, webContentLink, thumbnailLink, iconLink, description, owners, parents'
    });

    const file = fileResponse.data;

    return res.json({
      success: true,
      file: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size ? parseInt(file.size) : null,
        sizeFormatted: file.size ? formatBytes(parseInt(file.size)) : 'N/A',
        createdTime: file.createdTime,
        modifiedTime: file.modifiedTime,
        webViewLink: file.webViewLink,
        webContentLink: file.webContentLink,
        thumbnailLink: file.thumbnailLink,
        iconLink: file.iconLink,
        description: file.description,
        owners: file.owners,
        parents: file.parents
      }
    });

  } catch (err) {
    console.error('Ã¢ÂÅ’ Specific file fetch error:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to fetch file details',
      error: err.message 
    });
  }
});

/* ----------------------- DELETE FILE FROM GOOGLE DRIVE ----------------------- */
app.delete('/api/owner/drive-files/:fileId', authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied' 
      });
    }

    const ownerId = req.user.id;
    const { fileId } = req.params;

    console.log('Ã°Å¸â€”â€˜Ã¯Â¸Â Deleting file:', fileId);

    // Get owner's Google credentials
    const { rows } = await pool.query(
      `SELECT google_client_id, google_client_secret, google_refresh_token, 
              google_access_token, google_token_expiry
       FROM qr_portal.t_master_owner_details WHERE owner_id=$1`,
      [ownerId]
    );
    
    if (!rows.length) {
      return res.status(404).json({ 
        success: false,
        message: 'Owner not found' 
      });
    }

    const owner = rows[0];
    
    if (!owner.google_client_id || !owner.google_refresh_token) {
      return res.status(400).json({ 
        success: false,
        message: 'Google Drive not connected' 
      });
    }

    const oauth2Client = new google.auth.OAuth2(
      owner.google_client_id,
      owner.google_client_secret,
      `${process.env.BACKEND_URL}/api/owner/google-callback`
    );

    oauth2Client.setCredentials({
      refresh_token: owner.google_refresh_token,
      access_token: owner.google_access_token,
      expiry_date: owner.google_token_expiry ? new Date(owner.google_token_expiry).getTime() : null
    });

    if (oauth2Client.isTokenExpiring()) {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await pool.query(
        `UPDATE qr_portal.t_master_owner_details 
         SET google_access_token=$1, google_token_expiry=$2 
         WHERE owner_id=$3`,
        [credentials.access_token, new Date(credentials.expiry_date), ownerId]
      );
      oauth2Client.setCredentials(credentials);
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Delete the file
    await drive.files.delete({
      fileId: fileId
    });

    console.log('Ã¢Å“â€¦ File deleted successfully:', fileId);

    return res.json({
      success: true,
      message: 'File deleted successfully',
      fileId
    });

  } catch (err) {
    console.error('Ã¢ÂÅ’ File delete error:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to delete file',
      error: err.message 
    });
  }
});

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  if (!bytes) return 'N/A';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


// ================================================
// 1. Save Google Tokens (called from Mobile App)
// ================================================
app.post('/api/owner/:ownerId/save-google-tokens', async (req, res) => {
  const { ownerId } = req.params;
  const { access_token, refresh_token, expiry_date } = req.body;

  try {
    await pool.query(`
      UPDATE qr_portal.t_master_owner_details 
      SET 
        google_access_token = $1,
        google_refresh_token = $2,
        google_token_expiry = $3
      WHERE owner_id = $4
    `, [access_token, refresh_token, expiry_date || null, ownerId]);

    console.log(`Google tokens saved for owner ${ownerId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Save tokens error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================================================
// 2. Get Google Tokens (called from Web App when QR scanned)
// ================================================
app.get('/api/owner/:ownerId/google-tokens', async (req, res) => {
  const { ownerId } = req.params;

  try {
    const { rows } = await pool.query(`
      SELECT google_access_token, google_refresh_token, google_token_expiry 
      FROM qr_portal.t_master_owner_details 
      WHERE owner_id = $1
    `, [ownerId]);

    if (!rows.length || !rows[0].google_access_token) {
      return res.json({ success: false, message: 'Google Drive not connected' });
    }

    res.json({
      success: true,
      access_token: rows[0].google_access_token,
      refresh_token: rows[0].google_refresh_token
    });
  } catch (err) {
    console.error('Get tokens error:', err);
    res.status(500).json({ success: false });
  }
});

// ================================================
// 3. Upload Video to Google Drive (proxy via backend)
// ================================================
app.post('/upload/google-drive', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No video' });

  const { ownerId, access_token } = req.body;
  const filePath = req.file.path;

  try {
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const fileMetadata = {
      name: `Doorbell_${ownerId}_${Date.now()}.webm`,
      parents: ['root'] // Change to specific folder ID if needed
    };

    const media = {
      mimeType: 'video/webm',
      body: fs.createReadStream(filePath)
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink'
    });

    fs.unlinkSync(filePath); // delete temp file

    console.log(`Video uploaded to Drive: ${response.data.id}`);
    res.json({
      success: true,
      fileId: response.data.id,
      link: response.data.webViewLink
    });

  } catch (err) {
    console.error('Google Drive upload failed:', err);
    fs.unlinkSync(filePath);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================================================
// 4. Ring Doorbell (already exists, just confirming)
// ================================================
app.post('/api/ring', (req, res) => {
  const token = req.headers['x-api-key'];
  if (token !== API_KEY) return res.status(403).json({ success: false });

  if (!mqttConnected) return res.status(503).json({ success: false, message: 'MQTT not connected' });

  mqttClient.publish('doorbell/trigger', 'buzz', { qos: 1 }, (err) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, message: 'Bell rang!' });
  });
});

// 1️⃣ FIRST: Add this function BEFORE the endpoint (if not already present)
async function sendOwnerWelcomeEmail(ownerData) {
  console.log('📧 ========== SENDING WELCOME EMAIL ==========');
  
  try {
    const { owner_email, owner_name, owner_id, password, ssid } = ownerData;
    
    console.log('📧 Email Details:', {
      to: owner_email,
      name: owner_name,
      owner_id,
      has_password: !!password
    });

    // Validate
    if (!owner_email) throw new Error('owner_email is required');
    if (!owner_name) throw new Error('owner_name is required');
    if (!password) throw new Error('password is required');

    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error('SMTP credentials not configured');
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f5f5f5; }
          .container { background: #fff; border-radius: 12px; padding: 32px; }
          .header { text-align: center; border-bottom: 2px solid #f0f0f0; padding-bottom: 24px; }
          .credential-box { background: #f8f9fa; border-left: 4px solid #4285f4; padding: 20px; margin: 20px 0; border-radius: 8px; }
          .credential-item { background: #fff; padding: 16px; margin: 12px 0; border-radius: 8px; border: 1px solid #e0e0e0; }
          .label { font-size: 11px; color: #666; text-transform: uppercase; margin-bottom: 6px; font-weight: 600; }
          .value { font-size: 18px; font-weight: 700; color: #1a1a1a; font-family: monospace; word-break: break-all; }
          .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 16px; margin: 20px 0; border-radius: 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: #1a1a1a; margin: 0;">🔔 Welcome to DoorBell!</h1>
            <p style="color: #666; margin: 8px 0 0 0;">Your Smart Doorbell Account is Ready</p>
          </div>
          
          <div style="padding: 24px 0;">
            <p style="font-size: 18px;">Hello <strong>${owner_name}</strong>,</p>
            <p>Your DoorBell owner account has been created! Use these credentials to login to the Owner Dashboard.</p>
            
            <div class="credential-box">
              <h3 style="margin: 0 0 16px 0;">🔑 Your Login Credentials</h3>
              
              <div class="credential-item">
                <div class="label">Owner ID</div>
                <div class="value">${owner_id}</div>
              </div>
              
              <div class="credential-item">
                <div class="label">Email Address</div>
                <div class="value">${owner_email}</div>
              </div>
              
              <div class="credential-item">
                <div class="label">Temporary Password</div>
                <div class="value">${password}</div>
              </div>
            </div>
            
            <div class="warning">
              <strong>⚠️ Security Notice:</strong> Please change your password after first login.
            </div>
            
            <div style="background: #e8f4fd; padding: 20px; margin: 20px 0; border-radius: 8px;">
              <h3 style="margin: 0 0 12px 0; color: #0d47a1;">📱 How to Login:</h3>
              <ol style="margin: 0; padding-left: 24px;">
                <li>Open the DoorBell mobile app</li>
                <li>Tap "Owner Login"</li>
                <li>Enter your email and password</li>
                <li>Access your dashboard</li>
              </ol>
            </div>
            
            <div class="credential-box">
              <h3 style="margin: 0 0 8px 0;">📡 Device Configuration</h3>
              <p style="margin: 0;"><strong>WiFi Network:</strong> ${ssid}</p>
            </div>
          </div>
          
          <div style="text-align: center; padding-top: 24px; border-top: 2px solid #f0f0f0; color: #666; font-size: 14px;">
            <p style="margin: 0;">DoorBell Smart Security System</p>
          </div>
        </div>
      </body>
      </html>
    `;

    console.log('📧 Sending email to:', owner_email);

    const mailOptions = {
      from: `"DoorBell System" <${process.env.SMTP_USER}>`,
      to: owner_email,
      subject: '🎉 Welcome to DoorBell - Your Account is Ready!',
      html: emailHtml,
      text: `Welcome to DoorBell, ${owner_name}!\n\nYour Login Credentials:\n- Owner ID: ${owner_id}\n- Email: ${owner_email}\n- Password: ${password}\n\nLogin via the DoorBell mobile app.\n\nYour WiFi: ${ssid}`
    };

    const info = await transporter.sendMail(mailOptions);

    console.log('✅ EMAIL SENT SUCCESSFULLY!');
    console.log('✅ Message ID:', info.messageId);
    console.log('✅ Response:', info.response);
    console.log('📧 ========================================\n');

    return { 
      success: true, 
      messageId: info.messageId,
      response: info.response 
    };

  } catch (error) {
    console.error('❌ ========================================');
    console.error('❌ EMAIL SEND FAILED!');
    console.error('❌ Error:', error.message);
    console.error('❌ Code:', error.code);
    console.error('❌ ========================================\n');
    
    return { 
      success: false, 
      error: error.message,
      code: error.code
    };
  }
}

// 2️⃣ THEN: Replace your /api/owner/create endpoint with this COMPLETE version
app.post('/api/owner/create', authMiddleware, async (req, res) => {
  try {
    console.log('\n🎯 ========== CREATE OWNER REQUEST ==========');
    
    const { 
      owner_name, 
      owner_email, 
      owner_phone, 
      ssid, 
      dev_password, 
      google_client_id, 
      google_client_secret 
    } = req.body;

    console.log('📦 Request data:', {
      owner_name,
      owner_email,
      owner_phone,
      ssid,
      has_dev_password: !!dev_password
    });

    // ===== VALIDATION =====
    if (!owner_name?.trim()) {
      return res.status(400).json({ message: 'Owner name is required' });
    }
    if (!owner_email?.trim()) {
      return res.status(400).json({ message: 'Owner email is required' });
    }
    if (!owner_phone?.trim()) {
      return res.status(400).json({ message: 'Owner phone is required' });
    }
    if (!ssid?.trim()) {
      return res.status(400).json({ message: 'SSID is required' });
    }
    if (!dev_password?.trim()) {
      return res.status(400).json({ message: 'Device password is required' });
    }

    console.log('✅ Validation passed');

    const accesspoint_url = process.env.QR_ACCESS_URL || 'http://192.168.137.1:5000';

    // ===== DATABASE INSERT =====
    console.log('💾 Inserting into database...');

    const insert = `
      INSERT INTO qr_portal.t_master_owner_details
      (owner_name, owner_email, owner_phone, ssid, dev_password, accesspoint_url, 
       google_client_id, google_client_secret)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING owner_id, owner_name, owner_email, owner_phone, ssid, dev_password, 
                accesspoint_url, password, google_client_id, google_client_secret
    `;

    const { rows } = await pool.query(insert, [
      owner_name.trim(), 
      owner_email.trim(), 
      owner_phone.trim(), 
      ssid.trim(), 
      dev_password, 
      accesspoint_url,
      google_client_id?.trim() || null, 
      google_client_secret?.trim() || null
    ]);

    if (!rows.length) {
      return res.status(500).json({ message: 'Database insert failed' });
    }

    const owner = rows[0];
    console.log('✅ Owner created:', {
      owner_id: owner.owner_id,
      owner_email: owner.owner_email,
      has_auto_password: !!owner.password
    });

    // ===== GENERATE QR CODE =====
    console.log('🎨 Generating QR code...');
    const recordUrl = `${accesspoint_url}/record?ownerId=${owner.owner_id}&ssid=${encodeURIComponent(ssid)}&pwd=${encodeURIComponent(dev_password)}`;
    const qrPath = path.join(qrDir, `${owner.owner_id}-single.png`);
    await QRCode.toFile(qrPath, recordUrl, { width: 400 });
    console.log('✅ QR code saved:', qrPath);

    // ===== ⚡ SEND WELCOME EMAIL (THIS IS THE CRITICAL PART!) =====
    console.log('\n📧 ========== EMAIL SECTION START ==========');
    let emailResult = { success: false, error: 'Not attempted' };
    
    try {
      // ✅ MAKE SURE password exists before sending email
      if (!owner.password) {
        console.warn('⚠️ No auto-generated password found, skipping email');
        emailResult = { success: false, error: 'No password generated' };
      } else {
        console.log('📧 Calling sendOwnerWelcomeEmail...');
        
        emailResult = await sendOwnerWelcomeEmail({
          owner_email: owner.owner_email,
          owner_name: owner.owner_name,
          owner_id: owner.owner_id,
          password: owner.password,
          ssid: owner.ssid
        });

        if (emailResult.success) {
          console.log('✅ Email sent successfully to:', owner.owner_email);
        } else {
          console.error('⚠️ Email send failed:', emailResult.error);
        }
      }
    } catch (emailError) {
      console.error('❌ Email exception:', emailError.message);
      emailResult = { success: false, error: emailError.message };
    }
    console.log('📧 ========== EMAIL SECTION END ==========\n');

    // ===== RESPONSE =====
    const response = {
      success: true,
      message: 'Owner created successfully',
      owner: {
        owner_id: owner.owner_id,
        owner_name: owner.owner_name,
        owner_email: owner.owner_email,
        ssid: owner.ssid,
        dev_password: owner.dev_password,
        accesspoint_url: owner.accesspoint_url,
        google_client_id: owner.google_client_id || null,
        google_client_secret: owner.google_client_secret || null
      },
      qr_image: `/qrcodes/${owner.owner_id}-single.png`,
      recordUrl,
      // ✅ Include email status in response
      emailSent: emailResult.success,
      emailError: !emailResult.success ? emailResult.error : null
    };

    console.log('🎉 Response prepared');
    console.log('📧 Email sent:', emailResult.success);
    console.log('🎯 ========================================\n');
    
    res.json(response);

  } catch (err) {
    console.error('❌ CRITICAL ERROR:', err.message);
    console.error('❌ Stack:', err.stack);
    res.status(500).json({ 
      message: 'Failed to create owner',
      error: err.message
    });
  }
});

// ============================================
// 3️⃣ OPTIONAL: Test endpoint to verify email works
// ============================================
app.get('/api/test/email/:email', async (req, res) => {
  try {
    const testEmail = req.params.email;
    
    console.log('📧 Testing email send to:', testEmail);
    
    const info = await transporter.sendMail({
      from: `"DoorBell Test" <${process.env.SMTP_USER}>`,
      to: testEmail,
      subject: '✅ Test Email from DoorBell',
      html: `
        <h2>🎉 Email Configuration Working!</h2>
        <p>If you receive this, your SMTP setup is correct.</p>
        <p>Time: ${new Date().toISOString()}</p>
      `,
      text: `Email working! Time: ${new Date().toISOString()}`
    });

    console.log('✅ Test email sent:', info.messageId);
    
    res.json({ 
      success: true, 
      message: 'Test email sent successfully',
      messageId: info.messageId,
      to: testEmail
    });
  } catch (err) {
    console.error('❌ Test email failed:', err);
    res.status(500).json({ 
      success: false, 
      error: err.message,
      code: err.code
    });
  }
});


// ---------------------------------------------------------------
// SEND MOBILE OAUTH CONFIG TO FRONTEND
// ---------------------------------------------------------------
// server.js - Add this endpoint
// Replace the existing endpoint with this:
app.get('/api/config/google-oauth', (req, res) => {
  // ✅ Use Web Client ID consistently
  const webClientId = process.env.WEB_GOOGLE_CLIENT_ID;
  
  console.log('📱 OAuth config requested');
  console.log('🔑 Web Client ID available:', !!webClientId);
  console.log('🔑 Client ID (first 30 chars):', webClientId?.substring(0, 30) + '...');
  
  if (!webClientId) {
    return res.status(500).json({ 
      success: false,
      message: 'WEB_GOOGLE_CLIENT_ID not configured in environment variables' 
    });
  }
  
  res.json({
    success: true,
    androidClientId: webClientId, // Keep property name for backward compatibility
    webClientId: webClientId,
    redirectUri: 'https://doorbell-qckk.onrender.com/api/oauth/mobile-redirect'
  });
});
app.get('/api/owner/:ownerId/google-auth-url', async (req, res) => {
  try {
    const { ownerId } = req.params;
    console.log('ðŸ”— Generating Google auth URL for owner:', ownerId);

    const { rows } = await pool.query(
      'SELECT google_client_id, google_client_secret, owner_name FROM qr_portal.t_master_owner_details WHERE owner_id = $1',
      [ownerId]
    );

    if (!rows.length) {
      return res.status(404).json({ 
        success: false,
        message: 'Owner not found' 
      });
    }

    const owner = rows[0];

    if (!owner.google_client_id || !owner.google_client_secret) {
      return res.status(400).json({ 
        success: false,
        message: 'Google Client ID and Secret not configured' 
      });
    }

    const { google_client_id, google_client_secret } = owner;

    // âœ… CRITICAL: Use consistent redirect URI
    const backendUrl = process.env.BACKEND_URL || 'http://192.168.137.1:5000';
    const redirectUri = `${backendUrl}/api/owner/google-callback`;
    
    console.log('ðŸ”— Using Redirect URI:', redirectUri);

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      google_client_id,
      google_client_secret,
      redirectUri
    );

    // Generate authorization URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.appdata'
      ],
      state: JSON.stringify({ ownerId }),
      prompt: 'consent'
    });

    console.log('âœ… Auth URL generated');

    return res.json({ 
      success: true,
      authUrl,
      redirectUri
    });

  } catch (err) {
    console.error('âŒ Error generating auth URL:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to generate authorization URL',
      error: err.message 
    });
  }
});

// Replace in server.js

app.post('/api/owner/:ownerId/google-auth-callback', async (req, res) => {
  const { ownerId } = req.params;
  const { code, code_verifier } = req.body;

  console.log('📱 Mobile callback for owner:', ownerId);

  if (!code || !code_verifier) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing code or verifier' 
    });
  }

  try {
    const { rows } = await pool.query(
      `SELECT google_client_id, google_client_secret, owner_name, owner_email
       FROM qr_portal.t_master_owner_details WHERE owner_id=$1`,
      [ownerId]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: 'Owner not found'
      });
    }

    const owner = rows[0];

    if (!owner.google_client_id || !owner.google_client_secret) {
      return res.status(400).json({
        success: false,
        message: 'Google credentials not configured'
      });
    }

    // ✅ Use mobile client for token exchange
    const mobileOAuthClient = new google.auth.OAuth2(
      process.env.GOOGLE_MOBILE_CLIENT_ID,
      null, // Android clients don't have secrets
      'doorbellapp://oauth2redirect' // ✅ MUST match exactly
    );

    console.log('🔄 Exchanging code...');

    const { tokens } = await mobileOAuthClient.getToken({
      code: code,
      code_verifier: code_verifier
    });

    console.log('📦 Tokens:', {
      hasAccess: !!tokens.access_token,
      hasRefresh: !!tokens.refresh_token
    });

    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    // Save tokens
    await pool.query(
      `UPDATE qr_portal.t_master_owner_details 
       SET google_access_token = $1,
           google_refresh_token = COALESCE($2, google_refresh_token),
           google_token_expiry = $3
       WHERE owner_id = $4`,
      [
        tokens.access_token,
        tokens.refresh_token || null,
        tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        ownerId
      ]
    );

    console.log('✅ Saved tokens');

    return res.json({
      success: true,
      message: 'Connected',
      hasRefreshToken: !!tokens.refresh_token,
      ownerEmail: owner.owner_email
    });

  } catch (err) {
    console.error('❌ Token error:', err);
    
    return res.status(500).json({
      success: false,
      message: err.message || 'Token exchange failed',
      error: err.message
    });
  }
});
  
app.get('/api/owner/:ownerId/google-status', async (req, res) => {
  try {
    const { ownerId } = req.params;
    
    console.log('🔍 Checking Google Drive status for owner:', ownerId);
    
    const { rows } = await pool.query(
      `SELECT 
        google_refresh_token,
        google_access_token,
        google_token_expiry,
        owner_name,
        owner_email
       FROM qr_portal.t_master_owner_details 
       WHERE owner_id = $1`,
      [ownerId]
    );

    if (!rows.length) {
      console.error('❌ Owner not found:', ownerId);
      return res.status(404).json({ 
        success: false,
        message: 'Owner not found' 
      });
    }

    const owner = rows[0];
    
    const isConnected = !!owner.google_refresh_token;
    const hasValidToken = owner.google_token_expiry 
      ? new Date(owner.google_token_expiry) > new Date()
      : false;

    console.log('📊 Status:', {
      owner: owner.owner_name,
      isConnected,
      hasValidToken,
      tokenExpiry: owner.google_token_expiry
    });

    return res.json({
      success: true,
      status: {
        isConnected,
        hasValidToken,
        tokenExpiry: owner.google_token_expiry,
      },
      owner: {
        name: owner.owner_name,
        email: owner.owner_email
      },
      message: isConnected 
        ? '✅ Google Drive is connected' 
        : '❌ Google Drive not connected'
    });

  } catch (err) {
    console.error('❌ Status check error:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Failed to check status',
      error: err.message 
    });
  }
});

// Helper function to refresh expired tokens (use when making Drive API calls)
async function refreshGoogleTokenIfNeeded(ownerId) {
  try {
    const { rows } = await pool.query(
      `SELECT google_client_id, google_client_secret, google_refresh_token,
              google_access_token, google_token_expiry
       FROM qr_portal.t_master_owner_details WHERE owner_id=$1`,
      [ownerId]
    );
    
    if (!rows.length || !rows[0].google_refresh_token) {
      return null;
    }

    const owner = rows[0];
    
    const oauth2Client = new google.auth.OAuth2(
      owner.google_client_id,
      owner.google_client_secret,
      'com.doorbell.app://oauth-callback'
    );

    oauth2Client.setCredentials({
      refresh_token: owner.google_refresh_token,
      access_token: owner.google_access_token,
      expiry_date: owner.google_token_expiry ? new Date(owner.google_token_expiry).getTime() : null
    });

    // Check if token is expiring
    if (oauth2Client.isTokenExpiring()) {
      console.log('🔄 Refreshing expired access token...');
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      await pool.query(
        `UPDATE qr_portal.t_master_owner_details 
         SET google_access_token=$1, google_token_expiry=$2 
         WHERE owner_id=$3`,
        [credentials.access_token, new Date(credentials.expiry_date), ownerId]
      );
      
      oauth2Client.setCredentials(credentials);
      console.log('✅ Token refreshed successfully');
    }

    return oauth2Client;
  } catch (err) {
    console.error('❌ Token refresh error:', err);
    return null;
  }
}
app.post('/api/owner/:ownerId/google-auth-callback-mobile', async (req, res) => {
  const { ownerId } = req.params;
  const { code, code_verifier, customerClientId, customerClientSecret } = req.body;

  console.log('📱 Mobile OAuth callback for owner:', ownerId);

  if (!code || !code_verifier) {
    return res.status(400).json({ 
      success: false, 
      message: 'Missing code or verifier' 
    });
  }

  try {
    // Use mobile client to exchange code (no secret needed for Android)
    const mobileClientId = process.env.GOOGLE_MOBILE_CLIENT_ID;

    const oauth2Client = new google.auth.OAuth2(
      mobileClientId,
      null, // Android clients don't have secrets
      'com.doorbell.app:/oauth2redirect'
    );

    const { tokens } = await oauth2Client.getToken({
      code: code,
      code_verifier: code_verifier
    });

    if (!tokens.access_token) {
      throw new Error('No access token received');
    }

    // Store tokens with customer credentials
    await pool.query(
      `UPDATE qr_portal.t_master_owner_details 
       SET google_access_token = $1,
           google_refresh_token = COALESCE($2, google_refresh_token),
           google_token_expiry = $3,
           google_client_id = $4,
           google_client_secret = $5
       WHERE owner_id = $6`,
      [
        tokens.access_token,
        tokens.refresh_token || null,
        tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        customerClientId,
        customerClientSecret,
        ownerId
      ]
    );

    console.log('✅ Tokens stored with customer credentials');

    return res.json({
      success: true,
      message: 'Google Drive connected successfully',
      hasRefreshToken: !!tokens.refresh_token
    });

  } catch (err) {
    console.error('❌ Token exchange error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to exchange authorization code',
      error: err.message
    });
  }
});
// Update the uploadToGoogleDrive function to use the helper
async function uploadToGoogleDrive(ownerId, filePath, fileName, mimeType) {
  try {
    console.log('📤 Starting Google Drive upload for owner:', ownerId);

    const { rows } = await pool.query(
      `SELECT google_client_id, google_client_secret, google_refresh_token, 
              google_access_token, google_token_expiry, owner_name
       FROM qr_portal.t_master_owner_details WHERE owner_id=$1`,
      [ownerId]
    );
    
    if (!rows.length) {
      return { success: false, error: 'Owner not found' };
    }

    const owner = rows[0];
    
    if (!owner.google_client_id || !owner.google_refresh_token) {
      return { success: false, error: 'Google Drive not connected' };
    }

    // 🔥 Use CUSTOMER's credentials for uploads (uses their quota)
    const oauth2Client = new google.auth.OAuth2(
      owner.google_client_id,
      owner.google_client_secret,
      'com.doorbell.app://oauth-callback'
    );

    oauth2Client.setCredentials({
      refresh_token: owner.google_refresh_token,
      access_token: owner.google_access_token,
      expiry_date: owner.google_token_expiry ? new Date(owner.google_token_expiry).getTime() : null
    });

    // Refresh if needed
    if (oauth2Client.isTokenExpiring()) {
      console.log('🔄 Refreshing expired access token...');
      const { credentials } = await oauth2Client.refreshAccessToken();
      
      await pool.query(
        `UPDATE qr_portal.t_master_owner_details 
         SET google_access_token=$1, google_token_expiry=$2 
         WHERE owner_id=$3`,
        [credentials.access_token, new Date(credentials.expiry_date), ownerId]
      );
      
      oauth2Client.setCredentials(credentials);
      console.log('✅ Token refreshed successfully');
    }

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    // Create/find folder
    let folderId;
    try {
      const folderSearch = await drive.files.list({
        q: "name='DoorBell Videos' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields: 'files(id, name)',
        spaces: 'drive'
      });

      if (folderSearch.data.files?.length > 0) {
        folderId = folderSearch.data.files[0].id;
      } else {
        const folder = await drive.files.create({
          resource: {
            name: 'DoorBell Videos',
            mimeType: 'application/vnd.google-apps.folder'
          },
          fields: 'id'
        });
        folderId = folder.data.id;
      }
    } catch (folderErr) {
      console.warn('⚠️ Could not create/find folder');
      folderId = 'root';
    }

    // Upload file
    const fileMetadata = {
      name: fileName,
      parents: [folderId]
    };

    const media = {
      mimeType: mimeType,
      body: fs.createReadStream(filePath)
    };

    const response = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id, name, webViewLink, webContentLink, size, createdTime'
    });

    console.log('✅ Upload successful! File ID:', response.data.id);

    return {
      success: true,
      fileId: response.data.id,
      fileName: response.data.name,
      webViewLink: response.data.webViewLink,
      webContentLink: response.data.webContentLink,
      size: response.data.size,
      createdTime: response.data.createdTime
    };

  } catch (err) {
    console.error('❌ Google Drive upload error:', err);
    return {
      success: false,
      error: err.message
    };
  }
}
app.get('/api/owner/:ownerId/google-config-check', async (req, res) => {
  try {
    const { ownerId } = req.params;
    
    const { rows } = await pool.query(
      'SELECT google_client_id, google_client_secret, google_refresh_token, owner_name, owner_email FROM qr_portal.t_master_owner_details WHERE owner_id = $1',
      [ownerId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'Owner not found' });
    }

    const owner = rows[0];
    const backendUrl = process.env.BACKEND_URL || 'http://192.168.137.1:5000';

    return res.json({
      success: true,
      owner: {
        id: ownerId,
        name: owner.owner_name,
        email: owner.owner_email
      },
      configuration: {
        hasClientId: !!owner.google_client_id,
        hasClientSecret: !!owner.google_client_secret,
        hasRefreshToken: !!owner.google_refresh_token,
        isConfigured: !!(owner.google_client_id && owner.google_client_secret),
        isConnected: !!(owner.google_refresh_token)
      },
      redirectUri: `${backendUrl}/api/owner/google-callback`,
      instructions: [
        '1. Go to Google Cloud Console',
        '2. Navigate to: APIs & Services â†’ OAuth consent screen',
        `3. Add "${owner.owner_email}" as a test user`,
        '4. Navigate to: APIs & Services â†’ Credentials',
        '5. Add this redirect URI: ' + `${backendUrl}/api/owner/google-callback`,
        '6. Save and try again'
      ]
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});
app.get('/api/owner/:ownerId/test-google-credentials', async (req, res) => {
  try {
    const { ownerId } = req.params;
    
    const { rows } = await pool.query(
      'SELECT google_client_id, google_client_secret, google_refresh_token FROM qr_portal.t_master_owner_details WHERE owner_id = $1',
      [ownerId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: 'Owner not found' });
    }

    const owner = rows[0];
    
    return res.json({
      success: true,
      hasClientId: !!owner.google_client_id,
      hasClientSecret: !!owner.google_client_secret,
      hasRefreshToken: !!owner.google_refresh_token,
      isFullyConfigured: !!(owner.google_client_id && owner.google_client_secret),
      isConnected: !!(owner.google_client_id && owner.google_client_secret && owner.google_refresh_token)
    });
  } catch (err) {
    console.error('Test credentials error:', err);
    return res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});


app.get('/api/oauth/mobile-redirect', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  
  console.log('📱 OAuth redirect received:', { 
    hasCode: !!code, 
    hasError: !!error,
    state: state 
  });
  
  let success = false;
  let errorMessage = '';
  let ownerId = null;
  let customerClientId = null;
  let customerClientSecret = null;
  
  if (error) {
    console.error('❌ OAuth error:', error, error_description);
    errorMessage = error_description || error;
  } else if (code && state) {
    try {
      // Parse state to get owner info
      const stateData = JSON.parse(state);
      ownerId = stateData.ownerId;
      customerClientId = stateData.customerClientId;
      customerClientSecret = stateData.customerClientSecret;
      
      console.log('🔄 Exchanging code for tokens for owner:', ownerId);
      
      // ✅ Use Web Client credentials from env
      const webClientId = process.env.WEB_GOOGLE_CLIENT_ID;
      const webClientSecret = process.env.WEB_GOOGLE_SECRET_KEY;
      const redirectUri = `${process.env.BACKEND_URL}/api/oauth/mobile-redirect`;
      
      console.log('🔑 Using Web Client:', webClientId?.substring(0, 30) + '...');
      console.log('🔗 Redirect URI:', redirectUri);
      
      // Exchange code for tokens using Web client
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: code,
          client_id: webClientId,
          client_secret: webClientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code'
        })
      });
      
      const tokens = await tokenResponse.json();
      
      console.log('📦 Token response:', {
        ok: tokenResponse.ok,
        hasAccess: !!tokens.access_token,
        hasRefresh: !!tokens.refresh_token,
        error: tokens.error
      });
      
      if (!tokenResponse.ok || !tokens.access_token) {
        throw new Error(tokens.error_description || tokens.error || 'Token exchange failed');
      }
      
      console.log('✅ Tokens received');
      
      // Save tokens to database using CUSTOMER's credentials
      await pool.query(
        `UPDATE qr_portal.t_master_owner_details 
         SET google_access_token = $1,
             google_refresh_token = COALESCE($2, google_refresh_token),
             google_token_expiry = $3,
             google_client_id = $4,
             google_client_secret = $5
         WHERE owner_id = $6`,
        [
          tokens.access_token,
          tokens.refresh_token || null,
          tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
          customerClientId,
          customerClientSecret,
          ownerId
        ]
      );
      
      console.log('✅ Tokens saved to database for owner:', ownerId);
      success = true;
      
    } catch (err) {
      console.error('❌ Token exchange error:', err);
      errorMessage = err.message || 'Failed to exchange authorization code';
    }
  } else {
    errorMessage = 'Missing authorization code or state';
  }
  
  // Build deep link URL for Android app
  const deepLinkScheme = 'com.camera.doorbell://oauth';
  let deepLink = deepLinkScheme;
  
  const params = new URLSearchParams();
  if (success) {
    params.append('success', 'true');
    if (ownerId) params.append('ownerId', ownerId);
  } else {
    params.append('error', errorMessage);
  }
  
  if (params.toString()) {
    deepLink += '?' + params.toString();
  }
  
  console.log('🔗 Redirecting to deep link:', deepLink);
  
  // Return HTML with automatic redirect
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${success ? '✅ Connected!' : '❌ Error'}</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, ${success ? '#10b981 0%, #059669 100%' : '#ef4444 0%, #dc2626 100%'});
          color: white;
        }
        .container {
          text-align: center;
          padding: 2rem;
          max-width: 500px;
        }
        .icon {
          font-size: 5rem;
          margin-bottom: 1.5rem;
          animation: bounce 0.5s ease-in-out;
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-20px); }
        }
        h1 { 
          margin: 0 0 1rem; 
          font-size: 2rem;
          font-weight: bold;
        }
        p { 
          margin: 0.5rem 0; 
          opacity: 0.95; 
          line-height: 1.6;
          font-size: 1.1rem;
        }
        .spinner {
          width: 50px;
          height: 50px;
          border: 4px solid rgba(255,255,255,0.3);
          border-top-color: white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 1.5rem auto;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .manual-link {
          margin-top: 2rem;
          padding: 1.5rem;
          background: rgba(255,255,255,0.2);
          border-radius: 12px;
          display: none;
        }
        .manual-link a {
          color: white;
          text-decoration: none;
          font-weight: bold;
          font-size: 1.2rem;
          padding: 12px 24px;
          background: rgba(0,0,0,0.3);
          border-radius: 8px;
          display: inline-block;
          margin-top: 10px;
        }
        .error-details {
          background: rgba(0,0,0,0.3);
          padding: 1rem;
          border-radius: 8px;
          margin-top: 1rem;
          font-size: 0.9rem;
          word-break: break-word;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">${success ? '✅' : '❌'}</div>
        <h1>${success ? 'Google Drive Connected!' : 'Authorization Failed'}</h1>
        <p>
          ${success 
            ? 'Your videos will now be automatically saved to Google Drive! 🎉' 
            : 'Something went wrong during authorization.'
          }
        </p>
        ${!success ? `<div class="error-details">Error: ${errorMessage}</div>` : ''}
        <div class="spinner"></div>
        <p style="font-size: 0.95rem;">Returning to app...</p>
        <div class="manual-link" id="manualLink">
          <p>App didn't open automatically?</p>
          <a href="${deepLink}" id="deepLinkBtn">👉 Click here to return to app</a>
        </div>
      </div>
      <script>
        console.log('Redirect URL:', '${deepLink}');
        
        // Attempt automatic redirect
        setTimeout(() => {
          window.location.href = '${deepLink}';
          
          // Show manual link after 2 seconds
          setTimeout(() => {
            document.getElementById('manualLink').style.display = 'block';
          }, 2000);
        }, 1000);
      </script>
    </body>
    </html>
  `);
});
/* ----------------------- FETCH OWNER DETAILS ----------------------- */

app.get('/api/owner/:ownerId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT owner_id, owner_name, owner_email, owner_phone, ssid, dev_password, accesspoint_url
       FROM qr_portal.t_master_owner_details WHERE owner_id=$1`,
      [req.params.ownerId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Owner not found' });
    res.json({ owner: rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching owner' });
  }
});


/* ----------------------- DUAL QR GENERATION ----------------------- */

app.post('/api/qr/generate-dual', async (req, res) => {
  try {
    const { ownerId, frontendBaseUrl } = req.body;
    if (!ownerId || !frontendBaseUrl) return res.status(400).json({ message: 'Missing ownerId/frontendBaseUrl' });

    const { rows } = await pool.query(
      `SELECT ssid, dev_password FROM qr_portal.t_master_owner_details WHERE owner_id=$1`, [ownerId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Owner not found' });
    const owner = rows[0];

    const recordUrl = `${frontendBaseUrl.replace(/\/$/, '')}/record?ownerId=${encodeURIComponent(ownerId)}&ssid=${encodeURIComponent(owner.ssid)}&pwd=${encodeURIComponent(owner.dev_password)}`;

    const wifiPayload = `WIFI:T:WPA;S:${owner.ssid};P:${owner.dev_password};;`;
    const wifiQR = await QRCode.toDataURL(wifiPayload, { errorCorrectionLevel: 'H' });
    const urlQR = await QRCode.toDataURL(recordUrl, { errorCorrectionLevel: 'H' });

    const canvas = createCanvas(800, 900);
    const ctx = canvas.getContext('2d');
    const wifiImg = await loadImage(wifiQR);
    const urlImg = await loadImage(urlQR);

    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 800, 900);
    ctx.drawImage(wifiImg, 100, 50, 600, 600);
    ctx.drawImage(urlImg, 300, 670, 200, 200);
    ctx.fillStyle = '#333';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Scan to join Wi-Fi, then video recording starts', 400, 880);

    const filename = `${ownerId}-dual.png`;
    const outPath = path.join(qrDir, filename);
    fs.writeFileSync(outPath, canvas.toBuffer('image/png'));

    res.json({
      message: 'Dual QR generated',
      qr_image: `/qrcodes/${filename}`,
      recordUrl
    });
  } catch (err) {
    console.error('dual qr err', err);
    res.status(500).json({ message: 'Failed to generate dual QR' });
  }
});

// server.js - Replace the dual QR generation with single QR

/* ----------------------- SINGLE QR GENERATION ----------------------- */
app.post('/api/qr/generate-single', async (req, res) => {
  try {
    const { ownerId, frontendBaseUrl } = req.body;
    if (!ownerId || !frontendBaseUrl) return res.status(400).json({ message: 'Missing ownerId/frontendBaseUrl' });

    const { rows } = await pool.query(
      `SELECT ssid, dev_password FROM qr_portal.t_master_owner_details WHERE owner_id=$1`, [ownerId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Owner not found' });
    const owner = rows[0];

    // Single URL with all parameters
    const recordUrl = `${frontendBaseUrl.replace(/\/$/, '')}/record?ownerId=${encodeURIComponent(ownerId)}&ssid=${encodeURIComponent(owner.ssid)}&pwd=${encodeURIComponent(owner.dev_password)}`;

    // Generate single QR with the record URL
    const canvas = createCanvas(600, 700);
    const ctx = canvas.getContext('2d');
    
    // Generate QR code
    const qrDataUrl = await QRCode.toDataURL(recordUrl, { 
      errorCorrectionLevel: 'H',
      width: 500 
    });
    const qrImg = await loadImage(qrDataUrl);

    // White background
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 600, 700);
    
    // Draw QR code
    ctx.drawImage(qrImg, 50, 50, 500, 500);
    
    // Add instruction text
    ctx.fillStyle = '#333';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Scan to Record & Connect', 300, 600);
    
    ctx.font = '16px sans-serif';
    ctx.fillText('Video Ã¢â€ â€™ WiFi Ã¢â€ â€™ Doorbell', 300, 640);

    const filename = `${ownerId}-single.png`;
    const outPath = path.join(qrDir, filename);
    fs.writeFileSync(outPath, canvas.toBuffer('image/png'));

    res.json({
      message: 'Single QR generated',
      qr_image: `/qrcodes/${filename}`,
      recordUrl
    });
  } catch (err) {
    console.error('single qr err', err);
    res.status(500).json({ message: 'Failed to generate single QR' });
  }
});
/* ----------------------- VIDEO UPLOAD + MAIL ----------------------- */

app.post('/api/upload', upload.single('video'), async (req, res) => {
  const file = req.file;
  const { ownerId } = req.body || {};
  
  if (!file) {
    console.warn('/api/upload called but no file present');
    return res.status(400).json({ message: 'No video file provided' });
  }

  console.log('/api/upload hit', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    ownerId
  });

  const key = `videos/${Date.now()}-${file.originalname.replace(/\s+/g, '_')}`;

  const unlinkLocal = async (p) => {
    try { await fs.promises.unlink(p); } catch (e) { console.warn('unlink local failed', e && e.message); }
  };

  try {
    // 1Ã¯Â¸ÂÃ¢Æ’Â£ Upload to S3 (existing)
    const s3Stream = fs.createReadStream(file.path);
    await s3.send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: s3Stream,
      ContentType: file.mimetype
    }));

    const signedUrl = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET_NAME, Key: key }),
      { expiresIn: 3600 }
    );

    // 2Ã¯Â¸ÂÃ¢Æ’Â£ Upload to Google Drive (new)
    let driveResult = null;
    if (ownerId) {
      driveResult = await uploadToGoogleDrive(
        ownerId,
        file.path,
        file.originalname,
        file.mimetype
      );
    }

    // 3Ã¯Â¸ÂÃ¢Æ’Â£ Send email notification
    let ownerEmail = null;
    let emailSent = false;
    
    if (ownerId) {
      try {
        const { rows } = await pool.query(
          `SELECT owner_email FROM qr_portal.t_master_owner_details WHERE owner_id=$1`, 
          [ownerId]
        );
        if (rows.length) ownerEmail = rows[0].owner_email;
      } catch (dbErr) {
        console.warn('owner email lookup failed', dbErr && dbErr.message);
      }

      if (ownerEmail) {
        try {
          await transporter.sendMail({
            from: `"DoorBell" <${process.env.SMTP_USER}>`,
            to: ownerEmail,
            subject: 'Ã°Å¸â€œÂ¹ New visitor video recorded',
            html: `
              <p>Hello,</p>
              <p>A visitor recorded a video for your DoorBell instance.</p>
              <h3>View Options:</h3>
              <ul>
                <li><a href="${signedUrl}">View on S3 (expires in 1 hour)</a></li>
                ${driveResult?.success ? `<li><a href="${driveResult.webViewLink}">View on Google Drive (permanent)</a></li>` : ''}
              </ul>
              ${driveResult?.success ? '<p><strong>Ã¢Å“â€¦ Video also saved to your Google Drive</strong></p>' : ''}
              ${!driveResult?.success && driveResult ? `<p>Ã¢Å¡ Ã¯Â¸Â Google Drive upload failed: ${driveResult.error}</p>` : ''}
            `
          });
          emailSent = true;
        } catch (mailErr) {
          console.warn('Failed to send notification email:', mailErr && mailErr.message);
        }
      }
    }

    return res.json({
      message: 'Upload successful',
      s3: {
        downloadUrl: signedUrl,
        s3Key: key
      },
      googleDrive: driveResult,
      emailSent,
      ownerEmail: ownerEmail || null
    });
  } catch (err) {
    console.error('upload err', err);
    return res.status(500).json({ message: 'Upload failed', detail: err.message });
  } finally {
    await unlinkLocal(file.path);
  }
});

/* ----------------------- NOTIFY OWNER FOR VIDEO CALL ----------------------- */
app.post('/api/notify-owner-call', async (req, res) => {
  try {
    const { ownerId, roomLink } = req.body;
    
    if (!ownerId || !roomLink) {
      return res.status(400).json({ message: 'ownerId and roomLink required' });
    }

    console.log('Ã°Å¸â€œÂ¹ Video call notification request:', { ownerId, roomLink });

    // Get owner details
    const { rows } = await pool.query(
      `SELECT owner_email, owner_name, owner_phone 
       FROM qr_portal.t_master_owner_details WHERE owner_id=$1`,
      [ownerId]
    );
    
    if (!rows.length) {
      return res.status(404).json({ message: 'Owner not found' });
    }
    
    const owner = rows[0];

    // Send email notification
    try {
      await transporter.sendMail({
        from: `"DoorBell" <${process.env.SMTP_USER}>`,
        to: owner.owner_email,
        subject: 'Ã°Å¸â€œÂ¹ Someone wants to video call you!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Ã°Å¸â€â€ Visitor at Your Door!</h2>
            <p>Hello ${owner.owner_name},</p>
            <p>A visitor at your doorstep wants to video call with you.</p>
            
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Join Video Call:</h3>
              <a href="${roomLink}" 
                 style="display: inline-block; background: #25D366; color: white; 
                        padding: 12px 24px; text-decoration: none; border-radius: 6px; 
                        font-weight: bold; margin-top: 10px;">
                Ã°Å¸â€œÂ¹ Join Video Call Now
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              Or copy this link: <br>
              <code style="background: #f0f0f0; padding: 4px 8px; border-radius: 4px;">
                ${roomLink}
              </code>
            </p>
            
            <p style="color: #999; font-size: 12px; margin-top: 30px;">
              This is an automated notification from your DoorBell system.
            </p>
          </div>
        `
      });

      console.log('Ã¢Å“â€¦ Video call notification sent to:', owner.owner_email);

      // Also publish to MQTT for real-time notification (optional)
      if (mqttConnected) {
        mqttClient.publish(`owner/${ownerId}/video-call`, JSON.stringify({
          roomLink,
          timestamp: Date.now()
        }));
        console.log('Ã¢Å“â€¦ MQTT notification sent');
      }

      return res.json({ 
        success: true, 
        message: 'Owner notified via email',
        ownerEmail: owner.owner_email
      });

    } catch (mailErr) {
      console.error('Ã¢ÂÅ’ Email send failed:', mailErr);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to send email notification',
        error: mailErr.message 
      });
    }

  } catch (err) {
    console.error('Ã¢ÂÅ’ notify-owner-call error', err);
    return res.status(500).json({ 
      success: false,
      message: 'Internal server error',
      error: err.message 
    });
  }
});



/* ----------------------- TWILIO VIDEO CALL (FIXED) ----------------------- */
app.post('/api/video-call/create-room', async (req, res) => {
  try {
    const { ownerId, visitorName } = req.body;
    
    if (!ownerId) {
      return res.status(400).json({ message: 'ownerId required' });
    }

    // Validate credentials
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return res.status(500).json({ 
        success: false,
        message: 'Twilio credentials not configured' 
      });
    }

    if (!process.env.TWILIO_API_KEY || !process.env.TWILIO_API_SECRET) {
      return res.status(500).json({ 
        success: false,
        message: 'Twilio API Key not configured' 
      });
    }

    console.log('Ã°Å¸â€œÂ¹ Creating Twilio video room for owner:', ownerId);

    // Get owner details
    const { rows } = await pool.query(
      `SELECT owner_email, owner_name FROM qr_portal.t_master_owner_details WHERE owner_id=$1`,
      [ownerId]
    );
    
    if (!rows.length) {
      return res.status(404).json({ message: 'Owner not found' });
    }
    
    const owner = rows[0];

    // Initialize Twilio client
    const twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    // Ã¢Å“â€¦ FIXED: Use 'group' room type (current standard)
    const room = await twilioClient.video.v1.rooms.create({
      uniqueName: `doorbell-${ownerId}-${Date.now()}`,
      type: 'group',  // Ã¢Å“â€¦ CHANGED from 'go' to 'group'
      maxParticipants: 2,
      // Optional: Add timeout settings
      unusedRoomTimeout: 5,  // Room closes after 5 minutes if no one joins
      emptyRoomTimeout: 1    // Room closes 1 minute after last person leaves
    });

    console.log('Ã¢Å“â€¦ Twilio room created:', room.sid, '- Type:', room.type);

    // Generate access tokens
    const AccessToken = twilio.jwt.AccessToken;
    const VideoGrant = AccessToken.VideoGrant;

    // Visitor token
    const visitorToken = new AccessToken(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_API_KEY,
      process.env.TWILIO_API_SECRET,
      { identity: visitorName || `Visitor-${Date.now()}` }
    );

    const videoGrant = new VideoGrant({
      room: room.uniqueName
    });
    visitorToken.addGrant(videoGrant);

    // Owner token
    const ownerToken = new AccessToken(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_API_KEY,
      process.env.TWILIO_API_SECRET,
      { identity: owner.owner_name || `Owner-${ownerId}` }
    );
    ownerToken.addGrant(videoGrant);

    // Send email notification to owner
    const joinUrl = `${process.env.FRONTEND_URL}/video-call?room=${room.uniqueName}&token=${ownerToken.toJwt()}`;

    try {
      await transporter.sendMail({
        from: `"DoorBell" <${process.env.SMTP_USER}>`,
        to: owner.owner_email,
        subject: 'Ã°Å¸â€œÂ¹ Visitor Calling at Your Door!',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Ã°Å¸â€â€ Someone at Your Doorstep!</h2>
            <p>Hello ${owner.owner_name},</p>
            <p>A visitor wants to video call with you right now.</p>
            
            <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <a href="${joinUrl}" 
                 style="display: inline-block; background: #0263E0; color: white; 
                        padding: 15px 30px; text-decoration: none; border-radius: 8px; 
                        font-weight: bold; font-size: 18px;">
                Ã°Å¸â€œÂ¹ JOIN VIDEO CALL NOW
              </a>
            </div>
            
            <p style="color: #666; font-size: 14px;">
              The visitor is waiting. Click the button above to connect immediately.
            </p>
            
            <p style="color: #999; font-size: 12px; margin-top: 30px;">
              This link is valid for 10 minutes.
            </p>
          </div>
        `
      });

      console.log('Ã¢Å“â€¦ Owner notification sent to:', owner.owner_email);

      // Optional: MQTT notification
      if (mqttConnected) {
        mqttClient.publish(`owner/${ownerId}/video-call`, JSON.stringify({
          roomName: room.uniqueName,
          joinUrl,
          timestamp: Date.now()
        }));
      }

    } catch (mailErr) {
      console.error('Ã¢ÂÅ’ Email send failed:', mailErr);
    }

    // Return visitor token
    return res.json({
      success: true,
      roomName: room.uniqueName,
      roomSid: room.sid,
      roomType: room.type,
      token: visitorToken.toJwt(),
      message: 'Owner has been notified'
    });

  } catch (err) {
    console.error('Ã¢ÂÅ’ Twilio video call error:', err);
    return res.status(500).json({
      success: false,
      message: 'Failed to create video room',
      error: err.message,
      code: err.code,
      moreInfo: err.moreInfo
    });
  }
});





/* ----------------------- START SERVER ----------------------- */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Ã°Å¸Å¡â‚¬ Server running at http://192.168.137.1:${PORT}`);
  console.log(`Ã°Å¸â€œÂ¡ MQTT Status: ${mqttConnected ? 'Connected' : 'Connecting...'}`);
});