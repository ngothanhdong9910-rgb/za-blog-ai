import express from 'express';
import { createServer as createViteServer } from 'vite';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import admin from 'firebase-admin';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';

// --- Firebase Admin Initialization ---
let db: admin.firestore.Firestore;
let usersCol: admin.firestore.CollectionReference;
let blogsCol: admin.firestore.CollectionReference;

function getDb() {
  if (!db) {
    try {
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
      
      if (!admin.apps.length) {
        if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
          throw new Error('Firebase environment variables are missing. Please check your .env file.');
        }

        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: privateKey,
          }),
        });
        console.log('Firebase Admin initialized successfully');
      }
      db = admin.firestore();
      usersCol = db.collection('users');
      blogsCol = db.collection('blogs');
    } catch (error) {
      console.error('Firebase Admin initialization error:', error);
      throw error;
    }
  }
  return { db, usersCol, blogsCol };
}

async function seedAdmin() {
  try {
    const { usersCol } = getDb();
    const adminSnapshot = await usersCol.where('username', '==', 'admin').limit(1).get();
    
    if (adminSnapshot.empty) {
      const hashedPassword = await bcrypt.hash('1900', 10);
      await usersCol.add({
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('Admin account seeded successfully (admin/1900)');
    }
  } catch (error) {
    console.error('Error seeding admin:', error);
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());
  
  // Seed admin on start
  await seedAdmin();

  // --- Auth Middleware ---
  const authenticateToken = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      if (err) return res.status(403).json({ error: 'Forbidden' });
      req.user = user;
      next();
    });
  };

  const tryAuthenticate = (req: any, res: any, next: any) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
      req.user = null;
      return next();
    }
    jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
      req.user = err ? null : user;
      next();
    });
  };

  // --- Auth Routes ---
  app.post('/api/auth/register', async (req, res) => {
    const { username, password } = req.body;
    if (username && username.toLowerCase() === 'admin') {
      return res.status(400).json({ error: 'Cannot register with this username' });
    }
    try {
      const { usersCol } = getDb();
      // Check if user exists
      const userSnapshot = await usersCol.where('username', '==', username).limit(1).get();
      if (!userSnapshot.empty) {
        return res.status(400).json({ error: 'Username already exists' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const userRef = await usersCol.add({
        username,
        password: hashedPassword,
        role: 'user',
        created_at: admin.firestore.FieldValue.serverTimestamp()
      });
      
      res.status(201).json({ id: userRef.id, username, role: 'user' });
    } catch (error) {
      console.error('Register Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    try {
      const { usersCol } = getDb();
      const userSnapshot = await usersCol.where('username', '==', username).limit(1).get();

      if (userSnapshot.empty) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const userDoc = userSnapshot.docs[0];
      const userData = userDoc.data();

      if (!userData.password) {
        return res.status(401).json({ error: 'This account uses social login. Please sign in with Google.' });
      }

      if (!(await bcrypt.compare(password, userData.password))) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { id: userDoc.id, username: userData.username, role: userData.role || 'user' }, 
        JWT_SECRET, 
        { expiresIn: '24h' }
      );
      res.json({ 
        token, 
        user: { 
          id: userDoc.id, 
          username: userData.username, 
          role: userData.role || 'user' 
        } 
      });
    } catch (error) {
      console.error('Login Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // --- Google OAuth ---
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim();
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET?.trim();
  
  // Robustly construct REDIRECT_URI
  const getBaseUrl = () => {
    let url = process.env.APP_URL;
    
    // If APP_URL is missing or is the placeholder, use the default dev URL
    if (!url || url === 'MY_APP_URL' || url === 'YOUR_APP_URL') {
      url = 'https://ais-dev-gml4s4622pxoq3pv3dii2h-41700831825.asia-southeast1.run.app';
    }

    // Force HTTPS for AI Studio environment
    if (url.includes('.run.app')) {
      url = url.replace('http://', 'https://');
    }
    
    // Ensure no trailing slash
    return url.endsWith('/') ? url.slice(0, -1) : url;
  };
  const REDIRECT_URI = `${getBaseUrl()}/auth/google/callback`;
  console.log('--- GOOGLE OAUTH CONFIG ---');
  console.log('REDIRECT_URI:', REDIRECT_URI);
  console.log('CLIENT_ID_EXISTS:', !!GOOGLE_CLIENT_ID);
  console.log('---------------------------');

  app.get('/api/auth/google/url', (req, res) => {
    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: 'Google Client ID is not configured in environment variables.' });
    }

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account'
    });
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.json({ url });
  });

  app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.status(400).send('No code provided');

    try {
      // Exchange code for token
      const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
        code
      });

      const accessToken = tokenRes.data.access_token;

      // Get user info
      const userRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      const { sub: googleId, name, email, picture } = userRes.data;
      const { usersCol } = getDb();

      // Find or create user
      let userSnapshot = await usersCol.where('google_id', '==', googleId).limit(1).get();
      let userDoc;

      if (userSnapshot.empty) {
        // Try finding by email
        if (email) {
          const emailSnapshot = await usersCol.where('email', '==', email).limit(1).get();
          if (!emailSnapshot.empty) {
            userDoc = emailSnapshot.docs[0];
            await userDoc.ref.update({ google_id: googleId });
          }
        }

        if (!userDoc) {
          const newUser = await usersCol.add({
            username: name || email.split('@')[0],
            email: email || null,
            google_id: googleId,
            avatar: picture || null,
            role: 'user',
            created_at: admin.firestore.FieldValue.serverTimestamp()
          });
          userDoc = await newUser.get();
        }
      } else {
        userDoc = userSnapshot.docs[0];
      }

      const userData = userDoc.data()!;
      const token = jwt.sign(
        { id: userDoc.id, username: userData.username, role: userData.role || 'user' },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      // Send success message to parent window and close popup
      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  token: '${token}', 
                  user: ${JSON.stringify({ id: userDoc.id, username: userData.username, role: userData.role || 'user' })} 
                }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('Google OAuth Error:', error);
      res.status(500).send('Authentication failed');
    }
  });

  // --- Blog Routes ---
  app.get('/api/blogs', tryAuthenticate, async (req: any, res) => {
    try {
      const { blogsCol } = getDb();
      
      if (req.user) {
        // Everyone (including admin) only sees their own blogs in the dashboard
        const userBlogsSnapshot = await blogsCol.where('user_id', '==', req.user.id).get();
        const blogs = userBlogsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))
          .sort((a: any, b: any) => {
            const dateA = a.created_at?.toDate?.() || new Date(0);
            const dateB = b.created_at?.toDate?.() || new Date(0);
            return dateB - dateA;
          });
        
        return res.json(blogs);
      } else {
        const snapshot = await blogsCol.where('user_id', '==', null).orderBy('created_at', 'desc').limit(20).get();
        const blogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(blogs);
      }
    } catch (error) {
      console.error('Fetch Blogs Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/blogs/:id', async (req: any, res) => {
    try {
      const { blogsCol } = getDb();
      const doc = await blogsCol.doc(req.params.id).get();
      if (!doc.exists) return res.status(404).json({ error: 'Blog not found' });
      res.json({ id: doc.id, ...doc.data() });
    } catch (error) {
      res.status(400).json({ error: 'Invalid blog ID' });
    }
  });

  app.post('/api/blogs', tryAuthenticate, async (req: any, res) => {
    try {
      const { blogsCol } = getDb();
      const { title, content, excerpt, tone, language } = req.body;
      const userId = req.user ? req.user.id : null;
      
      const blogData = {
        user_id: userId,
        title,
        content,
        excerpt,
        tone,
        language,
        created_at: admin.firestore.FieldValue.serverTimestamp()
      };
      
      const blogRef = await blogsCol.add(blogData);
      const savedDoc = await blogRef.get();
      
      res.status(201).json({ id: savedDoc.id, ...savedDoc.data() });
    } catch (error: any) {
      console.error('Save Blog Error:', error);
      res.status(500).json({ error: 'Internal server error', details: error.message });
    }
  });

  app.put('/api/blogs/:id', authenticateToken, async (req: any, res) => {
    try {
      const { blogsCol } = getDb();
      const { title, content, excerpt } = req.body;
      const blogId = req.params.id;
      
      const blogDoc = await blogsCol.doc(blogId).get();
      if (!blogDoc.exists) {
        return res.status(404).json({ error: 'Blog not found' });
      }
      
      if (req.user.role !== 'admin' && blogDoc.data()?.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized to edit this blog' });
      }
      
      await blogsCol.doc(blogId).update({
        title,
        content,
        excerpt,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
      
      res.json({ message: 'Blog updated successfully' });
    } catch (error: any) {
      console.error('Update Blog Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.delete('/api/blogs/:id', authenticateToken, async (req: any, res) => {
    try {
      const { blogsCol } = getDb();
      const blogId = req.params.id;
      
      const blogDoc = await blogsCol.doc(blogId).get();
      if (!blogDoc.exists) {
        return res.status(404).json({ error: 'Blog not found' });
      }
      
      if (req.user.role !== 'admin' && blogDoc.data()?.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized to delete this blog' });
      }
      
      await blogsCol.doc(blogId).delete();
      res.json({ message: 'Blog deleted successfully' });
    } catch (error: any) {
      console.error('Delete Blog Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // --- Admin Routes ---
  app.get('/api/admin/stats', authenticateToken, async (req: any, res) => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    try {
      const { usersCol } = getDb();
      const snapshot = await usersCol.get();
      res.json({ userCount: snapshot.size });
    } catch (error) {
      console.error('Fetch Stats Error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // --- Vite Integration ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

startServer();
