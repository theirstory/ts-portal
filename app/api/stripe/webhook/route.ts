import Stripe from 'stripe';
import type { SplitRecipient } from '@/lib/stripe/types';

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(key);
}

export async function POST(request: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET is not set');
    return Response.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return Response.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    // Only process successful payments
    if (session.payment_status !== 'paid') {
      return Response.json({ received: true });
    }

    const metadata = session.metadata ?? {};
    const splitConfig = metadata.splitConfig;

    if (!splitConfig) {
      console.warn('No split config in session metadata:', session.id);
      return Response.json({ received: true });
    }

    let split: SplitRecipient[];
    try {
      split = JSON.parse(splitConfig) as SplitRecipient[];
    } catch {
      console.error('Invalid split config JSON:', splitConfig);
      return Response.json({ received: true });
    }

    const totalAmount = session.amount_total;
    if (!totalAmount || totalAmount <= 0) {
      console.warn('No amount in session:', session.id);
      return Response.json({ received: true });
    }

    // Stripe takes its processing fee from the total.
    // We distribute the full intended amounts — the platform absorbs Stripe fees.
    const transferGroup = session.id;

    console.log(
      `[stripe-webhook] Processing donation: $${(totalAmount / 100).toFixed(2)} for "${metadata.interviewTitle || 'portal'}"`,
    );

    for (const recipient of split) {
      const transferAmount = Math.floor((totalAmount * recipient.percent) / 100);
      if (transferAmount <= 0) continue;

      try {
        await stripe.transfers.create({
          amount: transferAmount,
          currency: session.currency || 'usd',
          destination: recipient.accountId,
          transfer_group: transferGroup,
          metadata: {
            recipientLabel: recipient.label,
            percent: String(recipient.percent),
            storyId: metadata.storyId || '',
            collectionId: metadata.collectionId || '',
          },
        });
        console.log(
          `[stripe-webhook] Transfer: $${(transferAmount / 100).toFixed(2)} → ${recipient.label} (${recipient.accountId})`,
        );
      } catch (err) {
        console.error(`[stripe-webhook] Transfer failed for ${recipient.label}:`, err);
      }
    }
  }

  return Response.json({ received: true });
}
