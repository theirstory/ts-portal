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
    const { amount, storyId, collectionId, interviewTitle, isEmbed, returnUrl } = body;

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

    // Determine return URLs
    const origin = returnUrl || request.headers.get('origin') || '';
    const embedParam = isEmbed ? '&embed=true' : '';
    const successUrl = `${origin}/donate/success?session_id={CHECKOUT_SESSION_ID}${embedParam}`;
    const cancelUrl = `${origin}/donate/cancel?${storyId ? `storyId=${storyId}` : ''}${embedParam}`;

    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: amountInCents,
            product_data: {
              name: interviewTitle ? `Donation — ${interviewTitle}` : 'Donation',
              description: interviewTitle
                ? `Supporting "${interviewTitle}" and the archive`
                : 'Supporting the oral history archive',
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        storyId: storyId || '',
        collectionId: collectionId || '',
        interviewTitle: interviewTitle || '',
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
