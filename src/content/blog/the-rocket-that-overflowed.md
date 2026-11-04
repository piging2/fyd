---
title: "The Rocket That Overflowed"
date: "2026-11-03"
excerpt: "On June 4, 1996, Ariane 5 veered off course and was destroyed thirty-seven seconds into its first flight: a 64-bit number squeezed into just 16 bits."
tags: ["essays", "reuse", "verification"]
status: "published"
---

Ariane 5 was Europe's new heavy-lift rocket, bigger and more capable than the Ariane 4 it replaced. On June 4, 1996, thirty-seven seconds into its first flight, it veered hard off course, began breaking apart under aerodynamic forces, and was destroyed by its own range safety system. The rocket and its payload were worth roughly $370 million. The immediate technical cause was almost absurdly small: a 64-bit floating point number representing horizontal velocity was converted into a 16-bit signed integer. The number was too large. The conversion overflowed.

The software that failed was not new. It came from Ariane 4, where it had flown successfully many times. Ariane 5's early flight profile was different enough that a value which had stayed inside the safe range on the old rocket ran outside it on the new one. The code was still doing a job connected to launch alignment, and part of it kept running briefly after liftoff even though its flight purpose had passed. When the overflow occurred, the inertial reference system produced diagnostic output where flight data should have been. The guidance system interpreted garbage as reality and commanded a violent correction. A backup inertial unit had already failed the same way, for the same reason. Redundancy protected against random hardware failure. It did not protect against identical software making the identical mistake.

That last point is where the funny stops and the useful begins. The system had two inertial reference units because engineers rightly feared failure. But both units ran the same software with the same hidden assumption. The redundancy was real at the level of boxes and wiring. It was fictional at the level of belief. If your backup shares your primary's false assumption, you do not have a backup for that failure. You have stereo.

The inquiry board's findings were more sophisticated than "a number got too big." They pointed to design and validation choices: the conversion was not protected because it was believed the value could not exceed the range; the reused component was not reanalyzed deeply enough against the new trajectory; simulations did not expose the fault; and the failure behavior was not graceful once bad data entered the guidance loop. In other words, the accident was assembled over months by reasonable people making local decisions that each looked defensible. The rocket merely revealed the sum in public.

Reusable code is one of engineering's great bargains. It is also a smuggling operation. Every reused component carries the border conditions of the world it was born in: ranges, timings, loads, and "that can never happen" assumptions packed quietly into the crate. If you do not unpack the assumptions when you move the crate, they move with it. Ariane 4's code was not sloppy. It was fitted to Ariane 4. Ariane 5 asked it to live in a different physics.

Our factory rule for borrowed machinery is therefore rude and simple: [provenance](/technology/evidence) or it does not run. A component enters production with its origin, its assumptions, and its verified limits attached, in writing, where the next operator can see them. If the limits are unknown, the component is a rumor in a metal box. The same rule applies to prompts, scripts, models, deployment files, and that helpful snippet from a forum at 2 a.m. The question is never only "does it work?" The question is "in what world was it proven to work, and are we still in that world?"

The other lesson is about identical redundancy. Independent checks need independent ways of being wrong. In our studio, a result is not believed because two agents said it. Agents can share prompts, context, and blind spots with depressing fidelity. A claim becomes stronger when it survives a different kind of test: a hash rather than a summary, a decode rather than a description, [a destination read](/technology/replay) rather than a sender's confidence. Diversity of evidence beats duplication of confidence.

Ariane 5 flew again and became a workhorse. The failure was not the end of the program; it was the price of learning, in the most expensive classroom there is, that a system is not the sum of its parts' reputations. It is the sum of their assumptions, at the boundary, on the worst day, all at once.

The rocket did not overflow. The number did. The distinction mattered to exactly no one at altitude, which is why boundaries deserve more respect than components.

Sources, for the record: the Ariane 5 Flight 501 inquiry board report describes the operand error in the conversion from 64-bit floating point to 16-bit signed integer, the reuse of Ariane 4 software, the identical failure of the backup inertial reference system, and the resulting loss of guidance information. Loss figures commonly reported for the rocket and payload are around $370 million.
