/* TrendMart — static brand marketing media (public/media) */

export type BrandSlide = {
  id: string;
  src: string;
  alt: string;
  href: string;
};

/** Instagram-style hero image slides (text baked into creatives — no overlays). */
export const BRAND_HERO_SLIDES: BrandSlide[] = [
  {
    id: "delivery",
    src: "/media/hero/slide-delivery.jpg",
    alt: "Fast Delivery, Right to Your Doorstep",
    href: "/",
  },
  {
    id: "all-in-one",
    src: "/media/hero/slide-all-in-one.png",
    alt: "Everything You Need, All in One App",
    href: "/",
  },
  {
    id: "deals",
    src: "/media/hero/slide-deals.jpg",
    alt: "Best Deals, Everyday — only on TrendsMart",
    href: "/deals",
  },
];

/** Homepage brand promo reel — muted autoplay loop. */
export const BRAND_PROMO_VIDEO = "/media/brand/promo-reel.mp4";
