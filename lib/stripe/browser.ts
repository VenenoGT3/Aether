import { loadStripe, type Stripe } from "@stripe/stripe-js";

/**
 * Browser Stripe.js singleton (publishable key only). Used by the performance
 * pool-funding Elements form.
 */
let stripePromise: Promise<Stripe | null> | null = null;

export function getStripePromise(): Promise<Stripe | null> {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}
