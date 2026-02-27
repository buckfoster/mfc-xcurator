const DIRECTUS_URL = process.env.DIRECTUS_URL || 'https://directus.manlyfeet.club';
const DIRECTUS_TOKEN = process.env.DIRECTUS_TOKEN;
const MEDIA_URL = process.env.MEDIA_URL || 'https://media.manlyfeet.club';

if (!DIRECTUS_TOKEN) {
  console.error('DIRECTUS_TOKEN env var is required');
  process.exit(1);
}

function headers() {
  return {
    Authorization: `Bearer ${DIRECTUS_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Query scraped_tweets from Directus with filtering, sorting, and pagination.
 */
async function getTweets({ status, mediaType, sort, page = 1, limit = 40 } = {}) {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String((page - 1) * limit),
    'fields[]': 'id,tweet_id,media_index,tweet_url,author_handle,author_name,text,media.id,media.filename_disk,media.type,media_type,like_count,retweet_count,view_count,tweeted_at,scraped_at,status',
    'meta': 'total_count,filter_count',
  });

  if (status && status !== 'all') {
    params.set('filter[status][_eq]', status);
  }

  if (mediaType === 'photo') {
    params.set('filter[media_type][_eq]', 'photo');
  } else if (mediaType === 'video') {
    params.set('filter[media_type][_in]', 'video,animated_gif');
  }

  if (sort === 'engagement') {
    params.set('sort', '-like_count');
  } else {
    params.set('sort', '-tweeted_at');
  }

  const url = `${DIRECTUS_URL}/items/scraped_tweets?${params}`;
  const res = await fetch(url, { headers: headers() });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Directus API ${res.status}: ${text}`);
  }

  const data = await res.json();
  return {
    tweets: (data.data || []).map(t => ({
      ...t,
      mediaUrl: t.media?.filename_disk ? `${MEDIA_URL}/${t.media.filename_disk}` : null,
      thumbnailUrl: t.media?.filename_disk ? `${DIRECTUS_URL}/assets/${t.media.id}?width=400&height=400&fit=cover` : null,
    })),
    total: data.meta?.filter_count || data.meta?.total_count || 0,
  };
}

/**
 * Save a scraped tweet to the posts collection as a draft.
 * Reuses the existing Directus file ID (media already in R2).
 */
async function saveToPost(tweetId) {
  // Fetch the scraped tweet
  const tweetRes = await fetch(
    `${DIRECTUS_URL}/items/scraped_tweets/${tweetId}?fields[]=id,media.id,author_handle,text`,
    { headers: headers() }
  );

  if (!tweetRes.ok) {
    const text = await tweetRes.text();
    throw new Error(`Failed to fetch tweet ${tweetId}: ${text}`);
  }

  const tweet = (await tweetRes.json()).data;

  if (!tweet.media?.id) {
    throw new Error('Tweet has no media file');
  }

  // Create a draft post with the same file reference
  const postRes = await fetch(`${DIRECTUS_URL}/items/posts`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      media: tweet.media.id,
      caption: `@${tweet.author_handle}`,
      publish_at: null,
    }),
  });

  if (!postRes.ok) {
    const text = await postRes.text();
    throw new Error(`Failed to create post: ${text}`);
  }

  const post = (await postRes.json()).data;

  // Mark scraped tweet as saved
  await updateTweetStatus(tweetId, 'saved');

  return post;
}

/**
 * Update the status of a scraped tweet (new/saved/dismissed).
 */
async function updateTweetStatus(tweetId, status) {
  const res = await fetch(`${DIRECTUS_URL}/items/scraped_tweets/${tweetId}`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update tweet ${tweetId}: ${text}`);
  }

  return (await res.json()).data;
}

module.exports = { getTweets, saveToPost, updateTweetStatus };
