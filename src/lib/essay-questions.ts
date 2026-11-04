import type { FaqItem } from "@/types/faq";

/**
 * Per essay questions (Wave 31 pilot, Wave 32 batch 2, Wave 33 batch 3, Wave 34 batch 4, Wave 35 batch 5, Wave 36 batch 6, Wave 37 final batch, Wave 38 same wave addition, Wave 39 same wave addition, Wave 40 same wave addition, Wave 43 same wave addition, regrade defect 7).
 *
 * Each entry answers questions a reader would ask after that essay,
 * written only from the essay's own body text. The claim to essay
 * mapping for every answer is recorded in the Wave 31 receipt.
 *
 * Storage rule for this pilot: questions live here, keyed by slug,
 * never inside the essay Markdown files, so essay bodies stay
 * untouched. A slug with no entry renders no questions section and
 * no FAQPage schema, exactly as posts rendered before this wave.
 */
export const ESSAY_QUESTIONS: Record<string, FaqItem[]> = {
  "the-retry-that-charged-twice": [
    {
      id: "retry-q1",
      category: "essay-questions",
      question: "Why did the customer end up with two charges for one purchase?",
      answer:
        "The server charged the card and created the order, but the response died on the way back, so the customer clicked buy again. The server treated the second click as a new request, and the result was two orders and two charges.",
    },
    {
      id: "retry-q2",
      category: "essay-questions",
      question: "What does idempotency mean?",
      answer:
        "Idempotency means an operation can be applied more than once and produce the same result as applying it once. The essay compares it to an elevator button: pressing it twelve times does not send twelve elevators.",
    },
    {
      id: "retry-q3",
      category: "essay-questions",
      question: "How does an idempotency key stop a retry from duplicating work?",
      answer:
        "The client attaches a unique identity to the first request, and the server records that identity with the result. If the same identity arrives again, the server returns the original result instead of redoing the work.",
    },
  ],
  "the-scheduler-said-it-ran": [
    {
      id: "scheduler-q1",
      category: "essay-questions",
      question: "What happened when the job's occurrences were coalesced?",
      answer:
        "When a scheduled run could not start, the platform folded it into the next occurrence and marked the folded one cancelled. Three mornings in a row the job simply never started, while the record showed a tidy calendar and an untouched workload.",
    },
    {
      id: "scheduler-q2",
      category: "essay-questions",
      question: "How does the factory judge whether a standing job really ran?",
      answer:
        "Every standing job is judged by a three-part test: a start time, a finish time, and an artifact it produced. If a job cannot show all three, its status is UNKNOWN, not probably fine.",
    },
    {
      id: "scheduler-q3",
      category: "essay-questions",
      question: "Why is an exit code not enough to prove a job succeeded?",
      answer:
        "A job can run and report success while the world it checks has stopped reporting honestly, as the factory's heal jobs once did for a stale safety file. An exit code tells you the job believes it succeeded, while an artifact lets you check whether the world agrees.",
    },
  ],
  "the-440-million-typo": [
    {
      id: "knight-q1",
      category: "essay-questions",
      question: "Why did the eighth server run different code from the other seven?",
      answer:
        "The rollout was manual: a technician copied the new software to seven of the eight servers, and the eighth kept the old build. Buried in that old build was dormant Power Peg test code, and the flag that activated the new feature on the updated servers woke the old code on the eighth.",
    },
    {
      id: "knight-q2",
      category: "essay-questions",
      question: "What did Power Peg do once the market opened, and what did it cost?",
      answer:
        "The eighth server began doing what Power Peg was designed to do in a test environment: buy high, sell low, over and over, at machine speed. Knight lost about $440 million in roughly forty-five minutes.",
    },
    {
      id: "knight-q3",
      category: "essay-questions",
      question: "What three fences does the essay say Knight did not have?",
      answer:
        "The essay lists three: dead code gets deleted instead of left in place with its activation flag wired up, deployments verify mechanically what version every node is running, and a kill switch that is actually a switch.",
    },
  ],
  "airplane-mode-postmortem": [
    {
      id: "airplane-q1",
      category: "essay-questions",
      question: "Why did the understudy machine stay silent for roughly twenty-three hours?",
      answer:
        "The machine was on and healthy, but a human had put it in airplane mode, so its radios were off. It had obeyed that instruction completely, and it stayed silent until the owner physically reached it and flipped the toggle.",
    },
    {
      id: "airplane-q2",
      category: "essay-questions",
      question: "What does silent-host triage check first now?",
      answer:
        "Triage now starts with a written ladder: power, radios, cable, address, route, service, application, in that order. No rung may be skipped because it feels beneath the incident, and the ladder is short enough to run in ten minutes.",
    },
    {
      id: "airplane-q3",
      category: "essay-questions",
      question: "What happened when the toggle was flipped back?",
      answer:
        "The understudy came back the moment the toggle flipped, with all services green and no data lost. The only casualty was a day of overflow capacity.",
    },
  ],
  "the-standup-is-a-distributed-system": [
    {
      id: "standup-q1",
      category: "essay-questions",
      question: "What three fields does each standup participant broadcast?",
      answer:
        "Each participant broadcasts what they committed since the last sync, what they plan to commit next, and whether they are blocked. The essay calls that format, yesterday, today, blockers, a heartbeat with a schema.",
    },
    {
      id: "standup-q2",
      category: "essay-questions",
      question: "Why does the essay say to write updates down on a board?",
      answer:
        "A written board is a shared log that every participant can read, so every node ends up holding approximately the same model of the work. If an update is not on the board, the essay says it did not reach consensus.",
    },
    {
      id: "standup-q3",
      category: "essay-questions",
      question: "What quorum rule does the essay give for split-brain standups?",
      answer:
        "When the team partitions, each side can reach its own consensus and commit its own work, and the merge later costs more than the partition did. The essay quorum rule is that decisions made without the decision owner in the partition are proposals, not commits.",
    },
  ],
  "what-a-hash-taught-us-about-trust": [
    {
      id: "hash-q1",
      category: "essay-questions",
      question: "What happens to a hash when a single bit of the input changes?",
      answer:
        "Change a single bit anywhere in the input and the fingerprint changes completely. The same input always returns the same fingerprint, on any machine, and a different input returns a different fingerprint.",
    },
    {
      id: "hash-q2",
      category: "essay-questions",
      question: "How does the factory use a hash to prove an artifact arrived intact?",
      answer:
        "When a worker finishes a unit of work, it records the fingerprint of the artifact, and the receiver computes the fingerprint again when it lands. A match means the thing is the thing, and a mismatch means it is not, regardless of what any report, filename, or timestamp claims.",
    },
    {
      id: "hash-q3",
      category: "essay-questions",
      question: "Why is verification different from asking a worker to explain itself?",
      answer:
        "An explanation is just more output from the worker, with the same provenance problems as the original output. Verification asks the work to be checkable by a path that does not pass through the worker at all.",
    },
  ],
  "the-space-probe-that-measured-in-pounds": [
    {
      id: "orbiter-q1",
      category: "essay-questions",
      question: "What unit mismatch destroyed the Mars Climate Orbiter?",
      answer:
        "The contractor software reported each thruster nudge in pound-force seconds, while NASA navigation software expected newton-seconds. Every correction was therefore off by a factor of about 4.45, in the same direction, for nine months.",
    },
    {
      id: "orbiter-q2",
      category: "essay-questions",
      question: "How close did the orbiter come to Mars, and what happened to it?",
      answer:
        "On September 23, 1999, it came around Mars at about 57 kilometers above the surface, below the minimum survivable altitude of somewhere around 80 to 85 kilometers. It either burned up or skipped off into a solar orbit, and it never phoned home again.",
    },
    {
      id: "orbiter-q3",
      category: "essay-questions",
      question: "What simple test would have caught the mismatch?",
      answer:
        "Push a known value in one side of the interface boundary and check what the other side believes it received. The essay says that test costs an afternoon and would have caught a factor of 4.45 in about nine seconds.",
    },
  ],
  "the-machine-that-trusted-its-software": [
    {
      id: "therac-q1",
      category: "essay-questions",
      question: "What safety change did the Therac-25 make compared with earlier models?",
      answer:
        "Earlier models had hardware interlocks, physical mechanisms that made certain dangerous states impossible no matter what the software believed. The Therac-25 removed most of those interlocks and gave their job to software.",
    },
    {
      id: "therac-q2",
      category: "essay-questions",
      question: "Which operators were most likely to trigger the race condition, and why?",
      answer:
        "The bug appearance depended on timing, in this case on how quickly a skilled operator typed, so fast, experienced operators were the ones most likely to trigger it. The machine could then report that no dose had been delivered when the electron beam had in fact fired at full power.",
    },
    {
      id: "therac-q3",
      category: "essay-questions",
      question: "Why had the reused software not earned its reputation on its own?",
      answer:
        "The software was reused and adapted from earlier machines whose hardware had silently covered for its flaws. The investigations also found no independent verification of the safety-critical code.",
    },
  ],
  "the-night-gitlab-deleted-itself": [
    {
      id: "gitlab-q1",
      category: "essay-questions",
      question: "How did GitLab delete roughly 300 gigabytes of production data?",
      answer:
        "An engineer working on a replication problem opened a terminal believed to be on the secondary database server and ran a command to clear out its data directory. The terminal was connected to the primary, so the command deleted roughly 300 gigabytes of live production data.",
    },
    {
      id: "gitlab-q2",
      category: "essay-questions",
      question: "Why did the backup and replication methods not save the data?",
      answer:
        "The database dumps had been failing silently because of a version mismatch, replication faithfully replicated the deletion, cloud disk snapshotting had not been enabled for that server, and the backup to object storage was an empty bucket. The best recovery source was a manually created backup that was hours old.",
    },
    {
      id: "gitlab-q3",
      category: "essay-questions",
      question: "What does the essay say a backup actually is?",
      answer:
        "A backup is not a file. A backup is a restore you have actually performed, because GitLab had copies but lacked evidence that the copies could become a database again.",
    },
  ],
  "the-rocket-that-overflowed": [
    {
      id: "rocket-q1",
      category: "essay-questions",
      question: "What conversion overflowed and destroyed Ariane 5?",
      answer:
        "A 64-bit floating point number representing horizontal velocity was converted into a 16-bit signed integer, and the number was too large, so the conversion overflowed. Thirty-seven seconds into its first flight on June 4, 1996, the rocket veered off course, began breaking apart, and was destroyed by its own range safety system.",
    },
    {
      id: "rocket-q2",
      category: "essay-questions",
      question: "Why did redundancy not save the rocket?",
      answer:
        "Both inertial reference units ran the same software with the same hidden assumption, so the backup had already failed the same way, for the same reason. Redundancy protected against random hardware failure, but it did not protect against identical software making the identical mistake.",
    },
    {
      id: "rocket-q3",
      category: "essay-questions",
      question: "What does reused code carry with it?",
      answer:
        "Every reused component carries the border conditions of the world it was born in: ranges, timings, loads, and assumptions packed quietly into the crate. Ariane 4's code was not sloppy; it was fitted to Ariane 4, and Ariane 5 asked it to live in a different physics.",
    },
  ],
  "the-update-that-grounded-the-planet": [
    {
      id: "update-q1",
      category: "essay-questions",
      question: "How many Windows devices were affected, and what did the update do to them?",
      answer:
        "Microsoft later estimated about 8.5 million Windows devices were affected. The sensor read outside the intended bounds, Windows responded to a misbehaving kernel-level driver, and the machine entered a boot loop that, for many organizations, had to be fixed by hand, machine by machine.",
    },
    {
      id: "update-q2",
      category: "essay-questions",
      question: "What is a canary deployment, in the essay's terms?",
      answer:
        "A canary releases to a tiny slice first, watches, then widens. The essay calls it humility with a pipeline: our confidence is finite, so our exposure should be finite too.",
    },
    {
      id: "update-q3",
      category: "essay-questions",
      question: "What does the essay argue about trust and blast radius?",
      answer:
        "Trust should be wide, but blast radius should be narrow, with staged rings even for fast channels and an automatic halt when the first ring reports elevated crashes. July 19, 2024 is what happens when only the first half gets engineered.",
    },
  ],
  "the-boat-that-stopped-the-world": [
    {
      id: "boat-q1",
      category: "essay-questions",
      question: "How long was the Ever Given stuck, and how many vessels waited?",
      answer:
        "The Ever Given ran aground in a narrow, single-lane stretch of the canal during a sandstorm with strong winds and sat wedged between the banks for six days. More than 400 vessels waited by the time the ship was refloated on March 29, helped by dredging, tugboats, and a full moon's tide.",
    },
    {
      id: "boat-q2",
      category: "essay-questions",
      question: "What property had the supply chain optimized away?",
      answer:
        "The system had optimized away margin, the part of a design that looks wasteful on every ordinary day and priceless on the one extraordinary day. The cost of margin is continuous and visible, while the cost of its absence is rare and total.",
    },
    {
      id: "boat-q3",
      category: "essay-questions",
      question: "What does the factory keep as its version of margin?",
      answer:
        "The factory keeps a protected reserve of free space that normal work may never allocate, enforced before pressure, not apologized for after. On the day a runaway process starts eating the disk, that reserve is where the logs, the tools, and the recovery work live while you fix the thing that is trying to kill the machine.",
    },
  ],
  "the-bug-that-didnt-bite": [
    {
      id: "y2k-q1",
      category: "essay-questions",
      question: "Why would the year 2000 be mistaken for 1900?",
      answer:
        "For decades, software stored years as two digits, because memory was expensive and 19 was the century of everyone who wrote the code. When the calendar rolled to 2000, 00 would be indistinguishable from 1900, and every calculation that depended on dates risked going politely insane.",
    },
    {
      id: "y2k-q2",
      category: "essay-questions",
      question: "What did the Y2K remediation actually consist of?",
      answer:
        "It was a census: find every system, find every date, decide what breaks, fix it, and test it, ideally by rolling clocks forward in a lab. The essay calls it maintenance as a heroic act, performed at global scale, with a deadline set by the rotation of the Earth.",
    },
    {
      id: "y2k-q3",
      category: "essay-questions",
      question: "Why does successful prevention look like hype?",
      answer:
        "Prevention that works looks, from the outside, identical to prevention that was never needed, and the budget holder cannot see the counterfactual. The work succeeded, and the success erased the evidence that the work was necessary.",
    },
  ],
  "the-blackout-was-a-software-bug": [
    {
      id: "blackout-q1",
      category: "essay-questions",
      question: "What triggered the 2003 blackout, and what hid it from operators?",
      answer:
        "A sagging power line in northern Ohio brushed against some poorly trimmed trees and shorted out. A race condition in the alarm software then failed silently, so the operators' screens did not show the alarms that would have told them lines were tripping.",
    },
    {
      id: "blackout-q2",
      category: "essay-questions",
      question: "What two jobs does every monitoring system have?",
      answer:
        "Every monitoring system has two jobs: detect the problem, and detect its own death. The absence of a heartbeat is itself information, if someone built the system to treat silence as a signal rather than as the sound of everything being fine.",
    },
    {
      id: "blackout-q3",
      category: "essay-questions",
      question: "How did the factory change its reporting after a worker died mid-job?",
      answer:
        "Every claim now carries a heartbeat and a deadline in a journal the worker does not own, and a missed heartbeat is recorded as an event, loudly, by machinery that does not depend on the thing it watches. Absence became data.",
    },
  ],
  "the-day-facebook-deleted-itself": [
    {
      id: "facebook-q1",
      category: "essay-questions",
      question: "What command made Facebook vanish on October 4, 2021?",
      answer:
        "During routine maintenance, a command issued to assess the capacity of the global backbone network withdrew the BGP routes that told the internet where Facebook's DNS servers lived. A bug in the audit tool that was supposed to catch dangerous commands let this one through.",
    },
    {
      id: "facebook-q2",
      category: "essay-questions",
      question: "Why was recovery so hard once the routes were withdrawn?",
      answer:
        "Facebook's internal systems ran on the same network it had just withdrawn, so the tools engineers needed to fix the problem were unreachable by the problem. Engineers who physically went to the data centers found their access badges did not work, because the badge system also depended on the vanished network.",
    },
    {
      id: "facebook-q3",
      category: "essay-questions",
      question: "How does the factory decide whether a safety gate can be trusted?",
      answer:
        "A check is not trusted because it exists, but because a known-bad artifact fails it and a known-good one passes, on the record, repeatedly. A gate that has never demonstrably caught anything is a decoration with a confident name.",
    },
  ],
  "the-typo-that-emptied-the-shelves": [
    {
      id: "shelves-q1",
      category: "essay-questions",
      question: "What did the mistyped command actually remove?",
      answer:
        "One of the inputs was entered incorrectly, so the command removed a larger set of servers than intended, including machines that supported the index and placement subsystems. The command did not fail; it worked perfectly and removed exactly the servers it was told to remove.",
    },
    {
      id: "shelves-q2",
      category: "essay-questions",
      question: "Why did losing the index matter if the data itself was safe?",
      answer:
        "Billions of objects sat safely on disks in Virginia, intact, checksummed, and unharmed, but the map to the data was being rebuilt. Without the index, S3 in US-EAST-1 could not service requests at all while both subsystems restarted.",
    },
    {
      id: "shelves-q3",
      category: "essay-questions",
      question: "What did Amazon change after the outage instead of blaming the engineer?",
      answer:
        "The tool was modified to remove capacity more slowly, with safeguards to prevent any subsystem from dropping below its minimum required capacity. Amazon also moved to partition the index into smaller cells and rebuilt the dashboard console to run across multiple regions.",
    },
  ],
  "the-day-the-phone-book-burned": [
    {
      id: "phonebook-q1",
      category: "essay-questions",
      question: "Why were healthy websites unreachable during the Dyn attack?",
      answer:
        "The attack did not break the websites; it broke the directions to them. Dyn's DNS infrastructure drowned in junk traffic, so legitimate questions about where a site lived could not get through, even though the sites' own servers were fine.",
    },
    {
      id: "phonebook-q2",
      category: "essay-questions",
      question: "How did Mirai recruit its botnet?",
      answer:
        "Mirai scanned for devices with telnet open and tried a built-in list of 62 factory default username and password combinations. If one pair worked, the device quietly joined the botnet and began scanning for the next device.",
    },
    {
      id: "phonebook-q3",
      category: "essay-questions",
      question: "What was the revised size of the attacking botnet, and why did the first count mislead?",
      answer:
        "Dyn revised its estimate to up to about 100,000 malicious endpoints. The earlier count of tens of millions of IP addresses was inflated by the retry storm, as legitimate resolvers asked again and again because the first answer never came.",
    },
  ],
  "the-worm-that-ate-the-hospitals": [
    {
      id: "wannacry-q1",
      category: "essay-questions",
      question: "How long had the patch existed before WannaCry struck?",
      answer:
        "Microsoft released the patch in Security Bulletin MS17-010 on March 14, 2017, and the outbreak began on May 12. Fifty-nine days separated the patch from the outbreak, and twenty-eight days separated the public release of the exploit from the outbreak.",
    },
    {
      id: "wannacry-q2",
      category: "essay-questions",
      question: "Which operating system ran on most infected machines?",
      answer:
        "About 98 percent of infected computers were running Windows 7, while fewer than 0.1 percent were running Windows XP. The central failure was that mainstream, supported Windows 7 machines had not received a critical patch that had been available for fifty-nine days.",
    },
    {
      id: "wannacry-q3",
      category: "essay-questions",
      question: "How did a $10.69 domain registration stop the worm?",
      answer:
        "Marcus Hutchins registered an unregistered domain the malware tried to contact, for $10.69, and WannaCry then stopped encrypting new victims. The logic appears to have been a sandbox check: a program that gets an answer from a nonsense domain may conclude it is inside an analyst's sandbox and shut down.",
    },
  ],
  "the-most-expensive-second-in-history": [
    {
      id: "leap-q1",
      category: "essay-questions",
      question: "What made the 2012 leap second livelock Linux machines?",
      answer:
        "The leap second code set the system clock back one second, but the call to clock_was_set() had been removed in 2007, so the high-resolution timer bases never adjusted. Timers set for less than a second ahead were suddenly in the past, fired immediately, and kept re-arming and expiring in a loop.",
    },
    {
      id: "leap-q2",
      category: "essay-questions",
      question: "How does Google's leap smear avoid the problem?",
      answer:
        "Google spreads the extra second across a twenty-hour window centered on the event, slowing every clock by roughly fourteen parts per million. No timestamp repeats and no duration goes negative, and Google's one rule is never to mix smeared and unsmeared time sources.",
    },
    {
      id: "leap-q3",
      category: "essay-questions",
      question: "Why did Cloudflare's resolver panic in 2017?",
      answer:
        "A lookup that straddled the clock step produced a round trip of roughly negative one second, and the smoothed value eventually crossed below zero. That negative number reached Go's rand.Int63n(), which panics when the limit it is given is negative, so RRDNS panicked and CNAME lookups failed.",
    },
  ],
  "the-certificate-that-expired": [
    {
      id: "equifax-q1",
      category: "essay-questions",
      question: "How long was Equifax's traffic inspector blind, and why?",
      answer:
        "Its SSL certificate expired on January 31, 2016, and for 19 months the appliance passed traffic through while inspecting none of it. When the certificate expired, the device failed open instead of stopping traffic or refusing to work.",
    },
    {
      id: "equifax-q2",
      category: "essay-questions",
      question: "Why did Equifax's scans miss the vulnerable system?",
      answer:
        "The scans came back clean because the scan examined the root directory of the system and not the subdirectory where Apache Struts was actually listed. A mis-aimed check produced output that looked exactly like a passed check, so the clean result was treated as a fact about the world.",
    },
    {
      id: "equifax-q3",
      category: "essay-questions",
      question: "What did the attackers reach beyond the dispute portal, and how?",
      answer:
        "ACIS was not walled off from the rest of the network, and an unsecured file held administrative usernames and passwords in plain text. With harvested credentials the attackers reached 48 other databases that had nothing to do with consumer disputes, running about 9,000 queries over 76 days.",
    },
  ],
  "the-phone-that-became-a-grenade": [
    {
      id: "note7-q1",
      category: "essay-questions",
      question: "What was wrong with the first Note 7 battery?",
      answer:
        "Battery A's cell pouch provided inadequate volume for the electrode assembly, so the assembly was compressed and the negative electrode deflected in the corner of the cell. Bent electrodes stressed the thin separator, creating paths to an internal short circuit and thermal runaway.",
    },
    {
      id: "note7-q2",
      category: "essay-questions",
      question: "Why did the replacement phones catch fire too?",
      answer:
        "Battery B was a different battery with a different defect: ultrasonic welding burrs on the positive tab could be driven through the insulation tape and separator into the negative electrode, and some cells had no insulation tape at all. The defect arrived when production ramped up suddenly to supply millions of replacement cells.",
    },
    {
      id: "note7-q3",
      category: "essay-questions",
      question: "What did the final investigation test, and what did it conclude?",
      answer:
        "Samsung put roughly 700 researchers and engineers on the problem and tested more than 200,000 fully assembled devices and more than 30,000 batteries. It concluded the phone's hardware and software were exonerated and the fires came from the batteries, plural, with separate causes, plural.",
    },
  ],
  "the-update-everyone-trusted": [
    {
      id: "trusted-q1",
      category: "essay-questions",
      question: "Why did the signature on the Orion update not protect customers?",
      answer:
        "SolarWinds signed the trojanized updates with its legitimate digital signature, because the compromise lived upstream of the signature, in the build system. The signature verified that the package came from SolarWinds' build pipeline, and it said nothing about what was inside.",
    },
    {
      id: "trusted-q2",
      category: "essay-questions",
      question: "How did SUNSPOT insert the backdoor without leaving it in the source code?",
      answer:
        "SUNSPOT sat on the build host and watched for MSBuild.exe to start, then quietly swapped one source file for a version carrying the SUNBURST backdoor while the build proceeded. Before anyone could notice, it restored the original file, and it checked file hashes first so it would stand down if a developer had legitimately modified that file.",
    },
    {
      id: "trusted-q3",
      category: "essay-questions",
      question: "How many organizations installed the poisoned update, and how many were entered in person?",
      answer:
        "SolarWinds believed fewer than 18,000 customers may have installed an Orion product containing the vulnerability. Of those, a much smaller number were compromised by follow-on activity: fewer than ten U.S. government agencies were identified at first, and the White House later put the figures at about 100 companies alongside nine federal agencies.",
    },
  ],
  "the-sensor-that-voted-alone": [
    {
      id: "sensor-q1",
      category: "essay-questions",
      question: "Why did MCAS keep pushing the nose down on the Lion Air flights?",
      answer:
        "The replacement left angle of attack sensor carried a 21 degree bias that the installation test did not detect, so the airplane's left side believed the nose was pointed far higher than it was. MCAS read that one sensor and no other, believed it too, and acted on the belief by pushing the nose down.",
    },
    {
      id: "sensor-q2",
      category: "essay-questions",
      question: "Why was one sensor reading enough for MCAS to act on?",
      answer:
        "MCAS listened to a single angle of attack sensor, alternately assigned, with no vote, no comparison, and no cross-check, even though the airplane carries two sensors. That single-sensor property never changed while its authority grew to 2.5 degrees per activation and it gained the ability to fire, reset, and fire again.",
    },
    {
      id: "sensor-q3",
      category: "essay-questions",
      question: "What did the return-to-service fix require MCAS to do differently?",
      answer:
        "MCAS now reads both angle of attack sensors and compares them continuously, and if they disagree by more than 5.5 degrees it disables itself for the remainder of the flight and tells the crew. It can activate only once per high angle of attack event, and its authority is limited so pilots can always overpower it with the control column alone.",
    },
  ],
  "the-airline-that-lost-its-planes": [
    {
      id: "airline-q1",
      category: "essay-questions",
      question: "What actually failed in Southwest's crew scheduling software?",
      answer:
        "SkySolver never stopped working; it was overwhelmed by the pace and volume of close-in crew and schedule changes, so individual crew assignments stopped being updated in a timely manner. The schedule said crews were places they were not, and every automated answer the airline generated was partially fictional.",
    },
    {
      id: "airline-q2",
      category: "essay-questions",
      question: "Why did the point to point network make the failure worse?",
      answer:
        "In a point to point network every link in the chain is load-bearing: cancel one leg and the plane is out of position for the next leg, and the crew is out of position for the leg after that. Planes and crews ended up scattered across dozens of cities, each one a small separate puzzle that only the scheduling system could solve at once.",
    },
    {
      id: "airline-q3",
      category: "essay-questions",
      question: "How did Southwest reset its operation, and what was the final count?",
      answer:
        "Southwest cut its operation to about one third of its normal schedule for several days while airplanes and crews were repositioned into legal, known configurations. By the Department of Transportation's count, 16,900 flights were cancelled and over two million passengers were stranded across the holiday period.",
    },
  ],
  "one-password-no-second-factor": [
    {
      id: "colonial-q1",
      category: "essay-questions",
      question: "How did the attackers get into Colonial Pipeline's network?",
      answer:
        "They used a legacy VPN profile that was not intended to be in use and that had single-factor authentication only. The password was complicated, but investigators found it had surfaced in a batch of leaked credentials circulating on the dark web, so a strong password that had leaked was no longer a secret.",
    },
    {
      id: "colonial-q2",
      category: "essay-questions",
      question: "Did the ransomware itself stop the pipeline?",
      answer:
        "No. The ransomware hit Colonial's information technology systems, and the operational technology that physically runs the pipe was not shown to be compromised. Colonial itself shut down all 5,500 miles within roughly an hour of the ransom note being found, because it could not verify the integrity of everything downstream of a breached network.",
    },
    {
      id: "colonial-q3",
      category: "essay-questions",
      question: "How much of the ransom did the FBI recover, and how?",
      answer:
        "Colonial paid 75 bitcoin, about $4.4 million, and the FBI traced the ransom on Bitcoin's public ledger to an address holding approximately 63.7 of the 75 bitcoin. With a seizure warrant the government seized those 63.7 bitcoin, worth about $2.3 million by then, using a private key the affidavit said the FBI had.",
    },
  ],
  "the-day-the-market-fell-off-a-cliff": [
    {
      id: "flashcrash-q1",
      category: "essay-questions",
      question: "What instruction did the sell algorithm follow on May 6, 2010?",
      answer:
        "The algorithm was handed a sell program of 75,000 E-mini contracts, worth approximately $4.1 billion, with a single instruction: sell at a rate equal to 9 percent of the trading volume over the previous minute. In the joint report's words, it targeted that rate without regard to price or time, and it finished in about twenty minutes.",
    },
    {
      id: "flashcrash-q2",
      category: "essay-questions",
      question: "What was the hot-potato volume effect?",
      answer:
        "High-frequency firms bought from the sell algorithm and sold to each other, passing the same positions around at machine speed instead of accumulating them. Between 2:45:13 and 2:45:27 p.m. they traded over 27,000 contracts, roughly 49 percent of all the volume in the market, while increasing their net position by about 200 contracts.",
    },
    {
      id: "flashcrash-q3",
      category: "essay-questions",
      question: "What stopped the plunge?",
      answer:
        "The CME's Stop Logic paused trading in the E-mini contract for five seconds, firing at 2:45:28 p.m. In that pause sell-side pressure partly drained away and buy-side interest crept back, trading resumed at 2:45:33 p.m., and prices stabilized and began to recover.",
    },
  ],
  "the-bank-that-moved-house": [
    {
      id: "tsb-q1",
      category: "essay-questions",
      question: "What went wrong in the first twenty minutes after TSB reopened?",
      answer:
        "Customers reported that savings had vanished from their accounts and that small purchases had been recorded as costing thousands of pounds, and some customers who logged in were presented with somebody else's accounts. TSB later put that last failure at 402 customers, during a 20-minute window that Sunday, who were able to view data that was not theirs.",
    },
    {
      id: "tsb-q2",
      category: "essay-questions",
      question: "Why did the big bang cutover make the failure total?",
      answer:
        "The customer data moved all at once in one weekend, with no phased rollout by region or customer group, no long period of the two platforms running side by side with real traffic, and no clean way back because the old platform was being vacated. The cutover design converted every ordinary error into a total one.",
    },
    {
      id: "tsb-q3",
      category: "essay-questions",
      question: "What did the reviews find about TSB's readiness and defect count?",
      answer:
        "IBM said it had not seen evidence of the application of a rigorous set of go-live criteria to prove production readiness. The Slaughter and May review found that only one of TSB's two data centres had been through performance testing before go-live, and reporting on the review put the known defects at go-live at about 2,000, against about 800 the board had been told.",
    },
  ],
  "the-graduate-student-who-counted-the-internet": [
    {
      id: "morris-q1",
      category: "essay-questions",
      question: "Why did Morris release the worm, and what was it meant to do?",
      answer:
        "Morris wanted to measure the internet: the program would quietly copy itself from machine to machine, settle in, and send back a signal, so someone could count the network for the first time. In 1988 there was no registry to query and no census to take, and nobody knew how large the internet was.",
    },
    {
      id: "morris-q2",
      category: "essay-questions",
      question: "How did the one in seven override defeat the worm population control?",
      answer:
        "Before installing itself, the worm asked whether a copy was already running, and a yes normally made the new arrival die. One time in seven it installed itself anyway, to catch administrators bluffing with a fake yes, so busy machines accumulated copies until the processor spent all of its time running the census.",
    },
    {
      id: "morris-q3",
      category: "essay-questions",
      question: "What institution did the worm accidentally create?",
      answer:
        "Within days of the worm, DARPA directed the Carnegie Mellon Software Engineering Institute to stand up the CERT Coordination Center, a permanent place to call that could receive reports, verify them, recruit experts, work with vendors, and publish advice. It had no authority to command anyone.",
    },
  ],
  "the-grid-problem": [
    {
      id: "grid-q1",
      category: "essay-questions",
      question: "What failures does Episode 3 follow?",
      answer:
        "The episode follows a winter storm in Texas that forced the grid to choose who goes dark, a solar storm that collapsed the Quebec network in ninety seconds, and an alarm in Ohio that failed silently while a blackout assembled itself around it.",
    },
    {
      id: "grid-q2",
      category: "essay-questions",
      question: "Where can Episode 3 be watched, listened to, and read?",
      answer:
        "The film is on YouTube, the episode is on Spotify, the full film is on Facebook, and Substack carries the transcripts and companion essays for the whole series, ad-free, in your inbox.",
    },
    {
      id: "grid-q3",
      category: "essay-questions",
      question: "What does the post say reliability is?",
      answer:
        "Every system has a grid story hiding inside it: a dependency nobody mapped, an alarm nobody tested, a margin that existed only on paper. The post calls reliability the discipline of knowing what your system will do on its worst day, and being able to prove it before that day arrives.",
    },
  ],
  "the-water-wheel-problem": [
    {
      id: "waterwheel-q1",
      category: "essay-questions",
      question: "What world does Episode 2 trace the trade away from?",
      answer:
        "Before the grid, power was made where it was used, by a water wheel its owner could see, touch, and repair. Episode 2 traces the trade for centralised generation and continent-spanning transmission, what was gained, what was quietly lost, and why the argument between the two models never actually ended.",
    },
    {
      id: "waterwheel-q2",
      category: "essay-questions",
      question: "Where is Episode 2 live, and how much of it is out?",
      answer:
        "Chapters 1 to 10 are live now on YouTube and Rumble. The remaining chapters are in production, and Episode 3, The Grid Problem, is already out in full.",
    },
    {
      id: "waterwheel-q3",
      category: "essay-questions",
      question: "Where do the transcripts and companion essays live?",
      answer:
        "Transcripts and companion essays for The Long Ping live on PING on Substack, ad-free. The Episode 1 five-part transcript series is there in full, starting with Part 1: The Authority.",
    },
  ],
  "what-survives-10000-years": [
    {
      id: "survives-q1",
      category: "essay-questions",
      question: "What is the central distinction in Episode 1 and design spec?",
      answer:
        "Preserving bits is not preserving meaning. Episode 1 climbs a seven-rung ladder (bits, file, format, meaning, context, authority, civilisation), breaks every rung on purpose, and converts what survives into a design spec: design for the carrier, not the receiver.",
    },
    {
      id: "survives-q2",
      category: "essay-questions",
      question: "How is every claim on the show graded?",
      answer:
        "Every claim on the show is graded live: receipt, BS, or thought experiment. The grades stick.",
    },
    {
      id: "survives-q3",
      category: "essay-questions",
      question: "Where can the full Episode 1 transcript be read?",
      answer:
        "The complete Episode 1 transcript is published in five parts on PING on Substack, from Part 1: The Authority to Part 5: The 10,000 Year. The short version in the post is that a system that cannot remember cannot be trusted with anything that matters.",
    },
  ],
  "why-continuity-matters-for-ai-agents": [
    {
      id: "continuity-q1",
      category: "essay-questions",
      question: "What does a stateless agent lose between sessions?",
      answer:
        "A stateless agent loses the reasons behind its decisions: it chose X last Tuesday, but the reasoning is gone, so the next agent starts over and may choose differently for no reason. It also cannot distinguish not found from failed to look when it reports an empty result.",
    },
    {
      id: "continuity-q2",
      category: "essay-questions",
      question: "What does continuity require in the PING stack?",
      answer:
        "In PING, events are source truth, recorded with identity, timestamp, and provenance in a log that is append-only in spirit, and they distill into canonical knowledge with evidence attached to claims. Replay verifies continuity: given the same causal history, the system reaches the same canonical state.",
    },
    {
      id: "continuity-q3",
      category: "essay-questions",
      question: "How does continuity differ from retrieval?",
      answer:
        "Retrieval finds similar past text and answers what is similar to this, while continuity records what happened, in what order, what was concluded, and what the evidence was. A system with retrieval can remind you what you talked about; a system with continuity can prove what it did and why.",
    },
  ],
  "building-agent-execution-boundaries": [
    {
      id: "boundaries-q1",
      category: "essay-questions",
      question: "Why is the quoting problem a silent failure?",
      answer:
        "Each layer of a nested shell invocation reinterprets quoting, escaping, and special characters, so a command that works in testing can corrupt in production. The failure is silent: the command runs, it just does not do what was intended.",
    },
    {
      id: "boundaries-q2",
      category: "essay-questions",
      question: "How does the stdin boundary solve the quoting problem?",
      answer:
        "PING passes the command as script bytes on standard input, never embedded in another shell command line, so no shell interprets it in transit. The receiving bash reads the bytes and executes them exactly once, in exactly one interpretation context.",
    },
    {
      id: "boundaries-q3",
      category: "essay-questions",
      question: "Why do agents receive capabilities instead of credentials?",
      answer:
        "Agents receive capabilities, not credential piles: humans authenticate as themselves once, there is one OAuth application per platform, and secrets live in exactly one place, resolved at runtime. When something fails, the blast radius is bounded by the capability, not by whatever the credential happened to unlock.",
    },
  ],
  "evidence-and-provenance-for-autonomous-systems": [
    {
      id: "provenance-q1",
      category: "essay-questions",
      question: "What three questions does every claim in PING answer?",
      answer:
        "Every claim in PING answers where it came from, how it was derived, and how confident it is. Confidence is not a vibes-based percentage, but a verification grade from a defined scale.",
    },
    {
      id: "provenance-q2",
      category: "essay-questions",
      question: "What is preserved along the evidence lineage?",
      answer:
        "The lineage runs from raw artifact to extracted observations, per-observation verification, preserved contradictions, and a verified claim, with nothing discarded along the way. When two observations contradict, both are preserved with their provenance rather than averaged into a false consensus.",
    },
    {
      id: "provenance-q3",
      category: "essay-questions",
      question: "What three rules govern evidence in PING?",
      answer:
        "Never turn absence of evidence into evidence of absence, never hide a failure behind an empty result, and never let uncertainty look like confidence. Failures get typed semantics: what failed, where, whether it is retryable, and whether state changed.",
    },
  ],
  "hpp-to-ping-first-tenant": [
    {
      id: "hpp-q1",
      category: "essay-questions",
      question: "What is the TenantOS model, as the post states it?",
      answer:
        "The model is platform code plus tenant configuration plus content: one codebase, many tenants. Each tenant is identity, brand, navigation, content, domain, and integrations expressed as configuration, never as a fork.",
    },
    {
      id: "hpp-q2",
      category: "essay-questions",
      question: "What pattern from the carpentry site was kept, and why?",
      answer:
        "The carpentry site had a configuration authority pattern: versioned JSON files loaded through a typed adapter layer, with components forbidden from importing the JSON directly. The transformation promoted that pattern because it is the tenant boundary, and a tenant.ping.v1.json authority now owns PING's identity, tagline, brand colors, navigation, contact info, and provenance note.",
    },
    {
      id: "hpp-q3",
      category: "essay-questions",
      question: "What does the post say TenantOS does not yet claim?",
      answer:
        "TenantOS is a direction with one proof point, not a product. The site does not yet demonstrate Tenant B onboarding end to end, per-tenant domains at the edge, or per-tenant integrations, and the point of the first tenant is to make the second tenant boring.",
    },
  ],
  "the-website-that-launched-to-everyone-at-once": [
    {
      id: "healthcare-q1",
      category: "essay-questions",
      question: "How many people visited HealthCare.gov on day one, and how many enrolled?",
      answer:
        "The administration's own figure for the day was about 4.7 million unique visitors. The internal war room notes counted the people who actually completed an enrollment on day one, and the number was six.",
    },
    {
      id: "healthcare-q2",
      category: "essay-questions",
      question: "Why did account creation become the bottleneck?",
      answer:
        "Before a visitor could look at a single insurance plan, they had to create a secure account, because a late decision had removed the option of browsing plans anonymously. Everything depended on the Enterprise Identity Management system, EIDM, the front door, and administration officials acknowledged within weeks that account creation was the bottleneck.",
    },
    {
      id: "healthcare-q3",
      category: "essay-questions",
      question: "What role was missing among the contractors?",
      answer:
        "The build was divided among 55 contractors, and no contract described the system. The missing role was the lead systems integrator, the one party responsible for making the pieces into a whole, and the HHS inspector general found that CMS did not select one until October 2013, after the launch.",
    },
  ],
  "the-biggest-debut-priced-by-a-glitch": [
    {
      id: "debut-q1",
      category: "essay-questions",
      question: "Why did the IPO cross keep rechecking instead of opening?",
      answer:
        "The cross application ran a validation check against the orders and cancellations in the book before it would commit to a price, but orders and cancellations kept arriving while the check ran. Each new arrival invalidated the check and sent the application back to run it again, so the cross fell 19 minutes behind the live order flow.",
    },
    {
      id: "debut-q2",
      category: "essay-questions",
      question: "How many orders were left stuck, and for how long?",
      answer:
        "About 8,000 of the orders placed in the gap between 11:11 and 11:30 were released into the open market when continuous trading commenced. The remaining 30,000-plus went nowhere: not executed, not cancelled, not confirmed, and they stayed stuck for more than two hours.",
    },
    {
      id: "debut-q3",
      category: "essay-questions",
      question: "What did NASDAQ leadership do mid-incident, and what penalty followed?",
      answer:
        "Senior leadership decided not to delay the start of secondary trading, believing they had fixed the design limitation by removing a few lines of code live, mid-incident, without understanding the root cause. In May 2013, NASDAQ agreed to a $10 million penalty, the largest ever imposed on an exchange at that time.",
    },
  ],
  "the-rover-that-kept-rebooting-itself": [
    {
      id: "rover-q1",
      category: "essay-questions",
      question: "Why did the lander computer keep resetting itself?",
      answer:
        "The bc_sched task checked that bc_dist had finished distributing the previous cycle's data, and bc_dist had a hard deadline. If bc_sched woke and found bc_dist still unfinished, the spacecraft declared an error and reset itself, by design, so the resets were the safety system reporting truthfully that a critical job had failed to finish on time.",
    },
    {
      id: "rover-q2",
      category: "essay-questions",
      question: "What was the priority inversion at the heart of the bug?",
      answer:
        "The low priority weather task held a lock that the high priority bc_dist was waiting on, while medium priority tasks kept running ahead of the weather task, so the lock was never released. Nothing in the system was broken: the highest priority work was effectively running at the priority of the lowest, plus the medium tasks.",
    },
    {
      id: "rover-q3",
      category: "essay-questions",
      question: "How did the team reproduce the failure and fix it?",
      answer:
        "The team ran the same activities that had preceded the failures on a replica of the spacecraft computer, with the trace facility armed, and made the failure happen on Earth in less than 18 hours. The fix was a creation flag that already existed: VxWorks mutexes could be created with priority inheritance switched on, and after extensive ground testing the change was sent to the spacecraft through the mission's specialized patch process.",
    },
  ],
  "the-night-the-backups-burned-too": [
    {
      id: "backups-q1",
      category: "essay-questions",
      question: "Why did SBG3 and SBG4 go dark even though the fire never touched them?",
      answer:
        "Firefighters isolate a smoldering site. At Strasbourg the whole site was cut off, so SBG3 and SBG4 went dark too and SBG1 lost four of its rooms. The machines in the surviving buildings were fine, but nothing could reach them, nothing could power them, and nobody was allowed near them.",
    },
    {
      id: "backups-q2",
      category: "essay-questions",
      question: "What happened to the backups Bati Courtage had paid OVHcloud for?",
      answer:
        "Bati Courtage had subscribed to the automated backup option for its servers in SBG2. After asking for its backups for about a month, it learned they had been destroyed along with the primary data, because they were stored in the same building as the main server. That was despite contract language describing the backup option as physically isolated from the infrastructure the server was set up on, and the rulings went against OVHcloud.",
    },
    {
      id: "backups-q3",
      category: "essay-questions",
      question: "What were the three points of the Hyper Resilience plan OVHcloud announced two months later?",
      answer:
        "First, a revamped approach to its internal backups, so the copies the company keeps for itself would stop sharing a fate with the originals. Second, a new emphasis on external customer backups, stored outside. Third, failover spread across three data centers. The essay reads all three as the same point, the one behind the 3-2-1 rule: three copies, on two different kinds of media, with one of them off site.",
    },
  ],
  "the-day-github-was-in-two-places-at-once": [
    {
      id: "github-q1",
      category: "essay-questions",
      question: "How did a 43-second partition turn GitHub into two databases?",
      answer:
        "Maintenance to replace failing optical equipment cut connectivity between the East Coast network hub and the primary East Coast data center for 43 seconds. During the partition, Orchestrator, following its Raft consensus rules with the nodes it could still reach, promoted West replicas to primary, while the East had kept writing too. The postmortem says Orchestrator behaved as configured: the configuration assumed unreachable means dead, and for 43 seconds unreachable only meant unreachable.",
    },
    {
      id: "github-q2",
      category: "essay-questions",
      question: "Why was failing back to the East unsafe?",
      answer:
        "Both sides held writes the other did not have. The East clusters held a few seconds of writes that had never replicated to the West, counted later as 954 unreplicated writes on one of its busiest clusters, while the West had taken nearly forty minutes of live application traffic. Failing back meant discarding or overwriting that West traffic, so GitHub failed forward, paused webhook delivery and GitHub Pages builds at 23:19 UTC, and prioritized data integrity over site usability and time to recovery.",
    },
    {
      id: "github-q3",
      category: "essay-questions",
      question: "How did GitHub recover, and what was the final outcome?",
      answer:
        "There was no trustworthy merge tool, so GitHub restored the affected MySQL clusters from backups that ran every four hours and were stored in remote blob storage, resynchronized the replicas, and then processed the backlog of over five million webhook events and 80,000 Pages builds. About 200,000 webhook payloads that outlived an internal time limit were dropped, but no user data was lost: the orphaned East writes were reconciled from the binary logs. Status returned to green at 23:03 UTC on October 22, 24 hours and 11 minutes after the blink.",
    },
  ],
  "1202-the-alarm-nobody-panicked-about": [
    {
      id: "apollo-q1",
      category: "essay-questions",
      question: "What did a 1202 alarm actually mean, and what did the computer do when it raised one?",
      answer:
        "It was a capacity announcement, not a crash report. If a job requested a core set and none was free, the computer raised 1202; if it requested a VAC area and none was free, it raised 1201. It then restarted itself on purpose, in a controlled way, in milliseconds, threw away the unfinished low priority work, restored the critical jobs from their protected checkpoints, and carried on flying, without rescheduling the bogus radar jobs that had caused the pileup.",
    },
    {
      id: "apollo-q2",
      category: "essay-questions",
      question: "Why could guidance officer Steve Bales call Go so quickly on the first 1202?",
      answer:
        "He did not decide from memory. Jack Garman, 24, in the back room, had a handwritten list under the plexiglass on his console, made after a final training simulation in which Bales had called an abort on a similar alarm the computer could recover from and Gene Kranz ordered every possible computer alarm written down with its correct response. Garman's note for 1201 and 1202 said the computer was shedding work and recovering: safe to continue if the alarm was occasional, a real problem only if it became continuous.",
    },
    {
      id: "apollo-q3",
      category: "essay-questions",
      question: "What caused the overload that produced five alarms in about four minutes?",
      answer:
        "The rendezvous radar, powered and warmed in SLEW or AUTO in case of an abort and tracking nothing, fed the computer spurious counter increments through its coupling data units. Two 800 cycle power supplies were not locked in phase, so the units read the stationary antenna as moving impossibly fast and ordered updates at up to 6,400 increments a second on each of two channels, stealing about 15 percent of the computer. The descent software had been tested to tolerate roughly a tenth, so job reservations piled up until the Executive ran out of core sets and VAC areas.",
    },
  ],
  "the-thermostat-that-joined-a-botnet": [
    {
      id: "thermostat-q1",
      category: "essay-questions",
      question: "How big was the attack on KrebsOnSecurity, and why did Akamai stop defending it even though its network had held?",
      answer:
        "The attack arrived at 623 gigabits per second, according to Akamai, aimed at one man's WordPress site. Akamai had been defending Krebs for free and absorbed the first day, but defending one journalist at that scale would cost millions of dollars, and it could not set the precedent of spending that kind of money on a free account, so KrebsOnSecurity went dark. It was not confessing technical defeat: its network had held, and Krebs eventually got back online under Project Shield, a free service run by Jigsaw, a unit of Alphabet, built specifically to protect journalists and human rights organizations from exactly this kind of silencing.",
    },
    {
      id: "thermostat-q2",
      category: "essay-questions",
      question: "How did Mirai recruit cameras, DVRs and other gadgets into its botnet?",
      answer:
        "Mirai scanned random internet addresses looking for an open Telnet port, the old remote login service that cameras, DVRs, routers and a long tail of forgotten gadgets shipped with switched on. When something answered, it tried logging in with its list of factory default username and password combinations, a little over sixty of them, like admin/admin and root/12345: the password printed in the manual, identical for every unit that ever rolled off the line. If one pair worked, the device was conscripted, kept recording video or routing packets exactly as before, and its owner noticed nothing.",
    },
    {
      id: "thermostat-q3",
      category: "essay-questions",
      question: "What did California SB-327 require, and why did it target Mirai's recruitment method?",
      answer:
        "SB-327 was signed on September 28, 2018 and took effect on January 1, 2020, becoming the first law in the United States to regulate the security of connected devices directly. If a device can be logged into from outside the local network, then either its preprogrammed password must be unique to that individual device, or the device must force the user to create a new means of authentication the first time it is used. A skeleton key ring stops working when every door has a different lock, and Mirai's recruitment list, applied to a world of unique passwords, gets nothing.",
    },
  ],
  "the-update-that-was-the-attack": [
    {
      id: "update-attack-q1",
      category: "essay-questions",
      question: "How did SUNSPOT swap the backdoor into the Orion build without changing the source tree?",
      answer:
        "SUNSPOT watched the build machine every second for a running copy of MSBuild.exe and read its command line to learn what was being compiled. If the answer was Orion, it swapped InventoryManager.cs, but only after verifying hashes: if a developer had legitimately edited the file, it stood down. If the hashes matched, it backed up the original with a .bk extension, wrote the trojan version in for the compile, then waited until the build exited, restored the original, and deleted the evidence, so the source tree the developers browsed the next morning was the one they had written.",
    },
    {
      id: "update-attack-q2",
      category: "essay-questions",
      question: "Why was SUNBURST so hard to catch in its first weeks?",
      answer:
        "Before any network activity, SUNBURST refused to wake until its file was at least twelve to fourteen days old, with the exact threshold chosen at random inside that range. Then it verified it was running inside the genuine SolarWinds host process on a real organizational domain, checking the domain against a blocklist of laboratory and test environments, and inventoried the host for forensic and antivirus tools. Only after that did it phone home, with orders encoded inside DNS lookups under avsvmcloud.com and later traffic dressed as the Orion Improvement Program, the product's own telemetry chatter.",
    },
    {
      id: "update-attack-q3",
      category: "essay-questions",
      question: "How did defenders turn SUNBURST's own killswitch against it, and what did it not fix?",
      answer:
        "FireEye, Microsoft, and GoDaddy took control of avsvmcloud.com on December 15 and 16, 2020, and GoDaddy set a wildcard record so every subdomain resolved to 20.140.0.1, an address inside the range SUNBURST read as terminate and never run again, so every surviving copy that asked for orders received the same reply: stand down, forever. The sinkhole also handed investigators a census of the infected, because each beacon carried the victim's encoded identity. But the killswitch only terminated copies still beaconing: victims where the operators had already installed other doors stayed compromised.",
    },
  ],
  "ninety-seconds-of-silence": [
    {
      id: "silence-q1",
      category: "essay-questions",
      question: "How did a single switch reset turn into a network wide cascade?",
      answer:
        "A switch that encountered a fault reset and, as it returned, sent a message saying it had recovered. A neighboring switch began processing that message, and before the work was complete a second recovery message arrived, less than ten milliseconds after the first. The recovery code followed the defective path, communications data was overwritten, the receiving switch error detection tripped and reset it, and that victim became a broadcaster: it recovered, announced its recovery, and supplied the next machine with the opening ingredient for the same accident.",
    },
    {
      id: "silence-q2",
      category: "essay-questions",
      question: "What was wrong with the break statement in the recovery code?",
      answer:
        "The December 1989 upgrade placed a C break statement inside an if statement nested inside a switch, in the fault recovery code. An if only controls whether a block runs; it does not provide the enclosing structure a break escapes, so the break belonged to the surrounding switch. Its placement changed the path execution took through the recovery logic, and under the fatal conditions control left the expected sequence and the recovery process overwrote communications data it needed to preserve.",
    },
    {
      id: "silence-q3",
      category: "essay-questions",
      question: "How did engineers end the collapse without fixing the bug first?",
      answer:
        "Engineers starved the bug. They suspended traffic on the backup signaling links so the fatal pairing of recovery messages could not occur in the same way, reducing the pathways by which one switch return could ambush another mid-recovery, and the ordinary evening decline in call volume added another margin of safety. The last link cleared at 11:30 p.m., about nine hours after the 2:25 p.m. start, with more than 50 million calls blocked and AT&T losing more than $60 million; the actual repair, a rollback followed by weeks of laboratory reproduction, came after.",
    },
  ],
};

export function getEssayQuestions(slug: string): FaqItem[] {
  return ESSAY_QUESTIONS[slug] ?? [];
}
