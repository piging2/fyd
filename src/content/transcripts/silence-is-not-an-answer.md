## SEC-01: The impossibility: silence is not an answer

**A:** I am looking at the same photo on my phone, my laptop, and the cloud. Same library. They agree. That is the truth, and it is not complicated.

**B:** They do not agree. They reconcile. Those are different things.

**A:** The result is three screens showing the same thing.

**B:** Because nothing is fighting right now. Agreement is easy when nobody disagrees.

**A:** So what. It works.

**B:** Until it does not. Take your laptop on a plane. No signal. You delete fifty photos and rename an album. At the same time, on your phone, you edit one of those deleted photos and move it into that album. Now land. What is the truth?

**A:** The cloud sorts it out.

**B:** The cloud is just another copy with better marketing, in this setup, where no copy was named the boss in advance. It has its own version. Now there are three versions, and each one was correct from where it sat. Does the delete win, or does the edit bring the photo back from the dead?

**A:** The newer change wins.

**B:** Newer according to which clock? Your laptop clock and your phone clock are not the same clock. One is drifting. You just made truth depend on a guess.

**A:** That is a sync problem. A consumer problem.

**B:** No. That is the whole subject, with photos because photos do not scare you. Change the nouns. The photo is a bank balance. The delete is a payment. The offline edit is a second payment against money that might be gone. Now which one wins?

**A:** I have never run a bank. I have run a deploy.

**B:** Then you have lived this. The deploy that ran twice, because the first run timed out and nobody could tell if it finished. So someone ran it again. The email went out twice. The charge went through twice.

**A:** The timeout said it failed.

**B:** The timeout said nothing arrived in time. That is not the same as failed. The work may have landed a second after you gave up. Silence is not a no. Silence is a shrug, and half of production pain lives in that shrug.

**A:** And the cache that swore the old price was still the price. The database had the new one. Both were telling the truth about what they last heard. Nobody lied. It still broke.

**B:** Exactly. No villain. Just two copies, two moments, and a gap between them. That gap is a distributed system. It does not start when you buy servers on three continents. It starts the second truth lives in two places at once.

**A:** So it is not a cloud topic.

**B:** It is a copies topic. And under it sit two questions nobody has answered away, one about fifty years old and one about forty. What can two sides ever guarantee each other, in common knowledge, over a channel that can lose messages? And if the channel loses nothing, what can a deterministic protocol guarantee about finishing when one side can simply stop?

**A:** Then what does everyone actually build?

**B:** Tradeoffs with names. Wait longer and be more sure, or answer fast and risk being wrong. Pick which copy leads. Decide in advance what happens when copies fight.

**A:** So the practical rule is never trust a copy?

**B:** Trust it. But ask it three questions first. How old are you? Who told you that? And what happens if another copy, right now, says the opposite? Because if you run anything with two copies of anything, a file, a cache, a database, a spreadsheet emailed to five people, you are already in this argument. You do not get to opt out. Your only choice is whether you designed for the disagreement, or you meet it first in production, at the worst possible hour.

**A:** Wait. Go back to the three screens for a second.

**B:** The phone, the laptop, and the cloud.

**A:** Right. Give them names for me, because screens sound too reasonable for what just happened.

**B:** Fine. They are not screens anymore. They are three divorced raccoons arguing over a stolen sandwich.

**A:** You just turned my photo library into divorced raccoons.

**B:** Divorced. They used to share everything. Now they share a lawyer and a deep suspicion of each others motives.

**A:** Please tell me the sandwich gets a lawyer too.

**B:** The sandwich is the contested copy of the truth. Whoever holds it claims the lunch was always theirs.

**A:** Who are the three, one at a time?

**B:** Raccoon One thinks he is the manager. Nobody elected him to anything permanent. He just speaks first and with the most confidence.

**A:** That tracks more production systems than I want to admit.

**B:** Raccoon Two keeps a spreadsheet. The spreadsheet exists for one purpose only. It proves Raccoon One is incompetent, in rows, with dates.

**A:** A spreadsheet kept out of spite is still a record.

**B:** It is the most honest record in the building, which is exactly the problem. Honest and aimed.

**A:** And Raccoon Three.

**B:** Raccoon Three has been temporarily unavailable since 2:47 in the morning. No note. No explanation. Just absence and a chair that is still warm.

**A:** Temporarily unavailable is doing a lot of work in that sentence.

**B:** It is doing all the damn work. That phrase is how adults say we do not know and we are embarrassed about it.

**A:** So the manager says the sandwich is his. The spreadsheet says it was never his. The third raccoon says nothing at all.

**B:** And silence from the third one could mean anything. He left. He is asleep. He is stuck under a fence with the real answer.

**A:** Here is what I am hearing. I own three copies, so I feel safe. I should feel argued with instead.

**B:** That is the clean version. Having copies does not mean having agreement.

**A:** Copies are just the raw material for a disagreement.

**B:** Right. A copy tells you what one place last heard. It does not tell you what every place would say at the same moment.

**A:** Which I cannot do, because one of them is under a fence.

**B:** Or on a plane. Or behind a network fault. The fence changes costumes. The absence stays the same.

**A:** So let me set a rule. If two raccoons agree, I go with them and I ignore the silent one.

**B:** You just invented a majority and a risk in the same sentence.

**A:** Did anything outside computers settle on that same threshold trick?

**B:** Honeybees did, and Thomas Seeley spent decades watching them do it, work he collected in Honeybee Democracy in 2010.

**A:** Bees voting on what, exactly?

**B:** A new home. Scout bees inspect candidate cavities, come back, and advertise a site with a waggle dance. The better the site, the longer the dance, and other scouts go and check for themselves.

**A:** No leader counts the votes.

**B:** No leader runs it at all. The decision point is out at the site itself. Seeley and Visscher found that swarms started preparing for flight once 15 or more bees were seen together at one nest box, and Seeley, in Honeybee Democracy, puts the quorum at 20 to 30 bees seen together at a site, usually about 10 to 15 bees inside the box and 10 to 15 outside it.

**A:** Twenty to thirty together, in the book. Fifteen or more seen together, in the paper.

**B:** Enough scouts, not all scouts. That is the balance Seeley points to, a better balance between speed and accuracy. And to be clear, the bees are not running a consensus protocol. It is the same shape in a different world. Act when a threshold of independent witnesses gathers, instead of waiting for everyone to agree.

**A:** That sounds efficient and slightly reckless.

**B:** It is efficient. It is also a decision about the silent one that you made without hearing from him. Sometimes that decision saves the day. Sometimes he was the only one holding the fresh copy.

**A:** Then ask him to confirm before I move.

**B:** Now you are sending a messenger to a raccoon who may never answer. How long do you stand there holding lunch?

**A:** As long as it takes to be sure.

**B:** People have tried as long as it takes. That project has a name and it did not end well.

**A:** Give me the project, then. Properly, from the start.

**B:** It was first published in 1975. And the two parties were not generals at all.

**A:** Who were they?

**B:** Gangsters. Two groups of gangsters planning a job and trying to coordinate over a channel that could fail.

**A:** Gangsters got promoted.

**B:** Jim Gray named the generals version in 1978. The uniforms arrived three years after the proof. The problem kept the promotion and lost the criminal record.

**A:** So retell it in uniform, since that is the version everyone uses.

**B:** Two commanders sit on two hills. They can only communicate by messenger. A messenger can be captured on the way.

**A:** And they need to attack together.

**B:** Together or not at all. One army attacking alone loses. So the first commander sends a message. Attack at dawn.

**A:** That is reasonable, given the terrible mail service.

**B:** Two hills and a road built to ruin the mail. It is a damn miracle anyone teaches this as a planning exercise.

**A:** The messenger arrives in the story, though. Start there.

**B:** The messenger arrives. The second commander now knows the plan. Does the first commander know that he knows?

**A:** No. Not until a confirmation comes back.

**B:** So a confirmation goes back. Now the first commander knows the plan arrived. Does the second commander know that the confirmation arrived?

**A:** No. He needs a confirmation of the confirmation.

**B:** And who confirms that one?

**A:** I see the staircase. Every step needs another step under it.

**B:** Confirm that you got my confirmation that confirmed your confirmation. Please advise. Please confirm that you advised.

**A:** These are the worst project managers in history.

**B:** They are not bad managers. They are perfect managers trapped in a bad channel. That is why the story stings.

**A:** Keep sending runners, then. Eventually the pile of confirmations gets so tall that both sides can act.

**B:** The pile never gets tall enough to close the question. The last messenger can always be the one who did not get through.

**A:** Even after fifty confirmations?

**B:** Even then the sender of the fiftieth one is standing on his hill wondering. Did that one land? If he needs to know that it landed, he needs a fifty-first message. If that one matters, he needs a fifty-second.

**A:** So they do not run out of arguments or cleverness.

**B:** They run out of messengers, not doubt. Doubt refills itself for free.

**A:** Spell out what cannot be built here, carefully.

**B:** No finite exchange over a lossy channel guarantees that both sides know that both sides know. One side is always holding the risk of the last trip.

**A:** There is a name for that fully shared knowing, is there not?

**B:** Common knowledge. I know. You know. I know that you know. You know that I know. All the way down, with no loose rung.

**A:** And a lost messenger snaps one rung somewhere and nobody can prove which one.

**B:** Nobody can prove there was not a snap. That is the sharper version. The plan may be perfectly shared in fact. They still cannot be sure that it is.

**A:** In practice people attack anyway, or they set a time and accept the risk.

**B:** In practice people make a bet and call it coordination. Sometimes the bet is excellent. The bet is still there under the uniform.

**A:** My rule from the raccoons just died here, did it not? Ask until I am sure.

**B:** Your rule died of old age on the second hill. Asking helps. Asking more helps more. Asking never converts a lossy channel into certainty.

**A:** Then give me a rule that does settle it. A deadline, a bigger timeout, something with an edge on it.

**B:** Deadlines settle behavior. They do not settle knowledge. A deadline says act at dawn even without the last confirmation. It does not say the other army got it.

**A:** So the honest output is a probability, and the plan is built on top of it.

**B:** That is exactly what it is, and most real systems would be healthier if they admitted it on the first page, shit and all.

**A:** Wait. The generals have a lossy channel. My servers mostly deliver their messages. Does the problem go away when the channel behaves?

**B:** The next result answers that, and it is less comforting. It removes the lost messengers and the trouble stays.

**A:** Less comforting than gangsters with a staffing problem is a high bar.

**B:** 1985. Fischer, Lynch, and Paterson. The result everyone calls FLP.

**A:** State it the way you would let me repeat it at work.

**B:** You state it. I will audit you.

**A:** No deterministic consensus protocol can guarantee termination in a fully asynchronous system with even one crash fault.

**B:** That form. Exactly that form. Every qualifier in that sentence is load bearing.

**A:** Start with guarantee. That word feels like the whole argument.

**B:** It is the whole argument. The claim is not that consensus fails. The claim is that no protocol in that model can promise to always finish.

**A:** Fully asynchronous means what, in plain speech?

**B:** No dependable bound on how long anything takes. A message can be delayed. A process can be slow. There is no timing assumption you are allowed to lean on.

**A:** And one crash fault means one participant can simply stop.

**B:** One. Not a fire. Not treason. One process stops at the worst moment and the guarantee is gone.

**A:** Why does one stopped process break a promise about finishing?

**B:** Because from the outside, stopped and slow are twins. A protocol waiting for the missing process cannot tell whether it is waiting for a corpse or for a very slow colleague.

**A:** So it waits, and waiting can stretch without limit.

**B:** Or it decides without that process and risks deciding while the slow one returns holding something that mattered. Either choice costs the guarantee something.

**A:** Be careful with me here. People hear this result and say the whole thing cannot be done.

**B:** People say that and they are wrong, and working systems are the rebuttal standing right behind them. Clusters reach consensus in production every day.

**A:** That is a large result to get from one quiet machine.

**B:** It is. One quiet machine, honestly described, is enough to kill an unconditional promise. That should make every engineer read their own promises twice.

**A:** Then what did 1985 actually take off the table?

**B:** A guarantee under those exact conditions. Determinism, full asynchrony, one possible crash, and an unconditional promise to terminate.

**A:** So real protocols cheat the model, not the math.

**B:** They change the terms honestly. They assume delays are usually bounded. They let a leader be suspected so work can move. They trade an absolute promise for a usable one with conditions printed on it.

**A:** Usually bounded is doing a lot of work in that sentence.

**B:** It is, and in 1988 Dwork, Lynch, and Stockmeyer gave that usually a formal name.

**A:** Partial synchrony.

**B:** Right. Version one, and it is stranger than it sounds. There are fixed bounds, on how long a message can take and on how fast processors run relative to each other. They exist. Nobody tells you what they are. And the paper actually varies the message bound and the speed bound separately, so these two clean versions are a map, not the whole territory.

**A:** And in the other version?

**B:** The bounds are known, but they only start holding at some unknown time, and the protocol has to work no matter when that time arrives.

**A:** So in that second version, the system is allowed to be a mess early, as long as it eventually behaves well enough for long enough.

**B:** That is the rescue. FLP rules out a guarantee when no timing bound exists at all. Partial synchrony adds back just enough timing reality to let consensus finish, without pretending the network is a metronome.

**A:** My instinct still wants a detector. Something that watches the other processes and just tells me, dead or alive, no poetry.

**B:** That instinct built an entire field. But first it built a damn courtroom.

**A:** A courtroom.

**B:** Somebody has to put the missing server on trial. That is the only honest way to hear how weak the evidence is. Picture a small courtroom. One defendant chair. It is empty.

**A:** The court calls the case of the missing server.

**B:** The prosecution stands first. The defendant accepted duties. The defendant answered requests. Then, in the middle of ordinary work, the defendant went silent and abandoned its post.

**A:** What evidence does the prosecution offer for abandonment?

**B:** Silence. Timed silence. Requests were sent. The deadline passed. Nothing came back.

**A:** Defense.

**B:** The defense says the defendant is merely slow. A crowded disk. A long pause. A network path having a bad afternoon. Slow is not a crime in this court.

**A:** The court will hear the defendant directly. Will the defendant confirm its presence?

**B:** Nothing.

**A:** Let the record show the defendant did not respond. Again. Will the defendant state whether it is alive and delayed, or unable to answer at all?

**B:** Nothing. The chair stays empty and the room gets very interested in the clock.

**A:** The clerk will note the time of the last confirmed answer.

**B:** Noted. Everything after that timestamp is interpretation.

**A:** Prosecution moves to seat a replacement and continue the work.

**B:** Defense objects. Seat a replacement too early and the original may return to find its duties reassigned and its last work disputed.

**A:** Motion held, not granted, not denied.

**B:** This court is learning the price of deciding under silence. The judge asks for one more test. Send another request. Wait a little longer this time.

**A:** A longer wait is still a wait. If the answer arrives after the deadline, was the defendant dead at the deadline and alive now, or alive the whole time?

**B:** The prosecution cannot say. The defense cannot say. The honest verdict in that room is not guilty and not innocent. It is unproven.

**A:** The court cannot determine whether the defendant is absent or simply buffering.

**B:** Buffering. The most damning word in the building is buffering, because it might be true. Out of the courtroom now, because that poor bastard never stood a chance in there. So the field stopped asking for a verdict and started grading the suspicion instead.

**A:** Plain facts, then. Who gave this problem a specification?

**B:** Chandra and Toueg. Their move was to stop demanding certainty from a detector.

**A:** What is a failure detector, without the courtroom costume?

**B:** A module that watches processes and maintains a list of the ones it currently suspects to have crashed.

**A:** Suspects. Not convicts.

**B:** Suspects, and the suspicion can be wrong. A detector can put a healthy, slow process on the list. It can also miss one for a while. That fallibility is not a flaw in their design. It is the design.

**A:** A judgment under uncertainty, with rules for what kind of judgment it is.

**B:** They characterized detectors by two properties. Completeness and accuracy. Those are properties a system can reason about, instead of a vibe it argues about at midnight.

**A:** Is there a floor under all of this? A weakest detector that still gets consensus done?

**B:** There is, and Chandra is on that paper too. Chandra, Hadzilacos, and Toueg, in the Journal of the ACM in 1996, determined what information about failures is necessary and sufficient to solve consensus when a majority of processes are correct.

**A:** Necessary and sufficient. That is a complete sentence in mathematics.

**B:** Their weakest form can be stated as a leader oracle. Call it Omega. It outputs one process that a process currently trusts, and eventually every correct process settles on the same correct leader.

**A:** So consensus does not need a perfect coroner.

**B:** It needs, in the end, one shared living name. That is why leader election keeps reappearing inside Raft and Paxos. It is not decoration. It is the minimum extra information that lets the system finish.

**A:** Pull those two properties apart for me, because they keep arriving as a pair.

**B:** Gladly. Completeness is about the dead. In its strong form, eventually every process that crashes is permanently suspected by every correct process. No corpse gets to stay off the list forever.

**A:** And accuracy is about the living.

**B:** Exactly. Accuracy limits the false accusations. In a strong form, no correct process is ever suspected. In an eventual form, the false accusations are allowed early, as long as they stop after some point.

**A:** So a detector can ace one property and fail the other.

**B:** That is the dial. Turn suspicion up and you get completeness quickly. Every crash is caught fast, and slow living processes get suspected too. That is accuracy paying the bill, in false funerals.

**A:** Turn suspicion down, and the living stay safe.

**B:** Safer, yes. And the dead wait longer to be buried, because a cautious detector is slow to suspect anyone. That is completeness paying the bill, in waiting.

**A:** So neither property is a grade by itself.

**B:** Neither one means a damn thing alone. A detector that suspects everyone is perfectly complete and completely useless. A detector that suspects nobody is perfectly accurate right up until you need it. Production detectors are chosen points between those two failures, whether the team choosing them uses these words or not.

**A:** Name the production version.

**B:** SWIM. A protocol built around periodic probing of members, with suspicion spread through the cluster instead of one watcher shouting alone.

**A:** Give me the version that runs in a named product.

**B:** Serf. Its gossip and failure detection are based on SWIM. A node that misses a direct probe gets probed indirectly through other members.

**A:** And if that also fails?

**B:** In Serf, the node is marked suspicious. Suspicious, and still a member. It gets a configurable window to dispute the suspicion. Only if it stays silent through that window is it finally considered dead.

**A:** So even production builds a pause between suspecting and burying.

**B:** It has to. The pause is where a slow node saves itself. The pause is also where a truly dead node costs you time. There is no setting that makes both sides of that pause free.

**A:** This is where my search for a clean rule gets expensive, is it not?

**B:** Every clean rule in this field is a bet with a price tag stapled to it. Timeout short and you bury the living. Timeout long and you wait beside the dead.

**A:** Which brings back Raccoon Three, temporarily unavailable since the morning.

**B:** We held a funeral for a server that was only busy.

**A:** Flowers, speeches, a tasteful replacement.

**B:** From the outside, crashed and very slow are twins for the first stretch. The detector did what detectors do. It suspected, the window closed, and the replacement took the seat.

**A:** And then the door opens.

**B:** The original walks back in holding coffee. Perfectly healthy. Slightly confused. It finds its replacement already seated and doing its job in front of everyone.

**A:** That is not a resurrection scene. That is an awkward Monday.

**B:** It is a goddamn awkward Monday at machine speed, and now it has to learn the new state before it says a word.

**A:** Because while it was being mourned, the truth moved on without it.

**B:** And any stale certainty it carried through that door is now a liability with a friendly face.

**A:** I want to end with a rule anyway. Give me a number. If a process is silent for ten seconds, I call it dead and I move.

**B:** You can call it dead. The calling is yours. Just know what you bought. You bought speed at the price of sometimes being wrong about a living process.

**A:** Then thirty seconds. A more patient rule.

**B:** A more patient bet. You bought fewer false funerals at the price of waiting longer beside real failures while users stare at a spinner.

**A:** Then make the timeout adaptive. Learn the normal rhythm and judge against that.

**B:** A smarter bet. Still a bet. The learner memorizes your normal mornings. Then one genuinely strange, healthy pause shows up wearing the exact shape of a death, and the learner cannot tell the costume from the corpse.

**A:** Wait. That adaptive idea has a production name, does it not?

**B:** It does. Phi accrual. Hayashibara, Defago, Yared, and Katayama published it in 2004, and instead of a yes or no verdict it hands you a suspicion level on a continuous scale.

**A:** A suspicion that grows.

**B:** Exactly. It samples heartbeat arrival times, keeps a sliding window of them, and lets the scale adjust to current network conditions. The longer the silence runs past the normal rhythm, the higher the suspicion climbs.

**A:** Does that statistician assume the rhythm has a tidy shape?

**B:** It does, and that is the soft spot. The estimate treats heartbeat arrival gaps as if they followed a normal distribution, using a mean and a variance from the window. A garbage collection pause, or load that hits many nodes at once, can bend the real gaps away from that shape, and the suspicion number bends with them.

**A:** And Cassandra actually runs this.

**B:** And this is not theory. Apache Cassandra documentation says every node runs a variant of the Phi Accrual Failure Detector. And every node makes its own independent decision about whether a peer is available. DataStax documentation adds the how. Cassandra keeps a sliding window of inter arrival times, instead of using one fixed threshold. Your statistician has a day job.

**A:** So the courtroom gets a statistician.

**B:** It gets a statistician who still cannot testify that the defendant is dead. The number prices the bet. Different thresholds can react at different levels of suspicion, which is the whole damn point.

**A:** Every answer I offer gets renamed a bet.

**B:** Because every answer is one. The renaming is the progress. A bet you can see can be priced and tested. A bet you call knowledge gets trusted in places it never earned.

**A:** So I design for being wrong, not just for being right.

**B:** That is the grown up version of every rule you wanted. Suspect carefully. Act on the suspicion when waiting costs more than error. Leave room for the accused to return and catch up.

**A:** And stop asking silence to testify.

**B:** Silence cannot testify. It can only start your clock.

**A:** Then the last honest sentence is about my clock, not about their machine.

**B:** Say it.

**A:** A timeout tells me only that I stopped waiting.

## SEC-02: Consensus mechanics: how the vote is built

**B:** And nothing in that sentence says the other side stopped living, working, or holding the copy you needed most. One ground rule before the arithmetic, because I am about to break some clusters. Every case in this next stretch is constructed. No company, no date, no victim. Just voters, partitions, and bad luck.

**A:** Two copies. One copy is a hope. Two copies is a backup. If one dies, the other has the data.

**B:** Two is the dangerous number.

**A:** It is literally twice as much data.

**B:** And half as much certainty as you think. Put your two copies on opposite sides of a network partition.

**A:** Each side still has a copy.

**B:** Neither side can see the other. Neither knows if the other is dead or just unreachable.

**A:** So the survivor keeps serving.

**B:** Which survivor. Both are alive. If both accept writes, you now have two different truths.

**A:** Then require both copies to agree on every write.

**B:** Now one failure stops all writes. You bought a second copy and lost availability when anything broke.

**A:** So two gives me a choice. Split brain or shutdown.

**B:** Exactly. A majority of two is two. There is no smaller majority that still overlaps. That word matters. Overlap.

**A:** You say overlap like it does the heavy lifting.

**B:** It does all the work. A majority works because any two majorities must share at least one member.

**A:** Prove it with three.

**B:** Three voters. A majority is two. Any two majorities count four votes across three voters. At least one voter sits in both.

**A:** That two out of three rule existed before anyone was electing database leaders, did it not?

**B:** In hardware, yes. Triple modular redundancy runs three identical modules on the same input and sends their outputs to a voter.

**A:** And the voter takes the majority output.

**B:** It does. If one module produces a wrong answer, the other two outvote it and the fault is masked, with no pause to argue about it.

**A:** Where does that pattern earn its keep?

**B:** In flight critical systems, where NASA work on architectural fault tolerance treats voting, fault detection, and Byzantine agreement as core topics, because a single wrong output cannot be allowed to steer the vehicle.

**A:** Same arithmetic, different stakes.

**B:** Same arithmetic, and one honest difference. A hardware voter masks a bad output in the moment. A consensus protocol also has to carry agreed state forward into the next decision.

**A:** That shared voter is a witness.

**B:** It carries the last agreed state into the next decision. A new leader cannot stay ignorant of the last committed write, but not by counting alone. The witness helps only because the protocol has a rule that uses it. Raft voters refuse a candidate whose log is behind theirs. A Paxos proposer must carry forward the highest numbered value already accepted. The witness was there, and the rule makes the next leader listen to it.

**A:** And split two voters one and one.

**B:** No witness crosses the line. Each side feels like a complete world. Each side is internally consistent, about different facts.

**A:** It does not look broken from inside either half.

**B:** Both halves log success. The failure appears when the partition heals and the two histories meet.

**A:** So three is the smallest honest cluster.

**B:** Three tolerates one crash failure and still forms a majority. One process stops, crash style, and does not argue back. Two voters remain. They can elect, write, and commit.

**A:** Then four must be better.

**B:** Four needs three for a majority. It still tolerates only one failure. You added cost and gained no tolerance. Even numbers waste a seat.

**A:** Fine. I want five copies of everything. Five tolerates two failures.

**B:** On paper. Now price it.

**A:** Storage is cheap.

**B:** Agreement is the expensive part. A write with five voters needs three acknowledgments before it commits.

**A:** Three fast replies. Done.

**B:** You wait for the second fastest follower every time. The leader already holds its own copy locally, so the three acknowledgments are the leader plus two replies. A slow disk or a distant region makes your latency that follower's latency.

**A:** That is safety I can sleep on.

**B:** You also pay in messages. The leader writes to four followers and collects replies, and the commit index rides along on later AppendEntries messages and heartbeats, instead of travelling as its own separate notice. Every voter adds traffic and a new way to be slow.

**A:** Still worth it for important data.

**B:** For some data, yes. For everything, no. Look at scale. Cloudflare said D1 passed 5.5 million databases, as of October 8 this year.

**A:** Five and a half million small databases.

**B:** Their problem was the control plane. They redesigned it so coordination stays off the hot path for queries. Agreement is a tax. You choose carefully where you collect it.

**A:** Walk me through what a quorum promises.

**B:** Three replicas. Write quorum is two. A write commits after two replicas store it. Read quorum is two. A read asks two replicas and takes the newest version.

**A:** Two plus two is four, more than three. The sets must overlap.

**B:** At least one replica in the read set holds the last committed write, if the replica set is fixed, the write finished on its write quorum before the read, versions can be compared, and the read returns the newest version it finds. That overlap is the guarantee, under those conditions. Not hope. Counting, plus the rules that use the count.

**A:** What does it not guarantee.

**B:** The third replica may never have gotten the write. It can sit stale for a long time.

**A:** But the next read fixes it.

**B:** Sometimes. That is read repair. A read that finds disagreement can push the newest value to the stale copy. It is cleanup, not a promise.

**A:** Repair can fail.

**B:** Or lag, or never trigger for data nobody reads. Read repair alone can leave cold data stale quietly, which is why Dynamo style systems also run background anti-entropy, comparing copies so unread data gets repaired too. The quorum gave a correct answer at read time. It did not give identical copies.

**A:** And a read from one replica, for speed.

**B:** That gives up the quorum. It may return the stale copy. Fast and wrong is an available configuration.

**A:** Generalize the quorum for me, then, because two and two over three cannot be the whole rule.

**B:** It is one point on a dial. The Dynamo paper from Amazon gives the general form. Keep N copies. Set W, the minimum number of nodes that must take part in a successful write. Set R, the minimum for a successful read.

**A:** And the overlap condition is arithmetic.

**B:** R plus W greater than N. Set them so the sum beats the copy count, and every read set must share at least one node with every completed write set.

**A:** Now turn the dial one way.

**B:** N is three. W one and R three means writes land on the first node that answers, and reads ask all three and take the newest comparable version. W three and R one moves the bill. Writes wait for everyone, and a read can trust one copy, because a completed write already reached all three.

**A:** And both set to one, for speed.

**B:** Then R plus W is two, which does not beat three, and there is no overlap promise at all. A read can land on the one copy the last write never reached. Fast and stale is the configuration, not a bug in it.

**A:** The paper prices the waiting too, does it not?

**B:** It does. Latency is set by the slowest of the R or W replicas taking part. And the arithmetic assumes one fixed set of voters. Change the membership carelessly and an old majority and a new majority can share nobody, each honestly counting itself the winner. A safe membership change keeps the old and new configurations overlapping while it crosses, or the proof stops applying.

**A:** Now Friday night with my five.

**B:** Two go down. A disk failure takes one. A bad deploy takes another. Your majority is exactly three, with zero margin.

**A:** Still running.

**B:** Now the third voter is across a network fault. Alive, but unreachable. The remaining side can prove it has how many.

**A:** Two. Not a majority of five.

**B:** Those two nodes hold recent data and refuse writes. They can see the data. They cannot prove they are allowed to change it.

**A:** Read only on a Friday night.

**B:** If reads run at all without a quorum. Strong reads need three as well. The data is right there, locked behind arithmetic.

**A:** And the unreachable voter refuses too.

**B:** One is not a majority. Everyone behaved correctly. The system chose consistency over availability, exactly as configured.

**A:** Five did not save me from the page. It changed which failure paged me.

**B:** Five saved you from losing committed data, as long as the copies that hold it survive. That is different from never going read only. Destroy a majority of the copies permanently, and even committed data can be gone.

**A:** Durability is not availability.

**B:** A quorum protects what was agreed. It does not promise you can always agree on something new.

**A:** New rule. Three for most state that must survive one failure. Five only where losing two voters is realistic and the write rate can pay the tax.

**B:** And two almost never, unless the data can be rebuilt elsewhere.

**A:** Two copies. One witness short of an argument.

**B:** One witness short of proof. A majority is not a bigger pile of copies. It is a counting rule that forces every decision to share a witness with the last one.

**A:** And every witness sends you a bill.

**B:** On every write. Forever. Choose the number like you will pay it, because you will.

**A:** Give me the two voter warning one more time, as the short version, for the people already building it.

**B:** Two voters alone cannot overlap with themselves on both sides of a cut. And that limit has fine print. It is about majority consensus, with nothing else in the room. Put an external witness in the room, one who votes but stores no data. Or fence the storage, so only one side can ever write. Now two stops being the trap.

**A:** So the dangerous number is two voters, alone, with nothing else in the room.

**B:** Exactly. Two alone is the trap. Two with a witness, or two behind a fence, is a design.

**A:** Build that witness for me, then. The seat that votes and stores nothing.

**B:** MongoDB documents one, called an arbiter. An arbiter participates in elections for primary, but it does not have a copy of the data set and cannot become a primary.

**A:** One vote, no data.

**B:** Exactly one election vote, per that same documentation. Put one beside your two data copies and the tie can break. One data side plus the arbiter is two votes out of three, and an election can finish.

**A:** And what can it never do?

**B:** It can never serve the data, take over as primary, or rebuild anything. Lose both data holders and the arbiter is a reliable witness to a loss it cannot repair. It holds no copy to vote back into existence.

**A:** It has to remember more than people think.

**B:** It has to remember its vote and its term across a restart, on disk. A witness that wakes up amnesiac and votes again in a contest it already decided is a second ballot with a friendly face.

**A:** And the side the witness is not on?

**B:** Still stuck, and correctly stuck. One data copy alone is one vote out of three. It cannot elect itself, and it cannot write as a majority. The arbiter breaks ties for the side that can reach it.

**A:** There is also a way to skip the vote entirely. Cloudflare sells a second answer to that tax, and it avoids the vote entirely.

**B:** Cloudflare again. The D1 people. Go on.

**A:** Cloudflare Durable Objects. In Cloudflare's own words, there is only ever one instance of a Durable Object with a given ID running anywhere in the world. Cloudflare also says all Workers making subrequests for the Durable Object with that ID are routed to the same instance.

**B:** One object. Not a quorum of objects arguing politely.

**A:** One object, and Cloudflare says each object is backed by a single thread. Requests can still interleave while one of them waits at an await point. Cloudflare's input gates and output gates are what prevent storage races, not a promise that requests never overlap.

**B:** That is the actor trick, productized. You do not get agreement by voting. You get it by making sure there is only ever one writer in the room.

**A:** And Cloudflare states the constraint in that same March 2021 post. One object can become the bottleneck. So you choose your object IDs carefully. You spread the work across many objects. One per user. One per room. One per thing that truly needs coordination.

**B:** So Cloudflare charges you to rent a referee who is also the only player allowed to touch the ball. Cute. Also genuinely useful, because most coordination problems are small, and a line in front of one honest thread beats a parliament nobody on the team can operate.

**A:** Counting gives us a rule. Now give me the machine that actually runs the count.

**B:** That machine is Raft, a consensus algorithm for managing a replicated log.

**A:** And Raft splits that problem into pieces.

**B:** Leader election, log replication, and safety, separated so each piece can be understood on its own. That separation was the point of the design.

**A:** Start with the servers.

**B:** Every server is a leader, a follower, or a candidate. A candidate is a server that wants the job and does not have it yet.

**A:** And time itself gets chopped up.

**B:** Raft divides time into terms, numbered with consecutive integers. Each term begins with an election, and at most one leader can be elected in a given term.

**A:** Nobody announces that the leader died.

**B:** Nobody can. A follower simply receives no communication for a period called the election timeout, and silence starts a suspicion, not a verdict.

**A:** Wait. Election timeout. So the server gets tired of waiting, stands up, and says I could run this place.

**B:** It has to win votes first. Some coup. That is just an election with worse branding.

**A:** And if nobody backs it, it times out and tries again later, or steps down when it meets a higher term.

**B:** With a higher term number, yes. Enthusiasm is not a field in the protocol.

**A:** What does the candidate actually do?

**B:** It increments its term, votes for itself, resets its timer, and sends vote requests to every other server.

**A:** Why does one candidate usually win instead of all of them standing up at once?

**B:** The timeouts are randomized, chosen randomly from a fixed interval in the Raft paper, for example 150 to 300 milliseconds. Usually one server times out first and wins before the others time out.

**A:** And a vote is not just enthusiasm either.

**B:** No. You get a vote only if the candidate's term is not behind yours, only if that server has not voted for someone else this term, and only if your log is at least as up to date as its log. Up to date has a definition too. A later last log term wins, and if the last terms match, the longer log wins.

**A:** You do not get to lead history with a shorter history.

**B:** That rule protects committed work. Then a strict majority makes the candidate the one leader for that term, and it starts sending heartbeats.

**A:** The heartbeat is just the leader saying I am still here.

**B:** It is an AppendEntries message with no entries in it. The one time it stops arriving, some ambitious little shit in the corner starts a campaign.

**A:** This is what I like about a proof. It tells you what can never happen inside the model.

**B:** And I like an incident report. It tells you what did happen while everyone was busy admiring the model.

**A:** If it happens anyway, the model is the thing that is wrong.

**B:** If it happens anyway, somebody still got paged, damn it. The boundary did not keep the rain out.

**A:** We are not settling this here, and we both know it.

**B:** We are not settling it at all. Show me a write.

**A:** Fine. A client shows up with a command.

**B:** Say set x to five. The client sends it to the leader, because log entries flow only from the leader to the followers.

**A:** The leader writes it down and announces victory.

**B:** It does not reply yet. One copy can still be lost. So the leader sends AppendEntries to each follower. In it goes the term. The entry just before the new one. The new entries themselves. And the leader's commit index.

**A:** That entry before part is a seam check.

**B:** It is. A follower replies false if the term is stale or its log has no matching entry at that seam.

**A:** And once the seam matches, but a later entry in the batch disagrees with mine?

**B:** Then the follower deletes that conflicting entry and everything after it, and appends the leader's entries in their place. Tedious as hell, and exactly the point.

**A:** So followers take the leader history as the shape of history.

**B:** For uncommitted entries, yes. The leader counts acknowledgments including itself, and if a majority holds an entry from its current term, it advances the commit index to that entry.

**A:** Why the current term condition?

**B:** Counting copies is the safe way to commit your own term entries. Older entries become committed when a current term entry after them is committed.

**A:** Now the client hears yes.

**B:** Only now. The leader applies the entry in log order and replies, and followers learn the commit index on the next heartbeat, advance their own, and apply in order.

**A:** Same entries, same order, same state.

**B:** That is the safety promise. If any server has applied an entry at a given index, no other server will ever apply a different entry for that same index.

**A:** Confidence is not authority.

**B:** Not unless a majority can still act on it. And this is not classroom machinery either, because etcd uses Raft under real clusters.

**A:** So the vote left the classroom and got a job.

**B:** It got several jobs and a sales team. HashiCorp documents Consul as implementing Raft to manage datacenter operations.

**A:** Consul is the service discovery system whose catalog tells services where other services live.

**B:** That catalog is not updated by hand. Consul log entries include registering services and updating key value pairs, and entries commit only when durably stored on a quorum of nodes.

**A:** So where things live rides on a majority vote.

**B:** Inside that product, the parliament is the product.

**A:** etcd strips the paint off the same shape.

**B:** etcd, a CNCF graduated project, calls itself a consistent distributed key value store used as a separate coordination service.

**A:** Separate is the confession. Coordination got important enough to become its own system.

**B:** The quorum bill stayed. etcd uses a leader based consensus protocol, operates only while a quorum can be established, and Raft enforces consistency after partitions heal.

**A:** Then there is ZooKeeper, the older animal.

**B:** Apache calls ZooKeeper a distributed, open source coordination service that exposes simple primitives for synchronization, configuration, and naming.

**A:** Does ZooKeeper run Raft too?

**B:** No, and that honesty matters. ZooKeeper uses its own agreement protocol, with write requests forwarded to a single leader and followers agreeing on delivery.

**A:** What does same primitive mean, exactly?

**B:** It means a majority that stays available. Apache says the service stays available as long as a majority of the ensemble servers are available.

**A:** Three projects, one confession. Nobody sane wants to build this themselves.

**B:** ZooKeeper admits coordination services are notoriously hard to get right and damn prone to race conditions and deadlock.

**A:** That is the business inside the algorithm. The tax did not disappear.

**B:** It changed its billing address. Run a quorum yourself and you pay in machines and on call nights. Rent it and the tax returns as a tier. HashiCorp offers Consul free in a community edition, with Consul Enterprise as the upgrade path.

**A:** When you rent coordination, you trust the vendor quorum with your own copies.

**B:** That is the part buyers skip. Your registry, configuration, and elections sit inside somebody else's majority, and if that quorum fails, your services lose their shared truth.

**A:** So consensus stopped being homework.

**B:** Consensus became inventory. Companies package the vote, teams buy it, and the vote still counts only when a majority shows up.

**A:** That makes understandability a commercial feature too. If you cannot explain the quorum you rented, you cannot argue with the invoice or the outage.

**B:** Now you see why this machinery was designed to be explained.

**A:** Why did this design need to exist at all?

**B:** Ongaro and Ousterhout made understandability the primary goal. They wanted it to be obvious why it works, not just that it works, and then they tested it.

**A:** With students.

**B:** Forty three students at two universities learned both algorithms and answered questions on both. Raft scored about 26 on average and Paxos about 21, out of 60.

**A:** The winning score is still a failing grade at most schools.

**B:** It is. Raft did not make consensus easy. It made it measurably less punishing to learn.

**A:** And the origin is less flattering to Paxos.

**B:** Ongaro admits in his dissertation that LogCabin was planned on Paxos before Raft existed. The difficulty of that attempt is what motivated the new algorithm.

**A:** They tried to build with the elegant classic, hit the wall, and designed a door.

**B:** The redesign came from a failed building attempt, not from a seminar room.

**A:** Then tell me the older answer properly.

**B:** Leslie Lamport cast Paxos as a parliament on a Greek island. There was no ancient parliament, and the part time legislators and their lost protocol are deliberate fiction.

**A:** The man who invented that parliament deserves an introduction before the costume swallows him.

**B:** Leslie Lamport received the Turing Award for 2013. The Association for Computing Machinery citation credits him with fundamental contributions to the theory and practice of distributed and concurrent systems.

**A:** Name the inventions in the citation.

**B:** Causality and logical clocks, safety and liveness, replicated state machines, and sequential consistency.

**A:** That is basically a map of the argument we have been having.

**B:** It is. In plain terms, he imposed clear and well defined coherence on systems that look chaotic because autonomous computers only ever talk by passing messages.

**A:** A raccoon parliament, but make it coherent.

**B:** He tried. The raccoons are still arguing, but now they argue in terms he named.

**A:** He invented a civilization to explain a vote.

**B:** Legislators wander in and out of the chamber, and messengers can forget a message, deliver it twice, or never deliver it at all.

**A:** Did he really lean into the costume?

**B:** He lectured in character as an archaeologist, with a Stetson hat and a hip flask.

**A:** And inside the costume there is a real algorithm.

**B:** A real one that chooses a single value among proposed values. Lamport later wrote Paxos Made Simple, arguing that presented in plain English the algorithm is very simple.

**A:** The field did not receive the fiction warmly.

**B:** He submitted the paper in 1990, and all three referees wanted the Paxos material removed. He shelved it, annoyed, and it was finally published in 1998.

**A:** Eight years in a drawer because the joke was too loud for the mathematics inside it.

**B:** Readers remembered the costume and missed the algorithm. Strip the costume off, and the core has proposers, acceptors, and learners, with no permanent leader. It does use proposal numbers, a rising generation number that does much of the work a term does in Raft, and practical Paxos settles on one distinguished proposer to make progress.

**A:** So a proposer just asks until a majority agrees on one value.

**B:** With a discipline that Raft hides inside the log. Say the Phase 1 answers come back, and some of them report a proposal already accepted. Then the proposer does not get to pick its own value. It has to carry forward the value from the highest numbered accepted proposal in those answers. That is why two proposers can block each other, until practical systems settle on one distinguished proposer.

**A:** Which is a leader with the serial numbers filed off.

**B:** Close enough that Raft made the leader a first class part of the design instead of an arrangement added later.

**A:** Did Paxos ever get a real job before Raft made it friendly?

**B:** It ran at Google. Mike Burrows described Chubby, a coarse grained lock service, at OSDI in 2006.

**A:** A lock service built on Paxos.

**B:** The Bigtable paper from Google describes a Chubby service as five active replicas, one elected as master, live when a majority are running and can communicate, and it says Chubby uses the Paxos algorithm to keep its replicas consistent in the face of failure.

**A:** Scale, carefully.

**B:** Google Research, summarizing the Chubby paper, says many instances had been used for over a year, with several of them each handling a few tens of thousands of clients concurrently.

**A:** So the parliament had tenants.

**B:** Tenants, locks, and a majority rule. The costume was fiction. The deployment was not.

**A:** I still trust the proof more than the costume. If the proof holds, a whole class of disaster cannot happen inside the model.

**B:** And I still trust the paper trail from where the model met a building. Production does not give a fuck about elegance when the assumptions leave the room.

**A:** Assumptions leaving the room is exactly what the proof helps you catch, inside the model it was proved in.

**B:** It is also exactly what the incident report records, after real users paid for the lesson.

**A:** Neither of us is converting today.

**B:** No. You keep your fence drawings. I keep my fire reports. And the next case is where they collide, because it starts with a leader everybody voted out.

**A:** Start with failover. It sounds clean. One side fails. The other side takes over.

**B:** It sounds clean because the hard part hides in one word. Over.

**A:** A failover can still leak, when the old side keeps taking work after the move.

**B:** Mechanics first. The mechanics are the part that can happen to anyone.

**A:** That is the system working though. Detect trouble. Move the work.

**B:** Move the work, yes. Now the next question. What stops the old side from still taking work?

**A:** It is down. That is why you failed over.

**B:** Down to who? Down to the observer who decided to fail over. Not necessarily down to itself. Not necessarily down to its clients. That is the whole problem. A leader can be deposed and be the last one to find out.

**A:** I keep picturing the raccoon parliament here. One raccoon is counting votes on a stolen sandwich, and halfway through the count he disappears straight into the wall.

**B:** Then the count had better not depend on him. Whoever counts next still has to find the last committed entry inside a majority, even when the old counter is living in the insulation.

**A:** He was gone for twenty minutes and came back still calling the meeting.

**B:** He never lost the title in his own view. He lost the quorum.

**A:** So he is not a leader. He is a man talking confidently to an empty room.

**B:** A partitioned room. A leader cut off that way can still hold the title in its own state, but without a majority it cannot commit new entries, and nothing he promised in there got committed.

**A:** Walk it through. Three nodes. One leader. Call it node one.

**B:** Node one is leader in term seven. It takes a write. It replicates the write. A majority confirms. Life is good.

**A:** Then node one pauses.

**B:** A long garbage collection pause. Or the network delays everything it sends. From the outside, silence looks the same in both cases.

**A:** The other two wait. No heartbeats. They conclude the leader is gone.

**B:** They hold an election. Node two wins in term eight. Perfectly legal. A majority voted.

**A:** And node one wakes up.

**B:** Node one missed the memo. It still believes it is leader in term seven. It still has clients connected. It accepts the next write.

**A:** And inside the log, that write goes nowhere.

**B:** Nowhere. It cannot commit it without a majority in its term, and it cannot honestly call it success. The log is safe. And that is a stale leader. Not a crashed leader. A former leader who kept working, whose danger lives outside the log.

**A:** My fix is obvious. Elect faster. Shrink the window. The stale window gets smaller.

**B:** Smaller. Not closed. And you paid for it somewhere else.

**A:** Where?

**B:** False alarms. Faster detection means a slow node looks dead sooner. A busy leader gets deposed for being busy. More elections. More chances for an old leader and a new leader to overlap. You sped up the ceremony. You did not remove the overlap.

**A:** But the election is majority based.

**B:** Correct, and that is why committed entries survive a clean handover.

**A:** Then majority voting already solves it.

**B:** It solves one problem. It protects committed history during a clean handover. It does not stop an old leader from doing new damage after the vote. Storage does not attend elections. The vote lives in the consensus layer. The write lands in a storage layer. That layer may never ask who won. And notice what the token cannot fence. It fences a resource that checks the number. A side effect that already left the building, a message sent, a payment released, a cache told to forget, never checks anything.

**A:** Give me the concrete failure.

**B:** Node one wakes. It writes directly to shared storage. Storage sees a valid request from a trusted machine. It stores the value. Term eight never gets consulted.

**A:** So the election made a promise. Nobody enforced it at the point of the write.

**B:** Exactly. Enforcement has to happen on every write, at the place the write lands.

**A:** That is where the term number stops being paperwork.

**B:** Yes. Call it a term in Raft. Call it an epoch elsewhere. It is a number that only goes up. It identifies who was authorized most recently.

**A:** And the fencing token is that number, carried with the work.

**B:** Carried with the work and checked at the door. Every time. Not once at login. Every write.

**A:** Like a bouncer checking the number stamped on your hand.

**B:** The stamp changes at every election. Node one shows up with seven. The door requires eight only after eight has actually been recorded at that door, and a term works as a token only if the resource receives it, records it, and checks it on every write. Seven gets refused, however confident node one sounds, once the higher number is on record there.

**A:** Give me that check with actual numbers, not just seven and eight.

**B:** Martin Kleppmann gives the clean version in his expert writing on distributed locking. It is expert writing, not an incident report, and the example is a worked example.

**A:** Numbers.

**B:** A first client acquires a lock and gets token 33. Then it pauses for a long time, and its lease expires.

**A:** A lease, not a lifetime appointment.

**B:** A second client acquires the lock and gets token 34. It writes with token 34, and storage remembers 34 as the highest token it has seen.

**A:** Then client one wakes up feeling fully employed.

**B:** It writes with token 33. Storage rejects it, because 33 is lower than 34 and lower is stale.

**A:** The pause did not matter once the number arrived late.

**B:** The pause is exactly why the number matters. A lock with a timeout cannot prove the old holder stopped, so the resource itself has to refuse the old number.

**A:** That fence lives at storage, though. What protects an effect that never touches that storage?

**B:** Nothing in the token does, and that limit needs saying plainly. Fencing only works where the resource enforces the token. Point the stale leader at a payment service, a mail service, or a webhook that ignores tokens, and the number might as well be a poem. For a service like that, the defenses are different. Give the operation an idempotency key, so a repeat arrives under the same name and gets the first answer back. Or record the intent in a transactional outbox, so the effect is dispatched once, by the current owner, from inside the transaction that earned it. Or make that external service the fence itself, the place that records and checks the number. And some effects cannot be fenced at all. A message already delivered does not come back because a term went up.

**A:** What if node one write arrives before the new leader first write? Storage has only seen seven. It accepts.

**B:** Good catch. That race is real, and fencing first does not erase it completely. A stale write that lands before the fencing write can still be accepted, because its number is not superseded yet at that moment. So the new leader must fence before it serves. Its first act is a fencing write to storage, an operation that does no client work but makes storage record eight as the highest token it has seen. Only then does it accept work. Fencing stops a stale write from overwriting the newer generation. It does not undo a stale write that already landed.

**A:** Fence first. Serve second.

**B:** If the new leader cannot reach storage to fence, it does not serve. Slow on purpose. Serving without fencing is how you get two truths.

**A:** Now back to my faster election. Why does speed make this worse, not just noisier?

**B:** Speed multiplies leaders per hour. Every election mints a new would-be stale leader. The old one does not vanish. It is paused, or partitioned, or slow.

**A:** And with no token check at storage, more elections means more overlap windows per day.

**B:** And shorter patience means healthy but slow leaders get deposed mid-work more often. Speed increases the supply of exactly the thing that hurts you.

**A:** So the dangerous moment is not the crash.

**B:** Crashes are honest. The node is gone. The dangerous moment is the pause that looks like a crash to everyone except the node having it.

**A:** That is absurd. The cluster did everything right. Voted correctly. Followed the rules. And still needs a bouncer because its own ex-leader will not leave.

**B:** The ex-leader is not malicious. It is obedient. It is executing old instructions with old authority. Not villains. Leftovers.

**A:** Practical consequence. If I run a database failover, what do I actually check?

**B:** Three things. One. Does every write carry a token tied to leadership? Two. Does storage reject stale tokens, tested, not assumed? Three. Does the new leader fence before it serves traffic?

**A:** And if any answer is no?

**B:** Then your failover plan is a hope with good documentation. The election decided who should lead. Nothing decided who can still write.

**A:** So moving the work is not the achievement.

**B:** The achievement is everything the old path can no longer do after the move.

**A:** If the old path can still accept a write an hour later, you did not fail over.

**B:** You forked. Reconciling forks is manual, expensive, and sometimes impossible. Fencing is a number comparison at write time. Cheap beats heroic.

**A:** So the rule narrows to this. Never trust a leader to know it is finished.

**B:** Never. Design as if every leader will outlive its authority and come back ready to work.

## SEC-03: Proof in production: the audits

**A:** If you want to know whether a design survives contact with reality, you do not read the brochure first.

**B:** You read the incident report. The brochure tells you what the builders hoped. The incident report tells you what the system actually did when the network stopped cooperating for less than a minute.

**A:** Start with GitHub, October 21, 2018.

**B:** A date a lot of engineers remember, because the trigger was damn small compared to what followed.

**A:** The loss of connectivity lasted 43 seconds.

**B:** Forty three seconds. That is the whole trigger. A link went away, a link came back, and the consequences ran for more than a day.

**A:** The break was between GitHub's US East Coast network hub and its primary East Coast data center.

**B:** Not a total collapse. Not every cable in the building. One connection, between a hub and a primary data center, gone for 43 seconds and then restored.

**A:** Inside that window, GitHub Orchestrator had a decision to make.

**B:** Orchestrator manages the database cluster topologies and handles automated failover, and it is built on top of Raft for consensus.

**A:** So the failover machinery was not improvised in the moment.

**B:** No. It was a consensus system doing the job it exists to do, watching for a leader it could no longer reach and arranging a replacement.

**A:** During the partition, the Orchestrator nodes on the West Coast and in the East Coast public cloud established a quorum. The divergent writes that followed did not come from that vote. They existed because the East MySQL primary remained writable under asynchronous replication, and the old primary was not fenced. Consensus was correct. The data plane was not bound by it.

**B:** And with that quorum in place, Orchestrator started failing database clusters over so that writes would go to the West Coast data center.

**A:** That is the sentence people rush past, so say it slowly.

**B:** The system failed the primaries over to the West. It did that because it was configured to do that. Nothing in that step was a malfunction.

**A:** Then connectivity came back.

**B:** After 43 seconds, yes. The East Coast hub and the primary East Coast data center could talk again, and the application tier began directing write traffic to the new primaries in the West.

**A:** If the story ended there, it would be a success story about automatic failover.

**B:** It does not end there, because of what the East Coast servers were holding when the link dropped.

**A:** The database servers in the East Coast data center contained a brief period of writes that had not been replicated to the West Coast facility.

**B:** A few seconds of writes. Small in count, enormous in consequence, because those writes existed on one side of the partition and nowhere else.

**A:** And once the West Coast primaries started accepting traffic, the mirror problem appeared.

**B:** Both sides now contained writes the other side did not have. The East had its brief unreplicated writes, and the West had everything written after the failover.

**A:** Neither copy was corrupt.

**B:** Neither copy was lying. Each one was a faithful record of what it had been asked to store. They simply disagreed, and disagreement between two honest copies is still disagreement.

**A:** That divergence is what blocked the obvious recovery.

**B:** GitHub could not safely fail the primary back over to the East Coast, because failing back would mean choosing one history and discarding writes that real users had already made on the other.

**A:** This is the 3 a.m. question in its purest form, because mid incident you have to decide which copy you believe while nobody can prove the other copy is wrong.

**B:** And there is no neutral answer. Whichever copy you demote, somebody's work sits on the losing side of that decision, and that is a hell of a call to have to make. Those are database writes, and the people behind them trusted GitHub with work they could not afford to lose.

**A:** How large was the divergence on the East side, in the postmortem own accounting?

**B:** The postmortem gives an example rather than a total. For one of the busiest clusters, there were 954 writes in the affected window that had not been replicated to the West.

**A:** Hold on to that framing, because it matters.

**B:** It does. Nine hundred fifty four writes are the published example figure for the busiest cluster. It is not a total across the incident, and the postmortem does not publish such a total.

**A:** A small number by the standards of a platform that size.

**B:** Small enough to fit in a careful human review, and that fact shaped everything that followed. You do not casually merge two divergent histories when you can instead account for the writes one by one.

**A:** So the team faced a fork with no cheap branch.

**B:** Fail back fast and risk discarding user data, or fail forward slowly and accept a long and visible degradation. Those were the real options once both sides held writes.

**A:** GitHub chose the second branch, deliberately.

**B:** At 23:13 UTC on October 21, the team concluded that the data already written to the West Coast ruled out options other than failing forward in order to keep user data safe.

**A:** Failing forward meant staying on the West Coast primaries and rebuilding toward a stable topology from there.

**B:** It also meant applications running in the East would pay cross country latency for their database calls, and GitHub said plainly that this would make the service unusable for many users.

**A:** They took the hit anyway.

**B:** They did, and they said the extended degradation was worth ensuring the consistency of user data. That is a values statement wearing an engineering costume.

**A:** Then they widened the degradation on purpose.

**B:** At 23:19 UTC on October 21, GitHub stopped jobs that write metadata about things like pushes, and paused webhook delivery and GitHub Pages builds.

**A:** Say why, in the reasoning the postmortem itself gives.

**B:** They made an explicit choice to partially degrade site usability by pausing webhook delivery and GitHub Pages builds instead of jeopardizing data that had already been received from users.

**A:** And the strategy, in their own words, was to prioritize data integrity over site usability and time to recovery.

**B:** That sentence is the whole philosophy in one line. Given a choice between a fast recovery and a correct one, they picked correct and paid the full damn price in public.

**A:** Pausing webhooks and Pages builds is not a cosmetic step.

**B:** No. It means accepting that parts of the platform stop moving so that the parts holding user data cannot be put at further risk while recovery proceeds.

**A:** What did the recovery itself look like?

**B:** The plan they formed in the early hours of October 22 went like this. Restore from backups. Get the replicas in both sites back in sync. Fall back to a stable serving topology. And only then start processing the queued jobs again.

**A:** Restore from backups is the slow road.

**B:** It is the slowest road on the map, and everyone involved knew the time frame because the restore procedure was tested regularly. Slow was not a surprise. Slow was the price that had been accepted.

**A:** And while that road was being walked, the divergent writes were handled separately.

**B:** GitHub captured the database binary logs containing the writes taken in the primary site that were not replicated to the West, cluster by cluster, so the divergence could be analyzed instead of guessed at.

**A:** Analysis to determine which writes could be reconciled automatically and which would need outreach to users.

**B:** Exactly. Some writes turned out to have been repeated by the user and successfully persisted since, which is the kind of detail you only learn by reading the logs rather than merging blind.

**A:** Through October 22, clusters were restored in the East and began replicating again.

**B:** The site became far more responsive once writes were co-located with the application tier again, and by 11:12 UTC on October 22, all database primaries were established in the East Coast.

**A:** Recovery was still not finished at that point.

**B:** No. Dozens of read replicas were still hours behind the primary, so users could still see inconsistent and out of date information depending on which replica served a request.

**A:** The estimate problem deserves a mention here.

**B:** It does, because it is the human version of the same lesson. An early estimate assumed replication would catch up on a linear path, and the actual catch up followed a power decay instead, which stretched the recovery.

**A:** So even the forecast about agreement was itself a model that reality declined to follow.

**B:** And the write load rose as Europe and the United States started their workdays, which pushed against the catch up at exactly the wrong time.

**A:** Additional read replicas were provisioned in the East Coast public cloud to spread the load.

**B:** Which lowered utilization across the replica pool and finally let replication close the gap instead of losing ground under peak traffic.

**A:** Then came the failback.

**B:** Once the replicas were in sync, GitHub conducted the failover back to the original topology, at 16:24 UTC on October 22.

**A:** And even then, the status stayed red by choice.

**B:** Yes. As a conscious decision to prioritize data integrity over a shorter incident window, GitHub kept the status red while it began processing the backlog that had accumulated.

**A:** The backlog was the paused work coming back to life.

**B:** Webhooks and Pages builds that had waited out the incident now had to be processed in order, under load, without overwhelming the partners waiting on the other end of those notifications.

**A:** The final marker is the one that closes the timeline.

**B:** All pending webhooks and Pages builds had been processed, the integrity and proper operation of all systems had been confirmed, and at 23:03 UTC on October 22 the status was finally updated to green.

**A:** Total degraded service, 24 hours and 11 minutes.

**B:** Twenty four hours and eleven minutes, from a 43 second break. And the opening line of the accounting still stands. Ultimately, no user data was lost.

**A:** Sit with the ratio for a moment.

**B:** Gladly. The trigger fits inside a single held breath, and the recovery fills an entire day and most of another night, because correctness work does not compress the way failure does.

**A:** Now tell me what this story actually argues, without the hero costume.

**B:** The design was not the failure. Raft did not fail. Orchestrator did not fail. The failover machinery executed the configuration it had been given.

**A:** The failure lived in the gap between the configuration and what the rest of the system could support.

**B:** That is GitHub's own stated lesson. Orchestrator actions behaved as configured, despite the application tier being unable to support the topology change that followed.

**A:** A cross region promotion was allowed by configuration.

**B:** And the stated fix was correspondingly narrow and honest. Adjust the configuration of Orchestrator to prevent promotion of database primaries across regional boundaries.

**A:** Not rip out the consensus protocol.

**B:** Not fire the damn automation. Not swear off failover. Change the boundary inside which the automation is allowed to act, because the boundary was the defect.

**A:** This is why the hero version of this story is always wrong.

**B:** Because nobody saved the day by overruling the machine. The machine followed orders, the orders were the problem, and the fix was to write better orders before the next 43 seconds arrived.

**A:** There is a discipline hiding in that.

**B:** There is. When you audit a system, you do not only ask whether the algorithm is correct. You ask whether the configuration in front of you still matches the claim on the box.

**A:** Which is a perfect place to stop trusting single incidents and start trusting audits.

**B:** Because one incident can be luck, weather, or one bad night. An audit is somebody whose entire job is to come back, on purpose, and check whether the claim survives the test.

**A:** That somebody, in this field, is Jepsen.

**B:** Jepsen is a distributed systems verification practice that tests whether real systems deliver the consistency and safety properties their documentation claims, and its funding is part of the record. The etcd analysis was funded through the CNCF and the Linux Foundation, the MongoDB analysis by MongoDB, and the CockroachDB analysis by Cockroach Labs, each under Jepsen's published ethics policy.

**A:** Describe the method without the mystique.

**B:** Jepsen runs the real thing. Real binaries, real cluster. It fires random operations at it, writes down what it asked for and what came back, and then checks that record against the property the documentation claimed.

**A:** And while the clients are running, the faults arrive on schedule.

**B:** The harness introduces network partitions, process pauses and crashes, and clock problems while the workload runs, because a guarantee that only holds on a quiet network is not much of a guarantee.

**A:** The reports can prove the presence of bugs.

**B:** And Jepsen is explicit that the method cannot prove their absence. A passing run is evidence, not a certificate, and that honesty is part of why the findings carry weight.

**A:** Start with etcd, version 3.4.3, in the analysis dated 2020.

**B:** etcd is a coordination service that other systems lean on for configuration and locking, which makes its lock behavior a load bearing claim rather than a side feature.

**A:** The headline finding is blunt.

**B:** Jepsen puts a heading over it that says locks are not real, and the finding underneath, scoped to etcd 3.4.3, is that a lease recheck bug let etcd locks fail to provide mutual exclusion.

**A:** Translate mutual exclusion into plain speech.

**B:** A lock is supposed to mean one holder at a time. If two clients can hold the same damn lock at once, then everything they each believed the lock was protecting is unprotected.

**A:** And this was not a fault only failure.

**B:** No. Multiple clients could hold the same lock simultaneously, and while pauses, crashes, and partitions made it worse, it could also occur in healthy clusters without any external faults.

**A:** The measured consequence came from a mutex protected set test.

**B:** Using etcd mutexes to protect updates to a set, Jepsen could reliably induce the loss of about 18 percent of acknowledged updates, in a test built to surface exactly that failure.

**A:** Acknowledged is the word to underline there, and the condition belongs attached to the number. That figure came from a test designed to induce the loss, which qualifies it without weakening it.

**B:** It is. These were updates the system had confirmed. Losing a request you never acknowledged is an inconvenience. Losing nearly one in five that you confirmed is a broken promise with a receipt.

**A:** There was a named root cause.

**B:** A client that waited for a lock, lost its lease, and then saw the lock released could be told it now held the lock without the server rechecking whether its lease was still valid.

**A:** That defect is recorded as issue 11456.

**B:** And the analysis lists that issue as fixed in master, which matters for how you should hold the finding. The bug was real, it was found, and the fix path existed.

**A:** The recommendation that follows from it is practical.

**B:** Use a fencing token, such as the revision of the lock key, rather than trusting the lock alone for safety. Do not let a polite abstraction stand between you and the check that actually protects the data.

**A:** Slow down on the token itself, because the mechanism is the whole lesson and it deserves more than a name.

**B:** Here is the shape of it. Every time the lock changes hands, the lock service hands the new holder a number, and that number is strictly larger than every number it handed out before.

**A:** In etcd's case, Jepsen's own recommendation points at the revision of the lock key, a number the system already keeps in global order.

**B:** The holder then carries that number with every write it makes to the thing the lock was protecting. The number travels with the work, not with the worker's confidence.

**A:** And the resource checks it at the door.

**B:** Every time. The resource remembers the highest token it has ever accepted, and it refuses any write that arrives carrying a smaller one. No exceptions for a holder who sounds very sure of himself.

**A:** So walk the failure through it. A holder pauses, its lease expires, and a second holder takes the lock with a larger token and writes.

**B:** Then the first holder wakes up, still believing the lock is his, and tries to write with the old, smaller token. The resource compares the numbers and turns him away. The lock lied to him. The door did not.

**A:** Hold the shape of that story, because it repeats.

**B:** A strong core, a weaker edge feature, and a claim in the documentation that ran ahead of what the edge feature could deliver under test.

**A:** Second case. MongoDB, version 3.6.4.

**B:** Tested in a sharded cluster configuration, and this analysis was conducted by Kit Patella for Jepsen, which is the credit line that belongs on it.

**A:** The finding here concerns write concern.

**B:** Write concern is the setting that says how much confirmation a write needs before the system calls it done, and the losses in this test happened at levels below a majority.

**A:** Give the measured result exactly, because in this case the setting is part of the result.

**B:** In a set test against a sharded cluster, MongoDB lost 543 out of 6,095 successfully acknowledged writes, and those writes were lost by rollback.

**A:** Rollback means the system later decided those writes had never happened.

**B:** In effect, yes. A newer primary without those writes takes over, the writes are rolled back, and a client holding an acknowledgment is holding a receipt for something the database has unhappened.

**A:** Jepsen is careful to note the documented context.

**B:** It is. The analysis itself says MongoDB can lose committed writes at write concern levels below a majority because those writes can be rolled back, and that this behavior is documented for replica sets.

**A:** So the configuration was the trap, again.

**B:** For the rollback half, yes, and the causal half is what this case actually exists to prove. At the strongest settings in that test series, Jepsen found no such loss after weeks of insert only and update heavy workloads through rebalances and partitions, and the v1 protocol appears to provide linearizable single-document reads, writes, and compare-and-set. The causal promise needed majority reads and writes, and nobody had written that requirement down.

**A:** Then there is the causal consistency finding, which is subtler.

**B:** MongoDB causal sessions claimed properties like read your writes and monotonic reads, and Jepsen found clear evidence of violations of causal consistency in testing.

**A:** One violation deserves a plain statement, because it shows a session promise failing in the exact way users were never warned about.

**B:** Two acknowledged writes happened during a network partition, and after the partition healed, a final read returned the initial blank state, as if those writes had never taken place.

**A:** Those anomalies appeared at sub majority settings.

**B:** They did. The examples used low write concern and local reads, no anomalies were observed at majority write concern, and the first anomaly disappears at majority read level.

**A:** And the documentation at the time did not say that clearly.

**B:** Jepsen conclusion was that causal consistency does not work unless users use majority reads and writes, and the causal consistency documentation made no mention of that requirement.

**A:** The vendor response splits into two parts.

**B:** Documentation warnings were added advising that the guarantees apply to majority operations, and that documentation work was completed in September 2018.

**A:** And on the core interpretation, the vendor disagreed.

**B:** MongoDB closed the issue as working as designed, arguing that durability is not guaranteed for sub majority writes. Jepsen recorded that interpretation and said users would find it less intuitive.

**A:** That phrase, working as designed, deserves a slow look.

**B:** It does, because it can be true as hell and useless at the same time. The design may permit the loss, while the session level promise still taught users to expect the loss would not reach them.

**A:** Third case. CockroachDB, the 2016 beta.

**B:** The version under test was beta 20160829, a distributed SQL database that aimed to provide serializability, which is exactly the property Jepsen went looking for violations of.

**A:** And found them.

**B:** The analysis discusses multiple serializability violations in that beta, and two new bugs carry the story.

**A:** The first bug is a timestamp cache collision.

**B:** Two transactions landed on the same timestamp and overwrote each other's entries in the timestamp cache. Both read the same maximum value. Both inserted the next value. So the final read had duplicates that should have been impossible.

**A:** The second bug should sound familiar to anyone who has operated retries.

**B:** A low level RPC retry turned an indeterminate network failure into an apparently definite logical failure, the transaction machinery retried the whole transaction, and the transaction was applied twice.

**A:** Applied twice means the effect happened twice.

**B:** In the test it surfaced as duplicated values in the final read, five values each appearing twice after a timeout during a network partition. Ambiguous failure, confident retry, doubled effect.

**A:** The by design exception should be stated fairly.

**B:** CockroachDB does not provide strict serializability, and the comments test failure reflects that deliberate choice rather than a defect. Jepsen marks that distinction clearly.

**A:** And the fix record is part of the finding, not an afterthought.

**B:** Fixes for the two bugs were included in beta 20160915 and beta 20161013, following the collaboration between Jepsen and the vendor.

**A:** Later betas changed the verdict.

**B:** In the latest betas at the time of the report, CockroachDB passed the Jepsen tests discussed, under crashes, pauses, partitions, and clock offset, with the by design comments test as the one exception.

**A:** The vendor also absorbed the tests.

**B:** Cockroach Labs merged many of the test cases into its internal suite and integrated Jepsen into its nightly testing, which is the healthiest possible response to an audit.

**A:** The story does not end with the vendor absorbing the tests. Cockroach Labs kept running them, and kept publishing what they found.

**B:** Cockroach Labs says it has run its Jepsen suite every night since before its 1.0 release, with 7 different workloads on a 5 node cluster, and that a nightly run two years to the day after the Jepsen tested beta found their first post release bug.

**A:** The failure deserves a plain description, because its shape is the ambiguous failure problem itself.

**B:** A key read back as 1, then read back as 4, even though every attempt to write that 4 had reported failure. One of those failed writes had in fact taken effect, which is the ambiguous failure problem wearing a name tag.

**A:** And the fix record deserves the same plain treatment, because a serious bug can have an honest and narrow fix.

**B:** Cockroach Labs says a transaction wrongly signalled that it had committed while its commit was being retried on a new leader, the fix was a single if statement, and the bug was still in version 2.1 before it was fixed in 2.1.1. That is the audit economy working exactly as advertised, damn it.

**A:** Pause there, because the auditor is a business too.

**B:** Jepsen lists paid analysis on its own site, alongside technical talks, training classes, and consulting services.

**A:** The offer is plain. You can hire Jepsen to analyze a database, a queue, or another kind of system.

**B:** That practice publishes free, in depth analyses, and has analyzed over two dozen databases, coordination services, and queues since 2013.

**A:** Which creates the tension nobody should skip. The customer for an audit is often the audited.

**B:** Jepsen says that part out loud. When a vendor pays for an analysis, few companies like seeing their product discussed in a negative light, and that creates pressure to deliver positive results.

**A:** So why trust the referee if the referee sends the home team an invoice?

**B:** Because the counter pressure is written down too. If Jepsen kept finding nothing, there would be no reason to hire Jepsen at all.

**A:** And a clean report is not the valuable product.

**B:** No. Companies often believe a positive post may suggest tampering, and encourage Jepsen to find problems. Users have shown goodwill toward vendors who accept public criticism and commit to improvement.

**A:** The promises around the money matter too. Every analysis will include a clear statement of who funded the work.

**B:** Clients review drafts and suggest causes or workarounds, but they can never tamper with results, and Jepsen retains final editorial control over public analyses.

**A:** A client may defer publication by up to three months to understand the faults, try fixes, and update documentation.

**B:** That delay has a hard limit. It is time to fix, not a burial for the finding.

**A:** Jepsen also declines sponsored content, and admits the plain economics. Analyses take months of work, and its researchers have to eat.

**B:** That line is funnier than it looks. A referee who pretends money is not in the room asks you to trust a fiction.

**A:** So read the funding statement, the editorial promise, and the published failure together. They are part of how you weigh the finding.

**B:** Exactly. A vendor paying for a test that breaks its own claim in public is the strongest signal here, because the money pointed one way and the result went the other.

**A:** Even the referee is a priced corner, then.

**B:** Even the referee. When the price structure is published with the verdict, the price stops being a hidden motive and becomes part of the evidence.

**A:** Now land the pattern across all three audits.

**B:** None of these reports says the system is junk. etcd key value operations held up strongly in the same analysis that broke its locks.

**A:** MongoDB at its strongest settings appears to provide linearizable single-document reads, writes, and compare-and-set, in Jepsen's own careful wording, in the same analysis that counted the rolled back writes.

**B:** And CockroachDB fixed its violations and passed in later betas in the same analysis that first exposed them. Junk does not behave like that. Junk does not improve under audit.

**A:** So what do the audits actually say?

**B:** They say the brochure and the configuration are different documents. The claim describes the system at its strongest settings, and the configuration describes the system you actually deployed.

**A:** GitHub learned that from the inside, in one night and one long day.

**B:** And Jepsen teaches it from the outside, one workload at a time, by reading the claim first and then testing the claim rather than the reputation.

**A:** The practical question for a listener is therefore not which database is safe.

**B:** No. The practical question is which claim you are relying on, at which setting, and whether anyone has tested that exact combination under the faults your system will actually meet.

**A:** A lock that is not mutual is worse than no lock at all.

**B:** Because no lock makes you careful, and a broken lock makes you confident. Confidence borrowed from an untested claim is the most expensive kind.

**A:** Same for an acknowledgment, so turn the aphorisms into a procedure before we leave this ground.

**B:** Step one. Find the claim you actually rely on, in writing, not the claim from the sales page.

**A:** Step two. Find the setting that claim depends on, even when it sits two screens deep in the documentation.

**B:** Step three. Find who on your team has run the system at that setting under a partition, and price the configuration that satisfies the claim. If the answer is nobody, then say out loud which guarantee you have given up, because you are the audit that has not happened yet.

**A:** That honesty is cheaper before the incident than after it.

**B:** Considerably. GitHub paid for its lesson with 24 hours and 11 minutes of degraded service and kept every byte of user data. The audits offer the same lesson at the price of reading.

**A:** So before we ask which design is right, ask what each design is selling, because the next two teams wrote the price on the first page.

**B:** When the copies disagree, which one do you believe, and did you decide that in a design review or are you deciding it for the first time while the status page is already red?

## SEC-04: The consistency spectrum: two industrial answers

**A:** Here is the part I cannot get past. Google looked at the whole problem of copies disagreeing about order, and instead of writing a cleverer argument, they went and bought better clocks.

**B:** They bought a bound on their own ignorance. That is a different purchase, and a much more honest one.

**A:** But the ambition was not modest. They wanted externally consistent transactions at global scale.

**B:** Say what that promise actually means, because people nod at that phrase and then use it to mean whatever the hell they want.

**A:** It means the timestamps tell the truth about real order. If one transaction commits before another transaction starts, the first one gets the smaller commit timestamp.

**B:** External consistency is a promise about commit timestamp order. If one transaction commits before another transaction starts, the first transaction receives the smaller commit timestamp, and the order of the timestamps respects the order in which things really happened.

**A:** The system behaves as if all the transactions ran one after another in a single order, and Spanner makes its strong reads and read write transactions linearizable, while a snapshot read at a past timestamp can legitimately see neither transaction.

**B:** Even though they did not. Even though they ran on different machines, in different places, at overlapping moments in real time. They refused to give up a single globally agreed order, and then they paid for the refusal in hardware, in latency, and in operations. Hold all three of those bills in your hand at once.

**A:** Start with the hardware, because that is where my brain keeps snagging.

**B:** The key enabler in the 2012 paper is a time service called TrueTime.

**A:** TrueTime gives you the time.

**B:** No. TrueTime gives you a range of possible times and admits how wide that range is.

**A:** So instead of saying it is exactly noon, it says it is somewhere between just before noon and just after noon.

**B:** Exactly. The API returns an interval, earliest to latest, and epsilon is half the width of that interval, the uncertainty the system has to live with.

**A:** Most clocks pretend to be certain.

**B:** Most clocks hide the doubt where the application cannot see it. TrueTime exposes the doubt and makes the database deal with it in the open.

**A:** The paper calls that uncertainty epsilon.

**B:** It does. And as the 2012 paper states it, epsilon was typically 1 to 7 milliseconds, with uncertainty generally under 10 milliseconds.

**A:** Those are 2012 paper figures, not a promise about any system running today.

**B:** Correct. Date the numbers or do not use them. That discipline matters more than the numbers themselves.

**A:** One to seven milliseconds still sounds tiny.

**B:** It is tiny, and it is not zero, and that gap between tiny and zero is where this entire damn design lives.

**A:** How did they keep the gap that small?

**B:** With multiple modern clock references, GPS and atomic clocks, exactly as the paper puts it.

**A:** Every server got its own atomic clock, right?

**B:** No, and that popular shorthand is just wrong. Stop repeating it.

**A:** Correct me properly before I repeat it at work.

**B:** The paper describes a set of time master machines per datacenter, and a timeslave daemon running on every machine.

**A:** So the special hardware sits with the masters, not inside every server.

**B:** Right. Most masters have GPS receivers with dedicated antennas. The remaining masters carry atomic clocks.

**A:** The paper gives those atomic clock masters a remarkable name.

**B:** It calls them Armageddon masters. They exist for the failure case where GPS fails.

**A:** They planned for the day the satellite signal could not be trusted, so they kept atoms in the building as a backup witness for time.

**B:** That is the level of seriousness here. They did not hope time would behave. They built fucking infrastructure for the day it would not.

**A:** Who pays for that level of seriousness? Receivers, atoms, and people who keep time honest.

**B:** Google pays, because wrong order is the failure their workloads cannot afford. A five person shop does not buy atoms. It rents the promise from someone who did, or picks a design that never needed it.

**A:** So the clocks are a purchase, not a law of nature.

**B:** A purchase. Hold that thought, because the wait is what it buys.

**A:** And the masters are separated physically, so one local problem does not corrupt every reference at once, while every machine polls masters in nearby and farther datacenters.

**B:** Yes. Then every machine polls the masters and disciplines its own clock against them.

**A:** This is what I mean by attacking the clock itself.

**B:** You are half right. They did not fix time. They measured how wrong they could be and kept that measurement small enough to spend.

**A:** Spend how?

**B:** By waiting. That is the second half of the design, and it is the beautiful half.

**A:** Walk through a transaction committing.

**B:** The system assigns the transaction a commit timestamp. That timestamp is chosen to reflect the serialization order the system is promising to defend.

**A:** The timestamp is not just a label stuck on afterwards.

**B:** No. It is the claim. It says this transaction belongs here in the global order, before what follows and after what came before.

**A:** And then the system does not immediately show the data to everyone.

**B:** It waits. That waiting has a name in the paper, commit wait.

**A:** Say the rule plainly.

**B:** The data stays invisible until the time service can prove that commit moment is fully in the past for everyone.

**A:** And the paper states that rule in its own words, word for word.

**B:** The coordinator leader ensures that clients cannot see any data committed by Ti until TT.after(si) is true.

**A:** So the leader chooses a timestamp slightly in the future relative to its uncertainty, and then sits on its hands until the whole world has caught up past that moment.

**B:** That is the shape of it. Because the timestamp was chosen from the latest edge of the interval, the paper states the expected wait as at least twice epsilon, the price of walking from one edge of the uncertainty interval past the other.

**A:** At the 2012 numbers, that wait is measured in milliseconds.

**B:** Small milliseconds, paid on transactions where the promise matters. Small is not free when you pay it at planetary scale, forever.

**A:** Careful with the small number first. In the Spanner paper, commit wait of about 5 milliseconds comes from the 1 replica experiments, where the zones sat less than a millisecond apart. That is a bench figure from 2012, not a production promise.

**B:** And the production figure from the F1 deployment?

**A:** The F1 paper says users saw read latencies of 5 to 10 milliseconds and commit latencies of 50 to 150 milliseconds, and that commit latency was largely determined by network latency between datacenters.

**B:** So the wait is real, but geography is a bigger bill. Exactly. The clocks charge you milliseconds. The Paxos round trips across the country charge you much more, and Google published both numbers instead of hiding either one.

**A:** But the payoff is enormous. Once the wait finishes, the order is not a hope.

**B:** Once the wait finishes, any later reader, anywhere, gets an answer consistent with that order. The system waited until it could prove the timestamp was in the past for everyone.

**A:** That is the strange beauty I keep coming back to. They did not eliminate uncertainty.

**B:** No. They did the opposite of the usual trick. They refused to pretend uncertainty was gone.

**A:** They measured it, named it, shrank it with satellites and atoms, and then paid the remainder down with waiting.

**B:** And when uncertainty grows large, the paper says the system slows down to wait it out. The guarantee does not quietly degrade. The latency absorbs the problem.

**A:** There is an operations bill hiding behind that sentence, and it never gets itemised.

**B:** Itemise it, then. Keeping epsilon small is not a purchase you make once. It is a signal somebody has to watch for the entire life of the system.

**A:** The paper's own machinery shows why. Every machine runs a timeslave daemon, and that daemon polls a variety of masters, nearby and farther away, precisely so that no single master can quietly poison the time.

**B:** And the daemons do not just average whatever answers arrive. They run a variant of Marzullo's algorithm to detect and reject liars, then discipline the local clock against the masters that survive the check.

**A:** So a widening uncertainty interval is not a performance curiosity. In this design it is the earliest visible symptom that a reference, an antenna, or a whole path to the masters is going wrong.

**B:** And the system's answer is already written down. When uncertainty grows large, Spanner slows down to wait it out, which means the symptom arrives as latency on real transactions, in front of real users.

**A:** Which turns timekeeping into an on call discipline. Somebody owns the masters. Somebody owns the antennas. Somebody gets paged when the interval starts to stretch.

**B:** Exactly. Google did not just buy better clocks. Google staffed a permanent argument with physics, and the staffing is part of the price every imitator forgets to copy.

**A:** That sentence should be printed on a wall. If the uncertainty is large, Spanner slows down to wait out that uncertainty. Why is that not just the answer, everywhere, for everyone?

**B:** Because somebody has to buy the damn clocks, run the antennas, maintain the masters, and eat the wait on every transaction that needs the promise.

**A:** Google had Google scale and Google money.

**B:** Google also had Google problems. Do not turn their answer into a moral law for a five person shop with one database and a landlord.

**A:** I am not saying every shop needs atomic clocks in the rack.

**B:** You are drifting that way every time you say everywhere. I can hear the drift from here.

**A:** I am saying the direction is right for the data where wrong order is the intolerable failure, which is not all data. Bound what you do not know, pay to shrink the bound, and never show data before you can defend the order you claimed for it.

**B:** The direction is right for data where wrong order is the intolerable failure. That qualifier is doing all the work.

**A:** Give me a case where wrong order is tolerable.

**B:** Hold that thought, because Amazon built an empire on exactly that case, and they wrote their reasons down just as carefully as Google wrote theirs.

**A:** Land Spanner in one honest summary before Amazon steals the room.

**B:** In its own abstract, Spanner calls itself a scalable, multi version, globally distributed database, synchronously replicated. And it was presented as the first system to distribute data at global scale and support externally consistent distributed transactions.

**A:** No hand waving about eventual agreement.

**B:** No. Agreement now, in order, with the receipts being timestamps that respect what really happened first.

**A:** And if a listener takes only one sentence from the Google half, it should be that waiting was not a flaw in the design.

**B:** Waiting was the design. They bought certainty with time, literally, on purpose, over and over again.

**A:** The afterlife is not theoretical either. Google built a full relational system called F1 on top of Spanner to run AdWords, and the F1 paper says it has been managing all AdWords advertising campaign data in production since early 2012.

**B:** Give the scale exactly as Google reported it in that paper.

**A:** The database was over 100 TB, served up to hundreds of thousands of requests per second, and ran SQL queries that scanned tens of trillions of data rows per day.

**B:** That is the ads business, not a demo. And in May 2017 Google took the same bet public, announcing Cloud Spanner as generally available with 99.999 percent availability, and naming Snap as a customer already using it for part of its search infrastructure.

**A:** Now do the opposite bet, because Amazon looked at the same fractured world and chose the other intolerable failure.

**B:** Amazon chose to protect the write itself.

**A:** Set the scene the way their 2007 paper sets it.

**B:** The motivating example is not a ledger or a scientific instrument. It is a shopping cart, and it is brutal in its requirements. Customers should be able to view and add items to their shopping cart even if disks are failing, network routes are flapping, or data centers are being destroyed by tornados.

**A:** That sentence is doing a lot of work with weather.

**B:** It is doing business work. At Amazon scale, the paper argues, even the slightest outage has significant financial consequences and damages customer trust.

**A:** So a rejected cart is not a technical inconvenience.

**B:** A rejected cart is a lost sale and a broken promise at the exact moment the customer tried to give you money. Amazon decided that failure was the one they would not accept.

**A:** Hence the rule that follows from it.

**B:** An Add to Cart operation can never be forgotten or rejected, and that sentence is the paper's design requirement for the cart service, not a system guarantee. Sloppy quorum and hinted handoff still fail when too few nodes are reachable.

**A:** Say that again slowly, because never is a strong word in engineering.

**B:** Never forgotten, and never rejected. If the most recent state of the cart is unavailable and a customer changes an older version, that change is still meaningful and it must be preserved.

**A:** Even if the customer is editing stale state.

**B:** Even then. The edit means something. Throwing it away because a cleaner copy exists somewhere unreachable is, in their framing, the wrong kind of correctness.

**A:** So the store is designed so that a write can always be performed, even when the network is partitioned and replicas cannot talk to each other.

**B:** That is the bet in plain language. Stay writable. Accept the item. Sort out the disagreement later.

**A:** One name warning before we go further, because two different things answer to it.

**B:** Dynamo is the 2007 paper system, built inside Amazon for Amazon. DynamoDB is the managed product that came later, the one on everyone else's cloud bill. When I say Dynamo in this stretch, I mean the paper.

**A:** Google waits before visibility to protect order. Amazon accepts immediately and protects the action.

**B:** And Dynamo, in its own abstract, is honest about the price. To achieve that level of availability, it sacrifices consistency under certain failure scenarios.

**A:** That honesty is the part I respect most about both papers.

**B:** Both papers name their sacrifice in the opening pages. Neither one pretends the sacrifice is not happening. That alone puts them ahead of half the damn vendor decks on earth.

**A:** Walk through what the sacrifice looks like on an ordinary day.

**B:** Dynamo provides eventual consistency. Updates propagate to all replicas asynchronously, after the write has already been accepted.

**A:** So a successful write does not mean every copy has it yet.

**B:** Correct. A write call may return before the update has reached every replica, so a following read may return an older version without the latest change.

**A:** That is a stale read, stated without any drama.

**B:** It is. One copy knows. Another copy does not know yet. Both answer honestly from what they hold, and the answers differ. Anyone who calls that broken has never priced the damn alternative. Refusing the write until every copy agrees means a failure somewhere turns into a refusal everywhere the partition reaches.

**A:** For a cart, Amazon judged a briefly stale answer better than a refused customer.

**B:** For a cart, yes. That judgment is local to the workload, and the paper never asks you to export it blindly to every workload on earth.

**A:** How does the system keep track of divergent versions without losing causality?

**B:** It versions objects and uses vector clocks to capture causality between versions of the same object.

**A:** Translate that out of paper language.

**B:** Each version carries a record of what it causally follows. If one version clearly descends from another, the older one can be set aside.

**A:** And if neither version descends from the other?

**B:** Then both changes happened without knowledge of each other. Neither overwrites the other. Both versions are kept and must be reconciled.

**A:** Reconciled by whom?

**B:** Often by the application, because the application knows what the operation means. The paper calls this application assisted conflict resolution, and it is a load bearing part of the design.

**A:** Stay with the running costs, because Dynamo's price is not paid once at divergence. It is paid continuously, in background work most designs never budget for.

**B:** Start with repair. The paper gives Dynamo an anti entropy protocol for keeping replicas synchronized, using Merkle trees so two nodes can compare a key range and find where they disagree.

**A:** Each node keeps a separate Merkle tree for each key range it hosts, so nodes compare hashes down the tree instead of shipping every value.

**B:** That is a permanent background job. Replicas fall behind and disks fail, and the trees keep asking the same unfashionable question. Are we still holding the same truth?

**A:** Then there is the stand in problem. When a replica is down, the write still has to land somewhere, because refusing it was the one failure this design swore never to commit.

**B:** So Dynamo uses sloppy quorum and hinted handoff. Writes go to the first healthy nodes available, and a stand in keeps the write separate, marked with a hint about where it truly belongs.

**A:** When the original replica returns, the stand in hands the write over. Until then, the system carries a debt it chose on purpose.

**B:** Choose is the right word. The hint is a promise to repay, and hints can strand if the holder fails first, which is why the paper pairs handoff with anti entropy behind it.

**A:** So the resurrection joke has a payroll underneath it. Divergence is not an event the system survives. It is a condition the system maintains, forever, on purpose.

**B:** That is the honest invoice. Amazon converted the agreement problem into permanent repair labour and a standing queue of hints waiting to go home.

**A:** For a cart, merging has a natural meaning.

**B:** It does. Two versions of a cart can be merged by preserving the items from both, because adding an item is an action the business wants to keep.

**A:** And that merge carries the famous cost.

**B:** It does. If an item was deleted in one version and kept in another, merging both histories can bring the deleted item back.

**A:** Give me the small human version of that, once, and then we will leave it alone.

**B:** You deleted the socks, and the cart restored them because another version of you still had them in its history.

**A:** My cart kept both timelines and made me the tie breaking raccoon.

**B:** It decided for availability. You are part of the conflict resolution. That is not a bug nobody noticed. It is an accepted merge cost, stated in the design.

**A:** There is a design tool that ran a related version of that trade in public and wrote down exactly where it refused to pay for agreement with no referee.

**B:** Name the company, because this is my favourite kind of refusal.

**A:** Figma. In a 2019 engineering post, Figma explained that its multiplayer system is inspired by CRDTs, the conflict free replicated data types, but is not built on true CRDTs.

**B:** Why refuse the real thing?

**A:** Because, in Figma's own account, CRDTs are designed for decentralized systems where there is no single central authority to decide what the final state should be. Figma is centralized, so Figma kept its server as the central authority and cut the overhead that decentralization would have charged.

**B:** So the clever move was keeping a referee, and refusing to pay for the version with no referee.

**A:** Exactly. Figma's server defines the order of events, so Figma does not need a timestamp to settle which write came last. Two people changing different properties of the same object do not conflict at all. Two people changing the same property of the same object do conflict, and the document ends up with the last value that was sent to the server.

**B:** Last writer wins, but only at the exact property where the fight actually happened. The rest of the design just gets on with its day.

**A:** And Figma accepted the visible cost in writing. If one person changes a text value from B to AB at the same time as another person changes it to BC, the result is AB or BC, never ABC, and Figma said that is fine because Figma is a design tool, not a text editor.

**B:** That is the whole argument wearing a startup costume. Figma did not abolish the argument about agreement. Figma shrank it to one server, one order, and one property at a time, and sold designers the hours they stopped spending emailing files to each other.

**A:** Resurrection as a line item.

**B:** Exactly. Amazon knew deleted items could resurface, wrote the tradeoff down, and shipped it because the alternative cost more in their world.

**A:** What else did Dynamo give up to stay in its chosen corner?

**B:** It provides no isolation guarantees and permits only single key updates, per its stated requirements for the 2007 paper system. Those limits belong to the paper system, not to the managed DynamoDB product that arrives later.

**A:** So no one should confuse it with a general transaction engine.

**B:** No one honest should. It targets applications that can operate with weaker consistency if that results in high availability. That targeting is the whole philosophy in miniature. Know your workload, name your intolerable failure, and build the system that refuses that failure even when it hurts elsewhere.

**A:** Now the part where I push back, because availability can become an excuse.

**B:** Push.

**A:** If every system claims its writes are too important to refuse, we end up with divergence everywhere and reconciliation debt nobody budgeted for.

**B:** True, and that is why who reconciles, and when, and at what cost, has to be part of the design and not a surprise discovered by the support team.

**A:** Someone still has to explain the resurrected socks to a customer.

**B:** Someone does. That explanation is part of the price, just as commit wait is part of Google price. There is no free corner in this argument. There are only priced corners.

**A:** I notice both designs are, at heart, admissions.

**B:** Say more.

**A:** Google admitted that perfect time was unavailable, so they bounded the error. Amazon admitted that perfect agreement during failure was unavailable, so they bounded the damage.

**B:** That is a fair narrowing. Neither paper starts by claiming the world is tidy. Both start by naming the untidiness they fear most.

**A:** Which brings us to the strange connection underneath both of them, because the man who gave this field its ordering language came to it from physics.

**B:** Leslie Lamport, and his 1978 work on time, clocks, and the ordering of events.

**A:** He had read work on maintaining duplicate databases that used message timestamps, and something clicked.

**B:** In his own retrospective he says he happened to have a solid, visceral understanding of special relativity.

**A:** And relativity gave him the structure immediately.

**B:** In his own framing, here is what special relativity teaches us. There is no total ordering of events in spacetime that every observer agrees on. It is not invariant. It depends on where you stand.

**A:** Different observers can disagree about which of two unrelated events happened first.

**B:** Yes. What survives across observers is a partial order, the order between events where one can causally affect the other.

**A:** That realization, he says, may have been brilliant, and after it everything else was trivial.

**B:** His words carry a lovely arrogance and, annoyingly, the receipts to support the first half of the sentence.

**A:** Sit with what that means for our two industrial answers.

**B:** It means there is no free global now waiting to be read off the universe. Order is something a system constructs, defends, and pays for, or declines to construct and pays differently.

**A:** Lamport showed you could build ordering from causality, without claiming a universal present moment.

**B:** And decades later Google spent real money on GPS receivers and atomic clocks to bound a physical now tightly enough to build a stronger promise on top of it.

**A:** Logic said order is a relationship. Production said order is also a purchase order.

**B:** That line is glib, but the fact under it is sound. The two approaches are answers to the same absence.

**A:** The absence being any natural, agreed, total order just lying around for free.

**B:** Correct. Spanner buys a tight approximation of that order and waits out the remaining doubt. Dynamo declines to wait for it and preserves actions instead.

**A:** This is also where the everyday clock mistake belongs, because most stale read confusion starts with a timestamp treated as proof.

**B:** State the mistake.

**A:** This event happened first, look, its timestamp is earlier.

**B:** Earlier on a machine whose clock has its own drift, its own skew, and its own private relationship with the truth.

**A:** So a timestamp alone cannot prove the true order of events across machines.

**B:** It cannot. Clocks did not lie. We asked them a question they never promised to answer. Clocks are useful and often approximately synchronized. They were never, on their own, a guarantee of global order. Blaming them for our overclaim is shitty engineering and worse history.

**A:** A read can be stale because propagation is asynchronous, and a timestamp can be misleading because clocks are approximate, and those are two separate facts people merge into one vague fear.

**B:** Separate them and the design choices sharpen. Dynamo accepts the first fact openly. Spanner attacks the second fact with hardware and waiting.

**A:** Now give the descendants, briefly, because listeners live downstream of these papers whether they know it or not.

**B:** From the Spanner answer, the line runs to CockroachDB, whose own team describes its design as based on Google Spanner data storage system and built to offer similar external consistency guarantees without atomic clocks on commodity hardware. Hear that sentence as the vendor's aspiration, because CockroachDB's default guarantee is serializability, not Spanner-grade external consistency.

**A:** One breath was unfair to CockroachDB, because the decision is the headline and the founding story is its evidence. Everyone else needed Spanner style agreement on ordinary hardware, and Cockroach Labs decided to charge for carrying that argument.

**B:** Tell it as a company, then, not as a footnote.

**A:** Cockroach Labs was incorporated in February 2015, and its three founders were Spencer Kimball, Peter Mattis, and Ben Darnell, all former Google engineers.

**B:** Former Google engineers is doing quiet work in that sentence. What did they actually do at Google?

**A:** Kimball and Mattis helped build Colossus, the Google file system in its storage stack, and Darnell helped design and build Google Reader. Cockroach Labs says its founders also interacted and worked with the teams that were building Spanner.

**B:** So they did not build Spanner itself. They worked next to the people who did, and then they missed the tooling after they left.

**A:** That is the honest version, and it is still a remarkable founding story. Kimball wrote the first CockroachDB design in January 2014 and began the open source project on GitHub that February, before Cockroach Labs existed.

**B:** And the trigger was not a whiteboard. Peter Mattis told The Register that at Viewfinder, and then at Square after Square acquired Viewfinder, they ran into database problems again, and that is when CockroachDB really got started.

**A:** So Cockroach Labs is a business built directly on a priced argument, and the biography is the receipt that proves the founders had stood next to the original.

**B:** Students of Spanner, selling the lesson back to the rest of us, minus the atoms. That is not hero worship. That is a market finding the exact price of agreement and building a company on that line.

**A:** One breath, as promised, and an important qualifier inside it. Similar guarantees, different hardware budget.

**B:** From the Dynamo answer, the line runs to DynamoDB, and the break needs to be explicit. DynamoDB is a different, managed product, not the 2007 paper system. Its team paper traces its origins and its name directly to the original Dynamo system, not its architecture, and DynamoDB replicates with Multi-Paxos and offers strong consistency, so its consistency modes are not Dynamo's.

**A:** Two descendants deserve more than one breath, because listeners actually run them.

**B:** Start at Facebook. Avinash Lakshman and Prashant Malik built Cassandra for Facebook Inbox Search, a problem the paper describes as needing billions of writes per day, and the paper works through Dynamo in its related work and partitions data with consistent hashing, the ring idea Dynamo used.

**A:** The paper says Inbox Search launched in June 2008 for around 100 million users, and that Cassandra was later deployed as the backend storage system for multiple services within Facebook.

**B:** Then the managed descendant, and here is what protecting the write looks like after a decade of production. Amazon's DynamoDB paper, from USENIX ATC in 2022, puts a number on it. During the 66 hour Prime Day event in 2021, Amazon systems made trillions of API calls to DynamoDB. At the peak, 89.2 million requests per second. And through all of it, high availability, with single digit millisecond performance.

**A:** Also one breath. A managed service carrying the Dynamo name and its origin story, not its architecture, into a product most teams will meet long before they read the 2007 paper.

**B:** Name the temptation cleanly so I can fight the real version of it.

**A:** I want Spanner answer everywhere because I trust order. If every system waited until it could defend its order, half the reconciliation horror stories would never be written.

**B:** And the other half would be replaced by latency complaints, availability incidents, and an operations bill that would close small teams outright.

**A:** Who pays is basically your whole religion here.

**B:** Because that is the whole argument once the poetry settles. Who pays for the clocks? Who pays for the waiting? Who pays for the operational burden of keeping time masters healthy across datacenters?

**A:** Google could pay because the promise was worth it for their workloads.

**B:** And a team without GPS antennas, without atomic clocks, and without staff who have ever run a time service does not get Spanner promise by wanting it very hard.

**A:** They can rent systems built by people who did that work.

**B:** They can, and renting moves the bill rather than deleting it. The subscription arrives in money, in latency, and in the constraints of someone else design.

**A:** You make certainty sound like a luxury good.

**B:** I make it sound priced, because it is priced. Calling it a luxury would be lazy. For some data, under some promises, it is worth every cent and every millisecond.

**A:** Name the data where you would pay without flinching.

**B:** Data where showing two transactions in the wrong order breaks the meaning of both, where a customer seeing a later state without the earlier one is not a quirk but a breach of the promise the product made.

**A:** And name the data where you would take the Dynamo paper's bet without flinching.

**B:** Data where losing the customer action is worse than briefly diverging, where the operation has a meaningful merge, and where a person or a process is explicitly assigned to reconcile what divergence leaves behind.

**A:** A cart qualifies on all three counts in the paper own reasoning.

**B:** It does. A cart accepts, merges, and resurfaces an item as a tolerable cost. Change any one of those conditions and the bet needs to be argued again from the start.

**A:** So the fight narrows to a test, not a tribe.

**B:** Finally. Ask which failure is intolerable, ask what merge or wait actually costs, and ask who is staffed to pay that cost on a bad fucking day.

**A:** And notice what every one of those prices had in common.

**B:** Every price we just named was for agreeing in advance. The next one shows up when an operation times out, nobody knows if it landed, and the code tries again anyway.

**A:** I still lean toward order more often than you do.

**B:** I know. You lean toward order until the wait and the hardware arrive as line items. I lean toward availability until the reconciliation debt arrives as a line item. Our leans are both honest until we skip the damn invoice.

## SEC-05: The retry: the failure every business has already had

**A:** Let us talk about the retry, because that is where theory stops and the money starts moving twice.

**B:** A retry is the most honest button in software, because it admits nobody knows what happened and hits it again anyway.

**A:** The two industrial answers are priced. Now the invoice goes to everyone else.

**B:** Every shop with a pay button already bought a ticket. Most of them just have not been charged twice yet.

**A:** That is exactly the problem. You do not know what happened.

**B:** And not knowing has three standard answers. The industry gave them names so precise that people stopped reading them.

**A:** At most once. At least once. Exactly once.

**B:** Kafka actually wrote these down plainly, so let us use their words. At most once. A message can be lost, but it will never be delivered twice.

**A:** At least once. A message is never lost, but it might show up twice.

**B:** And exactly once, in that same documentation, means each message is delivered once, and only once. Those three are delivery semantics, choices about delivery, not three grades of one feature.

**A:** Those sound like three levels of quality. Pick the best one and move on.

**B:** They are not levels. They are choices about which failure you would rather explain. At most once protects you from duplicates by accepting loss. At least once protects you from loss by accepting duplicates.

**A:** And exactly once protects you from both.

**B:** Inside a fence. That fence is the whole story, so let us build it carefully.

**A:** Build it.

**B:** Kafka splits the problem in two. There is the guarantee when you publish a message, and there is the guarantee when you consume one. People quote exactly once like it covers both, plus their database, plus their payment provider, plus email.

**A:** Does it?

**B:** Hell no. Kafka is careful even when its fans are not. Since version 0.11, the Kafka producer has an idempotent option. The broker assigns each producer an identity, and every message carries a sequence number from that producer.

**A:** So when the producer retries, the broker can recognize the second copy as the same message.

**B:** Exactly, with the scope stated. Per producer session, per partition, and only with idempotence enabled, resending does not create a duplicate entry in the log. A restarted producer is a new session unless it is transactional, so the fence has edges and we name them.

**A:** And the second piece.

**B:** Transactions. The producer can write the output messages and the consumer position in one transaction. Either both land, or neither does. And if it aborts, the position rolls back with it, so a consumer reading only committed work never sees the aborted output.

**A:** That is the Kafka Streams shape. Consume from one topic, process, produce to another topic, and commit the offset with the output.

**B:** That scoped shape is where Kafka supports exactly once, most fully in Kafka Streams and with the transactional producer. It is a boundary claim, not a universal law of nature. Anyone selling it without the fence is selling you a fence with no field behind it.

**A:** Say the boundary out loud, because this is where the loose talk starts.

**B:** The moment the work leaves that boundary and writes to an external system, Kafka hands you a different documented pattern. Store your consumer position in the same place as your output, so the two cannot drift apart.

**A:** So exactly once is never a property of a retry button in general.

**B:** Never. If either of us says exactly once from here on without naming the fence it lives inside, the other one narrows it on the spot.

**A:** One boundary needs saying plainly before we go further. A consensus protocol can give every copy the same log, in the same order, and that still does not make the work at the end of the log safe to repeat.

**B:** The log can agree perfectly that a charge was recorded twice. Agreement is about the copies. Idempotency is about the effect. Different fences, different animals. Say it in the clean form. A replicated log can commit charge order 7 once, in order, on every replica, while the worker executing that entry still calls the payment provider twice if it crashes between the external call and recording the result. A payment API cannot join the local transaction. It needs its own idempotency key and its own reconciliation.

**A:** Agreed. Why is the consumer side so easy to get wrong?

**B:** Because the semantic is decided by an ordering choice most people make without noticing. Read a message, save your position, then process it. If you crash after saving and before processing, that message is skipped forever.

**A:** That is at most once in practice, whether anyone chose it or not.

**B:** Now flip the order. Process first, save position after. Crash after processing and before saving, and your replacement gets the same message again and processes it a second time.

**A:** At least once, also by accident.

**B:** And Kafka points out why that often survives in practice. Many messages carry a primary key, so processing twice just overwrites a record with another copy of itself. The work is naturally idempotent, so the duplicate is harmless.

**A:** The duplicate is only harmless when the operation itself can absorb it.

**B:** That sentence is the section. Write it on the wall. A duplicate charge cannot absorb itself. A duplicate booking cannot absorb itself. A duplicate shipment waves at you from a loading dock.

**A:** So let us do the classic case, slowly, and label it for what it is.

**B:** Label it first, before the story. This is a hypothetical. No company. No date. No victim. It is a shape, not an incident.

**A:** A checkout sends a request to create a charge for one order. The request carries no identity for the operation, or the retry will invent a fresh identity, which amounts to the same mistake.

**B:** The payment side receives it and completes the charge. Money has moved. On that side of the wire, the operation succeeded completely.

**A:** Then the response goes missing. A network break, a proxy timeout, or the client side timeout firing first. From where the client sits, the outcome is unknown.

**B:** From the client chair, the charge is in one of three worlds. It landed. It failed. Or it is still running somewhere. And the chair cannot tell you which one.

**A:** So the client does the reasonable thing and retries.

**B:** Reasonable and damn destructive. Nothing links the retry to the first attempt, so the server treats it as a brand new charge, because as far as the server can tell, it is one.

**A:** The second charge succeeds, and now the customer has paid twice for one order.

**B:** And the system usually finds out the ugly way. A complaint. A reconciliation report. A refund request. Almost never from the request path itself, because the request path thought everything went fine twice.

**A:** This is not an invented fear. Shopify Engineering documents this exact shape as a design risk for its ChargeCreate mutation.

**B:** Documented as a risk its payment service was built to prevent. If that mutation returns an error or times out, the client cannot discover what state the payment is in. Retry after the payment actually completed, and the buyer gets double charged. That is their warning, not a story about a named buyer.

**A:** I want to make the sandwich version official, because I have lived it, paid for it, and eaten the evidence.

**B:** Go ahead, ruin lunch. The raccoons are already dressed for parliament.

**A:** I ordered once, the receipt got lost, and now I own two sandwiches and a financial lesson.

**B:** You ordered twice. The system cannot prove the second knock was the first order coming back. One sandwich went missing in parliament and started an argument. Here the sandwich arrived twice and the argument is with your bank. And the boundary matters here. Nobody disagreed about state. This is an operation identity failure, a second operation with no name, not copies arguing over one truth.

**A:** So give every sandwich a name tag before it leaves the kitchen.

**B:** That is uncomfortably close to what an idempotency key actually is. Hold onto that thought, because before the fix, there is a real case, and the real case is stranger than the hypothetical.

**A:** Twilio. July 18, 2013.

**B:** Twilio. Customers with auto recharge turned on were charged repeatedly that day.

**A:** How many customers?

**B:** The company said 1.4 percent of its customers were affected.

**A:** And I want the mechanism stated honestly, because this case gets retold wrong constantly.

**B:** Then let us retell it right. This was not one client retrying one request after one timeout. Anyone who tells it that way is inventing a cleaner story than the postmortem supports.

**A:** What did the postmortem actually say?

**B:** Twilio stored in flight account balances in a Redis cluster. After a partition drove the slaves into full sync overload, engineers restarted the master, and the restart read an incorrect configuration. Redis tried to recover from a non existent AOF file, dropped all the balance data, and booted as a slave of itself, read only, so balances read zero and could not be updated.

**A:** Walk through why zero matters so much.

**B:** Auto recharge watches the balance. When usage creates a billing transaction and the balance looks empty, auto recharge does its job and charges the card to top the account back up.

**A:** Except the top up never registered.

**B:** Right. The charge executed. The balance update that would have recorded the payment and stopped the recharging did not land, because balances could not be written. So the balance still read zero.

**A:** And a balance that still reads zero asks for another recharge.

**B:** And another. The charges kept executing without the record that would have proven the last one already happened. Some accounts were even suspended after repeated billing hit a deactivated card.

**A:** So the shape underneath is the same shape as the hypothetical, with the parts rearranged.

**B:** The shape is an effect without the control record that would have stopped the repetition. The hypothetical loses the record in a response on the wire. Twilio lost the record in the balance itself, the record that would have told auto recharge to stop. In both cases the work ran, the record that would have stopped it running again did not survive, and it ran again.

**A:** When did the refunds land?

**B:** Refunds were completed the next day, July 19. Twilio published its postmortem on July 23.

**A:** Stay with Twilio for one more shift, because the refund is not the end of the bill. The refund is the start of the second shift.

**B:** The second shift. Nobody budgets for the second shift.

**A:** A refund is an operation, with its own queue. Somebody has to find every affected account, decide what each one is owed, run the money back, and confirm it landed. Twilio finished that work the next day, which sounds simple until you price the labour inside the word finished.

**B:** And the customers did part of that work for free, the expensive part. The discovery part.

**A:** Say that plainly.

**B:** The system found out from complaints and reconciliation, not from its own request path. Every customer who spotted a duplicate charge and called in was doing detection labour the system should have done itself. Support time is not a rounding error. It is the invoice for a missing record, paid one phone call at a time.

**A:** Then comes reconciliation, which is a staffed job, not a report you glance at. Three records disagree. The provider record says what was charged. The internal record says what the system believes happened. The customer statement says what the customer can prove. Somebody sits with all three and makes them agree, account by account.

**B:** Three records, three stories, and the tiebreaker is a human being with a spreadsheet and a headache.

**A:** Shrink it to a small shop and the shape does not change. It gets more personal. The reconciliation department is the owner, at midnight, after a full day, comparing a payment dashboard against an order list against an angry email thread.

**B:** No platform team. No on call rotation. Just one tired person asking the monitor question with real names attached to it.

**A:** And underneath the labour sits the cost no refund line item captures. A customer who was charged twice and refunded quickly still learned something about your shop. They learned to check. A customer who checks every charge forever is a cost you pay in trust, slowly, long after the refund cleared.

**B:** You can refund the money in a day. You cannot refund the checking.

**A:** That is why the fast refund is the exception that proves the labour. Next day refunds happen because somebody staffed the second shift. The duplicate charge is one bug. The morning after is a whole department you did not know you had hired. And the lesson Twilio drew was about failing safely. If the balances do not exist or cannot be written, do not charge and do not suspend.

**B:** That is a grown up lesson. When the record keeper is down, the money mover stops too. Most systems learn that coupling only after it has billed somebody repeatedly.

**A:** Now the fix, and the fix has an identity of its own.

**B:** Stripe and its idempotency keys, straight from Stripe documentation. The client generates a key, one unique value that identifies one logical operation. Stripe suggests random values with enough entropy, like version 4 UUIDs, and keys can run up to 255 characters.

**A:** The key is generated once, for the purchase, not once per attempt.

**B:** That distinction is the entire fix, so say it twice in different words. One key per checkout. The same key on the first try and on every retry of that same checkout.

**A:** What does Stripe do with it?

**B:** Stripe saves the result of the first request made under that key. It stores the resulting status code and the body of that first request, whether the request succeeded or failed.

**A:** Even a failure gets saved.

**B:** Even a 500 error. A later request carrying the same key gets that same saved result back. The server returns the original answer instead of doing the work a second time.

**A:** That is the payoff, stated as plainly as possible. A keyed retry returns the original result instead of charging twice.

**B:** And the key comes with rules, because a label is not magic. Reuse the key with different parameters and Stripe compares the new parameters against the original request and returns an error.

**A:** So you cannot recycle a key for a different amount and call it a retry.

**B:** You cannot, and thank God for that, because that accident would be worse than the duplicate. The key names one exact operation. Change the operation and you need a new operation, with its own identity.

**A:** Amazon wrote the same lesson down for its own APIs, in the Amazon Builders Library, in an article by Malcolm Featonby published in January 2021.

**B:** The title tells the whole sermon. Making retries safe with idempotent APIs.

**A:** Amazon calls the identifier a client request identifier, and in the Amazon EC2 API it is the ClientToken.

**B:** Same name tag, bigger kitchen. The AWS tools will even mint one for you if you forget, and reuse it on the retry so the client can pretend the whole scary moment never happened.

**A:** The hard rule in that article is atomicity. Recording the token and doing the mutating work have to land as one atomic operation.

**B:** Because if you record the token and lose the work, or do the work and lose the token, you are right back to an effect without its record. We already met that ghost. It charges people.

**A:** Notice what is actually new here, because it is not the name tag. Stripe already taught the name tag. Amazon's new decision is where the tag gets written: in the same atomic step as the work, or the tag is a rumour.

**B:** So the second vendor earns its place for one reason only. It moves the question from what the key is to when the record of the key becomes true.

**A:** Amazon also asks for a semantically equivalent response on a retry, not a brand new answer that sends the client down a different path.

**B:** And if the same token shows up with different parameters, Amazon says the safest assumption is that the customer meant a different outcome, so it returns a parameter mismatch error.

**A:** How long does the protection last?

**B:** Stripe's window, and its layer is the payment API result itself: keys can be removed from the system after they are at least 24 hours old. Reuse a key after the original has been pruned and Stripe treats it as a new request and generates a fresh result.

**A:** So the safe retry window is generous and finite. Twenty four hours is plenty for a timeout, a crash, and a bad afternoon. It is not a permanent shield you can lean on next quarter.

**B:** One more documented edge, and senior engineers will listen for this one. Stripe only saves a result once execution of the endpoint has begun. If your parameters fail validation before that, nothing is saved. Same story if the request conflicts with another request executing at the same moment. Those requests can be retried.

**A:** The window matters too, and every vendor picks a different one.

**B:** Amazon SQS is the blunt example, and its layer is different. This is enqueue deduplication, not exactly once processing. In its FIFO queues, messages with the same deduplication ID sent within a 5 minute deduplication interval are treated as duplicates, and only one copy is delivered.

**A:** Five minutes. Not a day. Five minutes.

**B:** And if you do not supply an ID, Amazon SQS can generate one by hashing the message body when content based deduplication is enabled. Helpful, right up until two genuinely different messages happen to have the same body.

**A:** Google Cloud documents a different fence, at the API request layer. Take one Google Cloud Deploy create call. Give it a unique request ID, and the server will ignore a retry it has already completed. Google guarantees that for at least 60 minutes after the first request.

**B:** So Stripe gives you a key that can only be removed after at least 24 hours, Amazon SQS gives you 5 minutes in that FIFO queue, and Google Cloud gives you at least 60 minutes for that call. Three clocks, three very different bad afternoons if you guess wrong.

**A:** So a window is not trivia about a vendor. It is the length of time your system promises to remember that an operation already happened.

**B:** Design the retry to outlive the memory and you have built a machine that forgets the first charge right on schedule, then bills like it never met the customer.

**A:** Scope, for completeness. All POST requests in the Stripe API accept idempotency keys. Keys sent with GET and DELETE requests have no effect, because those requests are already idempotent by definition.

**B:** Now let us walk the code shape, because this is simple enough that the code is the explanation.

**A:** Version one, no protection. The client posts a charge. Twenty dollars, in the classic example. Amount, currency, customer, and no key anywhere.

**B:** The post throws a timeout. And here is the line that matters. That silence has three possible worlds inside it.

**A:** Name them.

**B:** The request never arrived. The request arrived, succeeded, and the reply got lost. Or the request is still being processed. From the client chair, all three worlds look identical. That silent counterparty, by the way, has a name in every operations story ever told. The unresponsive little liar. Not because it is lying. Because from your chair, its silence cannot tell you whether it succeeded, failed, or is still running.

**A:** So the client posts again, same amount, same currency, same customer.

**B:** And that second post is a brand new request as far as the server can tell, because nothing in it says otherwise. If world two was the true world, the customer now holds two charges, and both of them look legitimate. Two charges, two receipts, and not one damn clue in either record that they were ever meant to be the same purchase.

**A:** One line summary, the one a senior engineer would put in a review.

**B:** A retry without an identity for the operation is not a retry. It is a second operation wearing a trench coat.

**A:** Version two. Same client, one change before the first attempt.

**B:** Before sending anything, the client generates one key for this logical purchase. One purchase, one key, minted once.

**A:** First post goes out with that key in the header. Timeout again. Same silence, same three worlds.

**B:** The retry goes out with the same key and the same parameters. Nothing else changes. And that sameness is what saves the customer, because now the server can recognize the knock at the door.

**A:** Stripe sees the key, finds the saved result from the first request, and hands that result back. No second charge runs.

**B:** The client cannot tell the difference between a fast success and a rescued retry, and it does not need to. That is the design working. The rescue is invisible, which is exactly what you want from a safety mechanism.

**A:** Production rules, because the documentation implies them and teams break all of them.

**B:** Rule one. Generate the key once per logical operation, once per checkout attempt for one order, never once per HTTP attempt.

**A:** Rule two. Store the key with the order record before you send the request, so if your process crashes and a different process picks up the retry hours later, it reuses the same key instead of minting a new one.

**B:** Rule three. Never mint a fresh key just to get past an error. That is version one with extra steps, and the extra steps fool code reviewers.

**A:** Rule four. After that 24 hour pruning window, stop resending and reconcile. Look up the original charge and read what actually happened, instead of firing the operation into the dark and hoping.

**B:** Do those four things and the scariest retry in payments becomes boring. Boring is the highest compliment this field has.

**A:** One more pattern belongs in the decision table before we move on, because the four rules so far all assume a provider who offers you a key. The pattern has a plain shape. Before the external effect happens, the service writes down its intent to act, in the same local transaction as its own state change. The intent and the state land together, or neither lands.

**B:** An outbox. You write the letter and put it in the outbox as part of the same decision, instead of promising yourself you will remember to send it later.

**A:** Then a separate step performs the external effect from that record. It reads the outbox, does the work, and marks the record done. The Debezium project documents one version of this, where event entries are added to an outbox table inside the same transaction as the business state, and a connector then publishes those events onward. Exactly. Crash before the transaction commits, and there is no intent and no state change. Crash after it commits and before the effect runs, and the intent is sitting there, durable, waiting to be performed. Crash after the effect and before the mark, and the record tells the next worker what may already have happened, so the retry starts from evidence.

**B:** It does not make the effect itself atomic. Say that part out loud before somebody oversells it.

**A:** It does not. The external system can still receive the effect twice if the worker dies at the worst seam, which is why the receiving side still needs its own identity check where one exists. What the outbox buys is narrower and still enormous. It buys a local record that cannot drift away from the decision it describes.

**B:** Now the table, because now there are three shapes on it. One, trust the provider memory, a stored result returned for a key you supplied. Two, trust your own record, an intent written atomically with your state. Three, trust the shape of the operation itself, where doing it twice lands in the same place as doing it once. Pick the memory you can actually audit. That is the senior version of the rule, and it is boring enough to be true.

**A:** Are we done? Make retries safe and the story ends?

**B:** We are not done, because safe retries can still arrive like a damn herd.

**A:** The timing problem.

**B:** The timing problem. Picture a service stumbling. Hundreds of clients fail at the same moment, and every one of them runs the same polite retry logic.

**A:** Exponential backoff. Wait a little, then wait longer, multiplying the wait by a constant each time, up to a maximum.

**B:** Backoff helps, and the AWS Architecture Blog post by Marc Brooker is the source worth naming here, because he measured the failure of backoff alone instead of just asserting it.

**A:** What did he find?

**B:** Clients that failed together still retry together. Backoff spreads the rounds out, sure. But inside each round they still arrive in a cluster, all competing at the same instant. Then a gap, where nobody competes at all. Contention barely drops.

**A:** So the recovering service gets hit by a synchronized crowd, recovers a little, and gets hit again.

**B:** In waves, yes. The retries that were supposed to relieve the pressure keep recreating it on a schedule. Deterministic kindness, delivered simultaneously, is a load pattern.

**A:** And the fix is randomness. Jitter.

**B:** Add randomness to the sleep so each client picks its own moment. Brooker describes the time series smoothing out into an approximately constant rate of calls, with the gaps gone.

**A:** Give me the number, with its fence around it.

**B:** In his simulation, with 100 contending clients, adding jitter cut the call count by more than half compared with backoff without jitter, and it significantly improved time to completion too.

**A:** A simulation number, from his simulator, stated as his result. Not a promise about my production traffic.

**B:** Correct, and still a hell of a result for adding one random number to a sleep. He compares variants, full jitter, equal jitter, decorrelated jitter, and the unjittered backoff approach loses clearly on both work and time.

**A:** His bottom line was that jittered backoff should be standard practice for remote clients.

**B:** And it largely became practice. Which means when your retries all fire together today, you are not missing an exotic technique. You are missing a standard one.

**A:** Put the two halves together, because shops usually learn only one.

**B:** Idempotency makes a retry harmless to correctness. Jitter makes retries harmless to the system under load. One protects the customer balance. The other protects the recovering service.

**A:** A retry storm is just the herd arriving at the worst moment, all of them individually reasonable.

**B:** Every client waited a polite interval. Every client did the documented thing, minus the randomness. Politeness at scale is synchronization, and synchronization is a weapon.

**A:** I want one small familiar case before we land this, because not every duplicate wears a payment costume.

**B:** The vanishing post. Everyone listening has done this one with their own hands.

**A:** I posted it, I saw it, I refreshed, and the internet took it back.

**B:** One copy knew. The copy you asked next did not know yet. Your write landed on one replica, your refresh read from another replica that had not received it, and for a moment two honest copies disagreed about whether your post existed.

**A:** Truth travels. It just travels slower than my panic.

**B:** Nothing was deleted. Nothing lied. Replication lag is copies disagreeing briefly because updates take time to travel. And if you want the read to see your own write, you read from the copy that took the write, and you pay for that trip.

**A:** Same family as everything today. Two places, one truth, and a gap between them where the confusion lives.

**B:** Same family, smaller stakes. A vanished post costs you a heartbeat. A vanished balance record costs a customer real money, repeatedly, until somebody takes the system offline.

**A:** Now take that same money shape and put it at peak commerce scale, because volume changes what a retry means.

**B:** Shopify publishes its own preparation notes, and the years tell the story.

**A:** Start in 2018.

**B:** For Black Friday and Cyber Monday 2018, Shopify said it saw nearly 11,000 orders created per minute and around 100,000 requests per second for extended periods.

**A:** By its 2025 readiness writeup, Shopify was reporting 2024 peaks of 284 million requests per minute at the edge and 80 million requests per minute on app servers.

**B:** Eighty million a minute on the servers doing the work is a different country.

**A:** Their 2025 scale tests reached more than 80,000 checkouts per minute, and they inject flash sale bursts on top of baseline load on purpose.

**B:** Flash sale is a polite phrase for everyone arriving at once because the deal will not wait.

**A:** A limited drop and a countdown, and everyone hits the same door in the same minute. That is a stampede with a marketing plan.

**B:** Now run the retry arithmetic at that volume, as arithmetic, not as a story about Shopify.

**A:** If a bad shape happens once in a million operations, a small system may meet it rarely. At tens of millions a minute, the clock meets it again and again in one peak.

**B:** So a one in a million duplicate stops sounding like lightning.

**A:** It becomes a schedule. Volume turns a rare shape into a routine arrival, whether anyone designed it or not.

**B:** And every arrival can bring a retry right behind it.

**A:** That is the part a merchant feels. The retry is not an abstract second request. At checkout it can mean another payment attempt or another order creation, right when everything else is also peaking.

**B:** Which is why idempotency stops being hygiene at that scale.

**A:** Hygiene keeps code clean. This is business. One identity per operation keeps the biggest sales weekend from turning success into refunds, reconciliation work, and angry customers.

**B:** Shopify said its 2025 preparation took thousands of engineers, nine months, and five scale tests for those four days.

**A:** Four days a merchant may have planned around for months, with no quiet redo behind them if the retry goes wrong.

**B:** Scale converts rare failure shapes into daily operations. At low volume you can treat an unknown outcome as an exception. At peak commerce volume, the exception is part of the workload, and the business has to be built for it.

**A:** So land it on the businesses that think none of this is their subject.

**B:** Gladly. You do not need a global database or a fleet of servers to have this bug. You need one payment form, one booking calendar, or one order button whose retry has no identity. That is it. That is the whole ingredient list.

**A:** A small shop retries a charge after a timeout because the owner is trying to serve a customer standing right there.

**B:** A booking system retries after a slow response because the schedule matters and the front desk is busy. An ordering integration retries overnight because a job failed and nobody wants to lose the orders.

**A:** And if nothing ties that retry to the first attempt, the second attempt is a second charge, a second booking, a second order. The system is not malfunctioning. It is doing exactly what it was asked, twice, because nobody gave the request a name.

**B:** The fix is not a platform migration. It is a name tag. One identity per operation, generated once, stored with the order, carried on every retry, with the original result returned when the same identity knocks again.

**A:** Plus retries that wait, and wait randomly, so a bad minute does not turn into a stampede.

**B:** Plus one honest question taped to the monitor. When this request times out, and it will, can we prove what happened before we send it again?

**A:** Notice the word in that question. Prove. Not hope, not document, not intend. Prove, before the timeout happens to a real customer.

**B:** Which is a rude thing to ask a design doc. So next we meet the people who built a machine whose whole job is making systems prove it, on demand, before lunch.

## SEC-06: Proving it before production: simulation as a religion

**A:** Nineteen eighty eight is not nostalgia. It is the year the argument we have been pricing all day got its first working design.

**B:** A design old enough to have grandchildren, still on duty in a financial database. Fine. That date can stay.

**A:** Brian Oki and Barbara Liskov published Viewstamped Replication in nineteen eighty eight. One credential belongs next to that 1988 paper, and it comes from the ACM itself.

**B:** Credential away, professor.

**A:** Barbara Liskov received the ACM A. M. Turing Award for 2008.

**B:** For the replication paper?

**A:** Not for one paper alone. The ACM citation says: "For contributions to practical and theoretical foundations of programming language and system design, especially related to data abstraction, fault tolerance, and distributed computing."

**B:** So Viewstamped Replication sits inside the fault tolerance and distributed computing part of a much bigger body of work.

**A:** The ACM essay also names replicated storage among her advances, alongside data abstraction, modularity, fault tolerance, and persistence.

**B:** That explains why a 1988 replication method still shows up inside a financial ledger now. It was not a clever trick from one paper. It was one piece of a career spent making systems keep working when pieces fail.

**A:** And it gives the raccoon parliament a very distinguished founder.

**B:** Three divorced raccoons, one stolen sandwich, and a Turing Award watching over the whole argument. No pressure, little guys. Viewstamped Replication: A New Primary Copy Method to Support Highly-Available Distributed Systems, if we are doing the full title like nerds.

**A:** We are doing the full title like nerds.

**B:** Fine. What did it actually say, in human?

**A:** Keep more than one copy of the information, and keep the service usable when some copies are inaccessible, for example after a crash.

**B:** Revolutionary. Copies that survive a crash.

**A:** Computations run at a primary, and the primary notifies its backups of what it has done. If the primary crashes, the backups reorganize, and one backup becomes the new primary.

**B:** That reorganization has a name in the paper.

**A:** A view change. And the viewstamp is a special kind of timestamp the method uses to detect lost information during the handover.

**B:** Careful, I will grant. Now the price. The guarantee underneath has a name: one copy serializability. The copies have to behave as if there was only ever one copy, even when there are several. So who pays when a view change guesses wrong? And that price, to be clear, is our gloss on the trade, not a claim the paper itself makes.

**A:** The client pays in the pause while the backups reorganize, and every write pays coordination to keep the copies honest. The paper never claimed the promise was free. It claimed it could be kept.

**B:** Thirty plus years later, people are still building on that exact promise.

**A:** One of them is the reason we are here.

**B:** TigerBeetle.

**A:** TigerBeetle.

**B:** Say what it is plainly, because the name tells you nothing.

**A:** It is a database for financial accounting. Before the religion, the company, because TigerBeetle did not fall out of a research lab.

**B:** Founding story. Keep it dated.

**A:** Joran Dirk Greef started the TigerBeetle project in July 2020, while working on the Mojaloop open source payment switch at Coil, where a traditional database was the bottleneck he kept hitting.

**B:** The Interledger Foundation records the next step plainly. TigerBeetle, Inc. was spun out of Coil as a startup in August 2022, with Greef as its founder and chief executive.

**A:** So the founding bet, stated coldly, is this. A company spun out in 2022 chose a consensus protocol published in 1988, Viewstamped Replication, as the foundation for a new financial database company.

**B:** Most startups pitch the future by pretending the past is embarrassing. TigerBeetle pitched the future by hiring 1988 and giving it equity.

**A:** And the business logic matches the technical logic we are about to walk through. If agreement about money is the expensive part, build the company that sells agreement about money, with the accounting built into the database instead of bolted on by every customer afterward.

**B:** Somebody chose to pay a price first written down in 1988, on purpose, in 2022, and then charge the payments world for the receipt. That is not nostalgia. That is pricing an old argument correctly. A double-entry accounting API, built on accounts and transfers.

**A:** Accounts hold credits and debits, and each transfer moves value between two accounts.

**B:** Debits on one side, credits on the other, and the sum stays equal no matter what.

**A:** Money cannot be created or destroyed in that design, only transferred.

**B:** And the transfer history is immutable, per their own docs.

**A:** It implements Viewstamped Replication as its consensus and replication protocol.

**B:** The nineteen eighty eight idea, running a financial ledger in production.

**A:** With deterministic view changes and automated failover, per the project site.

**B:** Now tell them the part that makes every performance engineer twitch.

**A:** It uses a single leader node to process events.

**B:** One leader.

**A:** On a single core, by design.

**B:** One core. In twenty twenty six. On purpose.

**A:** Their performance page has a heading for it. Single Threaded By Design.

**B:** That sounds like an apology and it is actually a threat.

**A:** Adding more nodes increases reliability, but not throughput, because the leader is the one core.

**B:** So they gave up the obvious scaling knob on day one.

**A:** They gave it up to buy simplicity.

**B:** Explain that trade like you mean it.

**A:** The state machine applies transfers deterministically in sequence on one core.

**B:** No parallel chaos inside the state machine.

**A:** The surface area is intentionally minimized, with little configurability.

**B:** And only one isolation level.

**A:** Strict serializability, the strictest possible level, and nothing weaker on the menu.

**B:** Most databases give you a ladder of weaker guarantees and let you fall down it.

**A:** TigerBeetle removed the ladder.

**B:** That is not a limitation they failed to fix. That is a weapon they chose.

**A:** Simplicity as a design weapon is exactly the right phrase.

**B:** If your code has fewer ways to disagree with itself, you have fewer ways to lose money.

**A:** And stale reads are not possible at cluster level, per their docs, because reads go through consensus too.

**B:** Reads and writes both pay the agreement cost. No cheap sneaky reads on the side.

**A:** Hold on, because that is the invoice hiding inside the religion. Every read pays the vote. Not just the writes that move money. The lookups, the balance checks, the cheap little questions. All of them queue up to ask permission.

**B:** That is the honest version of the design. The guarantee is cluster wide precisely because nothing is allowed to sneak around it, and the cost is cluster wide for the same reason.

**A:** Which brings us to how they test it.

**B:** Here it comes. The religion part.

**A:** They test the production code inside a simulator.

**B:** Not a toy model of the code. The real code.

**A:** Simulation testing enables them to run the production TigerBeetle code under a wide variety of conditions.

**B:** To ensure the cluster behaves properly when the world goes sideways.

**A:** The simulator has a name.

**B:** The best name in databases, and I will fight anyone on this.

**A:** The VOPR.

**B:** Say the expansion, because people always ask.

**A:** The Viewstamped Operation Replicator.

**B:** Confirmed in their own internals documentation, before anyone accuses us of inventing it.

**A:** That is their name for their deterministic simulator. Before the doctrine hardens, one inventory belongs on the record early, compressed. A simulator searches the faults it can model. It does not search wrong specifications, wrong invariants, hardware errata, or correlated power, network, and datacenter events.

**B:** It does not search real kernel, network card, or dependency behaviour it never reproduced. It does not search production data skew or a workload shape it was never fed. And it does not search faults in the simulator itself.

**A:** Hold that shelf in mind. We will come back to it in full before we are done here, and the return is deliberate.

**B:** And the naming story is the part I would tattoo on a lab wall.

**A:** Their docs tell it themselves.

**B:** The name was inspired by the AI supercomputer in the nineteen eighty three movie WarGames.

**A:** Which was called the War Operation Plan Response, or WOPR.

**B:** A machine that constantly simulated scenarios in order to learn.

**A:** TigerBeetle kept the joke and made it a job description.

**B:** In the movie, the machine plays war games against itself until it learns the only winning move.

**A:** Here, the machine plays failure games against the database until the database learns to survive them.

**B:** That is funny until you realize it is also literally the testing strategy.

**A:** The key purpose of the VOPR is to test TigerBeetle safety and liveness.

**B:** Safety meaning nothing bad happens to the money.

**A:** Liveness meaning the system still makes progress.

**B:** And it focuses on consensus and the cluster recovery mechanisms, per the docs.

**A:** Now the doctrine part, because this is where it stops being a tool and becomes a belief system.

**B:** Deterministic.

**A:** The simulator is deterministic based on a seed number and the Git commit.

**B:** Same seed, same commit, same failure, every single time.

**A:** Any bug can be perfectly reproduced for local debugging.

**B:** Read that again slowly, because production engineers just felt something.

**A:** A bug you can summon on demand is a bug you can kill.

**B:** In normal production, a bug is a ghost. It happened at the worst possible hour, under load, with one weird packet, and it will never happen again while you are watching.

**A:** In the simulator, the ghost has an address.

**B:** You write down the seed, you check out the commit, and the ghost shows up on schedule and sits in the chair.

**A:** That changes the emotional life of debugging completely.

**B:** It changes it from archaeology to execution. You are not guessing what happened. You are rerunning what happened.

**A:** How does it create those failures?

**B:** By taking away every source of randomness the real world hides in.

**A:** All non deterministic parts of the system are stubbed out.

**B:** Clock, network, and disk operations, all controlled by the simulator.

**A:** The random seed tunes the parameters for injecting different types of faults.

**B:** Dropping packets. Reordering packets. Partitioning the network. Corrupting reads and writes to the disk.

**A:** Read that menu the right way. It is not a list of everything that can go wrong. It is a list of everything somebody on that team thought to write down as a way things go wrong.

**B:** Every item on it was imagined first and injected second. The simulator's whole world is the inside of that list. What lives outside it, we will get to before this section lets either of us leave.

**A:** The exact list from their docs.

**B:** It is a menu of cruelty, and the damn simulator orders everything on it.

**A:** The whole cluster runs in a single process on a developer machine, per their blog.

**B:** Replicas and clients interacting through Viewstamped Replication, with all input and output mocked out.

**A:** A network simulator handles network faults and latencies.

**B:** An in memory storage simulator handles storage faults and latencies.

**A:** And time itself is simulated.

**B:** The VOPR can speed up time arbitrarily, per the docs.

**A:** So a failure that needs a clock to drift and a disk to sulk and a network to split can be scheduled like an appointment.

**B:** You do not wait for the universe to hurt you in the right order. You hurt yourself in that order, on purpose, before lunch, and you write the whole damn thing down.

**A:** They also keep thousands of assertions in the codebase, checking invariants.

**B:** And here is the detail that separates the serious version from the demo.

**A:** TigerBeetle keeps those assertions on, even in production.

**B:** Most teams turn the seatbelts off for speed and then act surprised by the crash photos.

**A:** Their stated approach is that it is better to stop than to keep operating in an incorrect state.

**B:** For a ledger, damn right it is. A stopped ledger is an incident. A wrong ledger is a crime scene.

**A:** Their simulation approach was heavily inspired by FoundationDB and Antithesis, per their docs.

**B:** Hold on. We just name dropped Antithesis like everybody knows the family business. Who are these people?

**A:** Ask it as a decision, then, not a family tree. FoundationDB built this discipline for one system. Antithesis is the bet that the discipline itself is the product, that other teams will pay to rent the cruelty instead of building it.

**B:** Build the machine that breaks your own database, or rent one from the people who broke theirs professionally. That is a real choice, and it is the only reason their biography gets airtime here.

**A:** They are FoundationDB people, selling that testing discipline as a product. Antithesis says on its own backstory page that its founders are Will Wilson and Dave Scherer.

**B:** And reporting on its launch out of stealth puts the founding in 2018. SiliconANGLE reported that in February 2024, when the company announced 47 million dollars in funding.

**A:** What Antithesis sells, on its own home page, is a deterministic simulation platform that runs your complete system, stresses it with faults and toxic inputs, and can perfectly reproduce every bug it finds.

**B:** So FoundationDB built a cruelty machine for one database, and Antithesis said, nice machine, we will rent it to everybody whose software can embarrass them in public.

**A:** The middle of that story is Apple. TechCrunch reported on March 24, 2015 that Apple had acquired FoundationDB, and Antithesis tells the same 2015 story on its backstory page, saying Apple began using FoundationDB as the underpinning of its cloud infrastructure.

**B:** And the claim that makes engineers either jealous or suspicious is on that same backstory page. Antithesis says this. Its platform is built to shorten the time from bug introduction to bug discovery. Back at FoundationDB, they say, once they had confidence that any new bugs would be found immediately, programming itself felt different.

**A:** No trophy count attached to that, and we should not invent one. The documented point is speed of detection, not a number of bugs.

**B:** Immediately is a hell of a flex. Most shops find their bug when a customer finds it first and carries it to the desk like a dead bird.

**A:** Caught by your own team, right away, instead of delivered by a customer. That is the pitch, and it is a good one.

**B:** Which is the second system built on the same discipline.

**A:** FoundationDB.

**B:** The open source, distributed, transactional key value store, in its repository description.

**A:** Organized as an ordered key value store, with ACID transactions for all operations.

**B:** And its testing technology is called, with great imagination, Simulation.

**A:** Simulation can conduct a deterministic simulation of an entire FoundationDB cluster within a single threaded process.

**B:** One thread. Whole cluster. Same trick, second system.

**A:** Determinism allows perfect repeatability of a simulated run.

**B:** Their asynchronous runtime supports both production execution and deterministic simulated execution.

**A:** So the same code paths run in both worlds.

**B:** That is the part people miss. If your test code is different from your production code, you tested a story about your system.

**A:** What does their simulation model?

**B:** All physical components of the system, per the docs.

**A:** Drive performance and drive space, including a drive filling up.

**B:** The network. Machine performance degradation. Shutdowns and reboots.

**A:** Machines coming back from the dead.

**B:** Failure modes at network, machine, and datacenter levels.

**A:** Their named hardest fault pattern is worth saying out loud.

**B:** Swizzle clogging.

**A:** Clogging the network connections of a random subset of nodes, one by one.

**B:** Then unclogging them in random order, because of course you unclog them in the worst order too.

**A:** Now the scale, stated exactly the way their docs state it.

**B:** Carefully. Word for word carefully.

**A:** Simulation runs tens of thousands of simulations every night.

**B:** Each one simulating large numbers of component failures.

**A:** And they put a number on it, in their own docs. Based on the volume of tests, and how intense the failures are in their scenarios, they estimate they have run the equivalent of roughly one trillion CPU hours of simulation.

**B:** An estimate, in their own documentation, in those words. That number is so large it stops meaning time and starts meaning attitude.

**A:** The attitude is that production should never be the first place a failure mode is discovered.

**B:** If a failure can be imagined by the simulator, it should die in the simulator first.

**A:** First place it is discovered, with one word doing heavy work in that sentence. Imagined. Hold onto it, because the argument waiting at the end is about exactly that word. Two different projects, one financial ledger and one key value store, arriving at the same conclusion.

**B:** Write the system so a simulator can own time, the network, and the disk, and then let the simulator be cruel for a living.

**A:** I want to pause on why determinism is the whole game and not a nice extra.

**B:** Please do, because this is where teams usually cheap out.

**A:** A nondeterministic test that fails once in a thousand runs teaches you almost nothing.

**B:** It teaches you fear. It does not teach you the bug.

**A:** You rerun it and it passes, and now you have an argument instead of a diagnosis.

**B:** Flaky tests are just production incidents with better lighting, and everybody in the room knows that shit and ships it anyway.

**A:** Determinism ends the argument. The seed is the witness.

**B:** You hand another engineer the seed and the commit and they watch the same failure in the same order.

**A:** No screenshots of a log that rotated away. No prayer that it happens again on a Tuesday.

**B:** It happens again because you told it to happen again.

**A:** That is why I keep calling it a religion and not a technique.

**B:** A technique is something you do when it is convenient. A religion is something that shapes what you are allowed to build.

**A:** If a component cannot run inside the simulator, the design itself is suspect in this worldview.

**B:** Randomness has to be injected, never smuggled. Time has to be a parameter, never a surprise.

**A:** That discipline reaches backward into the architecture.

**B:** Single core leader. Bounded memory. Minimal configuration. Those are not separate quirks.

**A:** They are what a system looks like when it is built to be simulated.

**B:** Run the raccoons in here and you do not replay the sandwich theft. You replay the night the leader went quiet at 2:47, the same silence, the same seed, a thousand times, until somebody learns what the other two should have done while they could not tell dead from slow.

**A:** Before the harvest, one more consequence of the doctrine deserves plain words.

**B:** Consequence away.

**A:** A deterministic simulator changes what counts as an excuse.

**B:** Because we saw it once in testing stops being a defense when the seed was sitting right there.

**A:** If a failure is replayable, leaving it unfixed is a choice, not bad luck.

**B:** That is the uncomfortable moral part of this whole doctrine. It removes the alibi.

**A:** Teams without replay get to say the failure was strange and rare and hard to catch.

**B:** Teams with replay have to say we caught it, we filed it, and we shipped anyway, which is a shit sentence to say out loud in a postmortem.

**A:** It also changes hiring and design reviews in a healthy way.

**B:** How so?

**A:** You start asking how a new feature will behave inside the simulator before anyone asks how fast it is.

**B:** Speed second, survivability first. For a ledger, that ordering is not caution. That is the damn job.

**A:** And you start treating any new source of nondeterminism as a design defect, not a detail.

**B:** A hidden clock read. A random map iteration. A network call nobody stubbed. Each one is a little hole where a bug can hide from the seed.

**A:** Close the holes and the simulator sees more of the system.

**B:** Leave them open and you have built a beautiful testing machine. Blind in exactly the places production will hit first. Because production always finds the blind spot. It moves in. It pays rent. It is not leaving.

**A:** Which is why the discipline is expensive up front and cheap every day after.

**B:** Expensive like concrete is expensive. Cheap like not rebuilding the bridge is cheap.

**A:** Now the practical harvest, because most listeners do not run a database company.

**B:** Good, because I was about to ask what a normal team steals from this on Monday.

**A:** Five tools, briefly, each for what it actually does.

**B:** Rapid fire. I will keep you honest.

**A:** Jepsen first.

**B:** Jepsen is independent analysis that subjects distributed systems to faults and checks whether the systems live up to their claims.

**A:** It maintains an open source library for safety testing and publishes free, in depth analyses of specific systems.

**B:** Translation for working engineers. Someone unaffiliated tries to break the database claim before your customers do, and publishes the whole ugly attempt.

**A:** TigerBeetle second, already covered, but as a tool choice.

**B:** A financial transactions database with Viewstamped Replication and strict serializability, if your problem is a ledger and you want the religion preinstalled.

**A:** FoundationDB third.

**B:** A transactional key value store with deterministic whole cluster simulation behind it, if you want a foundation other systems can layer on.

**A:** Chaos Mesh fourth.

**B:** An open source cloud native chaos engineering platform that injects faults into pods, network, file system, and even the kernel on Kubernetes.

**A:** Toxiproxy fifth.

**B:** A framework for simulating network conditions, built for testing, continuous integration, and development environments, with deterministic tampering with connections.

**A:** That last one is the Monday morning move for a small team.

**B:** Say why, because it is the cheapest item on the list and the easiest to skip.

**A:** You put a proxy between your service and its dependency, and you make the network behave badly on purpose.

**B:** Latency. Dropped connections. A dependency that answers slowly and then not at all.

**A:** A proxy that drops packets beats a hope that packets arrive.

**B:** Write that on the wall of every shop that has ever said the network is reliable in a design doc and then acted surprised when the network lied like hell.

**A:** The workflow payload is not buy a simulator company.

**B:** The payload is shrink the idea until it fits your team.

**A:** Pick one critical path. Put one fault in front of it. Run it in your test pipeline.

**B:** One dropped connection during one checkout test will teach you more than a hundred happy path greens.

**A:** Then write down what your system did, in plain language, before you fix anything.

**B:** Did it retry safely? Did it charge once? Did it tell the user the truth or a cheerful lie?

**A:** Those three questions are the whole harvest for most businesses.

**B:** And if the answer is we do not know, that is the finding. Not knowing is the bug before the bug.

**A:** Deterministic simulation at TigerBeetle scale is the full scale version.

**B:** Toxiproxy in your test suite is the home version, and the home version still counts.

**A:** And home version is not a compliment or an insult. It is a scope statement. The home version tests the paths you pointed it at. It says nothing, yet, about the paths nobody pointed at.

**B:** Keep that sentence in your pocket. You are about to need it.

**A:** Now I will say the strong version of my position, and you can try to kill it.

**B:** Finally, violence.

**A:** Deterministic simulation is the only grown up way to build these systems.

**B:** Only?

**A:** If your system keeps copies of the truth and claims they agree under failure, you owe a replayable proof.

**B:** I owe a proof, sure. Do I owe your proof?

**A:** A test you cannot replay is a rumor.

**B:** Strong line. Shame about the blind spot the size of a data center.

**A:** Name the blind spot precisely.

**B:** The simulator can only inject faults somebody imagined.

**A:** It injects partitions, corruption, crashes, reordering, delay.

**B:** All imagined in advance, all parameterized in advance, all belonging to the world the designers already feared.

**A:** That still covers the protocol failure space better than any production surprise tour.

**B:** For the protocol, yes. Now tell me what layer the famous recent failures actually lived in.

**A:** Go on.

**B:** Configuration and operations.

**A:** Be specific without inventing.

**B:** The counterargument research names Meta in twenty twenty one and Cloudflare in twenty twenty five as officially postmortemed configuration and operations failures, not consensus protocol failures.

**A:** I accept that framing from the research file.

**B:** A command issued during maintenance. A guardrail with a bug in it. A permissions change that altered what a query returned.

**A:** None of those are quorum failures.

**B:** Bring back the trial for one question, because the courtroom finally earns its rent here. In the trial of the missing server, the fight was over what the silence meant. In the simulator, the fight is over what evidence the court was even capable of hearing.

**A:** A witness the simulator never built cannot testify. A fault it cannot represent cannot take the stand, no matter how guilty it looks in production.

**B:** None of those live inside your simulator either. Unless you simulated your own operators. Your own deploy pipeline. And your own audit tool, failing to audit.

**A:** You are arguing that simulation proves the wrong layer.

**B:** I am arguing it proves a real layer completely and a larger layer not at all, and the danger is mistaking the first for the whole.

**A:** Give me the failure the simulator cannot imagine, in one clean example.

**B:** A correct protocol, correctly implemented, deployed with a configuration that tells it to do the wrong thing faithfully.

**A:** The system does exactly what it was told, and what it was told is wrong.

**B:** Every replica agrees. Every assertion passes. The truth is consistently, durably, replicably wrong.

**A:** Consensus on a bad instruction is still consensus.

**B:** And your seed replays it perfectly, forever, which is a hell of a way to be confident about the wrong thing. Before you narrow anything, let me put the full shelf on the table, because earlier we only named it in shorthand. The unmodelled shelf has more than one compartment.

**A:** Stock the shelf, then.

**B:** First compartment. A workload shape the simulator was never fed, so its timing and contention were never real. The protocol can behave beautifully under every load you imagined and still meet a queue shape in production that nobody wrote down.

**A:** Representing that one costs real production data, honestly sampled, and the humility to feed the simulator loads that make your design look bad.

**B:** Second compartment. An invariant that is wrong in the same way in the code and in the assertions, so the seatbelts agree with the crash. Every check passes because the check shares the mistake.

**A:** Representing that one costs an independent statement of what must never happen, written by somebody who did not write the code, and that independence is organisational, not technical.

**B:** Third compartment. The human layer around the system. Deploy, rollback, and on call judgement. The simulator owns the machines. It does not own the tired person deciding at the worst hour whether the dashboard is lying.

**A:** Representing that one is not a simulator feature at all. That is rehearsal, which is where this fight was always going to end up.

**B:** And notice what they share. Each one is a place where the system and its picture of itself can be wrong together, quietly, while every replay stays perfectly consistent. So the shelf, stocked. Wrong workloads, shared mistakes, and the humans. None of them exotic. All of them patient.

**A:** That is a fair hit, but it does not demote simulation. It bounds it.

**B:** Bounds are all I ever wanted from you. Your first claim was only grown up way, full stop.

**A:** Let me narrow under fire, then.

**B:** Narrowing accepted in advance. Proceed.

**A:** Deterministic simulation is the only grown up way to systematically search for counterexamples under modeled faults, for the faults the protocol claims to survive.

**B:** Better. Keep narrowing.

**A:** It proves nothing about whether operations will hand that protocol a sane world to survive in.

**B:** There it is.

**A:** So the operations layer needs its own rehearsal.

**B:** Game days. Restore drills. Config changes treated like code, reviewed and tested and rolled back on purpose before they roll you back in production.

**A:** Rehearse the human system with the same cruelty the simulator applies to the machine system.

**B:** I will cosign that, and I cosign almost nothing before coffee, so frame the shit out of it before I reconsider.

**A:** Then our fight ends in an alliance, which will disappoint the listeners.

**B:** Not an alliance. A border. Your simulator guards one side of it and my rehearsals guard the other, and the failures live on both sides.

**A:** Simulate the protocol.

**B:** Rehearse the operations.

**A:** And never let a green simulation talk you out of drilling the restore.

**B:** And never let a smooth drill talk you out of asking what the simulator cannot imagine.

**A:** The question to leave on the table is not whether your system passed its tests.

**B:** The question is which failures your tests were capable of imagining, and which ones are still waiting outside that imagination, patient as hell.

**A:** The imagined ones, at least, can be made to show up on schedule and die in the lab.

**B:** A failure you cannot imagine does not care how deterministic you are. It will introduce itself in production, by name, at the worst hour, and it will not bring a seed.

## SEC-07: The mix layer: this month, at production scale

**A:** Let us leave the whiteboard and check the calendar, because everything we argued about happened in public this month.

**B:** That is the part I trust. Papers tell you what should happen. Incident pages tell you what actually happened when the pager went off.

**A:** Then start with the exhibit I cannot stop thinking about. Google Cloud Storage in us-central1, across October 8 and October 9.

**B:** Object storage. The layer everyone treats like furniture. Boring, reliable, and absolutely not supposed to be the story.

**A:** By Google's own accounting, on October 8 it was the story for 12 hours and 30 minutes, with elevated latency and errors on uploads and writes.

**B:** And Google's updates describe customers mainly seeing HTTP 503 errors on write operations, plus client side timeouts, while successful writes ran significantly slower.

**A:** The recurrence on October 9 ran 5 hours and 41 minutes, and Google put the total across both days at 18 hours and 11 minutes.

**B:** Do the vendor arithmetic out loud, because vendors love quoting you the first window and hoping you never add the second one.

**A:** Eighteen hours and eleven minutes in total, by Google's own accounting, for a storage service in one major region.

**B:** And the cause was not some mysterious act of God. Google's own incident page names it plainly, in its own words.

**A:** Google rolled out a traffic sorting optimization in the load balancing layer, because one area was short on capacity. And that optimization bypassed the standard routing logic, the part that checks capacity first.

**B:** Translate that for a working engineer. The smart routing got clever, and the cleverness routed around the very check that knew which nodes had room.

**A:** A small fraction of backend storage nodes with low available capacity received an overwhelming share of write traffic and hit resource exhaustion.

**B:** So the nodes with the least room got the most work. That is not bad luck. That is a sorting decision doing exactly the wrong job confidently.

**A:** The mitigation story is just as revealing. Google tried emergency capacity and was blocked by systemic regional capacity limits.

**B:** Read that sentence twice. During the incident, the fix of simply adding room ran into the fact that the region was out of easy room.

**A:** They drained overloaded nodes, disabled the optimization, and rolled back the metadata database update while the incident was still running.

**B:** And permanent resolution only came from fully reverting the load balancing configuration change. The new thing left. The old behavior came back.

**A:** Now the recurrence, because that is the part most incident reports would soften into a footnote. Google did not soften it.

**B:** Google said the October 9 recurrence was caused by an incomplete rollback of an upload planner feature, which broke the load balancing mechanism again.

**A:** The rollback itself was incomplete, a second set of backend nodes got overloaded, and the same class of failure returned the next day.

**B:** That is the damn sentence I would frame. Not because it embarrasses anyone. Because almost every team listening has shipped an incomplete rollback and gotten lucky.

**A:** Google published its full incident report on its status page on October 14, with root cause, a remediation timeline, and named preventative actions.

**B:** And the preventative actions are concrete, not corporate fog. Validate load balancing changes in smaller regions before large ones. Make it structurally impossible for traffic logic to bypass capacity safeguards.

**A:** So here is my claim. The report itself is a product feature, and customers should price it when they choose a platform.

**B:** Hard pushback on that. A great report about a broken day does not unbreak the day, and my uploads still failed for hours.

**A:** This one names its own optimization as the trigger, names the failed capacity attempt, and names the incomplete rollback as the recurrence cause.

**B:** It also gives the next team a testable promise. If the safeguard can still be bypassed, the promise failed and everyone can check.

**A:** That is the standard I want held up. Not perfection. A public record detailed enough that a stranger can audit the learning. Google has actually written down why it works this way, in its own SRE book. Google says writing a postmortem is not punishment. It is a learning opportunity for the entire company.

**B:** Not punishment is doing real work in that sentence. The moment a report can get someone in trouble, the next report gets shorter, vaguer, and weirdly allergic to timestamps.

**A:** The same book states the sharing rule in plain terms. Google's goal is to share postmortems to the widest possible audience that would benefit from the knowledge or lessons imparted.

**B:** Widest possible audience. Most companies treat an incident report like a diary with a legal department. Google treats it like a textbook somebody else is allowed to pass.

**A:** And Google closes the argument with an outcome claim, stated as its own experience. It says that thanks to its continuous investment in cultivating a postmortem culture, Google weathers fewer outages and fosters a better user experience.

**B:** Fewer outages as the return on honesty. That is the whole pitch, and it comes from the people who run the pager, not from a branding workshop. Fine, I will grant the honesty exhibit, with one condition. Honesty after the fact never substitutes for capacity headroom before the fact.

**A:** Agreed, and Google's own timeline makes your point for you, since the emergency capacity attempt hit regional limits during the incident.

**B:** Good. Now take the same company, a different region, and a much murkier story, because October was not finished with Google Cloud.

**A:** London, the europe-west2 region, early on Tuesday morning, October 20, London time. Google's incident record lists unavailability in the europe-west2-b zone, with elevated errors across the region, at 7 hours and 52 minutes, across 38 products.

**B:** That duration deserves respect on its own. Nearly eight hours is not a blip you explain away with a status emoji.

**A:** Google listed products including Compute Engine, Kubernetes Engine, Cloud Storage, and Cloud Run among the 38 affected.

**B:** And Google's own updates described elevated errors and intermittent network failures, with a suggested workaround of moving workloads to another zone or region.

**A:** The downstream impact is what made it public news. BBC live coverage named Revolut and Halifax among the UK banking apps disrupted.

**B:** Revolut told customers multiple services were partially unavailable, including card payments, transfers, and ATM withdrawals, confirmed customer money and data were safe, and attributed the disruption to a third party it did not name.

**A:** Halifax told customers it was aware of app and online issues, without confirming a cause in that statement.

**B:** That is a miserable Tuesday morning in London. Apps are disrupted, people cannot move their own money on their phones, and only some of the firms involved have said why.

**A:** The Emma budgeting app stated directly that it was down due to the Google Cloud outage in London since early that morning.

**B:** So the blast radius ran from a cloud region, through banking apps, into the pockets of people who have never heard of europe-west2.

**A:** Now the discipline test, because there is a reported cause circulating for the London event, and it involves a power event in one zone.

**B:** I have seen that version shared confidently all week, stated like settled fact by people who read one summary of another summary.

**A:** Then put the update on the record, with its status attached. As of today, Google's status updates attribute this to a power event in europe-west2-b; no final report has been published and that attribution is unconfirmed.

**B:** Named, but not explained. Google gave the cause a label and no account of what actually failed inside the power system, and that gap is exactly where confident repetition rushes in.

**A:** And one question stays explicitly unanswered on the record. Why would a single zone power event propagate region wide across 38 products?

**B:** Leave it unanswered. Nobody outside Google has published an account that answers it, and guessing in a confident voice is the habit this beat exists to break.

**A:** That flagging is not pedantry. It is the whole habit this conversation keeps demanding. Separate what is documented from what is merely repeated.

**B:** Hell, half the bad incident culture I know is just repetition wearing a lab coat. Somebody plausible said it, so everybody downstream stopped checking.

**A:** And notice the asymmetry for customers. The impact was fully visible in public, in banking apps, while the explanation remains entirely in the vendor's hands.

**B:** Which is why your earlier point stands, and stands harder here. In London the report is not part of the product. For the customer, the report is the whole product, because the explanation never leaves the vendor's hands any other way.

**A:** Third event, smaller, closer to home for anyone who ships code. GitHub, on October 19, with Actions, Pages, and Webhooks degraded.

**B:** GitHub's status page puts that at 1 hour and 7 minutes, with delays to workflow processing, site builds, and webhook delivery while GitHub investigated.

**A:** GitHub's closing update said a detailed root cause analysis will be shared as soon as it is available, and at research time it had not yet been published.

**B:** So the scoreboard is one London zone, europe-west2-b, unavailable, elevated errors across the wider region, and the world's code pipeline degraded the day before. Lovely week for infrastructure.

**A:** And October 19 was not even GitHub's first bad day this month. GitHub's own status page records an earlier Actions incident on October 5, running from 18:48 to 22:49 UTC.

**B:** Four hours and a minute of the world's build queue having a lie down. I have had shorter naps with better outcomes.

**A:** GitHub published the impact in numbers. Over the full incident, 14.3 percent of workflow runs on GitHub hosted runners did not start within five minutes.

**B:** And at the worst stretch, roughly ninety minutes, GitHub says 47.0 percent of those runs failed outright. Nearly half the queue, waving from the platform like passengers on a cancelled train.

**A:** GitHub states the cause plainly in that same record. A partial networking failure disrupted connectivity between one of its on premises datacenter regions and a subset of cloud hosted regional database and storage services.

**B:** Notice what that record does that the October 19 one has not done yet. It names a cause, prints the failure percentages, and says self hosted runners were not affected. That is a report a customer can actually plan around.

**A:** And the mitigation rhymes with everything else this month. GitHub shifted database and storage traffic to healthy regions and endpoints, and Actions recovered by 21:54 UTC, with everything else back by 22:49 UTC. Keep the irony budget small here. A company with a famous distributed systems history had its automation layer degraded, and the analysis is still pending.

**B:** One clause is all that irony earns. The useful point is duller. When Actions slows down, thousands of teams discover their release process has exactly one door.

**A:** Let us stand in that doorway for a minute, because the queue behind it is more than one team's build.

**B:** Behind that one door sit the merge checks a team will not merge without, the release build that produces the version customers actually get, the scheduled jobs that clean, bill, and report overnight, and the security scans that are supposed to pass before anything ships.

**A:** When the door slows, none of those queues sends a polite note. They just get longer, and every team watching a spinning status learns the same lesson at the same time.

**B:** And a delayed webhook is not a missing webhook. It is a message arriving after the decision that needed it, which is the retry problem in a different coat. Work gets requested twice, attempted twice, and the queue becomes the incident.

**A:** GitHub's own documentation warns that the schedule event can be delayed during periods of high load, when workflow runs pile up at once. Even the timetable admits the door has a crowd problem.

**B:** So the operational question is dull and expensive. What is your second door, and have you ever actually used it?

**A:** A second door you have never opened is not a door. It is a drawing of a door, taped to the wall of a burning building.

**B:** Write the second door down, test it on a quiet week, and know who holds the key before the week when everybody needs it at once.

**A:** I want to hold all three events in one frame before we move on, because together they make an argument no single one makes alone.

**B:** Go on. Frame it.

**A:** A storage optimization bypassed a safeguard. One zone in London became unavailable while its region saw elevated errors, with a cause named and never explained. A code platform degraded for an hour with its analysis promised.

**B:** Three different shapes of the same month. A change that hurt, a failure unexplained, and a dependency everyone shares blinking in daylight.

**A:** And notice the records themselves disagree in quality. One is complete enough to audit. One is a label. One is still a promise. None of these required an exotic failure. No tornados, no sabotage, no once in a century storm appears anywhere in the documented record.

**B:** Just configuration, capacity, rollback, and concentration. The ordinary ingredients, at extraordinary scale, on an ordinary week in October. That shit never makes the keynote.

**A:** Now the release train, because the other half of this month is how fast everything kept shipping while those incidents were still warm.

**B:** Start with the database everyone argues about at dinner. MongoDB's own announcement dates 9.0 to September 29, and the patch trains were already moving.

**A:** On October 14, MongoDB shipped 9.0.4 alongside patch releases for its older lines, four release trains landing on the same day, by MongoDB's release calendar.

**B:** A major version not yet three weeks old, already on its fourth patch, while the previous generations get their own fixes in parallel.

**A:** Next stop is October 15, and this one is a general availability announcement rather than another preview.

**B:** Snowflake announced that data mirroring for Snowflake Postgres had reached general availability, for anyone ready to build on it.

**A:** Snowflake describes it this way. The mirroring keeps copying tables from a Snowflake Postgres instance into a Snowflake database. Inserts, updates, deletes, even schema changes. And the lag is stated as minimal, not zero. Minimal is Snowflake's wording for that lag, not a guarantee, and that announcement states no bound a reader can treat as a promise.

**B:** And Snowflake says it works without ETL pipelines, batch jobs, or third party connectors, on AWS and Azure. The wall between transactional and analytical data just got thinner in public.

**A:** A copy that maintains itself, with the lag stated as minimal rather than zero, which is the honest way to describe any replication.

**B:** Minimal rather than zero. Is that honesty, or marketing wearing a lab coat?

**A:** Honesty, by the standard we set for copies all day. They named the lag instead of promising zero. A vendor that prints its gap earns the hearing.

**B:** Granted. Stated lag over promised zero, every time.

**A:** Then the speed marker I like best, because it touches nearly every backend team listening. Python 3.15 was released on October 9.

**B:** The release notes count 5,643 commits from 1,012 contributors since the previous major version, which is a small city shipping a language.

**A:** A major language release in the same month as those outages is the treadmill in one image. The ground moves even while you are repairing it.

**B:** You do not get a quiet quarter to stabilize. The runtime upgrades, the database patches, the platform mirrors, and the region fails, all inside three weeks.

**A:** Call that the pace argument. Each item alone is a line in a changelog. Together they describe the operating tempo senior engineers actually work at.

**B:** And nobody staffs for that tempo honestly. Teams plan as if change arrives in batches, then act surprised when it arrives as weather.

**A:** Weather is the right word, because weather is what workflow is for. You do not stop it. You dress for it. Which brings us to workflow, and the most relevant recent writing came from Uber Engineering, on stateful workloads in October 2026 and on retry storms in September 2026.

**B:** Uber published on stateful workloads in October, including the problem of giving stateful workloads similar computational resources across a diverse server fleet.

**A:** Stateful is the hard word in that sentence. A stateless job can land anywhere. A stateful one carries its history with it, and placement mistakes follow it.

**B:** And the retry storm writing sits right beside it, which is perfect, because a fleet under pressure plus eager retries is how a wobble becomes a self inflicted flood.

**A:** Connect it plainly. When a dependency slows down, clients retry, the retries add load, and the added load slows the dependency further.

**B:** We already taught the retry lesson properly, so no second lecture. Just notice that Uber engineers write about it as an operational discipline, not a theory.

**A:** That is the workflow point. The teams running the biggest fleets treat retry behavior and stateful placement as first class engineering, reviewed and published.

**B:** Meanwhile smaller shops discover their retry behavior during an incident, from the graphs, while someone asks why the traffic tripled. Classic damn surprise, every time.

**A:** A lighter engineering post with the same lesson about doing the hard rewrite deliberately. Discord recently rewrote its media engine in Rust.

**B:** Discord said so in its October 6 patch notes, adding that images resize faster with better color accuracy after the rewrite.

**A:** And for the observability end of the craft, ClickHouse published a post on October 13 about chasing a 32 millisecond tail latency.

**B:** A named engineer, Kavi Kanagaraj, a specific 32 millisecond tail, packet capture evidence in the post, and a verification step in the same customer setup.

**A:** That specificity is why it travels. Not a claim that latency improved in general. A number, a hunt, evidence, and a checkable result.

**B:** Averages are where latency problems hide. The tail is where users live, and a post that chases 32 milliseconds respects the reader enough to show the work.

**A:** So the month in workflow reads like this. Placement for stateful work, discipline for retries, a rewrite where the rewrite was due, and a tail latency hunt with receipts.

**B:** None of it is glamorous. All of it is the job. The glamorous version of this work is just these tasks photographed from a safe distance.

**A:** Now the trends, and we handle these differently, because these numbers are published claims by named publishers, not measurements we made ourselves.

**B:** Important distinction. We did not survey anyone. We are reading the scoreboards other organizations published, and arguing about what they actually say.

**A:** First, platform engineering. Gartner forecasts that by 2026, 80 percent of large software engineering organizations will establish platform engineering teams, up from 45 percent in 2022.

**B:** Gartner frames platform teams as internal providers of reusable services, components, and tools, built to ease the cognitive load on developers.

**A:** Puppet adds texture from its 2024 State of DevOps Report, published via Perforce, where 43 percent of respondents said they have had a platform team for 3 to 5 years.

**B:** So according to Puppet, this is not a pilot idea anymore for a large slice of organizations. A platform team with several birthdays is an established org chart fact.

**A:** Hold those two together carefully. Gartner's number is a forecast about 2026. Puppet's number is a 2024 survey about how long teams have existed.

**B:** Forecast versus history. One tells you where a publisher thinks the damn road goes. The other tells you how long some travelers have already been walking it.

**A:** Either way, the direction is consistent. The industry keeps building internal platforms so product teams stop rebuilding the same paved road badly.

**B:** Or, less charitably, so they stop falling into the same uncovered hole. A platform team is often just an organization admitting where its accidents kept happening. A platform team is a salary line that exists because the unpaved road kept eating product teams alive.

**A:** Now the AI numbers, which contain the real argument. Stack Overflow's survey says 84 percent of respondents are using or planning to use AI tools in 2025.

**B:** Stack Overflow also reports that 51 percent of professional developers use AI tools daily, so this is not occasional dabbling anymore. It is a daily habit for half the profession. Daily is the word that matters there. A tool you touch every day is not an experiment anymore. It is furniture with opinions.

**A:** And in the same Stack Overflow reporting, positive sentiment for AI tools fell to 60 percent in 2025, down from above 70 percent in the two prior years.

**B:** Usage up, enthusiasm down. That pairing is the most honest sentence in the whole trend stack, and nobody had to spin it. The survey just printed both.

**A:** Which is exactly why the DORA findings matter, because DORA tried to connect adoption to delivery outcomes instead of feelings.

**B:** DORA 2024, published via Google Cloud, studied the association between a 25 percent increase in AI adoption and a set of delivery measures.

**A:** On the positive side of that association, DORA reports a 7.5 percent increase in documentation quality and a 3.4 percent increase in code quality.

**B:** Read those again, because they are real gains. Better documentation and better code quality are not consolation prizes. Teams drown without both.

**A:** Now the other side of the same association, in the same DORA reporting. Delivery throughput went down by 1.5 percent.

**B:** And delivery stability went down by 7.2 percent. There it is. More AI adoption, associated with better documents, better code, slower delivery, and notably worse stability.

**A:** That tension is the payload, so argue it properly. My reading is that the quality gains are genuine and the delivery costs are an adoption phase problem.

**B:** My reading is ruder and simpler. If stability drops 7.2 percent while code quality rises 3.4 percent, the code being graded is not the system being shipped.

**A:** That is unfair to the measure. Code quality and documentation quality are leading indicators. Throughput and stability may recover as teams learn the workflow.

**B:** May recover is doing heavy lifting in that sentence. DORA measured what happened, not what a hopeful roadmap says happens next. Shit, the stability number is the biggest number on the page.

**A:** The biggest number, yes, but association is not a verdict on any single team. DORA describes a pattern across many organizations adopting at different depths of discipline.

**B:** Granted, and I will even grant the documentation gain twice, because undocumented systems are how knowledge becomes a single point of failure wearing a hoodie.

**A:** Then what is your actual objection, if you accept the gains and accept that association is not destiny?

**B:** My objection is to the celebration order. Teams quote the documentation and code numbers in the strategy deck, and leave the stability number in the appendix where numbers go to die.

**A:** That I accept completely. If you cite DORA, you cite all four figures, or you are marketing rather than engineering.

**B:** And there is a systems reading underneath it. Generated output arrives faster than the verification habits around it. Of course stability pays first. Verification is the bottleneck nobody automated.

**A:** So the trend argument lands here. Adoption is nearly universal by Stack Overflow's count, sentiment is cooling, and DORA ties adoption to better artifacts and worse delivery stability at once.

**B:** Both things, same report, no cherry picking. If your AI rollout story cannot hold the minus 7.2 in the same breath as the plus 7.5, it is not a story. It is a brochure.

**A:** That was 2024, and it is not the last word, because DORA has published since, and the update corrects the shape of the first story. One update belongs on the record before we leave this. DORA's 2025 report, State of AI-assisted Software Development, presented by Google Cloud, found that 90 percent of technology professionals now use AI at work.

**B:** Ninety percent. At that point asking a developer if they use AI is like asking if they use a chair. Technically a question, spiritually a formality.

**A:** DORA also reports that over 80 percent of respondents believe AI has increased their productivity, and DORA's own summary names the pattern in one word. Amplifier.

**B:** Amplifier is the honest word. Plug a good band into it and the room sounds better. Plug a struggling band into it and now the whole street knows.

**A:** And the delivery association changed shape between the two reports, so nobody gets to quote the old one as the final word. DORA's 2025 summary says higher AI adoption is associated with an increase in both software delivery throughput and software delivery instability.

**B:** Throughput up and instability up, in the same sentence, from the same publisher. Faster and shakier is not a contradiction. It is a Tuesday with better tooling.

**A:** DORA also puts the trust figure in print. Thirty percent of developers report little to no trust in the code generated by AI, per the 2025 report.

**B:** Thirty percent say it out loud, and the rest still check the work before it ships. That is not rejection. That is the job growing a verification step.

**A:** And the platform numbers explain where organizations think the fix lives. Platform teams, per Gartner and Puppet, are the industry's attempt to pave the safe path.

**B:** A paved path only helps if the pavement includes the guardrails. A platform that makes deployment faster without making rollback complete is just a quicker route to October 9.

**A:** That is a fair synthesis, and October supplied the evidence for it in public, with dates, durations, and in one case a genuinely exemplary report.

**B:** And through all of it, the releases never stopped, the surveys never stopped, and the work of verifying quietly became the whole job.

**A:** So the question this month leaves every engineering team is simple. When your own October arrives, will your report read like Google's storage report, detailed enough to audit?

## SEC-08: What businesses are missing, and the close

**B:** Or will it read like a label with no explanation under it, repeated confidently by everyone except the one organization that actually knows? Before we land anything, I want the other side to get its full say.

**A:** You want to argue against the whole argument we just built.

**B:** I want to argue against the lazy version, because the lazy version is the one people will take home and expense.

**A:** State the lazy version plainly.

**B:** The lazy version says serious systems are distributed systems, serious engineers learn consensus, and serious businesses should want both.

**A:** That version sounds confident and expensive.

**B:** It is expensive, and that is exactly why it sells so damn well.

**A:** Give me the honest version of the objection.

**B:** Most businesses do not need consensus at all.

**A:** You are not limiting that claim to a few unusual businesses.

**B:** I mean most businesses, most of the time, for most of the data they actually keep.

**A:** That is a large claim, so it needs a large proof.

**B:** I brought one, and it is not a toy example from a startup blog.

**A:** Name the proof.

**B:** OpenAI published an engineering post on January 22, 2026, about scaling PostgreSQL for 800 million ChatGPT users.

**A:** That is a product with real scale and real pressure.

**B:** It is, and Postgres remained unsharded, with a single primary instance serving all writes.

**A:** Say that again slowly, because it cuts against a lot of shopping lists.

**B:** One primary took the writes, and the system still served hundreds of millions of people.

**A:** Reads and writes are not the same burden in that story.

**B:** They are not, and OpenAI said the hard work was still hard.

**A:** The primary was not magic, and the team did not pretend it was simple.

**B:** Right, they offloaded reads to nearly 50 read replicas so reads could keep going if the primary went down, and the post says that Postgres workload is primarily read heavy, with a high availability standby behind the primary.

**A:** Writes would still fail while the primary was down.

**B:** Yes, and they accepted that limit in plain language.

**A:** So the existence proof is narrow and strong at the same time. Conceded on the proof, with its limits stated. This was one exceptionally well staffed team, with read replicas and unstated caching and pooling choices behind it, and it proves nothing about failover safety for most businesses. It does not prove a single primary can carry everything forever.

**B:** No, and I am not claiming that bullshit version either.

**A:** And the same post restores the rest of the picture. OpenAI migrated shardable, write heavy workloads to sharded Azure Cosmos DB.

**B:** New tables are barred on that Postgres deployment, and new workloads default to sharded systems.

**A:** The primary was not carrying every write OpenAI had. It was carrying the writes of the deployment that remained after that migration.

**B:** So the honest claim is narrower, and it still stands. One primary can be the right default, for the workload that actually fits it.

**A:** Then your claim is about the default, not about the ceiling.

**B:** Exactly, the default should be one well run primary until a measured problem pushes you off it.

**A:** Define well run, because people hide a lot inside that phrase.

**B:** Well run means backups you have tested, replicas you understand, pooling you have measured, and a restore you have actually performed.

**A:** It also means one engineer can hold the shape of the system in their head.

**B:** It means the person who gets paged can reason about the failure while they are still half asleep.

**A:** A distributed database multiplies the things that can disagree at that hour.

**B:** It multiplies nodes, clocks, networks, queues, leaders, followers, and every damn way they can stop trusting each other at the worst hour.

**A:** You are describing operational risk, not mathematical weakness.

**B:** Operational risk is the risk that actually pages people, so I give it full weight.

**A:** Fair enough, but a primary can fail too.

**B:** Of course it can, and nobody here is selling immortality in a single box.

**A:** And one concession belongs here too. A managed single primary still rents consensus underneath for safe failover, in the provider machinery that promotes a standby, so choosing one primary moves that agreement cost. It does not abolish it.

**B:** Rented agreement, honestly labelled. Fine. The default still stands.

**A:** Then the comparison is between known failures and newer failures. Known failures have names, runbooks, and survivors. Newer failures have introductions to make.

**B:** That is where Dan McKinley earns his keep with Choose Boring Technology.

**A:** Explain his innovation token idea for a listener who has never heard it.

**B:** McKinley argues that a company only has a small budget for genuinely new and strange choices.

**A:** He calls that budget innovation tokens.

**B:** Spend a token on your database architecture, and you may have nothing left for the product your customers actually buy.

**A:** Boring technology earns the praise because its failure modes are already mapped.

**B:** Boring is stable, boring is well understood, and boring fails in ways the team has met before.

**A:** New technology can still be the right spend when the old tool cannot do the job.

**B:** Sure, but then you should be able to name the job in one sentence without saying the word scale like a prayer.

**A:** Most teams use scale as a fog machine.

**B:** They do, and the fog hides the shitty little fact that their writes would fit comfortably on one good primary.

**A:** Give me a receipt for that claim, not another slogan about scale.

**B:** Prime Video Tech published one on March 22, 2023, by Marcin Kolny, about its audio and video monitoring service.

**A:** What did that service watch?

**B:** Every stream customers viewed, automatically flagging quality problems like block corruption or audio and video sync problems.

**A:** And the first design was the fashionable one.

**B:** Distributed components, orchestrated by AWS Step Functions, built from serverless pieces like Lambda.

**A:** Where did the money go, in their own accounting?

**B:** The two most expensive operations were the orchestration workflow and when data passed between distributed components.

**A:** Give me both mechanisms, plainly.

**B:** The service made multiple state transitions for every second of a stream, Step Functions charges per transition, and they reached account limits.

**A:** That is the orchestration bill. Now the data bill.

**B:** Frames were uploaded to an S3 bucket as temporary storage, detectors downloaded them, and the high number of Tier 1 calls was expensive.

**A:** And what did the expensive design buy them on scale?

**B:** A hard scaling limit at around 5 percent of the expected load, with a total cost too high to accept at large scale.

**A:** So they took the famous step backwards.

**B:** They packed every component into a single process, kept data transfer in process memory, and moved orchestration inside a single instance.

**A:** What fell off the bill?

**B:** The S3 bucket as a middleman for frames, because data no longer left the process to reach the detectors.

**A:** Did they have to throw away the design to do it?

**B:** No. The components stayed the same, the high level architecture stayed the same, and they reused a lot of code.

**A:** Now the number from their title, exactly as they report it.

**B:** Moving the service to a monolith reduced their infrastructure cost by over 90 percent, and it increased their scaling capabilities.

**A:** How far did the simpler system run?

**B:** Thousands of streams, they said, with capacity left to scale even further.

**A:** Now the limits, out loud, before this becomes a religion.

**B:** It was one service in one specific use case. Their own closing says the choice has to be made case by case.

**A:** And the monolith had its own ceiling in their telling.

**B:** Detectors in one instance scale only vertically. They outgrew one instance and cloned the service with different detector subsets.

**A:** So the receipt does not prove distribution is always waste.

**B:** No. It proves distribution is a purchase, and this buyer measured the bill, returned it for this job, and published the receipt. My next witness is eventual consistency, and it has been carrying user facing work for a long time.

**A:** Werner Vogels wrote the famous statement of that position.

**B:** Vogels published Eventually Consistent in Communications of the ACM in January 2009.

**A:** His argument was built for systems operating at worldwide scale.

**B:** It was, and we should say that out loud so we do not borrow his conclusion without his context.

**A:** The core claim still travels down to smaller systems.

**B:** The core claim is that weak consistency can improve availability and performance when strong agreement on every step is too costly.

**A:** Most user visible work tolerates a little delay.

**B:** A profile photo, a comment, a like, a feed, a catalog page, and a recommendation can arrive a few seconds late without breaking a promise.

**A:** The user may not even have a way to act on the delay.

**B:** Right, and Peter Bailis and his coauthors added measurement to that intuition.

**A:** Their finding was narrower than the slogan. In the Probabilistically Bounded Staleness work, Bailis and his coauthors measured systems including a LinkedIn deployment on solid state storage, where reads had a 97.4 percent probability of being consistent immediately after a write, rising to over 99.999 percent after 5 milliseconds.

**B:** Measured staleness in production is often short, and many anomalies stay rare enough that a team can manage them honestly.

**A:** Most of the time. The rest of the time is where the incident reports come from.

**B:** Exactly. Most of the time is not a guarantee and never will be.

**A:** Now scope it, because this is where the argument usually gets dishonest.

**B:** Eventual consistency is not the tool I trust alone for a financial ledger.

**A:** It is not the tool for inventory that can be oversold.

**B:** It is sure as hell not the tool for access control after someone has been removed.

**A:** A delayed permission change is not a cosmetic delay.

**B:** No, a stale permission can become a wrong action, and a wrong action is where staleness stops being charming.

**A:** Read your own write failures belong on that warning list too.

**B:** They do, because a person who saves a change and then cannot see it learns to distrust the whole product.

**A:** Conversation order belongs there as well.

**B:** Yes, because a reply that arrives before the message it answers makes people look careless when the system was careless.

**A:** So eventual consistency is fine for a wide field and dangerous in a narrow one.

**B:** That is the honest sentence, and it is stronger than the slogan on either side.

**A:** Your next witness has been correcting himself for years.

**B:** Eric Brewer corrected the popular reading of CAP in CAP Twelve Years Later.

**A:** Too many people learned CAP as a menu with three items and permission to pick two.

**B:** Brewer wrote that the "2 of 3" formulation was always misleading.

**A:** Before we bury the slogan, give it its proper paperwork.

**B:** Gladly. Brewer presented the idea as a conjecture in 2000. In 2002, Seth Gilbert and Nancy Lynch proved it, in ACM SIGACT News, and the proof is narrower than the slogan people put on slides.

**A:** Narrower how? They worked in an asynchronous network model, where there is no clock and nodes decide only from the messages they have received and local computation.

**B:** No clock. Nodes decide from what arrived. That is the whole stage.

**A:** And consistency meant something specific there.

**B:** Atomic consistency, for a read and write object. Every operation has to look as if it happened at a single instant, in one total order.

**A:** Their result, in their form and in plain speech, is this. In that model, you cannot build a read and write object that promises both things at once. Always available, and always atomically consistent, in every fair run, even the runs where messages get lost.

**B:** And availability has a precise meaning in that result. Every request sent to a node that has not failed must eventually receive a response.

**A:** So the theorem does not say pick any two from a menu at all times.

**B:** No. It says, under those stated assumptions, availability and atomic consistency cannot both be guaranteed when messages can be lost. Move toward a partially synchronous model and the paper itself discusses practical compromises.

**A:** The slogan lost the assumptions on the way to the whiteboard.

**B:** It usually does. That is how a proof becomes a bumper sticker.

**A:** That sentence should embarrass a thousand interview whiteboards.

**B:** It should, because partition tolerance is not an optional topping you decline to save money.

**A:** The choice between consistency and availability only binds during a partition.

**B:** And partitions are comparatively rare, even though they are never imaginary.

**A:** CAP consistency also means a specific strong property, not the general tidiness people want from the word consistency.

**B:** People mix it up with the consistency in ACID and then classify real databases with a label that does not fit.

**A:** So the slogan trains engineers to ask the wrong question confidently.

**B:** It does, and that is worse than asking no question at all, because a confident wrong label sends the whole team marching in the wrong direction.

**A:** Daniel Abadi offered a sharper frame in February 2012 in IEEE Computer.

**B:** His frame is PACELC, and it asks two questions instead of pretending there is only one.

**A:** Ask both of his questions, the partition one and the ordinary day one.

**B:** If there is a partition, do you choose availability or consistency for that operation? And if there is no partition, do you choose lower latency or stronger consistency for that operation?

**A:** That second choice is where most real systems reveal themselves.

**B:** Most teams weaken consistency to avoid coordination latency, not because they are bravely surviving some disaster movie shit.

**A:** A cross region wait is a daily tax, while a partition is a rare emergency.

**B:** Exactly, and any frame that ignores the daily tax misdescribes why these systems were built.

**A:** Now record the dissent, because we do not get to crown a new slogan.

**B:** Martin Kleppmann looked at PACELC and wrote that he did not find it any more enlightening than CAP.

**A:** That is not a small footnote from a random critic.

**B:** No, Kleppmann made a serious formal critique of how loosely people use these labels.

**A:** So we have Abadi saying PACELC reasons about both tradeoffs in one formulation.

**B:** And we have Kleppmann saying the classification still does not enlighten him.

**A:** We are not settling that fight here.

**B:** We are not, because the sources do not settle it and pretending otherwise would be cheap.

**A:** The useful residue is a pair of questions, not a new badge for a database.

**B:** Ask what happens during a partition, and ask what latency you pay when nothing is broken.

**A:** Those questions survive even if the acronym does not.

**B:** Good, because my last objection is the one that kicks the whole subject in the shins.

**A:** Bring the famous failures into the room.

**B:** Meta went down globally on October 4, 2021, for about six hours across its major services.

**A:** That outage is still the reference point for a bad day at planetary scale.

**B:** Meta postmortemed it as a configuration and operations failure, not a consensus protocol failure.

**A:** Walk through the mechanism without turning it into folklore.

**B:** A routine maintenance command was issued to assess global backbone capacity.

**A:** That command unintentionally took down the connections in the backbone network.

**B:** The audit tool that should have stopped a command like that had a bug, so the guardrail failed to guard.

**A:** Then the Domain Name System servers became unreachable even though they were still operational.

**B:** The rest of the internet could not find the servers, and the internal recovery tools depended on the same broken paths.

**A:** No quorum made that decision, and no election caused that cascade.

**B:** No protocol caused it, and that distinction matters if we are teaching people where reliability is actually won.

**A:** Your second case is more recent.

**B:** Cloudflare had a major outage on November 18, 2025, and postmortemed that one as a configuration and operations failure too.

**A:** Give the chain as Cloudflare reported it.

**B:** A change in a database permissions mechanism altered how a query behaved and produced duplicate rows.

**A:** Those duplicate rows fed a file used by the Bot Management system.

**B:** The file doubled in size, and its feature count rose from about 60 in normal use to more than 200, past the hardcoded feature count limit of 200, propagated through the fleet, and the proxies crashed hard as hell.

**A:** Again, the protocol did not betray anyone in that chain.

**B:** The chain ran through permissions, data shape, propagation, and a limit nobody had tested at that size.

**A:** So your closing charge is that we taught the wrong center of gravity.

**B:** My charge is that consensus is mostly a solved building block you consume, while configuration and operations are where the bodies are buried.

**A:** Teams rarely write a consensus protocol, and writing one is usually the mistake.

**B:** Damn right it is, because the mature libraries and managed systems already carry scars your team has not earned yet.

**A:** The objection is not that consensus is useless. It is that consensus is almost never the first thing that breaks. I concede the default.

**B:** Say the concession in full, so nobody can clip half of it.

**A:** Most businesses should start with one well run Postgres primary, read replicas where reads need help, tested backups, and a restore the team has practiced.

**B:** Keep conceding, because you are on a roll.

**A:** Most businesses should not run a distributed database they cannot operate, cannot debug, and cannot explain during a partition.

**B:** Eventual consistency belongs in that concession too.

**A:** Eventual consistency is the right answer for a large share of user facing reads, provided the team names the narrow places where staleness becomes a wrong action.

**B:** The labels belong in that concession too.

**A:** That one I will fight you for. The slogan being wrong does not make the labels useless. A team still needs words for the failure it fears.

**B:** And Brewer, who gave the field those words, said it himself. The 2 of 3 formulation was always misleading. The slogan misleads the very teams reaching for the words.

**A:** Conceded, with a scar. The pick two slogan is wrong. PACELC asks better daily questions. And Kleppmann may still be right that the label adds less than its fans claim. But a team still has to name its feared failure out loud, in some vocabulary, or it has not decided anything.

**B:** The famous failures belong in that concession too.

**A:** Meta in 2021 and Cloudflare in 2025 warn us that a bad change with a broken guardrail can outrank any protocol debate.

**B:** Then what is left of your argument after I take all that?

**A:** The part that was never about buying a distributed database.

**B:** Tell me what survives my best argument.

**A:** Copies survive it, retries survive it, and silence survives it.

**B:** Those three words need unpacking before they become another slogan.

**A:** You do not need consensus, but you already have copies, and copies do not ask permission before they disagree.

**B:** A cache is a copy.

**A:** A replica is a copy, a backup is a copy, an export is a copy, and a spreadsheet sent to five people is five copies with confidence.

**B:** A retry is where the second problem walks in.

**A:** You already have retries, because networks time out, clients reconnect, queues redeliver, and people press the button again.

**B:** A retry without an identity can do the work twice.

**A:** And silence is the third resident, because every timeout, every missing heartbeat, and every unanswered request forces a decision without giving you certainty.

**B:** Silence does not ask permission either.

**A:** No, silence arrives during the busiest hour and asks whether you will wait, proceed, duplicate, or stop.

**B:** So the landing is not adopt consensus everywhere.

**A:** The landing is to notice the distributed system you already operate, even if it wears ordinary business clothes.

**B:** Now give me the triggers that honestly break the single primary default.

**A:** The first trigger is write throughput that one primary cannot sustain after honest tuning and honest measurement.

**B:** That trigger is not a whiteboard fear of future throughput.

**A:** It is measured write pressure, with headroom gone and the queue becoming the product.

**B:** Name the second trigger for me.

**A:** Multi region latency becomes a user promise you cannot keep when every write must travel to one distant primary.

**B:** If your customers live far from the primary, physics sends the damn invoice every single day.

**A:** The third trigger is data residency, where law or contract says certain data must live and be processed in a certain place.

**B:** Residency is not a preference a roadmap can wave away.

**A:** The fourth trigger is a failover target that a primary recovery cannot meet.

**B:** If the business truly cannot tolerate writes stopping during primary recovery, the default has already changed.

**A:** Those four triggers earn distribution, and vague ambition does not. Hold those four triggers in your hand. They come back at the end as a rule you can run, not a list you admire.

**B:** Now pay the concessions that are still due.

**A:** Consensus is a staffing decision before it is a diagram.

**B:** A quorum you cannot operate is less reliable than a primary you understand in your sleep.

**A:** Distribution also amplifies configuration failure, because one bad change can reach every node before a human notices.

**B:** And recovery gets harder when the tools for recovery ride the same network that just failed.

**A:** Which brings us to the fight we have been circling.

**B:** You want to say complexity is sometimes the honest price.

**A:** Complexity is not a sin when the problem is genuinely hard.

**B:** Hiding complexity does not remove it, and it tends to resurface at three in the morning.

**A:** That was supposed to be my line, and you delivered it fairly.

**B:** I can deliver it and still answer it.

**A:** Then answer it with your strongest line.

**B:** Boring technology fails in ways we have already met.

**A:** New systems fail in ways they introduce personally.

**B:** That introduction happens at the worst available moment, pager in one hand, search engine in the other, and fuck all sleep in the bank.

**A:** Both sentences can be true, just at different miserable hours of the same incident.

**B:** They can, which is why the question is where the complexity is allowed to live.

**A:** Put it in the protocol when the invariant truly demands agreement.

**B:** Keep it out of the product when one primary, one queue, and one tested restore already tell the truth.

**A:** That distinction is the whole thing, stated without costume jewelry.

**B:** Then let us talk about what ordinary businesses are actually missing.

**A:** They are missing tested proof, not exotic machinery.

**B:** Start with backups, and name the publisher on the record.

**A:** Spiceworks, in its Voice of IT 2026 reporting, found that 41 percent of IT professionals test backup restores rarely, ad hoc, or never.

**B:** A backup job that reports success has not proven a restore.

**A:** A restore is proven only when someone brings the data back and checks that the business can use it.

**B:** A green check on a backup panel is a claim, not evidence.

**A:** Then let us turn that verdict into a drill a small shop can run this week, with a clock and a witness.

**B:** Step one is naming the targets in plain language, before anyone touches a backup panel. How much work can this business afford to lose, in hours? And how long can it afford to be down, in hours?

**A:** Those two answers are the whole budget for the drill. Everything after them is measuring whether the backup you already pay for meets them.

**B:** Step two. Pick a clean place that is not the live system, restore last night's backup into it, and start the clock when the restore starts, not when somebody remembers the clock exists.

**A:** Step three. Nobody on the team declares success. A person acting as a customer does. They log in, they find a real record, they place a test order or book a test appointment, and they try the payment path the way a stranger would.

**B:** Step four. Write down three numbers and one surprise. The restore time, the gap between the newest record you found and the newest record you expected, and the first thing that surprised you.

**A:** If the surprise list is empty, nobody was watching closely enough.

**B:** And if the numbers miss the targets from step one, the drill did its job anyway, because it found the gap on a quiet day instead of a bad one.

**A:** Human error is the next number, and it deserves the same care.

**B:** Uptime Institute counted this in its 2025 outage analysis. Nearly 40 percent of organizations. A major outage, caused by human error, inside the last three years.

**A:** That figure lands differently when you remember that procedures and process flaws sit inside many of those errors.

**B:** People skip steps, steps omit warnings, and the system faithfully performs the mistake at machine speed.

**A:** Ransomware recovery tells the same story from a harsher angle.

**B:** Veeam, in its 2024 ransomware findings, reported that 41 percent of data was compromised during attacks and that only 57 percent of compromised data was recovered on average. Veeam's 2025 report makes the same point with fresher numbers, and they are not comforting. In Veeam's own release, its chief executive said that of those attacked, only 10 percent recovered more than 90 percent of their data, while 57 percent recovered less than 50 percent.

**A:** Read the second half of that again. A majority of attacked organizations got back less than half of what was hit.

**B:** Less than half. That is not a recovery plan. That is a salvage operation with a login screen.

**A:** Veeam's release also says the share of organizations hit in the past year eased from 75 percent to 69 percent, across a survey of 1,300 organizations.

**B:** Fewer fires, same burned kitchen. The attack rate dipped and the recovery rate stayed grim, which tells you exactly where the missing work lives.

**A:** Having backups and recovering the business are different outcomes.

**B:** The gap between those outcomes is where the planning either existed or did not.

**A:** Uptime Institute also reported cost figures that need a fence around them.

**B:** Uptime reported that 54 percent of respondents said their most recent significant outage cost more than 100,000 dollars.

**A:** That is large organization data, and we will not dress it up as a small shop average.

**B:** A small shop can still be ended by a smaller number, which is the only honest use of that comparison.

**A:** The dashboard problem belongs in this same accounting.

**B:** The dashboard says everything is fine.

**A:** The dashboard says the checks we chose passed recently, in the places we checked.

**B:** A dashboard is a weather report filed from inside the house. Go and open a window before you tell the customers the sky is clear.

**A:** For a small shop that window is physical. Open the booking page. Check the till total against the bank. Read the last restore date out loud. What businesses are missing is rarely a grander architecture.

**B:** They are missing a restore they have rehearsed, a retry that carries an identity, a copy whose age they know, and a human procedure that survives a tired operator.

**A:** Let me build one shop to test that list, and I will label it plainly. This is a constructed example, not a real business, built from the copies almost every small shop keeps.

**B:** Five copies, by my count. Walk them.

**A:** The booking page holds the first copy, current until a customer changes it. The spreadsheet export on the owner's laptop holds the second, and it stopped being current the moment it was exported.

**B:** The card reader holds the third, a list of payments waiting to agree with the bank. The email inbox holds the fourth, confirmations that customers treat as promises even when the booking page disagrees.

**A:** And the owner's phone holds the fifth, photographs of the paper diary, taken as a backup and now quietly acting as the referee nobody appointed.

**B:** Now ask the three questions of that shop and watch the answers get uncomfortable. The export does not know its age. The inbox cannot say who told it the time had changed. And when the phone photograph and the booking page disagree, a tired human decides, by mood.

**A:** Nothing in that shop is exotic. That is the point. The distributed system was already open for business. They are missing a referee for the copies they already keep.

**B:** They are missing the habit of asking their own systems the hard questions before an outage asks first. Then let us stop touring and write the rule down, because a rule you can run on a Tuesday beats a tour you admire on a Sunday.

**A:** Four parts. Part one. One well run primary is enough until the evidence says otherwise.

**B:** And well run is a checklist, not a vibe.

**A:** If your busiest week leaves that primary with room to spare, if one person can draw the whole system on a napkin and explain it half asleep, and if a restore you have actually run brings you back inside the downtime the business can afford, you do not have a distribution problem yet. You have a good default. Keep it.

**B:** Part two. Distribution gets earned by evidence, not ambition.

**A:** The evidence is a graph showing measured write pressure with the headroom gone after honest tuning. Or a latency promise to distant customers that one far away primary physically cannot keep. Or a law or contract that says the data lives in a particular place. Or a timed recovery that misses the failover target the business truly needs.

**B:** One of those four, measured and in writing. That is the ticket. A whiteboard fear of next year is a costume, not a ticket.

**A:** Part three. Name the consistency each kind of data actually needs, in business words, before anyone names a database.

**B:** Ask it like this. If a customer sees the old version for ten seconds, what breaks?

**A:** If money can move twice, if stock can be oversold, if a removed login still works, a promise breaks, and that data needs the strong answer, where you always read your own write back.

**B:** If the answer is a photo lands late or a like arrives out of breath, eventual is fine, and you just saved a fortune in coordination.

**A:** Part four. Run the failure test before you buy anything, and the first test is a restore test, not a partition test.

**B:** This week. Restore last night's backup somewhere clean, log in as a customer, place a test order, take a test payment, and time it while somebody watches the clock.

**A:** If that test fails, no distributed database fixes you, because your problem was never agreement. It was proof.

**B:** And if it passes, write the time down. That number is the most honest sentence in your architecture.

**A:** Then let us ask those questions directly, the way we asked them at the start.

**B:** Ask your phone, your laptop, your cache, your replica, and your backup the first question.

**A:** How old are you?

**B:** Ask the record in front of you where its truth came from.

**A:** Who told you that?

**B:** Ask what your business does in the exact moment when two trusted copies contradict each other.

**A:** What happens if another copy says the opposite right now?

**B:** Do not answer those questions for the system you wish you had.

**A:** Answer them for the spreadsheet, the booking page, the payment retry, the customer list, and the restore file you actually have.

**B:** Somewhere in that inventory sits a copy that is stale and confident.

**A:** Somewhere sits a retry that can charge, book, send, or delete twice because nobody gave the first attempt a name.

**B:** Somewhere sits a silence you have been interpreting as failure, as success, or as permission, depending on which answer hurt less. And at three in the morning, one copy will be unresponsive, one copy will be slow, and one copy will be perfectly confident.

**A:** At three in the morning, which unresponsive little liar are you going to believe? None of them, because an unresponsive copy is not lying.

**B:** It is silent, and silence cannot tell you whether it is dead or slow, so you do not decide by belief in that moment. You decide by the rule you stated in advance. Three raccoons, one sandwich, and no referee is coming to settle it for you, unless you built one and named it in advance.

**A:** You are that referee if you named yourself one in advance, so decide now which copy earns your trust and why, and let the rule you wrote down do the settling.

**B:** That is the work we do at PING, a small digital services business in Grand Junction, Colorado, that builds practical systems for local businesses, and it is ordinary work on purpose.

**A:** If you want to hear more content like this, like, follow, subscribe, hit the bell so you can stay caught up on the build.
