---
title: "The Standup Is a Distributed System"
date: "2026-11-03"
excerpt: "This is not a metaphor stretched for comedy. It is a mapping precise enough to be useful, and once you see it, you cannot unsee why your standups work or fail."
tags: ["essays", "distributed-systems", "coordination"]
status: "published"
---

Every morning, in thousands of companies, a group of between five and fifteen distributed systems gathers in a circle or a video grid and performs a synchronization ritual. Each node broadcasts three fields: what it committed since the last sync, what it plans to commit next, and whether it is blocked. The ritual is timeboxed to fifteen minutes, which is to say it has a timeout. The participants believe they are attending a meeting. They are, in fact, running a consensus protocol with coffee.

This is not a metaphor stretched for comedy. It is a mapping precise enough to be useful, and once you see it, you cannot unsee why your standups work or fail.

Start with the message format. Yesterday, today, blockers is a heartbeat with a schema. It answers the only three questions a distributed system ever asks of its peers: what is your state, what is your intent, and are you alive enough to proceed? A standup where people narrate their feelings about the project is a protocol violation. The packets are malformed. The sync takes forever and nobody's state converges.

Convergence is the actual goal. A good standup ends with every node holding approximately the same model of the work: what is done, what is next, where the bodies are buried. A bad standup diverges politely. Everyone nods. Everyone leaves with a private version of the plan. By Friday the project exists in nine replicas, and integration, the moment the replicas meet reality, is left as an exercise for the reader. The reader is always production.

Then there is ordering. In a round-robin sync, the last speaker's update lands on top of the room's short-term memory with unfair weight. Managers feel this as recency bias and treat it as a personality flaw. It is not a personality flaw. It is eventual consistency with better branding. The fix used by actual distributed systems is the fix that works in standups: write it down where all replicas can read it, because a [shared log](/blog/the-scheduler-said-it-ran) beats a shared vibe every time. The board is the log. If it is not on the board, it did not reach consensus; it reached the last five minutes of a meeting.

Blockers deserve their own paragraph because they are the most honest part of the protocol. "I am waiting on Sarah" is a node reporting that a dependency has missed its heartbeat. The team's useful responses are exactly the ones a fault-tolerant system uses: route around the failure, escalate to whoever owns the dependency, or shed load until the dependency returns. The useless responses are also familiar: sympathy without routing, and the scheduling of a second meeting to discuss the blockage, which is a retry with no backoff and twice the packet loss.

Every standup also has a Sarah: the person through whom three approvals, two answers, and one production credential must pass. Sarah is a single point of failure with a calendar. Distributed systems engineering has a mature literature on this problem and its entire advice can be summarized as: notice that Sarah is load-bearing before Sarah goes on vacation. Cross-train, delegate the credential, write down the thing only Sarah knows. Not because Sarah is a problem. Because architecture that depends on one node's perfect attendance is not architecture. It is a hope with excellent attendance so far.

And then there is the split brain, the standup's most expensive failure mode. It happens when the cluster partitions: half the team in the room, half on a call that dropped; or two leads running parallel syncs with different membership. Each partition continues happily, reaching its own consensus, committing its own work. The partitions are not wrong. They are inconsistent, and the merge, when the network heals, costs more than the partition did. Anyone who has watched two teams discover in week six that they built two different features with the same name has attended this incident. It has a Jira ticket now. It did not need one. It needed a quorum rule: decisions made without the decision owner in the partition are proposals, not commits.

We run an agent factory, so we get to watch the literal version of this every day: coordinators, workers, claim journals, heartbeats, [receipts](/technology/evidence). The discovery that keeps recurring is that the software version and the human version fail in the same places, for the same reasons, at the same boundaries. State that lives in memory instead of a log. Dependencies nobody declared. A sync that reports vibes instead of state. A single point of failure everyone politely declines to name.

The standup is not a bad ritual. It is an under-specified one. Specify it like a protocol: state on the board before the meeting, three fields per node, blockers routed before the timeout, decisions committed to the log in the room. Fifteen minutes is plenty for a sync. It was never enough for a storytelling contest with fifteen protagonists.

Yesterday. Today. Blockers. It was a heartbeat all along.

Sources, for the record: the patterns referenced (quorum, split brain, eventual consistency, heartbeat failure detection, single point of failure) are standard distributed systems concepts, documented in texts such as Designing Data-Intensive Applications and in the literature on consensus and replication. The standup format referenced is the classic three-question daily Scrum described in the Scrum Guide.
