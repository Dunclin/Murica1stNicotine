// Simple cart stored in localStorage
function readCart() {
  try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return []; }
}
function writeCart(items) { localStorage.setItem('cart', JSON.stringify(items)); }

// Add-to-cart wiring
function wireAddToCart() {
  document.querySelectorAll('.add-to-cart, [data-sku]').forEach(btn => {
    btn.classList.add('btn', 'btn-add-to-cart');
    btn.addEventListener('click', () => {
      const item = {
        sku: btn.dataset.sku || btn.getAttribute('data-sku'),
        name: btn.dataset.name || btn.textContent.trim(),
        price: Number(btn.dataset.price || btn.getAttribute('data-price') || 0),
        qty: 1
      };
      const cart = readCart();
      const idx = cart.findIndex(i => i.sku === item.sku);
      if (idx >= 0) cart[idx].qty = (Number(cart[idx].qty) || 0) + 1;
      else cart.push(item);
      writeCart(cart);
      btn.disabled = true;
      setTimeout(() => { btn.disabled = false; }, 200);
    });
  });

  const cartBtn = document.getElementById('cartButton');
  if (cartBtn) cartBtn.classList.add('btn', 'btn-cart');
}
wireAddToCart();

// Address autocomplete with debounce + abort + mousedown selection
(() => {
  const input = document.getElementById('addressInput');
  const list  = document.getElementById('addressList');
  if (!input || !list) return;

  let abortCtrl = null;
  let debounceTimer = null;
  const showList = () => { list.hidden = false; };
  const hideList = () => { list.hidden = true; };
  const clearList = () => { list.innerHTML = ''; };

  function render(items) {
    clearList();
    if (!items || items.length === 0) {
      list.innerHTML = `<div class="address-empty">No matches</div>`;
      showList();
      return;
    }
    const frag = document.createDocumentFragment();
    for (const a of items) {
      const el = document.createElement('div');
      el.className = 'address-item';
      el.textContent = a.label || a.value || '';
      el.dataset.value = a.value || a.label || '';
      if (typeof a.lat === 'number') el.dataset.lat = String(a.lat);
      if (typeof a.lon === 'number') el.dataset.lng = String(a.lon);
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = el.dataset.value;
        input.dataset.lat = el.dataset.lat || '';
        input.dataset.lng = el.dataset.lng || '';
        hideList();
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      frag.appendChild(el);
    }
    list.appendChild(frag);
    showList();
  }

  async function fetchAddresses(q) {
    if (!q || q.length < 3) { clearList(); hideList(); return; }
    if (abortCtrl) abortCtrl.abort();
    abortCtrl = new AbortController();
    try {
      const res = await fetch(`/api/addresses?q=${encodeURIComponent(q)}`, { signal: abortCtrl.signal });
      const data = await res.json();
      render((data && data.results) || []);
    } catch (e) {
      if (e.name === 'AbortError') return;
      clearList();
      list.innerHTML = `<div class="address-empty">Error fetching suggestions</div>`;
      showList();
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fetchAddresses(input.value.trim()), 180);
  });
  input.addEventListener('focus', () => {
    if (list.childElementCount > 0) showList();
  });
  document.addEventListener('mousedown', (e) => {
    if (!list.contains(e.target) && e.target !== input) hideList();
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    const items = [...list.querySelectorAll('.address-item')];
    if (!items.length) return;
    const activeIdx = items.findIndex(x => x.classList.contains('active'));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown'
        ? (activeIdx + 1) % items.length
        : (activeIdx <= 0 ? items.length - 1 : activeIdx - 1);
      items.forEach(el => el.classList.remove('active'));
      items[next].classList.add('active');
      items[next].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = items[activeIdx >= 0 ? activeIdx : 0];
      if (pick) {
        input.value = pick.dataset.value;
        input.dataset.lat = pick.dataset.lat || '';
        input.dataset.lng = pick.dataset.lng || '';
        hideList();
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (e.key === 'Escape') {
      hideList();
    }
  });
})();