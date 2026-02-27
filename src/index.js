const express = require('express');
const path = require('path');
const basicAuth = require('express-basic-auth');
const { getTweets, saveToPost, updateTweetStatus } = require('./services/directus');

const app = express();
const PORT = process.env.PORT || 3300;

// Require auth credentials at startup
if (!process.env.ADMIN_PASS) {
  console.error('ADMIN_PASS env var is required');
  process.exit(1);
}

const auth = basicAuth({
  users: { [process.env.ADMIN_USER || 'admin']: process.env.ADMIN_PASS },
  challenge: true,
  realm: 'MFC X Curator',
});

function validateId(id) {
  return /^\d+$/.test(id);
}

// Health check — no auth
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'mfc-xcurator' });
});

// Get scraped tweets with filtering and pagination
app.get('/api/tweets', auth, async (req, res) => {
  try {
    const { status, media_type, sort } = req.query;
    const result = await getTweets({
      status: status || 'new',
      mediaType: media_type || undefined,
      sort: sort || 'date',
      page: Math.max(1, parseInt(req.query.page, 10) || 1),
      limit: Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 40)),
    });
    res.json(result);
  } catch (err) {
    console.error('Tweets fetch error:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// Save a scraped tweet to posts collection as a draft
app.post('/api/save/:id', auth, async (req, res) => {
  try {
    if (!validateId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    const post = await saveToPost(req.params.id);
    res.json({ success: true, post });
  } catch (err) {
    console.error('Save error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Dismiss a scraped tweet
app.post('/api/dismiss/:id', auth, async (req, res) => {
  try {
    if (!validateId(req.params.id)) return res.status(400).json({ error: 'Invalid id' });
    await updateTweetStatus(req.params.id, 'dismissed');
    res.json({ success: true });
  } catch (err) {
    console.error('Dismiss error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Serve static frontend (behind auth)
app.use(auth, express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`MFC X Curator listening on port ${PORT}`);
});
