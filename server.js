require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const { APIContracts, APIControllers } = require('authorizenet');

const app = express();
app.use(bodyParser.json());

// Config from env
const {
  API_LOGIN_ID,
  TRANSACTION_KEY,
  SIGNATURE_KEY,
  MERCHANT_NAME,
  PUBLIC_BASE_URL, // e.g., https://your-app.onrender.com
  RETURN_URL_SUCCESS, // e.g., https://yourdomain.com/success.html
  RETURN_URL_CANCEL   // e.g., https://yourdomain.com/cancel.html
} = process.env;

// Health
app.get('/health', (_req,res)=>res.send('ok'));

// Create checkout: builds an Accept Hosted form token for total amount
app.post('/api/create-checkout', async (req, res) => {
  try {
    const { cart, total } = req.body;
    if (!Array.isArray(cart) || typeof total !== 'number') {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Authorize.Net authentication
    const merchantAuthenticationType = new APIContracts.MerchantAuthenticationType();
    merchantAuthenticationType.setName(API_LOGIN_ID);
    merchantAuthenticationType.setTransactionKey(TRANSACTION_KEY);

    // Line items (optional; kept minimal here)
    const lineItems = new APIContracts.ArrayOfLineItem();
    cart.slice(0, 30).forEach((item, idx) => {
      const li = new APIContracts.LineItemType();
      li.setItemId((item.sku || 'SKU').toString().slice(0,30));
      li.setName((item.name || 'Item').toString().slice(0,30));
      li.setQuantity(item.qty || 1);
      li.setUnitPrice(item.price || 0);
      lineItems.getLineItem().push(li);
    });

    // Transaction request
    const transactionRequestType = new APIContracts.TransactionRequestType();
    transactionRequestType.setTransactionType(APIContracts.TransactionTypeEnum.AUTHCAPTURETRANSACTION);
    transactionRequestType.setAmount(Number(total.toFixed(2)));
    transactionRequestType.setLineItems(lineItems);

    // Hosted payment settings
    const settingList = new APIContracts.ArrayOfSetting();
    const settings = [
      { settingName: 'hostedPaymentReturnOptions', settingValue: JSON.stringify({
          showReceipt: true,
          url: RETURN_URL_SUCCESS || (PUBLIC_BASE_URL + '/receipt'),
          urlText: 'Return to Store',
          cancelUrl: RETURN_URL_CANCEL || (PUBLIC_BASE_URL + '/cancel'),
          cancelUrlText: 'Cancel'
      })},
      { settingName: 'hostedPaymentButtonOptions', settingValue: JSON.stringify({ text: 'Pay Now' })},
      { settingName: 'hostedPaymentPaymentOptions', settingValue: JSON.stringify({ cardCodeRequired: true })},
      { settingName: 'hostedPaymentOrderOptions', settingValue: JSON.stringify({ show: true, merchantName: MERCHANT_NAME || 'ZYN Shop' })},
      { settingName: 'hostedPaymentBillingAddressOptions', settingValue: JSON.stringify({ show: true, required: true })}
    ];
    settings.forEach(s => {
      const setting = new APIContracts.SettingType();
      setting.setSettingName(s.settingName);
      setting.setSettingValue(s.settingValue);
      settingList.getSetting().push(setting);
    });

    const request = new APIContracts.GetHostedPaymentPageRequest();
    request.setMerchantAuthentication(merchantAuthenticationType);
    request.setTransactionRequest(transactionRequestType);
    request.setHostedPaymentSettings(settingList);

    const ctrl = new APIControllers.GetHostedPaymentPageController(request.getJSON());
    ctrl.execute(() => {
      const apiResponse = ctrl.getResponse();
      const response = new APIContracts.GetHostedPaymentPageResponse(apiResponse);

      if (response != null && response.getMessages().getResultCode() === APIContracts.MessageTypeEnum.OK) {
        const token = response.getToken();
        // Return a URL that auto-posts the token to Authorize.Net
        const payUrl = `${PUBLIC_BASE_URL}/pay/${encodeURIComponent(token)}`;
        return res.json({ payUrl });
      } else {
        const code = response?.getMessages().getMessage()[0].getCode();
        const text = response?.getMessages().getMessage()[0].getText();
        return res.status(500).json({ error: 'Failed to create hosted payment token', code, text });
      }
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Auto-submit form that posts token to Authorize.Net hosted page
app.get('/pay/:token', (req, res) => {
  const token = req.params.token;
  const html = `<!doctype html>
  <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Redirecting to Secure Checkout…</title></head>
  <body>
    <form id="pay" method="post" action="https://accept.authorize.net/payment/payment">
      <input type="hidden" name="token" value="${token}"/>
    </form>
    <script>document.getElementById('pay').submit()</script>
    <p>Redirecting to secure payment…</p>
  </body></html>`;
  res.setHeader('Content-Type','text/html').send(html);
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log('Server listening on ' + port));
