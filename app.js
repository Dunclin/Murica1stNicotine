// ---------- Cart + UI ----------
const CART_KEY = 'zyn_cart_v1';
const cartBtn = document.getElementById('cart-btn');
const drawer = document.getElementById('cart-drawer');
const closeCart = document.getElementById('close-cart');
const cartItemsEl = document.getElementById('cart-items');
const cartTotalEl = document.getElementById('cart-total');
const cartCountEl = document.getElementById('cart-count');
const checkoutBtn = document.getElementById('checkout');

// Age gate
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
    drawer.classList.add('open');
  });
});

cartBtn.addEventListener('click', () => drawer.classList.add('open'));
closeCart.addEventListener('click', () => drawer.classList.remove('open'));
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

// Age gate
function maybeShowAgeGate(){
  if (sessionStorage.getItem('age_ok') === '1') return;
  ageGate.classList.remove('hidden');
}
ageYes.addEventListener('click', () => {
  sessionStorage.setItem('age_ok','1');
  ageGate.classList.add('hidden');
});
ageNo.addEventListener('click', () => {
  window.location.href = 'https://www.fda.gov/tobacco-products';
});

renderCart();
maybeShowAgeGate();

// ---------- Delivery & Maps ----------
const addrInput = document.getElementById('addr');
const quoteBtn = document.getElementById('quote');
const quoteStatus = document.getElementById('quote-status');
const feeDeliveryEl = document.getElementById('fee-delivery');
const feeGasEl = document.getElementById('fee-gas');
const grandTotalEl = document.getElementById('grand-total');
const routeMiEl = document.getElementById('route-mi');

let map, geocoder, directionsService, directionsRenderer;
let shopMarker, userMarker;
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

// Called by Google Maps JS API (callback=initMap in index.html)
window.initMap = function(){
  geocoder = new google.maps.Geocoder();
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({ suppressMarkers: true });

  map = new google.maps.Map(document.getElementById('map'), {
    center: { lat: 39.7597, lng: -76.6760 }, // fallback to Railroad, PA
    zoom: 12,
    mapTypeControl: false,
    streetViewControl: false
  });
  directionsRenderer.setMap(map);

  // Geocode shop address and pin it
  const shopAddress = window.SHOP_ADDRESS || '30 South Main St, Railroad, PA 17355';
  geocoder.geocode({ address: shopAddress }, (results, status) => {
    if (status === 'OK' && results[0]) {
      const loc = results[0].geometry.location;
      shopLatLng = { lat: loc.lat(), lng: loc.lng() };
      shopMarker = new google.maps.Marker({
        position: shopLatLng,
        map,
        label: 'S',
        title: 'Shop'
      });
      map.setCenter(shopLatLng);
    }
  });

  // Places autocomplete for the destination input
  const ac = new google.maps.places.Autocomplete(addrInput, {
    types: ['geocode'],
    componentRestrictions: { country: 'us' }
  });
  ac.addListener('place_changed', () => {
    const place = ac.getPlace();
    if (!place.geometry || !place.geometry.location) return;
    const loc = place.geometry.location;
    destLatLng = { lat: loc.lat(), lng: loc.lng() };

    // Put a marker for the user
    if (userMarker) userMarker.setMap(null);
    userMarker = new google.maps.Marker({
      position: destLatLng,
      map,
      label: 'D',
      title: 'Delivery'
    });

    // Draw route & show route distance
    if (shopLatLng) {
      directionsService.route({
        origin: shopLatLng,
        destination: destLatLng,
        travelMode: google.maps.TravelMode.DRIVING
      }, (res, status) => {
        if (status === 'OK' && res.routes[0] && res.routes[0].legs[0]) {
          directionsRenderer.setDirections(res);
          const meters = res.routes[0].legs.reduce((m, leg) => m + (leg.distance?.value || 0), 0);
          const miles = meters / 1609.344;
          routeMiEl.textContent = miles.toFixed(2);
          // Clear stale quote to encourage recalculation
          lastQuote = null;
          updateGrandTotal();
        }
      });
    }

    // Focus the quote button hint
    quoteStatus.textContent = 'Click "Get delivery quote" to compute fees.';
  });
};

async function requestQuote(){
  const address = (addrInput?.value || '').trim();
  if (!address) return alert('Enter a delivery address first.');
  if (!destLatLng) quoteStatus.textContent = 'Tip: choose an address from the dropdown for best accuracy.';

  quoteStatus.textContent = 'Calculating…';
  try {
    const res = await fetch(`${window.API_BASE}/api/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address,
        lat: destLatLng?.lat,
        lng: destLatLng?.lng
      })
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
if (quoteBtn) quoteBtn.addEventListener('click', requestQuote);

// Recompute grand total when cart changes
const _saveCartOrig = saveCart;
saveCart = function(c){ _saveCartOrig(c); updateGrandTotal(); };
updateGrandTotal();

// ---------- Place Order (pay on delivery) ----------
checkoutBtn.addEventListener('click', async () => {
  const cart = getCart();
  if (!cart.length) return alert('Your cart is empty.');
  const address = (addrInput?.value || '').trim();
  if (!address) return alert('Enter a delivery address.');

  try {
    const res = await fetch(`${window.API_BASE}/api/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address,
        lat: destLatLng?.lat,
        lng: destLatLng?.lng,
        cart
      })
    });
    if (!res.ok) throw new Error('Order failed');
    const data = await res.json();
    // Clear cart and go to success page with order ID + total
    localStorage.removeItem(CART_KEY);
    window.location.href = `success.html?orderId=${encodeURIComponent(data.orderId)}&total=${encodeURIComponent(data.total.toFixed(2))}`;
  } catch (e) {
    console.error(e);
    alert('Could not place order. Please try again.');
  }
});
