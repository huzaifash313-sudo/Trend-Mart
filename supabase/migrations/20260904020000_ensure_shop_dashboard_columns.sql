-- TrendsMart: ensure every shop column the dashboard settings form writes.
-- Idempotent. Safe to re-run if an older project is missing later columns.

ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS tiktok_handle text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS secondary_phone text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS business_hours text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS operating_status text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS accent_color text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS store_bio text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS announcement text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS announcement_expires_at timestamptz;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS service_area text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS hourly_rate numeric(10, 2);
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS call_out_charge numeric(10, 2);
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS emergency_available boolean DEFAULT false;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS shop_type text DEFAULT 'retail';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS longitude double precision;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS service_radius_km integer DEFAULT 10;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS delivery_zones text[] DEFAULT '{}'::text[];
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS address_display text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS min_order_amount numeric(12, 2) DEFAULT 0;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS free_delivery_threshold numeric(12, 2);
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS delivery_fee_flat numeric(12, 2) DEFAULT 0;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS delivery_fee_per_km numeric(12, 2) DEFAULT 0;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS sensitive_info_updated_at timestamptz;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS accepts_delivery boolean NOT NULL DEFAULT true;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS accepts_pickup boolean NOT NULL DEFAULT true;
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'approved';
ALTER TABLE public.shops ADD COLUMN IF NOT EXISTS is_live boolean DEFAULT true;
