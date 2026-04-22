import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockQuery = vi.fn();
vi.mock('@/lib/db', () => ({
  getPool: () => ({ query: mockQuery }),
}));

vi.mock('@/lib/whatsapp', () => ({
  sendWhatsApp: vi.fn().mockResolvedValue(true),
  sendWhatsAppMedia: vi.fn().mockResolvedValue(true),
}));

vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
  if (url.includes('/shipments/')) {
    return { ok: true, json: async () => ({ id: 999, logistic_type: 'fulfillment' }) };
  }
  return {
    ok: true,
    json: async () => ({
      id: 12345,
      status: 'payment_required',
      total_amount: 100,
      buyer: { id: 777, first_name: 'Cleiton', last_name: 'Terto' },
      order_items: [{ quantity: 1, item: { title: 'Bateria' } }]
    }),
  };
}));

const { POST } = await import('../route');

describe('ML Webhook Integration', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    // Config para as contas ml_tokens_json e config da conta no banco
    mockQuery.mockImplementation(async (query: string) => {
      if (query.includes("key = 'ml_tokens_json'")) {
        return { rows: [{ value: JSON.stringify([{ seller_id: 111, nickname: 'TESTE', access_token: 'xyz' }]) }] };
      }
      if (query.includes("notification_group FROM ml_account_configs")) {
        return { rows: [{ notification_group: '123-group' }] };
      }
      return { rows: [] };
    });
  });

  it('deve processar orders_v2 e persistir payment_required no banco ml_pedidos e ml_clientes', async () => {
    const body = {
      topic: 'orders_v2',
      resource: '/orders/12345',
      user_id: 111
    };
    const req = new NextRequest('http://localhost/api/mercado-livre/webhook', {
      method: 'POST',
      body: JSON.stringify(body)
    });

    const res = await POST(req);
    const resBody = await res.json();

    expect(res.status).toBe(200);
    expect(resBody.ok).toBe(true);
    expect(resBody.saved).toBe('payment_required');

    // Valida se o banco recebeu INSERTS específicos do webhook
    const calls = mockQuery.mock.calls;
    const dbInsertPedidos = calls.find(c => String(c[0]).includes('INSERT INTO ml_pedidos'));
    expect(dbInsertPedidos).toBeDefined();
    if (!dbInsertPedidos) throw new Error('INSERT INTO ml_pedidos call not found');
    expect(dbInsertPedidos[1][0]).toBe(12345); // ml_order_id
    expect(dbInsertPedidos[1][1]).toBe(777);   // buyer_id
  });
});
