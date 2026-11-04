---
title: "The Scheduler Said It Ran"
date: "2026-11-03"
excerpt: "The calendar answers what was supposed to happen. It is silent on what happened: why our factory judges every standing job by its run record, not its schedule."
tags: ["essays", "reliability", "scheduling"]
status: "published"
---

This is a story about a lie that nobody told.

Our factory runs standing jobs: small, regular pieces of work that fire on schedules. Ingestions, heals, watches, digests. One morning we reviewed a job's recent history and found an entry we now use in training. The job's occurrences had been "coalesced": when a scheduled run could not start, the platform folded it into the next occurrence and marked the folded one cancelled. Three mornings in a row, the record showed a tidy calendar and an untouched workload. The job had not failed. Failure would have left a mark. It had simply never started, three times, while wearing the paperwork of a healthy schedule.

Nobody lied. That is the point. Every individual record was accurate: scheduled, yes; coalesced, yes; cancelled, technically. The lie was an emergent property of reading the calendar instead of the run record. The calendar answers the question "what was supposed to happen?" It is silent on the only question that matters: "what happened?"

We fixed our reading habits before we fixed anything else, because the reading habit was the defect. Now every standing job in the factory is judged by a three-part test that a job cannot fake: a start time, a finish time, and an artifact. Started, finished, [produced something you can open](/technology/evidence). If a job cannot show all three, its status is not "probably fine." Its status is UNKNOWN, and UNKNOWN is a word our dashboard is required to say out loud, in amber, without rounding it off to green.

This sounds like inside baseball until you survey your own life for coalesced jobs. The backup that is scheduled nightly and has never once been restore-tested. The subscription you believe is cancelled because you clicked a button in April. The "we should catch up" that has been recurring for two years. Calendars are intentions. Logs are history. Most of us manage our infrastructure, and a fair amount of our lives, from the intentions tab.

Automation deepens the trap, because automation multiplies intentions faster than it multiplies verification. One diligent person can hand-check ten recurring jobs. A factory with a hundred standing jobs and a fleet of agents cannot hand-check anything; it must be architected so that non-execution is loud. Our version of loud is a simple invariant enforced by boring machinery: every scheduled thing owes the record an artifact, and the absence of the artifact is itself a reportable event, reviewed on the same cadence as the work. [Silence is treated as a symptom](/blog/the-retry-that-charged-twice), never as a clean bill of health.

There is a cousin failure worth naming in the same breath: the job that runs perfectly and accomplishes nothing, because the world it checks stopped reporting honestly. Our heal jobs once reported success for a safety file that was, on a second look, stale on some surfaces. The runs were real. The starts and finishes were real. Only the meaning was hollow. Which is why the three-part test ends with an artifact and not with an exit code. An exit code tells you the job believes it succeeded. An artifact lets you check whether the world agrees.

If you operate anything that matters, here is the whole essay in one exercise. Pick your five most trusted automations. For each one, produce, from evidence, the last time it started, the last time it finished, and the last artifact it made. Time yourself. The gap between how long you thought that would take and how long it takes is the size of your exposure. We know because we did it, and one of our five turned out to be a calendar entry with excellent attendance and no job at all.

The scheduler said it ran. The scheduler was describing the schedule. Read the runs.

Sources, for the record: this essay is drawn from PING's production records of scheduled job behavior, including occurrence coalescing observed in our own fleet's run histories. The general failure classes discussed, silent non-execution and success-without-effect, are standard topics in site reliability engineering literature, including Google's SRE books and their treatment of monitoring and alerting on symptoms rather than intentions.
