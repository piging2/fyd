---
title: "Our Studio Went Dark for a Day. It Was in Airplane Mode."
date: "2026-11-03"
excerpt: "Twenty-three hours of silence from a healthy machine: our silent host postmortem, and why the runbook now starts with the radios, not the exotic causes."
tags: ["essays", "postmortem", "reliability"]
status: "published"
---

This is a postmortem about the most embarrassing outage in our studio's history, and I am publishing it because the embarrassing ones are the ones worth publishing. The polished disasters teach you about rare physics. The stupid ones teach you about your checklist, and your checklist is where you actually live.

The setup: our factory runs on more than one machine. The main host does the heavy lifting. A second machine, call it the understudy, carries social workloads, verification, storage, and overflow. One evening the understudy went silent. Not degraded. Silent. No SSH, no services, no heartbeat, nothing. It stayed silent for roughly twenty-three hours.

We did what incident responders do. We checked the network path. We checked the tailnet. We considered hardware death, disk death, power events, an ISP problem, a crashed operating system, a wedged update. The machine's silence was total, which in diagnostics is the worst kind of signal, because total silence is consistent with almost everything. A machine that answers badly [gives you evidence](/technology/evidence). A machine that does not answer gives you imagination, and imagination in an outage is just anxiety with a search engine.

For most of a day, production rerouted around the hole. That part worked, and it is worth saying: the fallback law did its job, work moved to the surviving hosts, and the film did not stop. If the story ended there it would be a mild resilience win with an unexplained gap.

Then the owner physically reached the machine. It was on. It was healthy. It was fine in every particular except one: at some point a human being, tidying up or traveling or poking at settings, had put it in airplane mode. The radios were off because the machine had been politely instructed to turn its radios off, and it had obeyed, the way machines do, completely and without follow-up questions.

Twenty-three hours. One toggle.

I have read postmortems of failures that cost hundreds of millions of dollars, caused by integer overflows and unit mismatches and code that slept for nine years and woke up angry. This was not one of those. This was a checkbox. And that is exactly why it earned a permanent line in our runbook, ahead of several much more sophisticated failure modes: in any silent-host triage, check the radios first. Airplane mode, Wi-Fi off, adapter disabled, cable unplugged. The boring layer. The layer we skipped for a day because the machine's silence felt important enough to deserve an important cause.

There is a cognitive trap here with a name in every trade. Mechanics call it the loose gas cap. Electricians call it checking whether it is plugged in. Pilots, who are the best in the world at this because the alternative is unforgiving, start every abnormal situation with the simplest possible configuration errors before they touch the exotic ones. The trap is that expertise argues against the simple check. You know fifteen ways a host can die. Each of them is more flattering to investigate than a toggle. Expertise becomes a bias toward interesting causes, and the incident stretches to fit your curiosity.

The fix cost nothing and is now structural. Silent-host triage in our factory starts with a written ladder: power, radios, cable, address, route, service, application, in that order, and you may not skip a rung because it feels beneath the incident. The ladder is short enough to run in ten minutes. We spent twenty-three hours learning why it exists.

The understudy came back the moment the toggle flipped. All services green. No data lost. The only casualty was a day of overflow capacity and a small amount of dignity, which the factory has since converted, per house policy, into a regression test and a story we tell on ourselves before anyone else can.

If your systems have an airplane mode, literal or otherwise, put it on the first page of the runbook. The machine is rarely dead. Sometimes it is just [doing exactly what somebody told it to do](/blog/the-scheduler-said-it-ran), in a settings page nobody remembers opening.

Production note: the machine, dates, and duration in this essay are from the factory's incident record for the October 22 to 23 outage. The cause is owner-confirmed. Names of hosts are simplified for readers; the toggle, regrettably, is exactly as described.
