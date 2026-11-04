---
title: "The Day GitHub Was in Two Places at Once"
date: "2026-11-03"
excerpt: "A 43-second network partition split GitHub into two databases in October 2018, and choosing data integrity over usability turned it into a 24-hour recovery."
tags: ["essays", "postmortem", "reliability"]
status: "published"
---

## The blink nobody felt

At 22:52 UTC on Sunday, October 21, 2018, somebody at GitHub replaced a piece of failing optical equipment, and for 43 seconds, the company's primary data center on the US East Coast could not talk to its network hub.

Forty-three seconds. Shorter than the time it takes to read this paragraph aloud. GitHub's users, at that moment the population of effectively every software team on Earth, felt nothing. No error page, no alarm, no trending hashtag. The link came back, the maintenance moved on, and as far as the outside world was concerned, nothing had happened at all.

Inside the system, something had happened that could not be unhappened. In those 43 seconds, GitHub stopped being one database and became two.

This is the incident for everyone who has ever been told that the dangerous failures are the loud ones. The dangerous failure was silent, brief, and entirely survivable on its own terms. What made it a 24-hour event was not the partition. It was what the system did, automatically, correctly, exactly as configured, in response to the partition: it held an election, crowned a new set of leaders on the other side of the continent, and started stamping documents in both offices.

## Two offices, one filing cabinet

To see why that is a catastrophe, forget databases for a moment and picture a company with one filing cabinet and two offices.

The filing cabinet holds the only official record of everything: every contract, every invoice, every note in every margin. The main office sits on the East Coast, and every stamp lands there first. On the West Coast there is a team of clerks who copy every stamped document a moment later, so the West office can answer questions from its local copies. As long as every new stamp goes to the East first and the copies flow west, there is exactly one truth, and both offices can describe it.

Now cut the phone line between the offices for 43 seconds.

The West office cannot reach the East. Its instructions for exactly this situation are clear and sensible: if the main office is unreachable, assume it is gone, promote your senior clerk, and keep the company running. So the West opens its own stamp and starts stamping. This is the correct decision for almost every failure the rule was written for. If the East building had burned down, it would have saved the company.

But the East building had not burned down. It had lost phone service for 43 seconds, and during those 43 seconds it had kept stamping too, because from the East office's chair, nothing was wrong. A handful of documents got stamped in the East that the West has never seen. Then the phone line comes back, the two offices compare cabinets, and both of them are holding stamped, official, genuine documents that the other has never heard of.

There is no procedure for this. You cannot merge the cabinets by picking a winner, because both contain real work that real customers were told was filed. You cannot throw away either stack without tearing up documents people are counting on. The word engineers use is split-brain, and it is uglier than it sounds, because both halves are, by every local test, perfectly healthy. The system is not broken. The system is duplicated, and the two copies disagree about reality.

That is precisely where GitHub found itself before midnight. Its Orchestrator tool, the automated manager of its MySQL clusters, had watched the East primaries vanish behind the partition and, following its Raft consensus rules with the nodes it could still reach, promoted West replicas to primary. GitHub's own postmortem is careful to say that Orchestrator behaved as configured. The software was not buggy. The configuration simply encoded an assumption nobody had ever said out loud: that unreachable means dead. For 43 seconds, unreachable meant unreachable, and that was enough.

## The arithmetic of no safe way back

Once both sides take writes, the incident stops being about repair and becomes about evidence.

The East clusters held a few seconds of writes that had never crossed the country. That sounds trivial, and in raw count it was: GitHub would eventually count 954 unreplicated writes on one of its busiest clusters. But the West, by the time engineers had the full picture, had taken nearly forty minutes of live application traffic: new issues, pull requests, comments, pushes, the whole metadata heartbeat of the world's code, all stamped with the West's authority. Every minute the site ran on the West primaries added to the pile of truth that the East had never seen.

Failing back, the move everyone instinctively wants, meant pointing the primaries at the East again and discarding or overwriting the West's forty minutes. Failing forward meant keeping the West as the source of truth and somehow folding the East's orphaned seconds into it, by hand, without corrupting anything, while the application tier in the East struggled to do its work across a cross-country round trip it was never built for. GitHub's applications, the postmortem explains, could not cope with that latency. Choosing integrity meant choosing a site that would be, for many users, unusable.

They chose it anyway. By 23:19 UTC, twenty-seven minutes after the blink, GitHub had paused webhook delivery and GitHub Pages builds outright, sacrificing two whole features to stop the accumulation of new state it would later have to reconcile. The sentence in the postmortem deserves to be quoted at every architecture review for the next decade: "our strategy was to prioritize data integrity over site usability and time to recovery." It is an easy sentence to write in a postmortem. It is a very expensive sentence to execute live, on a Sunday night, with the whole industry watching your status page.

There is a second, quieter lesson inside that one, and it is about estimation. During the recovery, GitHub's status updates gave users a two-hour recovery estimate, computed by interpolating from replication telemetry, essentially drawing a straight line from how fast replicas had been catching up and extending it. Reality followed what the postmortem calls a power decay function instead, and then the European and American workdays began, write load climbed, and replication fell further behind even as more hardware arrived. The honest estimate, as usual, required admitting that the recovery curve was not a line. People plan incidents with lines. Systems recover on curves.

## The long day of putting it back together

The recovery plan, once chosen, was not elegant, and that is the point. There was no clever merge tool, because a trustworthy merge of two divergent histories was the one thing the incident had just proven impossible to automate in an afternoon. Instead: restore the affected MySQL clusters from backups, resynchronize the replicas, return to a stable topology, and then eat the backlog, in that order, for as long as it took.

The backups existed, every four hours, retained for years, and the restore procedure was tested daily. GitHub had simply never had to rebuild an entire cluster from one. The backups lived in remote blob storage, which is a fine place for backups right up until you need to download multiple terabytes of them in a hurry: a significant share of the day went to transferring, decompressing, checksumming, and loading backup files onto freshly provisioned servers. Your recovery time, it turns out, is not set by how often you back up. It is set by how fast you can get the backup back into a running machine, a number nobody puts on the slide.

By Monday afternoon UTC the primaries were home in the East and the site felt responsive again, but dozens of read replicas were still hours behind, which produced the incident's strangest user experience: GitHub was back, and it was lying politely. Depending on which replica your request happened to hit, an issue might be open or closed, a pull request might show comments that an hour later were not there yet. The data was all safe. It was just not all in the present tense at the same time. GitHub kept the status red, deliberately, long after the site looked healed, while it processed the backlog: over five million webhook events and eighty thousand Pages builds queued up behind the pause. About two hundred thousand webhook payloads had sat in the queue longer than an internal time limit allowed and were dropped, the incident's one real, admitted loss of user-facing work, deliveries that simply never arrived at the servers waiting for them.

And one detail from the timeline deserves preservation in amber, because no novelist would dare invent it. At 07:46 UTC on Monday, GitHub wanted to publish a blog post explaining all of this. GitHub publishes its blog on GitHub Pages. GitHub Pages builds were paused. Publishing the explanation of the outage was itself delayed by the outage, a fact the postmortem reports with commendable straightness.

The status finally went green at 23:03 UTC on Monday, October 22: 24 hours and 11 minutes after a 43-second blink.

## What they changed, and what they admitted

The technical fixes GitHub named afterward are instructive precisely because none of them is "make the network never partition." Networks partition. The first fix was aimed at the assumption: Orchestrator would be reconfigured so it could never again promote a database primary across a regional boundary. Failover inside a region, where the application tier can actually tolerate the result, stays automatic. Failover across the continent becomes a human decision, because the postmortem had just demonstrated that it is one.

Second, the three-color status page went away in favor of per-component status, because a single green-yellow-red verdict had been unable to say the true thing, which was that parts of GitHub were fine, parts were degraded, and parts were paused on purpose. Third, GitHub accelerated a project to serve traffic actively from multiple data centers, so that a future facility failure is a load problem rather than a truth problem. And fourth, the organizational admission: the company committed to systematically testing failure scenarios in advance, fault injection and chaos engineering, because this partition shape, a magnitude they had never seen internally, had been sitting in the design the whole time, unexamined. The bug was not in the failover tool. It was in the list of things they had assumed did not need rehearsing.

Our studio runs its own small version of this religion. Every worker's output has to land as [a verifiable artifact](/technology/evidence) before it counts, and there is [one canonical record](/technology/replay) that every claim is checked against, because we have been bitten, at our scale, by the same shape of failure: two parts of a system both honestly reporting success while quietly disagreeing about what happened. The tools differ. The temptation is identical. When two sources of truth conflict, the comfortable move is to average them, merge them, or pick the newer one and move on. GitHub's Sunday night is the standing refutation. There are conflicts you do not get to average. You stop, you degrade on purpose, you reconcile the evidence by hand, and you eat the 24 hours, because the alternative is a system that is fast, available, and wrong in ways nobody can enumerate.

GitHub was down-ish for a day so that it would never have to tell a single user, "your issue, your pull request, your work was in the copy we threw away." In the end they did not have to: no user data was lost, and the few seconds of orphaned writes were reconciled from the binary logs, some automatically, some with outreach to the users who had made them. The 43 seconds cost them a day and a great deal of pride. The decision they made inside the first half hour is why it did not cost anyone else anything at all.

Downtime is a debt everyone can see; a second, invented truth is a debt no one can count, and GitHub chose the visible one.

Sources, for the record: GitHub, "October 21 post-incident analysis," The GitHub Blog, October 30, 2018 (the 43-second partition during 100G optical maintenance, the Orchestrator failover to West Coast primaries, the divergent writes and the decision to fail forward, the pausing of webhooks and Pages builds, the backup restoration process, the five million webhook events and 80,000 Pages builds in the backlog, the roughly 200,000 dropped webhook payloads, the 954 unreplicated writes on one of the busiest clusters, the 24 hours and 11 minutes of degraded service, and the four follow-up initiatives). Contemporary coverage by DevClass (October 22, 2018) and GeekWire (October 22, 2018) corroborates the outage's public timeline and GitHub's statement that the incident affected website metadata such as issues and pull requests while no data was lost.
