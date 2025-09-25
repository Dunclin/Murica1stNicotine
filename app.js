/* Full cart + drawer + map + quotes */
const CART_KEY='zyn_cart_v1';

/* CART STATE */
const cartBtn=document.getElementById('cart-btn');
const drawer=document.getElementById('cart-drawer');
const closeCart=document.getElementById('close-cart');
const overlay=document.getElementById('cart-overlay');
const cartItemsEl=document.getElementById('cart-items');
const cartTotalEl=document.getElementById('cart-total');
const cartCountEl=document.getElementById('cart-count');
const checkoutLink=document.getElementById('checkout-link');

function getCart(){return JSON.parse(localStorage.getItem(CART_KEY)||'[]');}
function saveCart(c){localStorage.setItem(CART_KEY,JSON.stringify(c));renderCart();}

function renderCart(){
  const cart=getCart();
  if(cartItemsEl){cartItemsEl.innerHTML='';}
  let t=0;
  cart.forEach((i)=>{
    t+=i.price*i.qty;
    if(cartItemsEl){
      const row=document.createElement('div');
      row.className='cart-row';
      row.innerHTML=`<div><strong>${i.name}</strong> <small>(${i.flavor})</small></div><div>x ${i.qty} — $${(i.price*i.qty).toFixed(2)}</div>`;
      cartItemsEl.appendChild(row);
    }
  });
  if(cartTotalEl) cartTotalEl.textContent=t.toFixed(2);
  if(cartCountEl) cartCountEl.textContent=cart.reduce((a,b)=>a+b.qty,0);
  if(checkoutLink) checkoutLink.classList.toggle('primary', cart.length>0);
}

function openCart(){
  drawer.classList.add('open');drawer.classList.remove('hidden');
  overlay.classList.add('open');overlay.classList.remove('hidden');
  overlay.style.pointerEvents='auto';overlay.style.opacity='1';
}
function closeCartFn(){
  drawer.classList.remove('open');
  overlay.classList.remove('open');overlay.style.opacity='0';overlay.style.pointerEvents='none';
  setTimeout(()=>{drawer.classList.add('hidden');overlay.classList.add('hidden');},180);
}

cartBtn?.addEventListener('click',openCart);
closeCart?.addEventListener('click',closeCartFn);
overlay?.addEventListener('click',closeCartFn);

document.addEventListener('click',(e)=>{
  if(e.target.classList.contains('add')){
    const b=e.target;
    const sku=b.dataset.sku;
    const name=b.dataset.name;
    const price=parseFloat(b.dataset.price);
    const flavor=document.querySelector(`select.flavor[data-sku="${sku}"]`).value;
    const qty=parseInt(document.querySelector(`input.qty[data-sku="${sku}"]`).value,10)||1;
    const cart=getCart();
    const idx=cart.findIndex(i=>i.sku===sku&&i.flavor===flavor);
    if(idx>=0) cart[idx].qty+=qty; else cart.push({sku,name,price,flavor,qty});
    saveCart(cart);
    openCart();
  }
});

/* AGE GATE */
const ageGate=document.getElementById('age-gate');
document.getElementById('age-yes')?.addEventListener('click',()=>{sessionStorage.setItem('age_ok','1');ageGate.classList.add('hidden');});
document.getElementById('age-no')?.addEventListener('click',()=>{window.location.href='https://www.fda.gov/tobacco-products';});
if(sessionStorage.getItem('age_ok')!=='1') ageGate.classList.remove('hidden');

/* MAP + AUTOCOMPLETE + QUOTES */
const addrInput=document.getElementById('addr');
const acList=document.getElementById('addr-ac');
const quoteBtn=document.getElementById('quote');
const quoteStatus=document.getElementById('quote-status');
const feeDeliveryEl=document.getElementById('fee-delivery');
const feeGasEl=document.getElementById('fee-gas');
const grandTotalEl=document.getElementById('grand-total');
const routeMiEl=document.getElementById('route-mi');

let lMap,lRouter,shopLatLng=null,destLatLng=null;

function debounce(fn,ms=250){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
function getCartTotal(){return getCart().reduce((s,i)=>s+i.price*i.qty,0);}

function initMap(){
  const fb={lat:39.7597,lng:-76.6760};
  lMap=L.map('map').setView([fb.lat,fb.lng],12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap'}).addTo(lMap);
  const provider=L.Control.Geocoder.nominatim();
  const shop=window.SHOP_ADDRESS||'30 South Main St, Railroad, PA 17355';
  provider.geocode(shop,(r)=>{
    const c=r?.[0]?.center||fb;
    shopLatLng={lat:c.lat,lng:c.lng};
    L.marker([c.lat,c.lng],{title:'Shop'}).addTo(lMap);
    lMap.setView([c.lat,c.lng],13);
  });
  const gc=L.Control.geocoder({defaultMarkGeocode:false}).addTo(lMap);
  gc.on('markgeocode',e=>chooseAddr({label:e.geocode.name,lat:e.geocode.center.lat,lon:e.geocode.center.lng}));
  lMap.on('click',e=>chooseAddr({label:`${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`,lat:e.latlng.lat,lon:e.latlng.lng}));
}

function drawRoute(){
  if(!shopLatLng||!destLatLng) return;
  if(lRouter){ lMap.removeControl(lRouter); lRouter=null; }
  lRouter=L.Routing.control({
    waypoints:[L.latLng(shopLatLng.lat,shopLatLng.lng),L.latLng(destLatLng.lat,destLatLng.lng)],
    router:L.Routing.osrmv1({serviceUrl:'https://router.project-osrm.org/route/v1'}),
    addWaypoints:false,draggableWaypoints:false,show:false,fitSelectedRoutes:true
  }).on('routesfound',e=>{
    routeMiEl && (routeMiEl.textContent=(e.routes[0].summary.totalDistance/1609.344).toFixed(2));
  }).addTo(lMap);
}

const fetchSug=debounce(async(q)=>{
  if(!q||q.length<2){acList.innerHTML='';acList.classList.add('hidden');return;}
  const url=`https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=8&countrycodes=us&q=${encodeURIComponent(q)}`;
  try{
    const r=await fetch(url,{headers:{'User-Agent':'murica1stnicotine/1.0 (contact: merchant@example.com)'}});
    const j=await r.json();
    acList.innerHTML=j.map(d=>`<div class="ac-item" data-lat="${d.lat}" data-lon="${d.lon}">${d.display_name}</div>`).join('');
    acList.classList.remove('hidden');
  }catch{
    acList.innerHTML='';acList.classList.add('hidden');
  }
},250);

function chooseAddr({label,lat,lon}){
  addrInput.value=label;
  destLatLng={lat,lng:lon};
  L.marker([lat,lon]).addTo(lMap);
  drawRoute();
  acList.innerHTML='';acList.classList.add('hidden');
  quoteStatus && (quoteStatus.textContent='Click "Get delivery quote" to compute fees.');
}

addrInput?.addEventListener('input',e=>fetchSug(e.target.value));
document.addEventListener('click',e=>{
  if(e.target.classList.contains('ac-item')){
    chooseAddr({label:e.target.textContent,lat:parseFloat(e.target.dataset.lat),lon:parseFloat(e.target.dataset.lon)});
  }else if(!document.querySelector('.ac-wrap')?.contains(e.target)){
    acList.classList.add('hidden');
  }
});

async function ensureCoords(address){
  if(destLatLng && typeof destLatLng.lat==='number' && typeof destLatLng.lng==='number'){ return destLatLng; }
  if(!address) throw new Error('No address');
  const r=await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,{headers:{'User-Agent':'murica1stnicotine/1.0 (contact: merchant@example.com)'}});
  const j=await r.json();
  if(!Array.isArray(j)||!j.length) throw new Error('Address not found');
  destLatLng={lat:parseFloat(j[0].lat),lng:parseFloat(j[0].lon)};
  L.marker([destLatLng.lat,destLatLng.lng]).addTo(lMap);
  drawRoute();
  return destLatLng;
}

document.getElementById('quote')?.addEventListener('click', async ()=>{
  const address=(addrInput?.value||'').trim();
  if(quoteStatus) quoteStatus.textContent='Calculating…';
  try{
    const coords=await ensureCoords(address);
    const res=await fetch(`${window.API_BASE}/api/quote`,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({address,lat:coords.lat,lng:coords.lng})
    });
    const txt=await res.text();
    if(!res.ok) throw new Error(`HTTP ${res.status} ${txt}`);
    const data=JSON.parse(txt);
    document.getElementById('fee-delivery').textContent=data.fees.delivery.toFixed(2);
    document.getElementById('fee-gas').textContent=data.fees.gas.toFixed(2);
    document.getElementById('grand-total').textContent=(getCartTotal()+data.fees.delivery+data.fees.gas).toFixed(2);
    if(quoteStatus) quoteStatus.textContent='Quote updated.';
  }catch(e){
    if(quoteStatus) quoteStatus.textContent='Could not calculate — ' + (e.message||'error');
    console.error(e);
  }
});

document.addEventListener('DOMContentLoaded',()=>{renderCart();initMap();});
