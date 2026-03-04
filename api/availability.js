/**
 * GET /api/availability
 *
 * Fetches rated availability from Checkfront v3 API.
 * Returns availability status, pricing, and booking SLIPs.
 *
 * Two modes:
 *   Bulk:   ?categories=3742,3752&start=YYYYMMDD&end=YYYYMMDD
 *           Returns availability for ALL items in those categories at once.
 *           This replaces the old chunked batch approach (11+ calls → 1 call).
 *
 *   Single: ?item_id=123&start=YYYYMMDD&end=YYYYMMDD
 *           Returns availability for one specific item.
 *           Used when clicking a stall that wasn't in the bulk cache.
 *
 * Checkfront v3 endpoint: GET /api/3.0/item?category_id=X&start_date=Y&end_date=Z
 * When dates are provided, v3 returns a "rated" response with pricing and SLIPs.
 */

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { categories, item_id, start, end } = req.query;

  if (!start || !end) {
    return res.status(400).json({ error: 'start and end date parameters required (YYYYMMDD)' });
  }
  if (!categories && !item_id) {
    return res.status(400).json({ error: 'categories or item_id parameter required' });
  }

  const subdomain = process.env.CF_SUBDOMAIN;
  const domain = process.env.CF_DOMAIN || 'manage.na1.bookingplatform.app';
  const baseUrl = `https://${subdomain}.${domain}/api/3.0`;

  // Build headers — include auth if credentials are configured
  const headers = { 'Accept': 'application/json' };
  if (process.env.CF_API_KEY && process.env.CF_API_SECRET) {
    const creds = Buffer.from(
      `${process.env.CF_API_KEY}:${process.env.CF_API_SECRET}`
    ).toString('base64');
    headers['Authorization'] = `Basic ${creds}`;
  }

  try {
    if (item_id) {
      // ── Single item availability ──
      const result = await fetchSingleItem(baseUrl, headers, item_id, start, end);
      return res.json(result);
    } else {
      // ── Bulk availability by category ──
      const results = await fetchBulkAvailability(baseUrl, headers, categories, start, end);
      // Short cache — availability changes frequently
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      return res.json({ results });
    }
  } catch (err) {
    console.error('Availability fetch error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};


/**
 * Fetch rated availability for a single item.
 * v3 endpoint: GET /api/3.0/item/{item_id}?start_date=X&end_date=Y
 */
async function fetchSingleItem(baseUrl, headers, itemId, start, end) {
  const url = `${baseUrl}/item/${itemId}?start_date=${start}&end_date=${end}`;
  const resp = await fetch(url, { headers });

  if (!resp.ok) {
    return { itemId: parseInt(itemId), available: false, error: `API ${resp.status}` };
  }

  const data = await resp.json();

  // v3 single-item response: data.item contains the rated item
  // Adjust these field paths if the actual v3 response differs
  const item = data.item || data;
  return normalizeItem(item);
}


/**
 * Fetch rated availability for all items in the given categories.
 * v3 endpoint: GET /api/3.0/item?category_id=X&start_date=Y&end_date=Z
 *
 * Handles pagination if there are many items (v3 uses page-based pagination).
 */
async function fetchBulkAvailability(baseUrl, headers, categories, start, end) {
  const allItems = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = `${baseUrl}/item?category_id=${encodeURIComponent(categories)}`
      + `&start_date=${start}&end_date=${end}`
      + `&page=${page}`;

    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      console.error(`Bulk availability page ${page} error: ${resp.status}`);
      break;
    }

    const data = await resp.json();

    // v3 returns items as object keyed by item_id
    const rawItems = data.items || data.item || {};
    const itemList = Array.isArray(rawItems) ? rawItems : Object.values(rawItems);

    for (const item of itemList) {
      if (item && item.item_id) {
        allItems.push(normalizeItem(item));
      }
    }

    // Check if there are more pages
    // v3 pagination: data.request.pages tells total pages
    const totalPages = (data.request && data.request.pages) || 1;
    page++;
    hasMore = page <= totalPages;
  }

  return allItems;
}


/**
 * Normalize a v3 rated item into the format the frontend expects.
 *
 * NOTE: The exact v3 response field names may need adjustment.
 * Run a test query and check the actual response structure.
 * The fields below are based on v3 API documentation.
 *
 * What the frontend expects:
 *   { itemId, available, slip, priceTitle, priceTotal, sku, name }
 */
function normalizeItem(item) {
  // v3 rated items include a "rate" object when dates are provided
  // The rate contains pricing, availability status, and the booking SLIP
  const rate = item.rate || {};

  // Availability: item has rate data and rate status indicates available
  // v3 uses rate.status = "AVAILABLE" or similar, or just presence of slip
  const slip = rate.slip || item.slip || null;
  const isAvailable = !!(slip && (rate.status === 'AVAILABLE' || rate.available));

  // Pricing from rate summary
  const priceTitle = rate.summary || rate.price || '';
  const priceTotal = rate.total || '';

  return {
    itemId: parseInt(item.item_id),
    name: item.name || '',
    sku: item.sku || '',
    available: isAvailable,
    slip: slip,
    priceTitle: String(priceTitle),
    priceTotal: String(priceTotal),
  };
}
