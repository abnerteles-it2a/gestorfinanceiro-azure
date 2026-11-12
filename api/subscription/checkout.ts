import { verifySession } from '../_auth_shared';


import { getPool } from '../_db';
import { assertBillingSchema, registerBillingPayment } from '../_billing';

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end('Method Not Allowed');
        return;
    }

    const db = getPool();

    try {
        // Auth Check (Enforcing Single-Session Compliance)
        const result = await verifySession(req, res, db);
        if (!result) return;
        const { userId, payload } = result;

        let body: any = {};
        if (req.body) {
            body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        } else {
            let rawBody = '';
            await new Promise<void>((resolve) => { req.on('data', (c: any) => { rawBody += c; }); req.on('end', resolve); });
            body = rawBody ? JSON.parse(rawBody) : {};
        }

        const { tier, billingPeriod, method, cpfCnpj, creditCard, orgId } = body;
        const normalizedTier = String(tier || 'starter').toLowerCase();
        const normalizedBilling = (String(billingPeriod || 'monthly').toLowerCase() === 'yearly' || String(billingPeriod).toLowerCase() === 'annually') ? 'yearly' : 'monthly';
        if (!['starter', 'plus', 'pro'].includes(normalizedTier)) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: false, error: 'Plano inválido.' }));
            return;
        }

        const addMonths = (d: Date, months: number) => {
            const x = new Date(d.getTime());
            const day = x.getDate();
            x.setMonth(x.getMonth() + months);
            if (x.getDate() < day) x.setDate(0);
            return x;
        };
        const now = new Date();
        const nextEnd = normalizedBilling === 'yearly' ? addMonths(now, 12) : addMonths(now, 1);
        
        // Asaas Config
        const ASAAS_KEY = process.env.ASAAS_API_KEY;
        const ASAAS_URL = process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3';
        
        if (!ASAAS_KEY) {
            console.error('[Checkout Error] ASAAS_API_KEY is missing.');
            throw new Error(`Configuração de pagamento (Asaas) não encontrada no servidor.`);
        }

        // 1. Get User Info
        const userRes = await db.query('SELECT full_name, asaas_customer_id, document FROM public.profiles WHERE user_id = $1', [userId]);
        const profile = userRes.rows[0];
        const userEmail = String(payload?.email || '');
        const userName = profile?.full_name || payload?.name || 'Cliente Gestor Financeiro';
        const finalCpfCnpj = (cpfCnpj || profile?.document || '').replace(/\D/g, '');

        if (!finalCpfCnpj) {
            throw new Error('CPF ou CNPJ é obrigatório para processar o pagamento.');
        }

        // 2. Pricing Logic
        const monthlyPrices: Record<string, number> = { starter: 30.00, plus: 79.00, pro: 149.00 };
        const annualPrices: Record<string, number> = { starter: 25.00 * 12, plus: 67.00 * 12, pro: 126.00 * 12 };
        
        const amount = normalizedBilling === 'yearly' 
            ? (annualPrices[normalizedTier] || 300.00) 
            : (monthlyPrices[normalizedTier] || 30.00);

        await assertBillingSchema(db);

        // 3. Asaas Customer Management
        let asaasCustomerId = profile?.asaas_customer_id;
        if (!asaasCustomerId) {
            const cRes = await fetch(`${ASAAS_URL}/customers`, {
                method: 'POST',
                headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: userName, email: userEmail || `${userId}@gestor.financeiro`, cpfCnpj: finalCpfCnpj, externalReference: userId })
            });
            const cData = await cRes.json();
            if (cData.id) {
                asaasCustomerId = cData.id;
                await db.query('UPDATE public.profiles SET asaas_customer_id = $1, document = $2 WHERE user_id = $3', [asaasCustomerId, finalCpfCnpj, userId]);
            } else {
                throw new Error(cData.errors?.[0]?.description || 'Erro ao criar registro de cliente no Asaas.');
            }
        } else {
            // PUT to update existing customer data
            await fetch(`${ASAAS_URL}/customers/${asaasCustomerId}`, {
                method: 'PUT',
                headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
                body: JSON.stringify({ cpfCnpj: finalCpfCnpj, name: userName })
            });
            await db.query('UPDATE public.profiles SET document = $1 WHERE user_id = $2', [finalCpfCnpj, userId]);
        }

        // 4. Create Payment
        const billingType = method === 'pix' ? 'PIX' : 'CREDIT_CARD';
        // externalReference: tier|userId|orgId|billingPeriod — used by webhook to avoid DB lookup
        const externalReference = `${normalizedTier}|${userId}|${orgId || ''}|${normalizedBilling}`.slice(0, 200);
        const paymentPayload: any = {
            customer: asaasCustomerId,
            billingType,
            dueDate: (billingType === 'PIX' || method === 'pix') ? new Date().toISOString().split('T')[0] : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            value: amount,
            description: `Assinatura Gestor Financeiro - Plano ${normalizedTier.toUpperCase()} (${normalizedBilling === 'yearly' ? 'Anual' : 'Mensal'})`,
            externalReference,
            postalService: false
        };

        // Inform Asaas of billing cycle for subscription tracking
        paymentPayload.cycle = normalizedBilling === 'yearly' ? 'YEARLY' : 'MONTHLY';

        if (billingType === 'CREDIT_CARD' && creditCard) {
            paymentPayload.creditCard = { holderName: creditCard.holderName, number: creditCard.number.replace(/\s/g, ''), expiryMonth: creditCard.expiry.split('/')[0], expiryYear: '20' + creditCard.expiry.split('/')[1], ccv: creditCard.cvv };
            paymentPayload.creditCardHolderInfo = { name: userName, email: userEmail || `${userId}@gestor.financeiro`, cpfCnpj: finalCpfCnpj, postalCode: '01001000', addressNumber: '1', phone: '11999999999' };
        }

        const pRes = await fetch(`${ASAAS_URL}/payments`, {
            method: 'POST',
            headers: { 'access_token': ASAAS_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify(paymentPayload)
        });
        const pData = await pRes.json();
        if (!pData.id) {
            throw new Error(pData.errors?.[0]?.description || 'Erro ao gerar fatura de pagamento.');
        }

        // Persist checkout without replacing an active paid subscription.
        await registerBillingPayment(db, {
            paymentId: pData.id, userId, orgId: orgId || null,
            tier: normalizedTier, billingPeriod: normalizedBilling
        }, nextEnd);

        // 6. Pix logic if UNDEFINED or pix method
        let pixData = null;
        if (billingType === 'PIX' || method === 'pix') {
            const fetchPix = async (at = 1): Promise<any> => {
                console.log(`[Checkout] Fetching Pix QR Code (Attempt ${at}/3)...`);
                const res = await fetch(`${ASAAS_URL}/payments/${pData.id}/pixQrCode`, { headers: { 'access_token': ASAAS_KEY } });
                const json = await res.json();
                
                if (json.encodedImageData && json.payload) {
                    console.log(`[Checkout] Pix QR Code generated successfully on attempt ${at}.`);
                    return json;
                }
                
                console.warn(`[Checkout] Pix QR Code retrieval attempt ${at} failed. Response:`, JSON.stringify(json, null, 2));
                
                if (at < 3) { 
                    console.log(`[Checkout] Waiting 3s before next attempt...`);
                    await new Promise(r => setTimeout(r, 3000)); 
                    return fetchPix(at + 1); 
                }
                return json;
            };
            const pixJson = await fetchPix();
            if (pixJson.encodedImageData && pixJson.payload) {
                pixData = { encoded: pixJson.encodedImageData, payload: pixJson.payload };
            } else {
                // Return a clear error if Pix failed but payment created
                console.warn('[Checkout] Payment created but Pix QR Code generation timed out or failed.');
            }
        }

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, paymentId: pData.id, invoiceUrl: pData.invoiceUrl, pix: pixData, status: pData.status }));

    } catch (e: any) {
        console.error('Checkout API Error:', e);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: false, error: e?.message || 'Erro interno no processamento' }));
    }
}
