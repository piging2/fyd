---
title: "The Airline That Lost Its Planes"
date: "2026-11-03"
excerpt: "Southwest cancelled 16,900 flights at Christmas 2022 not because planes broke, but because its crew scheduling software lost track of who was where."
tags: ["essays", "postmortem", "scheduling"]
status: "published"
---

## The hold music

Start with the hold music, because that is where the airline actually lived for about a week.

Picture a Southwest pilot in a hotel room in a city she was never supposed to sleep in, phone on speaker, battery draining, listening to her own employer's hold music for the fourth hour. She is not calling customer service. She is an employee. She is calling crew scheduling, the department whose entire job is to know where she is and where she goes next, and she is calling them because the system that is supposed to tell her has stopped being able to. She has a plane she could fly. Somewhere there is a plane that needs a pilot. Between those two facts sits a phone queue.

By the worst of it, hold times for crew members trying to reach scheduling were reported at more than five hours. Some pilots and flight attendants reportedly fell asleep with their phones still on hold, which is the saddest sentence in this entire story and also the most diagnostic. When your fallback plan is "everyone calls one phone number," your fallback plan has a capacity, and the capacity is the number of humans who can answer phones, and that number does not care how big your airline is.

This is the story of how the fourth largest airline in America, an airline with hundreds of airplanes and tens of thousands of employees, temporarily lost track of both, not because the planes broke and not really because of the weather, but because the software that held the map of who was where could not redraw the map as fast as the storm was shredding it. An airline with a fleet became, for about a week, a very large group chat trying to remember where everyone was. Except the group chat was a phone tree, it was Christmas, and two million people's holidays were in the chat with them.

## The storm was real, and it was not the whole story

Winter Storm Elliott was a genuine monster. In the days before Christmas 2022 it drove a bomb cyclone across a huge swath of the United States, with extreme cold, high winds, and snow hitting region after region in sequence. Southwest later noted that the storm had hit almost every one of its largest airports. Nobody serious argues the storm was nothing. Every airline in the country took a beating from it.

Here is the part that matters: every airline got the same sky.

On December 25 and 26, as the storm moved on and other carriers began digging out, Southwest cancelled over 5,500 flights. Delta, over the same two days, cancelled 311. Read that pair of numbers again, because they are the whole argument in miniature. The weather was a shared input. The outputs were not shared at all. One airline had a terrible couple of days. The other airline entered a state that the Department of Transportation would later describe in a consent order, which is where airlines go when "terrible couple of days" stops being an adequate legal description.

Two of Southwest's most important stations, Denver and Chicago Midway, got hit at the same time, and they are not just airports for Southwest. They are crew bases. Denver and Midway together accounted for about a quarter of the airline's flight crews, a fact COO Andrew Watterson would later lay out for the Senate. Southwest wound up cancelling almost its entire Denver schedule across December 21 to 23, and doing roughly the same at Midway. So the storm did not just cancel flights. It displaced the people who fly the planes, at industrial scale, in the exact two cities where a huge share of those people start and end their work.

A cancelled flight is a spreadsheet problem. A displaced crew is a geography problem. And Southwest, in late December 2022, was about to discover that its geography problem had been quietly compounding interest for years.

## The network that made it worse

To understand why Southwest could not simply reset overnight, you have to understand the shape of its network, because the shape is the story.

Most big airlines run hub and spoke. Planes fly into a few enormous hubs, passengers and crews shuffle around, planes fly back out. It is annoying for passengers and wonderful for recovery, because a hub concentrates spare airplanes, spare crews, and the people who coordinate them in one place. When a hub carrier's operation breaks, it breaks in a few big places where the airline is strongest.

Southwest runs point to point. A Southwest plane might hopscotch across the country all day, city to city to city, no hub, no home base, just a long chain of legs. Passengers love it, because it means direct flights between smaller cities. In good weather it is efficient, elegant, and profitable. In a cascading failure it has a specific and terrifying property: every link in the chain is load-bearing. Cancel one leg and the plane is out of position for the next leg, and the crew is out of position for the leg after that, and the passengers for three cities downstream are holding boarding passes for a flight whose airplane is in the wrong state and whose pilots are, as we have established, on hold.

When a hub carrier cancels a flight, the damage tends to pool at the hub, where the recovery resources are. When a point to point carrier cancels flights at storm scale, the damage atomizes. Planes and crews end up scattered across dozens of cities, each one a small separate puzzle, and the only thing that can solve thousands of small puzzles at once is the scheduling system. Which brings us to the scheduling system.

## The software at the center of the airline

Southwest's crew assignment software is called SkySolver. Its job sounds mundane and is anything but: it takes the airline's schedule, the airplanes, the pilots, the flight attendants, the federal rules about how long a crew member may legally work, and it produces legal assignments. Who flies what, when, and after how much rest. Every airline has some version of this. It is the kind of software nobody writes press releases about, right up until it becomes the only thing standing between an airline and a very expensive lesson in what "load-bearing" means.

Watterson's testimony to the Senate Commerce Committee on February 9, 2023 is worth dwelling on, because he said the quiet part precisely. The software, he said, never stopped working. It was overwhelmed. The pace and volume of close-in crew and schedule changes, over multiple days, left the humans in crew scheduling unable to efficiently address the state of the operation, and individual crew assignments stopped being updated in a timely manner.

That distinction, between broken and overwhelmed, is the most important sentence in this essay. A system that crashes gets fixed. A system that keeps running while falling further and further behind is worse, because it produces confident, outdated answers. The schedule said crews were places they were not. Assignments pointed at people who were asleep in the wrong cities, or legal to fly but unreachable, or reachable but out of legal duty time. The map and the territory filed for divorce somewhere around December 23, and after that, every automated answer the airline generated was partially fictional.

And the tool had form. The pilots' union, SWAPA, had been warning about Southwest's scheduling technology for years. Flight attendants had complained about outdated scheduling technology for a decade. In the summer of 2022, a few months before the meltdown, Southwest pilots picketed, and here is the detail that should be carved above the door of every operations department in America: they were not picketing for pay. They were picketing, in part, for a better crew scheduling system. They said the system was inflexible. They said crews of cancelled flights got stranded without lodging and the airline lost track of them. They predicted, in writing, in public, that this would produce exactly the kind of mass failure it then produced. At the Senate hearing, SWAPA president Casey Murray told the committee that pilots had been sounding the alarm and management had not listened, and that Southwest could not connect pilots to airplanes. He also described crews being sent on what he called circular deadheads, automated assignments that ferried crew members around without solving the actual problem, which is what a solver does when it is optimizing a map that no longer matches the world.

There is a genre of corporate disaster where nobody could have known. This is not that genre. This is the genre where the people who use the system every day filed the bug report with picket signs.

## The week the airline ran on telephones

Once the automated map diverged from reality, the airline's recovery mechanism became the oldest one in the building: people calling people.

Think about what manual crew scheduling actually means at Southwest's scale. You have thousands of pilots and flight attendants scattered across the country, each with legal rest requirements ticking down like timers, each needing a specific airplane, a specific route, and a hotel if the day ends wrong. Reassigning one crew member can invalidate another's assignment, which invalidates a third's. A human scheduler with a phone and a screen can work this problem for a few hundred changes a day. Southwest had tens of thousands of changes. The math is not close. The math is a rounding error wearing a trench coat.

So the operation did what overloaded systems always do. It queued. Crews queued on hold for hours to report where they were, which meant the airline's picture of where its crews were got staler by the hour, which meant the assignments got worse, which meant more crews needed to call. Watterson told the Senate that at points the airline did not know where its crews were and could not contact some of them at all, with some crews out of contact for up to 17 hours. Seventeen hours. A modern airline, with an app, with satellites, with a hundred years of accumulated logistics genius in the building, reduced to hoping a flight attendant's phone battery held out.

The cancellations came in waves. Southwest cancelled roughly two thirds of its schedule on December 26 alone. The airline accounted for the overwhelming majority of all cancellations in the United States on its worst days; the rest of the industry was, by then, mostly arguing about delays. Passengers slept in airports. Baggage piled into small fabric mountains. Rental cars vanished from entire cities as two million people improvised their way home for Christmas by road. The group chat had become the nation's largest unplanned road trip.

## The reset

There is exactly one reliable way to recover a system whose state you no longer trust, and Southwest eventually did it. You stop trying to patch the state. You throw the schedule away and rebuild from a known position.

Southwest cut its operation to about one third of its normal schedule for several days. That is an astonishing sentence to write about a major airline at Christmas, and it was the correct decision, which tells you how bad the state of the state was. While flying that skeleton schedule, the airline repositioned. Airplanes flew without passengers to the cities where they were supposed to be. Crews were ferried, deadheaded, and reassembled into legal, known configurations. It was the aviation equivalent of turning the entire company off and on again, except turning it off cost roughly two thousand cancelled flights a day and the reboot took the better part of a week.

On December 30, Southwest resumed something close to a normal schedule. Total the damage with the Department of Transportation's ruler: 16,900 flights cancelled, over two million passengers stranded across the holiday period. The most costly and largest operational collapse in the history of American airlines, as it has been described, produced by a storm that lasted days and a recovery that lasted more than a week.

## The bill

Southwest's own filings put the hit to fourth-quarter pretax income at about $800 million. The DOT, in closing its investigation a year later, tallied over $600 million in refunds and reimbursements to passengers, and over $750 million in total passenger-facing costs once the penalty structure was counted.

The penalty itself deserves a slow read, because it was not a fine so much as a piece of policy engineering. On December 18, 2023, the DOT announced a $140 million civil penalty, 30 times larger than any consumer protection penalty in the Department's history. The structure: $35 million in cash to the U.S. Treasury. A $72 million offset tied to a new, DOT-ordered compensation system in which Southwest must set aside $90 million to pay vouchers of at least $75 to future passengers hit by controllable cancellations and long delays. And a $33 million credit for the 25,000 Rapid Rewards points the airline had already handed affected passengers as an apology. Notice what the Department did. Most of the headline penalty was converted into a standing obligation to compensate the next disruption's victims quickly. The fine was designed to keep fining, in the form of vouchers, every time the operation failed someone from then on.

Southwest also committed to spending about $1.3 billion on technology in 2023, and SkySolver upgrades were rushed out in February 2023, weeks after the meltdown and days before Watterson sat down in front of the Senate and said the two words that headline every honest postmortem: "We messed up."

## The lesson

Strip the airplanes away and this is a story about a database and a queue, which is to say it is a story about every company now.

Scheduling software is load-bearing infrastructure. At Southwest it was not an administrative convenience layered on top of the real operation. In a disruption it WAS the operation, because it was the only component that knew, or was supposed to know, the position of every asset the company owned. The airplanes were fine. The pilots were willing. The fuel was in the ground where fuel goes. The thing that failed was the shared picture of reality, and once the picture failed, the physical assets might as well have been on the moon.

Second: a system that works at normal scale and fails at storm scale does not have a scaling problem. It has a timing problem, because it fails at the exact moment it becomes the only thing that can save you. SkySolver on a normal Tuesday was adequate. SkySolver during the worst disruption in the airline's history was the single point through which all recovery had to pass, and it could not pass recovery through itself fast enough. Load testing a system against your average day tells you it works on your average day. Your average day is not when you need it.

Third: a manual fallback is not a fallback if it does not scale. "The crew can always call scheduling" is a true sentence right up until several thousand crew members call scheduling in the same afternoon. A fallback that depends on a fixed pool of humans answering phones has a hard ceiling, and the ceiling arrives precisely when the primary system fails hardest, because that is when everyone reaches for the fallback at once. Fallbacks need the same capacity engineering as the systems they back up, or they are not fallbacks. They are decorations.

We run a small studio, not an airline, and the scale is not comparable, but the failure shape is one we have met personally. We have had workers finish tasks that the coordinator never heard about, schedulers report runs that never happened, and a machine go silent for a day because it was in airplane mode, which in hindsight was the universe workshopping material for this essay. Every time, the pattern is Southwest's: the components were fine, the [shared picture of who had done what](/technology/continuity) and where things stood was wrong, and recovery meant stopping, rebuilding a known state, and only then moving again. The rule we run on now is that a result does not exist until it [lands somewhere verifiable](/technology/evidence), in a form a machine can check. It is a less glamorous rule than "buy better software." It is also the rule that would have told Southwest, on December 22, that its map no longer matched its airline, while there was still time to shrink the schedule on purpose instead of having it shrunk by physics.

The unions, it should be said, had been filing that exact observation for years, for free, in the form of warnings. The most expensive sentence in corporate life might be the one that goes: we will modernize that system next year. Next year, at Southwest, cost $140 million in penalties, over $600 million in refunds and reimbursements, about $800 million off a quarter's pretax income, and Christmas for two million people. The system worked every day it did not matter. It failed on the only days it did.

Sources, for the record: U.S. Department of Transportation press release and consent order (Order 2023-12-11), December 2023, for the cancellation count, passenger count, refund totals, and the full penalty structure. Testimony before the U.S. Senate Committee on Commerce, Science, and Transportation, February 9, 2023, for Andrew Watterson's account of the scheduling failure and Casey Murray's account of the union warnings. Southwest's financial filings and statements for the fourth-quarter impact and the 2023 technology investment. Contemporaneous reporting by Bloomberg, the New York Times, and AIN for the point-to-point recovery dynamics, the one-third schedule reset, and crew accounts of the phone queues.

The planes were fine. The weather cleared by the weekend. What failed was a list of who was where, and at that scale, the list is the airline.
