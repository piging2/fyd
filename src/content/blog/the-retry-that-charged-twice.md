---
title: "The Retry That Charged Twice"
date: "2026-11-03"
excerpt: "A lost response, a second click, two charges: why retries without an identity duplicate work, and the small index-card fix that makes asking twice safe."
tags: ["essays", "distributed-systems", "idempotency"]
status: "published"
---

A customer clicks buy. The request travels to the server. The server does the work: it charges the card, creates the order, sends the confirmation into the void. The response travels back toward the customer and somewhere in the middle, it dies. The customer's screen shows a spinner, then an error. The customer, being a rational mammal, clicks buy again.

Now there are two orders. Two charges. One very confused customer and one support ticket that begins with the words "your system."

Nothing in this story is broken, and that is what makes it dangerous. The network did what networks occasionally do. The client did what clients should do when the world goes silent: it retried. The server did what servers do: it obeyed. The failure lives in the gap between doing the work and knowing the work was done. The technical name for the missing piece is idempotency, an ugly word for a beautiful idea: an operation can be applied more than once and produce the same result as applying it once. Press the elevator button twelve times in a panic. The elevator does not send twelve elevators. It understood you the first time.

The standard fix is small enough to fit on an index card. When the client first sends the request, it attaches a unique identity to it: this purchase, this attempt, this one and no other. The server records that identity with the result. If the same identity arrives again, the server does not redo the work. It returns the original result, the way a good clerk finds your coat check ticket and hands you your coat instead of buying you a second coat. Retry away. The answer is the same because the question was the same, and the server can prove it.

Why does this matter beyond shopping carts? Because the modern world is built out of retries. Payment processors retry webhooks. Phones retry uploads. Fleets of software agents, the kind our studio runs all day, retry everything: fetches, posts, builds, messages. Every retry without an identity is a dice roll on whether the first attempt secretly succeeded. Multiply that by automation and you get the defining bug class of the agent era: not work that failed, but work that happened twice while everyone believed it happened once. Duplicate posts. Duplicate charges. Duplicate side effects stacking quietly in systems that were only ever designed to be asked once.

Our factory learned this in the social arena before we learned it in theory. A publish action whose outcome is unknown must never be blindly retried. If a post's fate is unclear, you go and look at the destination: is it live or not? Only the destination knows. The rule generalizes beautifully: when the result of an action is unknown, [reconcile at the destination](/technology/evidence) instead of rolling the dice again. Retrying is optimism. Reconciling is engineering.

There is a human version of this, and it is worth naming because your life runs on it too. "Did you get my email?" is a retry without an identity, and it produces duplicate meetings, duplicate orders, and two identical cakes at the same party. The coat check ticket, the confirmation number, the read receipt, the calendar invite with a unique ID: civilization is held together by little identities attached to requests so the world can safely be asked twice.

So the next time an app tells you "please do not press back or refresh," what it is really saying is: we did not do the index-card thing. We cannot tell your second click from a second purchase. Somewhere a server is about to buy you two coats, in a world where a ten-character ticket would have saved everyone.

Give every request an identity. Record the result against it. Answer repeats with [the original answer](/technology/replay). That is the whole trick, and the whole trick is the difference between a system that survives its own retries and a system that bills you for them.

Sources, for the record: idempotency keys are a documented, standard pattern in payment APIs (Stripe's API documentation describes idempotent requests using client-supplied keys to safely retry without duplicating operations). The failure pattern described, a lost response followed by a duplicate effect, is the classic at-least-once delivery problem in distributed systems, described in standard texts and in the documentation of every major message queue.
