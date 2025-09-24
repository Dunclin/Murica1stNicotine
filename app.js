// Simple cart + Authorize.Net Accept Hosted redirect
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

checkoutBtn.addEventListener('click', async () => {
  const cart = getCart();
  if (!cart.length) return alert('Your cart is empty.');

  // Calculate server-side in production
  const total = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  try {
    const res = await fetch(`${window.API_BASE}/api/create-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart, total })
    });
    if (!res.ok) throw new Error('Checkout failed');
    const data = await res.json();
    if (data.payUrl) {
      window.location.href = data.payUrl; // server returns /pay/<token> route which auto-submits to Authorize.Net
    } else {
      alert('Payment link not created. Check server logs.');
    }
  } catch (err) {
    console.error(err);
    alert('Could not start checkout. Try again or contact support.');
  }
});

// Simple age gate with sessionStorage
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
