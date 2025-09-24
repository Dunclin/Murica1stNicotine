/* ---------------- Cart + Age Gate ---------------- */
const CART_KEY = 'zyn_cart_v1';
const cartBtn = document.getElementById('cart-btn');
const drawer = document.getElementById('cart-drawer');
const closeCart = document.getElementById('close-cart');
const overlay = document.getElementById('cart-overlay');
const cartItemsEl = document.getElementById('cart-items');
const cartTotalEl = document.getElementById('cart-total');
const cartCountEl = document.getElementById('cart-count');
const checkoutBtn = document.getElementById('checkout');

const ageGate = document.getElementById('age-gate');
const ageYes = document.getElementById('age-yes');
const ageNo = document.getElementById('age-no');

function getCart(){ return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
function saveCart(c){ localStorage.setItem(CART_KEY, JSON.stringify(c)); renderCart(); }

function renderCart(){
  const cart = getCart();
  cartItemsEl.innerHTML = '';
  let total = 0;
  cart.forEach((item, idx) => {
    total += item.price * item.qty;
    const row = document.createElement('div');
    row.className = 'cart-row';
    row.innerHTML = `
      <div>
        <strong>${item.name}</strong> <small>(${item.flavor})</small><br/>
        <small>$${item.price.toFixed(2)} each</small>
      </div>
      <div class="qty-controls">
        <button class="qty-btn" data-idx="${idx}" data-action="dec">-</button>
        <span>${item.qty}</span>
        <button class="qty-btn" data-idx="${idx}" data-action="inc">+</button>
        <button class="qty-btn" data-idx="${idx}" data-action="rm">×</button>
      </div>`;
    cartItemsEl.appendChild(row);
  });
  cartTotalEl.textContent = total.toFixed(2);
  cartCountEl.textContent = cart.reduce((a,b) => a + b.qty, 0);
}

function addToCart(sku, name, price, flavor, qty){
  const cart = getCart();
  const idx = cart.findIndex(i => i.sku===sku && i.flavor===flavor);
  if (idx >= 0) cart[idx].qty += qty;
  else cart.push({ sku, name, price, flavor, qty });
  saveCart(cart);
}

document.querySelectorAll('.add').forEach(btn => {
  btn.addEventListener('click', () => {
    const sku = btn.dataset.sku;
    const name = btn.dataset.name;
    const price = parseFloat(btn.dataset.price);
    const flavor = document.querySelector(`select.flavor[data-sku="${sku}"]`).value;
    const qty = parseInt(document.querySelector(`input.qty[data-sku="${sku}"]`).value, 10) || 1;
    addToCart(sku, name, price, flavor, qty);
    openCart();
  });
});

function openCart(){
  if (!drawer) return;
  drawer.classList.add('open'); drawer.classList.remove('hidden');
  overlay?.classList.add('open'); overlay?.classList.remove('hidden');
  setTimeout(() => { if (window._leafletMap) window._leafletMap.invalidateSize(); }, 120);
}
function closeCartFn(){
  if (!drawer) return;
  drawer.classList.remove('open');
  overlay?.classList.remove('open');
  setTimeout(() => {
    drawer.classList.add('hidden');
    overlay?.classList.add('hidden');
  }, 180);
}

cartBtn?.addEventListener('click', openCart);
closeCart?.addEventListener('click', closeCartFn);
overlay?.addEventListener('click', closeCartFn);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drawer?.classList.contains('open')) closeCartFn();
});

cartItemsEl.addEventListener('click', (e) => {
  const t = e.target;
  if (!t.classList.contains('qty-btn')) return;
  const cart = getCart();
  const i = parseInt(t.dataset.idx, 10);
  if (t.dataset.action === 'inc') cart[i].qty++;
  if (t.dataset.action === 'dec') cart[i].qty = Math.max(1, cart[i].qty - 1);
  if (t.dataset.action === 'rm') cart.splice(i,1);
  saveCart(cart);
});

function maybeShowAgeGate(){
  if (sessionStorage.getItem('age_ok') === '1') return;
  ageGate.classList.remove('hidden');
}
ageYes?.addEventListener('click', () => { sessionStorage.setItem('age_ok','1'); ageGate.classList.add('hidden'); });
ageNo?.addEventListener('click', () => { window.location.href = 'https://www.fda.gov/tobacco-products'; });

renderCart();
maybeShowAgeGate();

/* ---------------- Delivery + Leaflet Routing ---------------- */
const addrInput = document.getElementById('addr');
const quoteBtn = document.getElementById('quote');
const quoteStatus = document.getElementById('quote-status');
const feeDeliveryEl = document.getElementById('fee-delivery');
const feeGasEl = document.getElementById('fee-gas');
const grandTotalEl = document.getElementById('grand-total');
const routeMiEl = document.getElementById('route-mi');

let lMap, lRouter, shopMarker, destMarker;
let shopLatLng = null;
let destLatLng = null;
let lastQuote = null;

function getCartTotal(){
  return getCart().reduce((sum, i) => sum + i.price * i.qty, 0);
}
function updateGrandTotal(){
  const cartTotal = getCartTotal();
  const fees = (lastQuote?.fees?.delivery || 0) + (lastQuote?.fees?.gas || 0);
  grandTotalEl.textContent = (cartTotal + fees).toFixed(2);
}

function initLeafletDelivery(){
  const fallback = { lat: 39.7597, lng: -76.6760 };
  lMap = L.map('map').setView([fallback.lat, fallback.lng], 12);
  window._leafletMap = lMap;

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(lMap);

  const provider = L.Control.Geocoder.nominatim();
  const shopAddress = window.SHOP_ADDRESS || '30 South Main St, Railroad, PA 17355';
  provider.geocode(shopAddress, (results) => {
    if (results && results.length) {
      const c = results[0].center;
      shopLatLng = { lat: c.lat, lng: c.lng };
      shopMarker = L.marker([c.lat, c.lng], { title: 'Shop' }).bindPopup('Shop').addTo(lMap);
      lMap.setView([c.lat, c.lng], 13);
      setTimeout(() => lMap.invalidateSize(), 50);
    } else {
      shopLatLng = fallback;
      shopMarker = L.marker([fallback.lat, fallback.lng]).bindPopup('Shop').addTo(lMap);
      setTimeout(() => lMap.invalidateSize(), 50);
    }
  });

  const geocoderCtrl = L.Control.geocoder({ defaultMarkGeocode: false }).addTo(lMap);
  geocoderCtrl.on('markgeocode', (e) => {
    const c = e.geocode.center;
    destLatLng = { lat: c.lat, lng: c.lng };
    if (destMarker) destMarker.remove();
    destMarker = L.marker([c.lat, c.lng], { title: 'Delivery' }).addTo(lMap);
    addrInput.value = e.geocode.name;
    drawRouteAndUpdate();
    quoteStatus.textContent = 'Click "Get delivery quote" to compute fees.';
  });

  lMap.on('click', (e) => {
    destLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };
    if (destMarker) destMarker.remove();
    destMarker = L.marker([destLatLng.lat, destLatLng.lng], { title: 'Delivery' }).addTo(lMap);
    drawRouteAndUpdate();
    quoteStatus.textContent = 'Click "Get delivery quote" to compute fees.';
  });

  window.addEventListener('load', () => setTimeout(() => lMap.invalidateSize(), 100));
}

function drawRouteAndUpdate(){
  if (!shopLatLng || !destLatLng) return;
  if (lRouter) { lMap.removeControl(lRouter); lRouter = null; }

  lRouter = L.Routing.control({
    waypoints: [ L.latLng(shopLatLng.lat, shopLatLng.lng), L.latLng(destLatLng.lat, destLatLng.lng) ],
    router: L.Routing.osrmv1({ serviceUrl: 'https://router.project-osrm.org/route/v1' }),
    addWaypoints: false, draggableWaypoints: false, show: false, fitSelectedRoutes: true
  })
  .on('routesfound', (e) => {
    const meters = e.routes[0].summary.totalDistance;
    const miles = meters / 1609.344;
    routeMiEl.textContent = miles.toFixed(2);
    setTimeout(() => lMap.invalidateSize(), 50);
  })
  .addTo(lMap);
}

document.addEventListener('DOMContentLoaded', initLeafletDelivery);

async function requestQuote(){
  const address = (addrInput?.value || '').trim();
  if (!address && !destLatLng) return alert('Enter or pick a delivery address.');
  quoteStatus.textContent = 'Calculating…';
  try {
    const res = await fetch(`${window.API_BASE}/api/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, lat: destLatLng?.lat, lng: destLatLng?.lng })
    });
    if (!res.ok) throw new Error('Quote failed');
    const data = await res.json();
    lastQuote = data;
    feeDeliveryEl.textContent = data.fees.delivery.toFixed(2);
    feeGasEl.textContent = data.fees.gas.toFixed(2);
    updateGrandTotal();
    quoteStatus.textContent = 'Quote updated.';
  } catch (e) {
    console.error(e);
    quoteStatus.textContent = 'Could not calculate. Try a full address and ZIP.';
  }
}
quoteBtn?.addEventListener('click', requestQuote);

const _saveCartOrig = saveCart;
saveCart = function(c){ _saveCartOrig(c); updateGrandTotal(); };
updateGrandTotal();

checkoutBtn?.addEventListener('click', async () => {
  const cart = getCart();
  if (!cart.length) return alert('Your cart is empty.');
  const address = (addrInput?.value || '').trim();
  if (!address && !destLatLng) return alert('Enter or pick a delivery address.');

  try {
    const res = await fetch(`${window.API_BASE}/api/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address, lat: destLatLng?.lat, lng: destLatLng?.lng, cart })
    });
    if (!res.ok) throw new Error('Order failed');
    const data = await res.json();
    localStorage.removeItem(CART_KEY);
    window.location.href = `success.html?orderId=${encodeURIComponent(data.orderId)}&total=${encodeURIComponent(data.total.toFixed(2))}`;
  } catch (e) {
    console.error(e);
    alert('Could not place order. Please try again.');
  }
});
