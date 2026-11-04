---
title: "The Bank That Moved House and Locked Everyone Out"
date: "2026-11-03"
excerpt: "In April 2018 TSB moved 1.3 billion records for 5.2 million customers in one weekend big bang, and the new platform locked customers out within minutes."
tags: ["essays", "postmortem", "reliability"]
status: "published"
---

## The Sunday night the bank changed its locks

At 6 p.m. on Sunday, April 22, 2018, TSB Bank turned its customers' accounts back on, and for about twenty minutes, everything looked like a success story.

The bank had spent the weekend performing the largest house move in British retail banking: 1.3 billion records, belonging to 5.2 million customers, lifted off the platform TSB rented from its former owner, Lloyds, and set down on a brand new platform built by its new owner, Spain's Banco Sabadell. The old systems had been dark since Friday afternoon. The plan was the plan every mover knows. Do it over one quiet weekend, while nobody is watching, and have everything in its new place by the time the working week begins.

Twenty minutes after the doors reopened, the first reports arrived. People's savings had vanished from their accounts. Small purchases had been recorded as costing thousands of pounds. And some customers who logged in, expecting the mild boredom of their own finances, were presented with somebody else's. One man told the BBC that his login had shown him a stranger's £35,000 savings account, an £11,000 ISA, and a business account, a complete tour of a financial life that was not his, with, as he reasonably pointed out, everything needed to empty it. TSB later put a number on that particular horror: 402 customers, during a 20-minute window that Sunday, were able to view data that was not theirs.

By 9 p.m. the bank was on the phone to the Financial Conduct Authority to say something had gone wrong. By half past eleven both the FCA and the Prudential Regulation Authority were calling TSB. Just after midnight, on a conference call in the small hours of Monday morning, the regulators had one question, the question every customer in Britain was about to spend weeks asking: what is going on?

What was going on was that the bank had moved house and locked everyone out, including, on the [evidence](/technology/evidence) of those 402 accounts, occasionally locking the wrong people in.

## The divorce, the rent, and the big bang

To understand why a bank would do something this risky in a single weekend, you have to understand how badly it wanted the weekend to happen.

TSB had been carved out of Lloyds in 2013, as a condition of the government bailout of Lloyds during the financial crisis, and relaunched as a standalone challenger bank. But the separation was legal, not technical. TSB's customers still lived on a clone of the Lloyds computer system, and Lloyds charged rent for it: about £100 million a year. It is hard to run a plucky insurgent brand when a hundred million a year of your money is going to the incumbent you are supposed to be insurgent against, for the privilege of running on their machines.

Sabadell bought TSB in 2015 for £1.7 billion with a clear plan. Sabadell had its own core banking platform, Proteo, and a track record of migrating acquired banks onto it. A UK version, Proteo4UK, would free TSB from the Lloyds rent forever. At a celebratory company meeting in Barcelona before Christmas 2017, Sabadell's leadership boasted that more than 2,500 years of person-power and over 1,000 professionals had gone into the project. The migration was, in the words of Sabadell's chief executive, "an unprecedented project in Europe."

It was also behind schedule. The move had been planned for November 2017 and slipped to April. And here is the decision on which everything else hangs: after those months of preparation, the actual cutover was designed as a big bang. Discrete services had been shifted in earlier phases, but the customer data, the beating heart of the thing, would move all at once, in one weekend, with no [phased rollout](/blog/the-update-that-grounded-the-planet) by region or customer group, no long period of the two platforms running side by side with real traffic, and, because the old platform was being vacated, no clean way back.

Engineers have a name for the alternative TSB did not choose: strangling the old system gradually, slice by slice, so that each slice proves itself under real load while the rest of the bank still stands on ground that is known to work. It is slower. It is less cinematic. It does not produce a single triumphant weekend or a clean break with the ex. What it produces, when a slice fails, is a small problem affecting some customers, instead of the entire bank discovering simultaneously that the new house has no working doors.

The big bang is always seductive for the same reason a wedding date is seductive. It turns an engineering programme into an event, with a date the board can celebrate and a before and after the press release can describe. The trouble is that a bank is not a wedding. Five point two million people's money does not care about your date. And a cutover that cannot be reversed is not a plan with a deadline. It is a bet, with the customers' rent money as the stake.

## The weeks when the money was in there somewhere

The Sunday night failure was not a bad evening. It was the start of a season.

On the Monday, customers who could not log in at all compared notes with customers who could log in but wished they hadn't. On Tuesday, TSB took internet and mobile banking offline again entirely. On Wednesday morning, chief executive Paul Pester announced the services were back up and running. Customers, attempting to use them in large numbers, reported a different experience, and the announcement is now a small classic of the genre: the fix declared from the podium while the queue outside is still forming. That Wednesday, April 25, three days after reopening, the bank admitted internet banking was running at about 50 percent of capacity: of every ten customers who tried to get in, five would succeed. It had, in effect, built a bank with a coin flip at the door.

Up to 1.9 million active internet and mobile banking users were caught in it. They did what people do when the app lies and the phone lines jam: they went to branches, in person, to ask a human where their money was. Direct debits bounced. Wages appeared to go missing. Fraudsters, who read the news like everyone else, worked the confusion hard, and fraud losses climbed inside the chaos. The regulators would eventually note that for some customers, the problems were not fully resolved until December 2018, eight months after the triumphant weekend.

Hold that timeline against the assurance timeline. Sabadell announced on the Monday that the migration had been completed successfully. Pester, who apologised repeatedly and sincerely and would spend the spring being hauled in front of Parliament, maintained that the migration itself had gone well and that the problem was a capacity issue, a question of too many customers arriving at once at a fundamentally sound new platform.

It is worth pausing on how natural that explanation felt, and how wrong it was. Capacity is the explanation every failing system reaches for first, because it flatters everyone: the thing we built is fine, the world simply wanted it too much. But a platform where some users are shown other users' accounts is not suffering from popularity. That is not a queue. That is a data integrity failure wearing a queue's clothing.

## What the paperwork said

The post-mortems, when they finally arrived, read like a different bank's diary.

IBM was brought in during the crisis itself, and its report declined to join in the capacity story. IBM said it had "not seen evidence of the application of a rigorous set of go-live criteria to prove production readiness." Read that sentence the way an engineer reads it. It does not say the criteria were applied badly. It says IBM could find no evidence they were applied at all. Somewhere between the celebratory meeting in Barcelona and the Sunday night switch-over, the question "how will we know this is ready?" had apparently been answered with a date.

The fuller reckoning came from the law firm Slaughter and May, whose review of the migration was published in November 2019. Among its findings: only one of TSB's two data centres had been through performance testing before go-live, and the board had not been told. Sit with that for a moment. A bank with two data centres tested one of them under load, launched on both, and the people at the top of the building learned about the untested half afterwards, from the lawyers. Reporting on the review put the number of known defects at go-live at about 2,000. The number the board had been told was about 800.

There is a whole management philosophy in the gap between those two numbers. Two thousand defects is a fact about a software platform. Eight hundred is a fact about an organisation: about what happens to bad news as it travels upward through a programme that has a celebratory date attached to it. Defects do not shrink on their own. They get summarised. And a summary, passed up enough layers, can launder a platform that is not ready into a platform that is merely imperfect, which is the kind of platform executives feel able to launch.

None of this required sabotage or villainy. It required only the ordinary machinery of a big programme under schedule pressure, plus a cutover design that converted every ordinary error into a total one. A phased migration with a testing gap is a local embarrassment. A big bang with a testing gap is a national news story, a parliamentary inquiry, and a case study that engineering students will be reading for decades. The design chose the blast radius long before the code chose the bugs.

## The bill

Failure this public eventually gets itemised, and TSB's invoice is a model of the genre.

The bank put the total post-migration costs at £330.2 million, a figure that gathered up customer compensation, extra staff, fraud losses made possible by the confusion, and income that simply never arrived. About £153 million was provisionally recovered from Sabis, the Sabadell technology company that built and ran the platform, which is one way of saying the argument about whose fault it was had a price tag attached and the price tag went both directions. Customer redress alone came to £32.7 million.

The profit and loss account told the same story in one line. TSB reported a pre-tax loss of £105.4 million for 2018, against a profit of £162.7 million the year before, a swing of more than a quarter of a billion pounds in the year it changed its computer. Paul Pester, the chief executive who had announced on the Wednesday that the services were back up and running, stepped down in September 2018.

And still the heaviest envelope had not arrived. On December 20, 2022, more than four and a half years after the migration weekend, the FCA fined TSB £29.75 million and the PRA fined it £18.9 million, a combined £48.65 million, and that was after a 30 percent discount for settling, down from £69.5 million. The following April, the PRA fined the bank's former chief information officer, Carlos Abarca, £81,620 personally, the first time a chief information officer had been fined under the Senior Managers and Certification Regime. The fine aimed at one man's wallet was small next to the others. As a statement about where accountability for a migration actually lives, it was the largest number in the whole affair.

Notice the schedule on which all this landed. The migration took a weekend. The outage took weeks. The customer problems, for some, took eight months. The regulatory conclusion took four and a half years. A big bang is a decision to compress all of your risk into the shortest possible window, and the universe responded by smearing the consequences across half a decade.

## The lesson we keep relearning

Every industry has its own vocabulary for this mistake, but the mistake is always the same: treating a migration as a movement of data when it is actually a cutover of trust.

The data, in the narrow sense, mostly moved. One point three billion records went from one platform to another over a weekend, and the scandal is not that the records were lost. The scandal is everything around them that did not move: the tested capacity, the honest defect count, the board's picture of its own bank, and the customers' belief that the number on the screen was their money. A bank account is not a row in a database. It is a promise that renders as a row in a database, and the promise is the product.

This is why the phased alternative matters, and why it keeps losing arguments in boardrooms. Phased migration is not really a technical preference. It is a preference about who finds your bugs. Move five percent of customers first and your bugs are found by five percent of customers, on a Tuesday, while the old platform still hums underneath everyone else and retreat remains a real verb. Move everyone at once and your bugs are found by the entire country, on a Sunday night, with the regulators dialling in before midnight and nowhere to retreat to. The testing does not get easier in the second case. It just gets done by the public, unpaid, at scale, with their rent money.

Our own studio runs a small, unfashionable rule that comes from exactly this story family: finished work is proven on the artifact, never announced from the podium. A migration, a release, a launch, it does not matter. The Wednesday press release that says the services are back is worth precisely nothing next to one customer, chosen at random, logging in and seeing their own balance. Verification is not a communications strategy. It is the thing itself.

TSB's engineers were not stupid, and Sabadell's platform teams had migrated banks before. That is what makes the story worth retelling. Competent people, a real budget, a parent company with a track record, and still: an untested data centre, a defect count that shrank as it climbed the building, a launch that could not be undone, and 5.2 million people discovering the difference between a bank that has moved its data and a bank that has moved. You do not get to test in production with other people's money. Production, it turns out, tests you back.

The records all arrived by Sunday night. The trust is still in transit.

Sources, for the record: IEEE Spectrum's account of the migration gives the 1.3 billion records, the 5.2 million customers, the Proteo4UK platform, and the delayed November 2017 date; Which? covered the April 2018 cutover window, the 402 customers shown other people's data, and the 1.9 million active digital users affected. Increment's "What broke the bank" carries the IBM findings and the 20-minute first reports; Silicon UK and The Register carry the Slaughter and May review's data centre and defect findings. The FCA and PRA final notices of December 20, 2022 give the combined £48.65 million fine, the settlement discount, and the £32.7 million redress; TSB's 2018 results give the £330.2 million cost figure and the £105.4 million loss; the PRA's April 2023 notice covers the personal fine on the former chief information officer.
