const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg'); 
const cors = require('cors');
const bcrypt = require('bcrypt'); 
const jwt = require('jsonwebtoken'); 
const nodemailer = require('nodemailer'); 
const crypto = require('crypto'); 
const { OAuth2Client } = require('google-auth-library');

const app = express();

// --- ENVIRONMENT VARIABLES (Hiding secrets for the cloud) ---
const SECRET_KEY = process.env.SECRET_KEY || "public_pile_super_secret"; 
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "482124776342-8161maq31o64v1tbn7kjem69tpnqdqcj.apps.googleusercontent.com";
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Allow your future professional domain (publicpile.xyz) to connect
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:5173"
}));

app.use(express.json({ limit: '150mb' })); 
app.use(express.urlencoded({ limit: '150mb', extended: true }));

// --- CLOUD DATABASE CONNECTION (Neon/Singapore) ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // This is mandatory for Neon/Render
  }
});

// --- EMAIL TRANSPORTER (Using App Passwords) ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'jessehianchaykingramos@gmail.com', 
    pass: process.env.EMAIL_PASS || 'qintordvmhmbvntc' 
  }
});

// --- AUTH ROUTES ---

// A. REGISTER ROUTE (With Email Validation)
app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  // Server-side email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return res.status(400).json({ error: "A valid email address is required for verification." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    await pool.query(
      'INSERT INTO users (username, email, password_hash, verification_token) VALUES ($1, $2, $3, $4)',
      [username, email, hashedPassword, verificationToken]
    );

    // Use environment variable for the link so it works on your live domain
    const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";
    const verificationLink = `${backendUrl}/verify-email/${verificationToken}`;
    
    const mailOptions = {
      from: 'PublicPile <jessehianchaykingramos@gmail.com>',
      to: email,
      subject: 'Verify your PublicPile Account',
      html: `<h3>Welcome to the Pile, ${username}!</h3>
             <p>Please click the link below to verify your email and start chatting:</p>
             <a href="${verificationLink}">${verificationLink}</a>`
    };

    transporter.sendMail(mailOptions, (err, info) => {
      if (err) console.log("Email Error:", err);
      else console.log("Verification Email Sent!");
    });

    res.status(201).json({ message: "Check your email to verify your account!" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Username or Email already exists." });
  }
});

// B. VERIFICATION LINK ROUTE
app.get('/verify-email/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const result = await pool.query(
      'UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE verification_token = $1 RETURNING username',
      [token]
    );

    if (result.rowCount > 0) {
      res.send("<h1>Email Verified!</h1><p>You can now close this tab and log in to PublicPile.</p>");
    } else {
      res.status(400).send("Invalid or expired token.");
    }
  } catch (err) {
    res.status(500).send("Server Error");
  }
});

// C. LOGIN ROUTE (Standard)
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (user.rows.length > 0) {
      if (!user.rows[0].is_verified) {
        return res.status(403).json({ error: "Please verify your email first." });
      }

      const validPassword = await bcrypt.compare(password, user.rows[0].password_hash);
      if (validPassword) {
        const token = jwt.sign({ id: user.rows[0].id, username }, SECRET_KEY, { expiresIn: '24h' });
        res.json({ token, username });
      } else {
        res.status(401).json({ error: "Incorrect password" });
      }
    } else {
      res.status(404).json({ error: "User not found" });
    }
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

// D. GOOGLE OAUTH ROUTE (With Custom Username Prompt Logic)
app.post('/auth/google', async (req, res) => {
  const { token, chosenUsername } = req.body;
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const email = payload['email'];

    let user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    if (user.rows.length === 0) {
      if (!chosenUsername) {
        return res.json({ newUser: true });
      }

      const nameCheck = await pool.query('SELECT * FROM users WHERE username = $1', [chosenUsername]);
      if (nameCheck.rows.length > 0) {
        return res.status(400).json({ error: "That username is already taken!" });
      }

      try {
        const result = await pool.query(
          'INSERT INTO users (username, email, is_verified) VALUES ($1, $2, TRUE) RETURNING username',
          [chosenUsername, email]
        );
        user = { rows: [result.rows[0]] };
      } catch (dbErr) {
        console.error("DATABASE INSERT FAILED:", dbErr.detail || dbErr.message);
        return res.status(500).json({ error: "Database could not save new Google user." });
      }
    } else {
      await pool.query('UPDATE users SET is_verified = TRUE WHERE email = $1', [email]);
    }

    const appToken = jwt.sign({ username: user.rows[0].username }, SECRET_KEY, { expiresIn: '24h' });
    res.json({ token: appToken, username: user.rows[0].username });
    
  } catch (err) {
    console.error("GOOGLE TOKEN VERIFICATION FAILED:", err.message); 
    res.status(400).json({ error: "Invalid Google Token" });
  }
});

// --- SOCKET.IO LOGIC ---
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || "http://localhost:5173", methods: ["GET", "POST"] },
  maxHttpBufferSize: 1.5e8 
});

const activeUsers = {}; 

io.on('connection', (socket) => {
  socket.on('join_pile', (username) => {
    activeUsers[socket.id] = username; 
    io.emit('active_users', Object.values(activeUsers));
  });

  socket.on('request_history', async () => {
    try {
      const result = await pool.query(
        'SELECT id, username as user, content as text, image_data as image FROM messages ORDER BY created_at ASC LIMIT 100'
      );
      socket.emit('load_messages', result.rows);
    } catch (err) {
      console.error("History Error:", err.message);
    }
  });

  socket.on('send_message', async (data) => {
    const { user, text, image } = data; 
    try {
      const result = await pool.query(
        'INSERT INTO messages (username, content, image_data) VALUES ($1, $2, $3) RETURNING id',
        [user, text, image]
      );
      const newMessage = { ...data, id: result.rows[0].id };
      io.emit('receive_message', newMessage);
    } catch (err) {
      console.error("Save Error:", err.message);
    }
  });

  socket.on('delete_message', async (data) => {
    const { messageId, user } = data;
    try {
      const result = await pool.query(
        'DELETE FROM messages WHERE id = $1 AND username = $2',
        [messageId, user]
      );
      if (result.rowCount > 0) {
        io.emit('message_deleted', messageId);
      }
    } catch (err) {
      console.error("Delete Error:", err.message);
    }
  });

  socket.on('disconnect', () => {
    const username = activeUsers[socket.id];
    if (username) {
      delete activeUsers[socket.id]; 
      io.emit('active_users', Object.values(activeUsers));
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`SERVER RUNNING ON PORT ${PORT} (SSL + EMAIL VERIFY + GOOGLE AUTH READY)`);
});