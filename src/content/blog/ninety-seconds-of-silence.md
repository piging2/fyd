---
title: "Ninety Seconds of Silence"
date: "2026-11-03"
excerpt: "On 15 January 1990, AT&T's long distance network spent nine hours healing itself to death: one mis-scoped break in 114 switches, spreading by recovery."
tags: ["essays", "postmortem", "reliability"]
status: "published"
---

The most honest room in American telecommunications used to be a theater in Bedminster, New Jersey. AT&T's network operations center had a video wall, a glowing map of the United States across which the company's long distance traffic flowed in light. On a good day, which was nearly every day, the wall said one thing: everything works, everywhere, all the time, and it has said so for years. The people who ran that network were not complacent. They were the descendants of a telephone culture that treated five nines of reliability the way other religions treat scripture, and their flagship switch, the 4ESS, was the most battle tested piece of call routing machinery on Earth.

On Monday, 15 January 1990, the wall began to lie to them in the worst possible way. It did not go dark. It flickered. Cities would light up, fail, recover, light up, and fail somewhere else, as if the map itself had caught a fever and could not decide where it was sick. It was Martin Luther King Jr. Day, a federal holiday, which meant traffic was lighter than a normal Monday. Hold that fact. Lighter traffic. The network that carried more than 70 percent of the nation's long distance calls, something like 115 million calls a day, was about to be taken apart by a holiday discount, one switch at a time, starting at 2:25 p.m. Eastern, and it would not fully stand back up until 11:30 that night.

To understand what happened, you first have to appreciate what the network was on a good day, because the good day is the setup for the joke, and the joke is not kind. A 4ESS was a toll switch, a machine the size of a small house whose entire personality was paranoia. These switches monitored themselves relentlessly, checked their own work, and, crucially, kept an eye on each other. When a switch finished recovering from a fault, it announced the happy news to its neighbors over a dedicated signaling network, the digital equivalent of getting up from the table and telling the room, I am fine now, send me your calls. The neighbors, being well brought up, would mark the recovered switch as healthy and begin routing traffic to it again. It was a democracy, but a paranoid one: every citizen armed, every citizen watching every other citizen for signs of madness, and a standing procedure for what to do when a citizen started acting strange. That procedure is where our story lives, because on 15 January 1990, the procedure for recovering from a failure became the failure, and the announcement that a switch had healed became the way the sickness traveled.

## The afternoon the map went dark

At 2:25 p.m. EST on 15 January 1990, a telephone switch in New York did something that, in isolation, would barely have qualified as an event. It detected a problem, reset itself, and began recovering. Computers reset. Switches reset. That is why they have recovery procedures. If every successful reset generated a headline, the technology section would be a very long list of machines announcing that they had briefly stopped and then changed their minds.

The trouble began when recovery stopped being a local event.

AT&T's long distance network was built from 114 4ESS switches, an extraordinary concentration of responsibility for machines with such an unglamorous name. Together they carried more than 70 percent of United States long distance traffic, roughly 115 million calls a day. This was not a decorative computer in a closet doing light administrative work. It was a major organ of the national communications system, and on that afternoon its organs began politely notifying one another that they were recovering.

One reset produced a recovery message. Another switch received it while dealing with its own traffic and timing. Under a very specific sequence, that second switch stumbled in its own recovery code, detected corrupted data, and reset. Then it announced its recovery. The announcement traveled. Another switch received it at precisely the wrong moment. The map did not fail like a tower collapsing. It failed like a row of extremely competent machines copying one another's bad decision at electronic speed.

That distinction matters. A single broken switch is a maintenance problem. A network of switches that can persuade one another to restart is a philosophy problem.

At first, the cascade would have been visible in the least cinematic way possible: calls failing, routes refusing to complete, operators watching trouble multiply faster than isolated equipment faults could explain. Hardware failures usually have the courtesy to stay where they happened. This one moved. Worse, it moved by using a trusted internal signal. Nobody had broken into the network and ordered the switches to fall over. The switches were doing it themselves, through a pathway installed to make them more resilient.

From the caller's side, the scale arrived as absence. You picked up the phone, attempted a long distance call, and the connection simply did not happen. Multiply that small private inconvenience by tens of millions and it becomes a national event. Almost 50 percent of calls failed during the collapse. More than 50 million calls were blocked. The financial damage to AT&T passed $60 million, which is an expensive way to learn that the words "recovery complete" should never be treated as harmless gossip.

The first New York reset was not the disaster. It was the first domino politely introducing itself to the second.

## Anatomy of a break

The fatal ingredient had entered the network a month earlier, wearing the least suspicious disguise in software: an upgrade.

In December 1989, AT&T deployed new software across the 4ESS switches. Somewhere in the fault recovery code sat a C `break` statement inside an `if` statement that was itself nested inside a `switch`. To a casual reader, the line looked like housekeeping. It was short. It was syntactically legal. It did what C said it should do. Unfortunately, what C said it should do was not what the programmers needed it to do.

C has rules about scope, and those rules are indifferent to human hope. An `if` statement controls whether a block runs. It does not provide the kind of enclosing structure a `break` escapes. A `break` inside that nested `if` belonged to the surrounding `switch`. Its placement therefore changed the path execution took through the recovery logic. Under the fatal conditions, control left the expected sequence and the recovery process overwrote communications data it needed to preserve.

This is why the bug deserves more respect than the familiar joke about one wrong line. The line was not misspelled. It did not announce itself with smoke. It exploited the distance between how the code looked to a person and how the language defined it for the machine. Human beings read intent. Compilers read structure. On 15 January, structure won by knockout.

Code review had every reason to miss it. Reviewers scanning a recovery routine would see a conditional, a break, and a familiar shape. The statement was not a strange new algorithm demanding a whiteboard and three senior engineers. It was the software equivalent of a stair that is one inch shorter than the others. Everyone can walk past it in good light. The injury requires the right foot, the right speed, and a mind occupied with something else.

Testing had an even better excuse, which is to say a worse one. The defective path did not run during ordinary call handling. It lived in fault recovery, the code that wakes when another fault has already disturbed the machine. To reach it, a switch had to be processing one recovery message and receive a second within less than ten milliseconds. A test could run mountains of normal calls through the software and never create that pairing. It could even test recovery in a general way and still miss the exact overlap.

This is the nastiest category of defect: deterministic, repeatable, and hidden behind a timing window narrow enough to make everyone feel personally insulted. The code was not sometimes confused about mathematics. It followed its instructions faithfully whenever the universe arranged the messages correctly. The network had shipped a booby trap that required two acts of recovery in rapid succession to spring it.

Deployment turned the local mistake into a systemic one. All 114 switches received the same software, which was rational. Uniform versions simplify maintenance, support, and behavior. They also guarantee that an undiscovered defect does not remain one machine's private weakness. It becomes a shared trait, like a family allergy, except every relative is connected by high speed signaling links and responsible for a nation's phone calls.

## Recovery as a contagion vector

The mechanism deserves to be slowed down, partly because it is elegant and partly because slowing it down is what the switches were unable to do.

A switch encounters a fault and resets. As it returns, it sends a message indicating that it has recovered. A neighboring switch receives that message and begins processing it. Before that work is complete, another recovery message arrives, less than ten milliseconds after the first. The recovery code now follows the defective path. Communications data is overwritten. The receiving switch's own error detection notices that something is wrong and initiates a reset. The victim becomes a broadcaster. It recovers, announces that recovery, and supplies the next machine with the opening ingredient for the same accident.

No outside attacker is required. No malicious payload rides the message. The message does not tell the receiving switch to damage itself. It simply arrives at a moment when the receiving switch's doctor has a faulty instruction card.

That is what makes the story modern. We tend to imagine contagion as bad content moving through a healthy system. Here the content was an ordinary status update, and the vulnerability lived in the handler. Trust made the signal efficient. Every switch was supposed to listen to its peers. Listening was part of the design. The announcements were valuable because operators and machines need to know when a neighbor has returned to service. The network did not suffer from too little communication. It suffered because a truthful message could trigger a fatal local procedure.

Perfect unison made it worse. The switches ran compatible software, observed compatible protocols, and reacted at machine speed. A human organization can sometimes survive a bad instruction because people hesitate, misunderstand it in different ways, or wander off to find coffee. The 4ESS fleet had no such protective incompetence. It was disciplined. It was fast. It was consistent. It turned a timing bug into choreography.

There is a dark comedy in a network healing itself to death. Each participant can produce a locally sensible account of its actions. I found an error. I reset. I recovered. I informed my neighbors. Every sentence is reasonable. The catastrophe exists only at the level of composition, which is where distributed systems keep their sharpest knives. No individual switch has to be insane for the collective behavior to be indefensible.

This also explains why the event could continue for hours without a single obvious broken component sitting still long enough to be blamed. The failure was a relationship among messages, timing, state, and identical code. Remove the traffic pattern and the switches behaved. Restore the pattern and the ghosts returned. Engineers were not chasing a corpse. They were chasing a dance.

## The nine hours

For roughly nine hours, one of the most sophisticated communications networks on Earth was trapped inside its own remedy.

The public experience had none of the glamour of a cyber thriller. There was no masked figure typing furiously while green characters reflected in his sunglasses. There were people trying to call relatives, businesses trying to reach customers, travelers trying to rearrange plans, and a phone network that kept declining to perform the one trick everyone expected from it. Long distance had become so reliable that its absence felt less like a service outage and more like a violation of physics.

Inside AT&T, the problem had a peculiar shape. Switches were resetting, but the resets were not evidence of widespread hardware decay. The failures propagated. They clustered around signaling and recovery. Engineers had to separate cause from symptom while the symptoms kept manufacturing new causes in public. Restarting a machine could restore it and also create the conditions for a neighbor to fail. The normal therapeutic act was carrying the disease.

The eventual cure was not a heroic patch typed at the last second while a room full of executives held its breath. Engineers starved the bug. They suspended traffic on the backup signaling links so the fatal pairing of recovery messages could not occur in the same way. This reduced the pathways by which one switch's return could ambush another mid-recovery. As evening arrived, ordinary call volume declined, giving the network another margin of safety. The last link cleared at 11:30 p.m.

That ending is less satisfying than a cinematic root cause reveal, which is exactly why it rings true. Complex incidents often improve first because operators change the environment enough to stop the bleeding. You isolate a path. You shed load. You prevent the trigger from recurring. You buy time in which the system can be observed without continuously injuring itself. AT&T then rolled back the software, removing the defective recovery code from production rather than leaving the network dependent on procedural caution.

The numbers keep the scale from dissolving into metaphor. About nine hours elapsed between the start at 2:25 p.m. and the final clearing at 11:30 p.m. More than 50 million calls were blocked. Almost half of attempted calls failed while the collapse ran its course. AT&T lost more than $60 million. Those are not the statistics of a quirky programming anecdote. They are the price of discovering that a resilience mechanism had become the largest correlated risk in the system.

## The lab hunt

Stopping the collapse was not the same as understanding it.

After production had been stabilized and the software rolled back, AT&T spent weeks reproducing the failure in the lab. That delay is sometimes told as an embarrassment, but it is better read as a clue about the bug's character. If a defect appears only when two messages arrive inside a ten millisecond window, while a switch is partway through processing the first, ordinary reproduction attempts can miss it again and again. The switch is not being evasive. The test simply has not rebuilt the weather.

Timing bugs create a special kind of investigative misery. The evidence at the scene consists of resets, overwritten data, and machines insisting, in effect, that they followed procedure. The procedure is the suspect, but it is a long procedure filled with respectable code. Engineers need to reconstruct the order of events finely enough to see where state changed. A difference of milliseconds is not a footnote. It is the whole crime scene.

When the hunt finally isolated the cause, the answer was almost offensively small: one misplaced understanding of what a `break` statement would escape, sitting in recovery code deployed across the fleet. One line of C had acquired a blast radius measured in states, hours, and tens of millions of calls.

That smallness should not make the defect feel trivial. In software, destructive power is rarely proportional to character count. A single wrong assumption about identity can expose a database. A single bad comparison can approve the wrong transaction. A single retry rule can multiply a hiccup into a self inflicted denial of service attack. The AT&T line happened to live in code whose entire purpose was to restore a huge system, so its leverage was huge from the start.

The lab work mattered because a plausible story is not an explanation. AT&T needed a reproduction that could connect the December upgrade, the message timing, the overwritten data, the error detection, and the reset cascade. Without that chain, the organization would have had a cure but not knowledge. It might have avoided the same afternoon while preserving a dozen neighboring ways to have a similar one.

## The studio lesson

At PING, we keep returning to this story because it refuses to stay in 1990.

The obvious lesson is to test recovery code. The useful lesson is sharper: failure recovery paths are production code with emergency powers. They run when the system is already confused, when operators are under pressure, when queues are swollen, and when neighboring components may be behaving strangely. They often receive less realistic testing than the cheerful path because creating their working conditions requires us to break things in combinations. Then, at the exact moment we can least afford a surprise, they take control.

Nolan's deadpan summary in the studio is: "So the safest code in the building is the code we run when the building is already on fire."

Trish's answer is: "That is not a safety system. That is a group chat with root access."

She is right, and the group chat has more attack surface than we like to admit. A retry is not merely an attempt to be helpful. It is new load generated by failure. A health announcement is not merely information. It is an input that other machines trust and process. A restart is not merely a clean slate. It can erase evidence, interrupt in flight work, and send a burst of status traffic into peers that are also struggling. None of these mechanisms is bad. All of them become dangerous when we describe them only by their intentions.

Modern systems repeat the AT&T pattern with better fonts. A service times out, so clients retry at once. The extra traffic makes the service slower, so more requests time out and more retries arrive. A worker announces that it is healthy before its state is fully rebuilt. A queue redelivers a message and two copies perform the same side effect. A fleet receives one flawed update because uniformity is convenient, then discovers that diversity was doing quiet risk management work nobody had budgeted for. The vocabulary has changed. The choreography has not.

The defenses are equally unglamorous. Retries need limits, backoff, jitter, and a budget. Repeated work needs [idempotency](/blog/the-retry-that-charged-twice) so receiving the same instruction twice does not charge the customer twice, launch the job twice, or publish the same artifact twice. Recovery announcements need rate limits and skeptical consumers. Health should become a claim that can be tested, not a spell one component casts on the rest of the network. Rollouts need staged exposure, because a fleetwide update converts uncertainty into correlation. Most of all, the recovery path itself needs rehearsals in which messages arrive late, twice, out of order, and while the receiver is already busy recovering from the last helpful announcement.

That last test would have made AT&T's bug much easier to find. Test the switch while it is healing. Then interrupt the healing. Then send the same news again before the first interruption has settled. Distributed systems do not fail in the tidy sequence diagrams we draw for them. They fail in overlaps.

There is also a lesson about sameness. Standards are good. Shared libraries are good. One approved voice, one canonical pipeline, one deployment pattern, one recovery procedure: all of these reduce chaos. They also mean a hidden flaw can be everywhere at once. The answer is not random variation for its own sake. It is a deliberate blast radius. Canary the change. Hold back part of the fleet. Make rollback a practiced motion instead of a ceremonial hope. Preserve enough independence that the entire system cannot learn the same bad trick on the same afternoon.

Ninety seconds is a fitting title because the collapse turns on intervals too small for human supervision. Ten milliseconds decided whether a message was routine or lethal. Nine hours measured how long a huge organization needed to stop its own remedy from spreading. Between those two numbers sits the entire discipline of reliable systems. Machines act in milliseconds. Institutions learn in hours. Good engineering narrows that gap before the phones go quiet.

## [Sources](/technology/evidence), for the record

The account above rests on Dennis Burke's "All Circuits Are Busy Now", published through Cal Poly, including its reconstruction of the recovery code and the mis-scoped `break`; on btw.media's analysis of AT&T's own account of the collapse, its scale, and the signaling changes used to starve the failure; and on Bruce Sterling's *The Hacker Crackdown*, which preserves the event in the wider history of the early networked age and its very human talent for building enormous consequences out of small assumptions.

The network did not fail because it was fragile; it failed because it was helpful, 114 times a second, in perfect unison.
