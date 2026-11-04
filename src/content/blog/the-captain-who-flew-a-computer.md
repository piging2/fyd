---
title: "The Captain Who Flew a Computer"
date: "2026-11-03"
excerpt: "Air France Flight 447 stalled from 38,000 feet to the sea after ice blocked its pitot probes, the autopilot resigned, and its stall warning inverted."
tags: ["essays", "postmortem", "reliability"]
status: "published"
---

## A routine cruise over the Atlantic

Begin with how ordinary it was, because ordinary is the whole story.

An Airbus A330 is crossing the Atlantic in the middle of the night, hours out of Rio de Janeiro, pointed at Paris, flying through the wide dark band of weather near the equator that pilots cross so routinely it has an acronym and a seating policy. The captain, the most experienced man on the flight deck, with nearly four times the hours of the pilot flying, has gone back to rest, because that is what the procedure says, because the airplane is certified for it, because this is the safest machine its generation of engineers knew how to build and it has the paperwork to prove it.

That last part matters. The A330 was not a sketchy experiment. It was the mature product of the most ambitious automation program in commercial aviation, an aircraft designed around a philosophy of envelopes and protections. In normal law, the flight computers simply will not let you stall the airplane. You can pull the sidestick all the way back and hold it there like a man trying to start a lawnmower the size of a building, and the computers will politely decline, because they know the angle of attack limits and you, apparently, cannot be trusted with them. Generations of pilots trained inside that envelope, and the envelope never once let them down, and that is precisely the problem this essay is about. A protection that never fails teaches the protected that failure is not a real category. It teaches them, slowly, flight by flight, year by year, that the thing the protection protects against is theoretical.

Nobody on that flight deck was careless, and nobody was a fool. There were three qualified pilots, thousands of hours, a modern jet, a working radar, and a sky full of weather they had all crossed before. What there was not, anywhere in the system, was a single human being who had recently practiced the exact skill the night was about to demand. The airline industry had spent thirty years building airplanes that did not need that skill, and then, in the space of about four seconds, over the middle of the ocean, it needed it more than it had ever needed anything.

## The ice and the number that lied

The failure, when it came, was almost insultingly small. Ice crystals, high in the storm, blocked the pitot probes, the little tubes that measure airspeed by feeling the wind. Not all the automation in the world can repeal the fact that a computer can only compute what it can measure, and the measurement, that night, came from a tube full of ice.

The speed on the left display fell from about 275 knots to 60 knots. Sit with that number for a moment. The airplane did not slow down. The airplane was fine, aerodynamically, flying exactly as it had been flying. Only the number changed. But in a modern cockpit, the number is the reality the humans are given to work with, and the number now said something impossible and terrifying: the jet appeared to be falling out of the sky at the speed of a family car on a motorway.

Every distributed system ever built has this exact failure mode, and every engineer reading this has shipped it. Your sensor lies, not maliciously, not even noticeably, and every downstream decision, human and machine alike, is now being made inside the lie. The monitoring dashboard goes red. The alert fires. The on call engineer wakes up and starts fixing the number instead of the system, because the number is the loudest thing in the room. On Flight 447, the number lied for a matter of seconds before the probes cleared and honest airspeed returned. The lie was brief. Everything that followed was the reaction to the lie, and the reaction lasted until the ocean.

## The night the autopilot resigned

At 02:10:05 UTC, the autopilot and autothrust disconnected, and the flight control law stepped down from normal law to alternate law. In plain terms, the airplane looked at its contradictory speed data, concluded it could no longer guarantee its own protections, and did the thing it was designed to do. It handed the jet back.

There is a grim corporate comedy in the timing, the kind any manager will recognise. The automation behaved exactly like a conscientious employee who discovers a discrepancy in the accounts at the worst possible moment of the quarter, writes a careful note, and resigns on the spot, leaving the building while the fire alarm is still warming up. It followed procedure. The procedure was the disaster. The protections the crew had flown behind for their entire careers, including the one that made a stall physically impossible to command, evaporated in the same instant that a startled human being took hold of the controls.

And the human did what startled humans do, and what, if we are honest, his training had quietly taught him the airplane would forgive. He pulled back. Pitch rose to 11 degrees in 10 seconds. Think about what pulling back means in the mental model of a pilot raised inside the envelope: it means climb, it means safety, it means get away from the ground and the weather and the confusing numbers. Inside normal law, it could never mean stall, because the computers would not allow the thought to become physics. But normal law had left the building. In alternate law, pulling back means exactly what it meant in 1912. The nose rises, the speed bleeds, the wing stops being a wing, and the airplane, which weighs hundreds of tonnes and is seven miles above the Atlantic, begins to stall.

The jet climbed to about 38,000 feet on momentum and misunderstanding, trading its speed for altitude like a gambler trading his house for chips, and at the top of that climb it had almost nothing left. The stall warning began. And here the story stops being about one man's inputs, because what happened next was a collaboration between a frightened crew, an honest airplane, and a warning system whose logic was about to betray everyone in the most technically correct way imaginable.

## The invisible sidestick

First, the sidestick, because it is the quietest design decision in this story and maybe the most important.

In an older airliner, the two control columns are mechanically linked. When one pilot pushes or pulls, the other pilot sees the column move and feels it move. The controls are a shared physical language. You cannot make a large, sustained, fatal input in secret, because your colleague's hands are resting on the same sentence.

The Airbus sidesticks are not linked. Each is a small spring loaded stick at the side of each seat, and when both pilots make inputs, the computers average them, a design choice with the same energy as resolving a disagreement between two surgeons by averaging their incisions. The pilot not flying that night could not see what the pilot flying was doing. The fatal input, the sustained pull that held the jet in its stall all the way down, was invisible. It was not hidden by malice. It was hidden by industrial design.

At one point, the pilot not flying did take priority, pressing the takeover button that gives one sidestick sole authority, which is the system working as intended. And then the priority was silently reversed, and the averaging resumed, and the pull resumed with it. No alarm announced the reversal. The cockpit had a chime for trivia and silence for this.

Every team that has ever debugged a distributed system at three in the morning knows this interface. Two operators, both issuing commands, neither able to see the other's hands, the system politely merging contradictory instructions and telling no one. We call it a split brain when computers do it. We call it a design philosophy when we sell it in an airplane. The crew of Flight 447 spent their last minutes issuing inputs into a system that concealed the inputs from each other, and the investigation would later have to reconstruct, from recorded data, a conversation the flight deck itself never got to hear.

## The warning that punished the right answer

Now the stall warning, which deserves its own section in the museum of good intentions.

A stall warning exists for one reason: to shout at the pilot at the exact moment the wing is about to give up, early enough and loudly enough that the pilot does the one counterintuitive thing a stall demands, which is push the nose down. Everything about a stall recovery is an argument between instinct and physics. Instinct says pull away from the ground. Physics says the ground is not the problem, the angle is the problem, push forward, lose altitude on purpose, get the wing flying again, and then climb. It is the hardest lesson in aviation precisely because it must be performed by a frightened person against every signal their body sends.

The warning on Flight 447 had a logic flaw, and the flaw is the kind that passes every review meeting ever held. The warning depended on computed airspeed, and below a certain computed speed, the system judged its own data invalid and suppressed the warning. Reasonable, on paper. Clean, even. And catastrophic in sequence, because of what it did to the feedback loop. When the pilot flying pulled back, deeper into the stall, the computed speed fell, the data went invalid, and the warning fell silent. When he pushed forward, the correct input, the recovery input, computed speed rose, the data became valid again, and the warning screamed at him for doing the right thing.

Seventy five times, the warning sounded. To the man holding the stick, the lesson of those seventy five alarms was unmistakable and completely false: pushing forward makes the screaming start, pulling back makes it stop. The system was training him, in real time, in the last minutes of his life, to hold the exact input that was killing the airplane. He was not ignoring the warning. He was obeying the only pattern the warning left available to him. Any of us, dropped into that seat with that training and those signals, should be humble about how we would have done.

There is not a monitoring stack on Earth that is innocent of this. We have all built the alert that fires on recovery and silences during the failure, the dashboard that goes green because the metrics pipeline died, the health check that reports health because it checks itself. The edge case where your alarm's logic inverts is never the edge case you test, because by definition it lives outside the conditions you imagined, and the night it matters is the night the conditions are outside everything anyone imagined.

## The captain returns

At about 02:11:42 UTC, roughly a minute and a half after the autopilot resigned, the captain came back through the flight deck door.

He was 58 years old, with 10,988 hours, the deep well of experience the whole system was designed around. The rested captain returning to a crisis is the final safety net in the long haul model, the senior man arriving with fresh eyes and a calm voice, and generations of passengers have slept better knowing the arrangement existed. He arrived. And the net did not hold, because the net had the same hole in it as everything else that night.

Nobody on that flight deck ever said the word stall and meant it as a diagnosis. That is the finding that should be printed on card and taped above every operations desk in the world: three professional pilots, one of them enormously experienced, flew a fully developed stall from 38,000 feet to the sea, talking, working, trying, and the actual name of their situation was never spoken in a way that organised their actions. They discussed speed. They discussed altitude. They discussed the climb and the descent. The one word that would have turned all of that data into a single command, push, stayed unspoken or unheard or unbelieved, because nothing in their shared mental model of that airplane included the possibility that it could be stalled at altitude by a colleague's unseen hand while a warning system contradicted itself in the background.

Experience does not rescue a broken model. Experience is the model, deepened. The captain's ten thousand hours were hours inside an envelope that had never once let a stall happen, which means his expertise, real and hard earned, was expertise in a world where this could not occur. He returned to the flight deck as the most qualified person alive to fly the airplane as designed, on the one night the airplane as designed was no longer the airplane he had.

## The long descent nobody named

The descent took about three and a half minutes, at rates up to 10,913 feet per minute, at a 40 degree angle of attack, which is less a flight path than an argument the wing had already lost. The aircraft was, throughout, structurally sound. The engines ran. The computers computed. By the standards of a maintenance log, almost nothing on that airplane was broken for most of the fall: one set of probes had iced and cleared, and everything else was a human system coming apart inside a machine that kept politely reporting its own destruction in accurate numbers.

No emergency message was ever transmitted. There was no Mayday, no call to any controller, no moment where anyone outside that flight deck was told that anything was wrong. The first notification the world received that Flight 447 was in trouble was its absence. Two hundred and twenty eight people were aboard, passengers who had eaten dinner and watched films and trusted, reasonably, completely, the layered competence of a modern airline, and the record of their last minutes is a cockpit voice recorder transcript that investigators would read with the particular grief of people who can hear exactly how close the crew came, again and again, to the right words.

It is important to end this section where the investigation ended: with the refusal of the easy story. The easy story is pilot error, said in the tone people use to close a file. The real record is a chain of design decisions, training assumptions, alarm logics and interface choices, each defensible on its own, each reviewed by serious people, which together built a trap that armed itself only on the one night every condition aligned. The pilots were the last component to fail, and they were the only component that was ever going to be blamed by name. The rest of the chain got recommendations.

## The studio lesson

Trish read the BEA report the way she reads all official documents, which is to say out loud, with commentary, in a tone normally reserved for terms of service agreements and other works of fiction. Her summary, delivered to the studio whiteboard in one breath, was this: the airplane had one job at the end, it had to be flown by a human, and the entire industry had spent thirty years making sure the human was out of practice. Then she wrote LIABILITY in large letters and underlined it twice, which is her way of saying the quiet part.

Nolan, who never raises his voice and treats [automation](/technology/business-automation) the way other people treat weather, put it more gently. His version is that the protections were wonderful. That is the part nobody wants to say at the inquiry. The envelope protection was wonderful. The autopilot was wonderful. The systems genuinely were safer than the humans, for thirty years, measurably, statistically, undeniably. The trap is not that the automation was bad. The trap is that excellent automation quietly converts its operators from practitioners into supervisors, and supervisors into passengers, and then, on the worst night of the decade, it resigns and asks for a practitioner.

We build software, not airliners, but we would like the record to show that we recognised the room. The parallels sit in our own house, wearing our own badges. Automation that trains humans out of the loop is our runbook that nobody has executed by hand since the quarter it was written. Alarms whose logic inverts at the edge are our alerts that page on recovery and sleep through the outage. Control inputs nobody else can see are our silent configuration changes, our unlogged production fixes, our second sidestick averaging itself into the system while the dashboard shows green. The PING answer, the one we are building this studio to test, is boring on purpose: keep the human's hands warm with real practice, make every input visible to every operator, test the alarm at the edge where its logic flips, and rehearse the night the automation resigns, because the automation always, eventually, resigns. Not from malice. From ice, in the dark, at the exact moment its note hits your desk.

## [Sources](/technology/evidence)

This essay is drawn from the Final Report of the Bureau d'Enquêtes et d'Analyses on the accident to the Airbus A330, Flight AF 447, published July 2012; from "Sustained Stall," the Flight Safety Foundation analysis in AeroSafety World, August 2012; from the findings of the BEA third interim report; and from the peer reviewed human factors analysis by Salmon, Walker and Stanton. Where figures are given, they are the investigation's figures: the disconnection at 02:10:05 UTC, the captain's return at about 02:11:42 UTC, the climb to about 38,000 feet, the descent at up to 10,913 feet per minute at a 40 degree angle of attack, and a stall warning that sounded 75 times.

The airplane did not fall out of the sky because the computers failed; it fell because the computers succeeded, perfectly, at handing the problem back to the humans at the one moment the humans had been trained never to expect it.
