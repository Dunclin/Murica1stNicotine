async function submitOrder() {
  const addressEl = document.getElementById('addressInput');
  const phoneEl = document.getElementById('phone');

  const address = addressEl?.value?.trim() || '';
  const phone = phoneEl?.value?.trim() || '';
  const lat = Number(addressEl?.dataset?.lat);
  const lng = Number(addressEl?.dataset?.lng);

  const cart = (function readCart() {
    try { return JSON.parse(localStorage.getItem('cart') || '[]'); } catch { return []; }
  })();

  if (!cart.length) {
    alert('Your cart is empty.');
    return;
  }
  if (!address) {
    alert('Please enter your delivery address.');
    return;
  }

  const payload = { address, phone, cart };
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    payload.lat = lat;
    payload.lng = lng;
  }

  try {
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'Order failed');
    }
    alert(`Order placed! ID: ${data.orderId}\nTotal: $${data.total}`);
    // Optionally clear cart
    localStorage.removeItem('cart');
  } catch (e) {
    alert('Failed to place order: ' + e.message);
  }
}

document.getElementById('checkoutButton')?.addEventListener('click', submitOrder);