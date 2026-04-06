const isSandbox = process.env.MELHOR_ENVIO_ENV !== 'production';

const ME_BASE_URL = isSandbox
  ? 'https://sandbox.melhorenvio.com.br/api/v2'
  : 'https://api.melhorenvio.com.br/api/v2';

const ME_TOKEN = isSandbox
  ? process.env.ME_SANDBOX_TOKEN
  : process.env.ME_PROD_TOKEN;

export async function meRequest(endpoint: string, method = 'GET', body?: object) {
  const res = await fetch(`${ME_BASE_URL}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${ME_TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': 'MissionControl/1.0 (cleiton.terto@gmail.com)',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.message ?? `ME API error ${res.status}`);
  return data;
}

export async function meCalculateFreight(
  from: string,
  to: string,
  weight: number,
  width: number,
  height: number,
  length: number,
  insuranceValue: number
) {
  return meRequest('/me/shipment/calculate', 'POST', {
    from: { postal_code: from },
    to: { postal_code: to },
    package: { weight, width, height, length },
    options: { insurance_value: insuranceValue, receipt: false, own_hand: false },
    services: '1,2',
  });
}

export async function meGetBalance() {
  return meRequest('/me/balance');
}

export async function meTestConnection() {
  return meRequest('/me');
}

// ─── Label Flow: cart → checkout → generate → print ──────────────────────────

interface MeAddress {
  name: string;
  phone?: string;
  email?: string;
  document?: string;
  postal_code: string;
  address: string;
  number?: string;
  complement?: string;
  district: string;
  city: string;
  state_abbr: string;
  country_id?: string;
}

interface MePackage {
  weight: number;
  width: number;
  height: number;
  length: number;
}

export async function meAddToCart(
  serviceId: number,
  from: MeAddress,
  to: MeAddress,
  pkg: MePackage,
  insuranceValue = 0,
  products: Array<{ name: string; quantity: number; unitary_value: number }> = []
) {
  return meRequest('/me/cart', 'POST', {
    service: serviceId,
    from,
    to,
    package: pkg,
    products: products.length > 0 ? products : [{ name: 'Bateria', quantity: 1, unitary_value: insuranceValue || 100 }],
    options: { insurance_value: insuranceValue, receipt: false, own_hand: false, non_commercial: true },
  });
}

export async function meCheckout(orderIds: string[]) {
  return meRequest('/me/shipment/checkout', 'POST', { orders: orderIds });
}

export async function meGenerate(orderIds: string[]) {
  return meRequest('/me/shipment/generate', 'POST', { orders: orderIds });
}

export async function mePrint(orderIds: string[]) {
  return meRequest('/me/shipment/print', 'POST', { orders: orderIds });
}

export async function meTrackShipment(orderIds: string[]) {
  return meRequest('/me/shipment/tracking', 'POST', { orders: orderIds });
}

export async function meCancelShipment(orderIds: string[]) {
  return meRequest('/me/shipment/cancel', 'POST', { orders: orderIds });
}
