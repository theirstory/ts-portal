import Stripe from 'stripe';
import { resolveSplit, validateSplit, getCurrency } from '@/lib/stripe/config';
import type { CheckoutRequest } from '@/lib/stripe/types';

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(key);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckoutRequest;
    const {
      amount,
      frequency = 'one-time',
      storyId,
      collectionId,
      interviewTitle,
      storytellerName,
      inHonorOf,
      isEmbed,
      returnUrl,
    } = body;

    if (!amount || amount < 1) {
      return Response.json({ error: 'Amount must be at least $1' }, { status: 400 });
    }

    if (amount > 10000) {
      return Response.json({ error: 'Amount cannot exceed $10,000' }, { status: 400 });
    }

    const split = resolveSplit(storyId, collectionId);
    const { valid, error } = validateSplit(split);
    if (!valid) {
      console.error('Invalid donation split config:', error);
      return Response.json({ error: 'Donation configuration error. Please contact support.' }, { status: 500 });
    }

    const currency = getCurrency();
    const amountInCents = Math.round(amount * 100);

    const origin = returnUrl || request.headers.get('origin') || '';
    const successParams = new URLSearchParams({ session_id: '{CHECKOUT_SESSION_ID}' });
    if (storyId) successParams.set('storyId', storyId);
    if (storytellerName) successParams.set('storytellerName', storytellerName);
    if (interviewTitle) successParams.set('interviewTitle', interviewTitle);
    if (isEmbed) successParams.set('embed', 'true');
    // Stripe replaces {CHECKOUT_SESSION_ID} server-side, so we must not URL-encode the braces.
    const successUrl = `${origin}/donate/success?${successParams.toString().replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}')}`;
    const cancelParams = new URLSearchParams();
    if (storyId) cancelParams.set('storyId', storyId);
    if (isEmbed) cancelParams.set('embed', 'true');
    const cancelUrl = `${origin}/donate/cancel${cancelParams.toString() ? `?${cancelParams.toString()}` : ''}`;

    const productName = storytellerName
      ? `Donation — ${storytellerName}'s story`
      : interviewTitle
        ? `Donation — ${interviewTitle}`
        : 'Donation';
    const descriptionPieces = [
      storytellerName
        ? `Supporting ${storytellerName}'s story and the archive`
        : interviewTitle
          ? `Supporting "${interviewTitle}" and the archive`
          : 'Supporting the oral history archive',
      inHonorOf ? `In honor of ${inHonorOf}` : null,
    ].filter(Boolean);

    const stripe = getStripe();
    const isSubscription = frequency === 'monthly';

    const session = await stripe.checkout.sessions.create({
      mode: isSubscription ? 'subscription' : 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: amountInCents,
            ...(isSubscription ? { recurring: { interval: 'month' as const } } : {}),
            product_data: {
              name: productName,
              description: descriptionPieces.join(' · '),
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        storyId: storyId || '',
        collectionId: collectionId || '',
        interviewTitle: interviewTitle || '',
        storytellerName: storytellerName || '',
        inHonorOf: inHonorOf || '',
        frequency,
        splitConfig: JSON.stringify(split),
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) {
      return Response.json({ error: 'Failed to create checkout session' }, { status: 500 });
    }

    return Response.json({ url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to create checkout session' },
      { status: 500 },
    );
  }
}
