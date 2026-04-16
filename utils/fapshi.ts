/**
 * lib/fapshi.ts
 * Typed Fapshi wrapper using native fetch — no axios, safe in Next.js App Router.
 */

const BASE_URL = process.env.FAPSHI_BASE_URL ?? "https://sandbox.fapshi.com";

function getHeaders(): HeadersInit {
    const apiuser = process.env.FAPSHI_API_USER;
    const apikey  = process.env.FAPSHI_API_KEY;
    if (!apiuser || !apikey) {
        throw new Error("Fapshi credentials missing — set FAPSHI_API_USER and FAPSHI_API_KEY");
    }
    return { apiuser, apikey, "Content-Type": "application/json" };
}

// ── Discriminated union — ok: false = error, ok: true = success ───────────────

export interface FapshiError {
    ok:         false;
    message:    string;
    statusCode: number;
}

export interface InitiatePayResponse {
    ok:         true;
    message:    string;
    link:       string;
    transId:    string;
    statusCode: number;
}

export interface DirectPayResponse {
    ok:         true;
    message:    string;
    transId:    string;     // save on order — used by webhook to find it
    statusCode: number;
}

export interface PaymentStatusResponse {
    ok:            true;
    transId:       string;
    status:        "CREATED" | "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED";
    amount:        number;
    externalId?:   string;
    dateInitiated: string;
    statusCode:    number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function makeError(message: string, statusCode: number): FapshiError {
    return { ok: false, message, statusCode };
}

async function fapshiPost<T extends { ok: true }>(
    path: string,
    body: object
): Promise<T | FapshiError> {
    try {
        const res  = await fetch(`${BASE_URL}${path}`, {
            method:  "POST",
            headers: getHeaders(),
            body:    JSON.stringify(body),
        });
        const data = await res.json();
        if (res.status >= 400) {
            return { ok: false, message: data?.message ?? "Fapshi error", statusCode: res.status };
        }
        return { ...data, ok: true, statusCode: res.status };
    } catch (e: any) {
        return makeError(e?.message ?? "Network error", 500);
    }
}

async function fapshiGet<T extends { ok: true }>(
    path: string
): Promise<T | FapshiError> {
    try {
        const res  = await fetch(`${BASE_URL}${path}`, {
            method:  "GET",
            headers: getHeaders(),
        });
        const data = await res.json();
        if (res.status >= 400) {
            return { ok: false, message: data?.message ?? "Fapshi error", statusCode: res.status };
        }
        return { ...data, ok: true, statusCode: res.status };
    } catch (e: any) {
        return makeError(e?.message ?? "Network error", 500);
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generates a hosted Fapshi payment page.
 * Redirect the customer to the returned `link`.
 */
export async function initiatePay(data: {
    amount:       number;
    externalId?:  string;
    redirectUrl?: string;
    message?:     string;
    userId?:      string;
}): Promise<InitiatePayResponse | FapshiError> {
    if (!data.amount)                   return makeError("amount required", 400);
    if (!Number.isInteger(data.amount)) return makeError("amount must be an integer", 400);
    if (data.amount < 100)              return makeError("minimum amount is 100 XAF", 400);
    return fapshiPost<InitiatePayResponse>("/initiate-pay", data);
}

/**
 * Pushes a USSD payment request directly to the customer's phone.
 * No redirect — customer stays on your site and approves on their device.
 * Returns a transId to save on the order for webhook matching.
 *
 * phone must be a valid 9-digit Cameroonian number: 6XXXXXXXX
 * medium is auto-detected from the number if omitted:
 *   - MTN numbers (67X, 68X, 650-654) → "mobile money"
 *   - Orange numbers (69X, 655-659)   → "orange money"
 */
export async function directPay(data: {
    amount:      number;
    phone:       string;
    medium?:     "mobile money" | "orange money";
    name?:       string;
    externalId?: string;
    message?:    string;
}): Promise<DirectPayResponse | FapshiError> {
    if (!data.amount)                   return makeError("amount required", 400);
    if (!Number.isInteger(data.amount)) return makeError("amount must be an integer", 400);
    if (data.amount < 100)              return makeError("minimum amount is 100 XAF", 400);
    if (!data.phone)                    return makeError("phone required", 400);

    // Validate Cameroonian phone format
    const phone = data.phone.replace(/\D/g, "").replace(/^237/, "");
    if (!/^6[0-9]{8}$/.test(phone)) {
        return makeError("phone must be a valid 9-digit Cameroonian number (6XXXXXXXX)", 400);
    }

    return fapshiPost<DirectPayResponse>("/direct-pay", {
        ...data,
        phone, // normalised — no country code, no spaces
    });
}

/**
 * Fetches the live status of a transaction.
 * Always call this inside the webhook to verify before trusting it.
 */
export async function paymentStatus(
    transId: string
): Promise<PaymentStatusResponse | FapshiError> {
    if (!transId) return makeError("transId required", 400);
    return fapshiGet<PaymentStatusResponse>(`/payment-status/${transId}`);
}

// ── Type guard ────────────────────────────────────────────────────────────────

export function isFapshiError(res: FapshiError | { ok: true }): res is FapshiError {
    return res.ok === false;
}