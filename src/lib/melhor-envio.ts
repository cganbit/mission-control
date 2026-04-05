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
