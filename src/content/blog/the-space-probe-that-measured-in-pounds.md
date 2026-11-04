---
title: "The Space Probe That Measured in Pounds"
date: "2026-11-03"
excerpt: "A $125 million spacecraft was destroyed by a units conversion: one team expressed force in pounds, the other expected newtons, for nine straight months."
tags: ["essays", "interfaces", "verification"]
status: "published"
---

The Mars Climate Orbiter was a $125 million spacecraft, and it was destroyed by a units conversion. Not a broken part. Not a bad sensor. One team expressed a force in pounds. Another team expected newtons. The spacecraft listened to both of them faithfully, did the math it was given, and flew itself into the Martian atmosphere at an altitude where atmospheres are not survivable.

The orbiter launched in December 1998, bound for Mars, where it would study the climate and relay data from the lander traveling with it. For nine months it flew. During cruise, ground teams periodically fired its thrusters to correct its trajectory, a maneuver called angular momentum desaturation, and software on the ground computed how much each firing had nudged the spacecraft. The contractor's software reported that nudge in pound-force seconds, the imperial unit. NASA's navigation software, built to the interface specification, expected newton-seconds, the metric unit. One pound-force is about 4.45 newtons. Every correction was therefore off by a factor of four and a half, in the same direction, for nine months.

Here is the part that should be printed on a poster. The discrepancy was visible. Navigation data during cruise kept looking slightly wrong, and engineers noticed, and emails were exchanged, and concerns were raised in the informal way concerns get raised when a project is busy and the spacecraft is, after all, still flying. The investigation board later found that the concerns never traveled through the formal problem-reporting process with the force they deserved. The system had a channel for exactly this kind of anomaly. The humans routed around it, because the signal was ambiguous and the schedule was not.

On September 23, 1999, the orbiter came around Mars at about 57 kilometers above the surface. The minimum survivable altitude was somewhere around 80 to 85 kilometers; the plan called for about 140. It either burned up or skipped off into a solar orbit. Either way, it never phoned home again, and a nine-month, $125 million mission ended because two groups of excellent engineers disagreed about what a number meant, without ever disagreeing out loud.

The easy moral is "use metric," and it is not wrong, but it is too small. The specification actually required newtons. The failure was not that one team loved pounds. The failure was that an interface, the agreement about what crosses a boundary, was never [verified end to end](/technology/integrations). Nobody ran the obvious test: push a known value in one side of the boundary and check what the other side believes it received. That test costs an afternoon. It would have caught a factor of 4.45 in about nine seconds.

We build agent systems in our studio, and the Mars Climate Orbiter is the story I think about when two components shake hands. An interface is not a shape, it is a semantics. Two systems can exchange perfectly formed data, valid in every field, checksums green, and still be talking about different worlds, because the meaning of the number was assumed instead of proven. The spacecraft's data was valid. It was also wrong, for nine consecutive months, in a way that only an end-to-end check could have caught.

The second moral is about the emails. Every large failure has a moment where someone, somewhere, wrote a sentence that began with "this looks off." The Climate Orbiter's board found those moments. The anomaly was seen. What failed was the escalation machinery: the path by which a vague worry becomes a formal problem that a project is obligated to answer. Organizations do not usually die from a lack of sensors. They die from sensors wired to nothing, worries that arrive as vibes, and a culture where raising the formal flag feels like accusing your colleagues.

A spacecraft obediently flew the wrong numbers into a planet because nobody verified what the numbers meant, and nobody with a worry used the loud channel. The technology worked flawlessly. It was the agreements that failed, which is to say, the most human part of the system was the part that was never tested.

Somewhere in my studio's rulebook there is a line that [evidence outranks reports](/technology/evidence), and a second line that UNKNOWN stays UNKNOWN instead of being rounded off to fine. Both of them are just the Mars Climate Orbiter, translated into a house style. A number whose meaning is unverified is not a measurement. It is a hope with decimals.

Sources, for the record: NASA's Mars Climate Orbiter Mishap Investigation Board report (1999) documents the pound-force versus newton-second mismatch, the factor of 4.45, the trajectory estimates, and the finding that concerns during cruise were not elevated through the formal problem process. The mission cost figure of about $125 million is from NASA's reporting at the time.
