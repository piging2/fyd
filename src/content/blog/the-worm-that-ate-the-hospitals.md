---
title: "The Worm That Ate the Hospitals"
date: "2026-11-03"
excerpt: "WannaCry hit 200,000 computers in 150 countries, shut wards across the NHS, and was stopped by a $10.69 domain. The patch had existed for fifty-nine days."
tags: ["essays", "postmortem", "reliability"]
status: "published"
---

On the morning of Friday, May 12, 2017, the most dangerous computer in a British hospital was not the one running the MRI scanner. It was the ordinary Windows PC that had been waiting patiently for somebody to install an update.

At hospitals across England, staff arrived to find red warning screens where patient systems had been. Files were encrypted. The message demanded $300 in bitcoin. Accident and emergency departments began diverting ambulances. Doctors went back to pen and paper, which remains the only clinical software that has never once asked anyone to restart it in the middle of a shift.

The National Audit Office later counted infection or disruption at 81 of the NHS's 236 trusts in England. Another 603 primary care and other NHS organisations were infected, including 595 GP practices. NHS England identified 6,912 cancelled appointments and estimated that more than 19,000 appointments would have been cancelled in total. Five accident and emergency departments could not treat some patients and had to turn ambulances away.

That is the cold open, but it is not quite the right mental picture. WannaCry did not march into the NHS like a burglar who had studied the floor plan. It wandered the internet knocking on doors at machine speed. The NHS was not specially selected. It was specially reachable.

That distinction matters. A targeted attack says something about the attacker. An untargeted worm says something about everyone it manages to infect.

## A patch, a leak, and a fifty-nine-day fuse

WannaCry spread through SMBv1, an old version of Microsoft's Server Message Block protocol for sharing files and printers on a network. SMBv1 belonged to an earlier and more trusting age of computing, when the machine on the other end of the cable was presumed to be a colleague rather than a hostile program with a stopwatch.

The exploit was called EternalBlue. It had been developed by the United States National Security Agency around a flaw in the way Windows handled SMBv1 traffic. The NSA kept the vulnerability for its own use instead of disclosing it to Microsoft. Then the agency lost control of the tool.

A group calling itself the Shadow Brokers had been leaking stolen NSA material since 2016. It first tried to auction the tools, in what may be the worst business model ever applied to stolen state weapons: announce that you possess them, invite the world's intelligence agencies to identify themselves as customers, then discover that the market for extremely hot cyberweapons is surprisingly price sensitive.

On April 14, 2017, the Shadow Brokers gave the tools away. EternalBlue was suddenly available to anyone who could download a file and read instructions.

Here is the part that turns a scandal into an engineering case study. Microsoft had already released the patch almost a month earlier. Security Bulletin MS17-010 came out on March 14, 2017. It fixed the SMBv1 flaws for supported Windows systems. The outbreak did not begin until May 12.

So the sequence was not:

1. A new vulnerability appears.
2. A worm exploits it before anyone can react.

The sequence was:

1. A government agency finds a vulnerability and keeps it.
2. The agency's exploit is stolen.
3. Microsoft learns enough to issue a patch on March 14.
4. The exploit is published on April 14.
5. Millions of organisations spend the next month not installing the patch.
6. On May 12, the internet holds a practical examination.

Fifty-nine days separated the patch from the outbreak. Twenty-eight days separated public release of the exploit from the outbreak. In security terms, that is not a surprise attack. That is a deadline that was emailed, published, indexed, discussed, and then ignored by an impressive cross-section of the global economy.

WannaCry did not need a victim to open an attachment or visit the wrong website. Once it reached a vulnerable machine, it could use EternalBlue to execute code remotely. It then scanned for other reachable machines and copied itself onward. A person did not have to make a mistake at 9:14 in the morning. The mistake had been scheduled months earlier, in the form of an update nobody had applied and a protocol nobody had turned off.

The payload encrypted files and demanded $300 in bitcoin, with the price set to rise and the files threatened with deletion. As a business, it was badly built. The payment process was clumsy, the attackers used a small set of bitcoin addresses, and there was no reliable way to connect a payment to the correct victim's decryption key. As a fundraising exercise, WannaCry was a failure. As a demonstration of how much of the world's infrastructure was one old protocol away from stopping work, it was devastatingly effective.

## The world tour

The NHS became the public face of the outbreak because hospitals make abstract downtime visible. A cancelled scan is easier to understand than a stalled logistics database. But WannaCry was moving everywhere at once.

Europol estimated that about 200,000 computers in 150 countries were infected. Deutsche Bahn station displays showed the ransom demand instead of train information, which is one way to make a network outage legible to the general public. Telefónica in Spain told employees to shut down computers and disconnect from internal systems. FedEx was hit. Renault halted production at factories while it dealt with infected systems. Russia's Interior Ministry, railway organisations, banks, universities, manufacturers, and government offices all appeared in the casualty lists.

This is what a flat, trusting network does to a local software fault. It gives it frequent flyer status.

An infected laptop is a nuisance. An infected laptop that can freely reach file servers, workstations, medical devices, printers, and forgotten test machines is a distribution network. The worm did not have to defeat a hundred different defences in a hospital. It needed one vulnerable machine with network reach, then it could keep asking the same question of everything nearby: are you patched?

Too many machines answered no.

Windows XP became the mascot of the disaster, and not without reason. XP was unsupported, old, and still embedded in organisations that had built workflows around it. Microsoft took the extraordinary step of releasing an emergency patch for XP and other unsupported systems after the outbreak began. But the popular story that WannaCry mainly ate XP machines is wrong. Kaspersky Lab's analysis found that about 98 percent of infected computers were running Windows 7, while fewer than 0.1 percent were running XP.

That correction makes the lesson worse, not better. The central failure was not simply that a few museums of computing history were still plugged into hospital walls. It was that mainstream, supported Windows 7 machines had not received a critical patch that had been available for fifty-nine days.

Unsupported systems are the dramatic villains because they wear period costume. Unpatched supported systems are the real crowd scene. They look respectable, they pass a casual glance, and there are millions of them.

The NHS investigation exposed another familiar problem: warnings are not controls. NHS Digital had issued alerts about the relevant threat before the attack. The National Audit Office found that the Department of Health had no formal mechanism for checking whether local NHS organisations had acted on them. In other words, the centre could prove that it had sent the email. It could not prove that the patch had been installed.

Every large organisation has a version of that gap. A ticket is opened, so the risk is considered managed. A policy is circulated, so the behaviour is assumed to exist. A dashboard turns amber, then red, then becomes part of the furniture. WannaCry did not exploit a shortage of concern. It exploited the distance between saying a system was maintained and mechanically knowing that it was.

## The ten-dollar fire alarm

The strangest part of WannaCry is that its author accidentally installed an emergency stop and then handed the button to the first researcher curious enough to press it.

Marcus Hutchins was a 22-year-old British security researcher working for Kryptos Logic and writing as MalwareTech. On May 12, while examining the malware, he noticed that before doing its work it tried to contact a long, unregistered domain name made of apparent nonsense.

An unregistered domain in malware is interesting. It might be a command server that has not been activated. It might be a way to track infections. It might be a test. Hutchins registered it for $10.69 so he could see what connected to it.

A flood of connections arrived. Then something unexpected happened: WannaCry stopped encrypting new victims.

The logic appears to have been a sandbox check. Malware analysts often run suspicious programs in controlled environments that simulate the internet and answer requests indiscriminately. If a program asks for a nonsense domain and gets an answer, it may conclude that it is inside an analyst's sandbox and shut down to avoid revealing itself. WannaCry's creator had built a test for a fake internet. Hutchins accidentally made the real internet give the answer.

So the sequence deserves to be stated without decoration. A stolen state exploit was published for free. A worm used it to spread through hospitals, railways, factories, and delivery networks across 150 countries. The outbreak was halted because one researcher spent $10.69 on a domain name he did not know was a kill switch.

In September 2018 terms, that domain purchase would not buy a modest office lunch. On May 12, 2017, it bought the world a weekend.

The kill switch did not repair machines that were already encrypted. It did not patch SMBv1. It did not resurrect cancelled operations by administrative magic. Variants without the same domain check followed, and defenders still had to patch, disconnect, rebuild, and clean networks. But it stopped the original worm's explosive growth and gave system administrators time to work before Monday morning multiplied the damage.

There is a temptation to turn Hutchins into the hero of a simple story: one good hacker defeats a global attack with pocket change. The truth is better and more embarrassing. He was observant, fast, and willing to spend ten dollars on an experiment. The world's emergency brake worked because a talented person noticed an anomaly. That is luck layered on competence. Luck is wonderful to receive and terrible to budget for.

Nobody's disaster recovery plan should contain the step, "Hope a 22-year-old in England is having a productive afternoon."

## The bill and the blame

The NHS eventually estimated the cost of WannaCry at £92 million, split between lost output during the attack and the information technology work needed afterward. Global damage estimates varied widely, from hundreds of millions of dollars to several billions, because the incident included halted production, recovery labour, delayed services, and systems that had to be rebuilt under pressure. The precise global invoice is less important than the shape of it. The attackers demanded $300 per machine. The world paid orders of magnitude more to clean up after them.

That asymmetry is the ransomware economy in miniature. The criminal does not need to collect much if the victim's downtime is expensive enough. A factory does not lose $300 when a workstation locks. It loses the shift, the schedule, the shipment, and the confidence of the customer waiting at the other end.

Attribution took longer than the outbreak. Within days, researchers noticed code similarities between WannaCry and tools associated with the Lazarus Group. In December 2017, the United States and the United Kingdom publicly attributed the attack to North Korea. The UK National Cyber Security Centre assessed that Lazarus was behind it. In September 2018, the United States Department of Justice unsealed a criminal complaint against North Korean programmer Park Jin Hyok, alleging his role in a conspiracy that included WannaCry, the Sony Pictures attack, and the Bangladesh Bank theft.

That made WannaCry a strange diplomatic object: a poorly monetised ransomware worm, built around a stolen American exploit, attributed to a North Korean state group, stopped by a British researcher registering a domain, after hospitals had failed to install a Microsoft patch that had been available since March.

If you put that chain in a novel, an editor would ask you to simplify it.

The attribution also complicates the easy argument that patching is only about criminals looking for money. State actors pick up published exploits too. Once a weapon is public, its next user does not have to share the first user's motives, skill, budget, or restraint. A patch delay is therefore not a private wager between one organisation and ordinary crime. It is an open invitation to anyone who downloads the same tooling, including governments with strange hobbies and very few invoicing requirements.

## The small shop version

Most small businesses do not run a hospital trust, a railway, or a car plant. They run something more fragile: one server that everybody depends on, one backup that nobody has tested, one old PC in the corner because the label printer only works with it, and one person who "does the computers" in addition to their actual job.

WannaCry's lesson for that shop is not "fear North Korea." It is more domestic.

Patch latency is exposure. A critical update does not become real when the vendor publishes it. It becomes real when the machines are rebooted, the update is confirmed, and the exceptions are named. "We generally keep things updated" is not a security posture. It is a weather report.

Flat networks multiply mistakes. The machine that browses the web should not automatically enjoy intimate access to the file server, the accounting system, the backups, and the weird old PC that runs the door controller. Segmentation is not enterprise theatre. It is deciding in advance which room a fire is allowed to occupy.

Unsupported systems need a fence and a funeral date. Every organisation has one application that supposedly cannot be moved. Sometimes that is even true. The answer is not to let the ancient machine roam the whole network because it is special. Isolate it, restrict what it can reach, back up its data, and write down the date by which the dependency dies. A legacy system without an exit plan is not being preserved. It is being allowed to vote on the future.

[Backups are not backups until a restore has worked](/technology/replay). WannaCry encrypted files at scale. Ransomware becomes an extinction event when the only copies are attached to the same network and writable by the same compromised credentials. An offline or properly isolated copy changes the negotiation from "pay strangers and hope" to "lose time, rebuild, and learn an expensive lesson." Still bad. Much less fatal.

Verification beats announcement. The NHS could show that alerts had been issued. What it lacked was [a reliable way to prove local compliance](/technology/evidence). A small shop does not need a giant compliance department to do better. It needs a list of machines, their operating systems, their patch state, and a person who checks the list against reality. If the list says twelve computers and the office contains fourteen, the finding is not that arithmetic is hard. The finding is that two unmanaged machines are waiting to introduce themselves during an incident.

Finally, turn off what you do not use. SMBv1 survived in countless environments because it was there, not because the organisation had held a meeting and voted for a legacy file sharing protocol. Defaults are decisions that nobody remembers making. Attackers are excellent at finding them.

## What WannaCry really proved

WannaCry is usually filed under ransomware, but ransomware was only the payload. The event itself was a patching failure, a network design failure, an inventory failure, and a governance failure, all travelling inside a worm that did not know or care which organisation it had entered.

It also proved that modern systems fail by connection. The NSA's secret became the Shadow Brokers' leak. The leak became a worm. The worm became a hospital cancellation, a railway display, a factory stoppage, and a delivery delay. Each step crossed an organisational boundary that looked solid until pressure arrived.

And it proved that resilience sometimes depends on a tiny, almost comic asymmetry. The vulnerability had been hoarded by an intelligence agency. The exploit was released by anonymous thieves. The patch sat uninstalled for fifty-nine days. The damage ran into the millions. The emergency stop cost $10.69.

That is not a comforting story about the internet. It is an accurate one.

The patch was free. The domain cost $10.69. The expensive part was everything that happened because the world installed neither in time.

Sources, for the record: Microsoft Security Bulletin MS17-010, March 14, 2017; Europol statements on the May 2017 outbreak; National Audit Office, "Investigation: WannaCry cyber attack and the NHS," October 27, 2017; Department of Health and Social Care cost estimate reported in October 2018; Marcus Hutchins's MalwareTech account of registering the kill switch domain; Kaspersky Lab analysis of infected operating systems; UK National Cyber Security Centre attribution statement, December 19, 2017; United States Department of Justice criminal complaint against Park Jin Hyok, unsealed September 6, 2018.
