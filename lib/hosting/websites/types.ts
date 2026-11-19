export const GB = 1000000000;
export const MAX_UPLOAD_BYTES = GB;
export const PROOF_MAX_BYTES = 2000000;
export const PROOF_BUCKET = 'hosting-website-payment-proofs';
export type WebsiteSettings = {
    id: boolean;
    enabled: boolean;
    currency: string;
    website_price_minor: number;
    extra_gb_month_minor: number;
    bank_details: string;
    max_extra_gb: number;
    revision: number;
};
export type PaymentRequest = {
    id: string;
    client_id: string;
    status: 'pending' | 'approved' | 'rejected';
    currency: string;
    amount_minor: number;
    extra_gb_month_minor: number;
    reference: string;
    proof_path: string | null;
    created_at: string;
    reviewed_at: string | null;
    review_note: string;
    client_name?: string;
};
export type WebsiteCredit = {
    id: string;
    client_id: string;
    currency: string;
    extra_gb_month_minor: number;
    max_extra_gb: number;
    app_id: string | null;
};
export type StorageBill = {
    id: string;
    client_id: string;
    period: string;
    currency: string;
    amount_minor: number;
    gb_seconds: number;
};
export function gbLabel(bytes: number | null) { return bytes === null ? 'Not measured' : `${(bytes / GB).toLocaleString('en-GB', { maximumFractionDigits: 3 })} GB`; }
export function price(minor: number, currency: string) { return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(minor / 100); }
