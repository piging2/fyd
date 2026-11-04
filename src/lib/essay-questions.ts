import type { FaqItem } from "@/types/faq";

/**
 * Per essay questions (Wave 31 pilot, Wave 32 batch 2, Wave 33 batch 3, Wave 34 batch 4, regrade defect 7).
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
};

export function getEssayQuestions(slug: string): FaqItem[] {
  return ESSAY_QUESTIONS[slug] ?? [];
}
