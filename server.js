require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const https = require('https');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());
app.use(cors({ origin: true, methods: ['GET','POST'] }));

// ---- ENV ----
const {
  STORE_LAT = '39.7597',   // Railroad, PA approx
  STORE_LON = '-76.6760',
  DELIVERY_BASE_FEE = '4.00',
  DELIVERY_BASE_RADIUS_KM = '5',
  DELIVERY_PER_KM_BEYOND = '0.75',
  GAS_FEE_PER_KM = '0.10'
} = process.env;

// ---- Helpers ----
function haversineKm(lat1, lon1, lat2, lon2){
  const toRad = d => d * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function geocodeNominatim(address){
  return new Promise((resolve, reject) => {
    if (!address) return reject(new Error('No address'));
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const req = https.get(url, { headers: { 'User-Agent': 'murica1stnicotine/1.0 (contact: merchant@example.com)' }}, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(data);
          if (Array.isArray(j) && j.length){
            resolve({ lat: parseFloat(j[0].lat), lon: parseFloat(j[0].lon) });
          } else reject(new Error('No results'));
        } catch (e){ reject(e); }
      });
    });
    req.on('error', reject);
  });
}

function calcFees(distanceKm){
  const baseFee = parseFloat(DELIVERY_BASE_FEE);
  const baseRadius = parseFloat(DELIVERY_BASE_RADIUS_KM);
  const perKm = parseFloat(DELIVERY_PER_KM_BEYOND);
  const gasPerKm = parseFloat(GAS_FEE_PER_KM);

  let delivery = baseFee + Math.max(0, distanceKm - baseRadius) * perKm;
  const gas = distanceKm * gasPerKm;
  const round = x => Math.round(x * 100) / 100;
  return { delivery: round(delivery), gas: round(gas) };
}

// ---- Routes ----
app.get('/health', (_req,res)=>res.send('ok'));

// POST /api/quote  -> { address, lat, lng }  -> { distance_km, fees, coords }
app.post('/api/quote', async (req, res) => {
  try {
    const { address, lat, lng } = req.body || {};
    const storeLat = parseFloat(STORE_LAT);
    const storeLon = parseFloat(STORE_LON);

    let dest;
    if (typeof lat === 'number' && typeof lng === 'number') {
      dest = { lat, lon: lng };
    } else {
      dest = await geocodeNominatim(address);
    }

    const distance_km = haversineKm(storeLat, storeLon, dest.lat, dest.lon);
    const fees = calcFees(distance_km);
    return res.json({ distance_km, fees, coords: { lat: dest.lat, lon: dest.lon } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not compute quote' });
  }
});

// POST /api/order -> { address, lat, lng, cart } -> { orderId, total, fees }
app.post('/api/order', async (req, res) => {
  try {
    const { address, lat, lng, cart } = req.body || {};
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: 'Empty cart' });
    }
    if (!address) {
      return res.status(400).json({ error: 'Missing address' });
    }

    // Recompute cart total server-side
    const cartTotal = cart.reduce((sum, i) => sum + (Number(i.price)||0) * (Number(i.qty)||0), 0);

    const storeLat = parseFloat(STORE_LAT);
    const storeLon = parseFloat(STORE_LON);

    let dest;
    if (typeof lat === 'number' && typeof lng === 'number') {
      dest = { lat, lon: lng };
    } else {
      dest = await geocodeNominatim(address);
    }

    const distance_km = haversineKm(storeLat, storeLon, dest.lat, dest.lon);
    const fees = calcFees(distance_km);
    const total = Math.round((cartTotal + fees.delivery + fees.gas) * 100) / 100;

    // Make an order ID and log it (replace with DB/email as needed)
    const orderId = 'ORD-' + Date.now().toString(36).toUpperCase();
    console.log('[NEW ORDER]', { orderId, address, coords: dest, cart, fees, total });

    return res.json({ orderId, total, fees, distance_km });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Order creation failed' });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log('Server listening on ' + port));
