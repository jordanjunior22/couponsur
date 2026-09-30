/**
 * utils/fapshiPayout.ts
 * Client for Fapshi's disbursement (payout) service — deliberately a
 * SEPARATE file from utils/fapshi.ts, authenticating with its own
 * FAPSHI_PAYOUT_* credentials rather than the collection service's. That
 * separation is intentional: it's structurally impossible for payout code
 * to accidentally authenticate with the wrong (collection) keys, or vice
 * versa, since neither file ever reads the other's env vars.
 *
 * Spec confirmed against https://docs.fapshi.com/en/api-reference/openapi.json
 * (not guessed) — see the "Fapshi disbursement integration" plan.
 */
import { FapshiError, isFapshiError } from "./fapshi";

export { isFapshiError };
export type { FapshiError };

const BASE_URL = process.env.FAPSHI_PAYOUT_BASE_URL ?? "https://sandbox.fapshi.com";

function getHeaders(): HeadersInit {
    const apiuser = process.env.FAPSHI_PAYOUT_API_USER;
    const apikey  = process.env.FAPSHI_PAYOUT_API_KEY;
    if (!apiuser || !apikey) {
        throw new Error("Fapshi payout credentials missing — set FAPSHI_PAYOUT_API_USER and FAPSHI_PAYOUT_API_KEY");
    }
    return { apiuser, apikey, "Content-Type": "application/json" };
}

function makeError(message: string, statusCode: number): FapshiError {
    return { ok: false, message, statusCode };
}

async function payoutPost<T extends { ok: true }>(
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
    } catch (e: unknown) {
        return makeError(e instanceof Error ? e.message : "Network error", 500);
    }
}

async function payoutGet<T extends { ok: true }>(
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
    } catch (e: unknown) {
        return makeError(e instanceof Error ? e.message : "Network error", 500);
    }
}

export interface MakePayoutResponse {
    ok:            true;
    message:       string;
    transId:       string;
    dateInitiated: string;
    statusCode:    number;
}

export interface BalanceResponse {
    ok:         true;
    service:    string;
    balance:    number;
    currency:   string;
    statusCode: number;
}

export interface PayoutStatusResponse {
    ok:            true;
    transId:       string;
    status:        "CREATED" | "PENDING" | "SUCCESSFUL" | "FAILED" | "EXPIRED";
    transType?:    "Collection" | "Payout";
    amount:        number;
    // Net amount received after Fapshi/operator fees — see the matching
    // comment in app/api/payout/webhook/route.ts.
    revenue?:      number;
    externalId?:   string;
    dateInitiated: string;
    dateConfirmed?: string;
    statusCode:    number;
}

/**
 * Sends money to a recipient's mobile money/Orange Money account. Async —
 * a 200 here only means Fapshi ACCEPTED the transfer, not that it landed.
 * The real outcome arrives via the payout webhook (app/api/payout/webhook)
 * or payoutStatus() polling below.
 */
export async function makePayout(data: {
    amount:      number;
    phone?:      string;
    medium?:     "mobile money" | "orange money" | "fapshi";
    name?:       string;
    email?:      string;
    userId?:     string;
    externalId?: string;
    message?:    string;
}): Promise<MakePayoutResponse | FapshiError> {
    if (!data.amount)                   return makeError("amount required", 400);
    if (!Number.isInteger(data.amount)) return makeError("amount must be an integer", 400);
    if (data.amount < 100)              return makeError("minimum amount is 100 XAF", 400);
    if (data.medium === "fapshi") {
        if (!data.email) return makeError("email required when medium is 'fapshi'", 400);
    } else if (!data.phone) {
        return makeError("phone required", 400);
    }

    return payoutPost<MakePayoutResponse>("/payout", data);
}

/** Current float available in the payout service's Fapshi account. */
export async function getBalance(): Promise<BalanceResponse | FapshiError> {
    return payoutGet<BalanceResponse>("/balance");
}

/** Re-verifies a payout's live status against Fapshi — never trust a webhook body blindly. */
export async function payoutStatus(
    transId: string
): Promise<PayoutStatusResponse | FapshiError> {
    if (!transId) return makeError("transId required", 400);
    return payoutGet<PayoutStatusResponse>(`/payment-status/${transId}`);
}
