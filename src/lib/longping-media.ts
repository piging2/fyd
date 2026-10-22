/**
 * Media + social inventory for The Long Ping and PING.
 *
 * Every URL in this file was verified live before being added (publication
 * ledger oEmbed/connector checks, lane publication records, or the platform's
 * own profile data). Do not add a URL that has not been verified: an
 * unpublished or pending item does not belong here.
 */

export interface FeaturedVideo {
  id: string;
  title: string;
  kind: "Film" | "Episode" | "Short";
  watchUrl: string;
  thumbnail: string;
  thumbnailFallback?: string;
  blurb: string;
}

function ytThumb(id: string, variant: "maxresdefault" | "hqdefault") {
  return `https://i.ytimg.com/vi/${id}/${variant}.jpg`;
}

export const featuredFilm: FeaturedVideo = {
  id: "s3Os1RNAmeo",
  title: "The Grid Problem | The Long Ping",
  kind: "Film",
  watchUrl: "https://www.youtube.com/watch?v=s3Os1RNAmeo",
  thumbnail: ytThumb("s3Os1RNAmeo", "maxresdefault"),
  thumbnailFallback: ytThumb("s3Os1RNAmeo", "hqdefault"),
  blurb:
    "Episode 3 of The Long Ping, in full: three hours and forty-three minutes on how power grids fail, why they fail the way they do, and what the failures teach about every other system we depend on.",
};

export const episodeVideos: FeaturedVideo[] = [
  {
    id: "ibgccWqthsw",
    title: "The Long Ping, Episode 2: The Water Wheel Problem (Chapters 1-10)",
    kind: "Episode",
    watchUrl: "https://www.youtube.com/watch?v=ibgccWqthsw",
    thumbnail: ytThumb("ibgccWqthsw", "maxresdefault"),
    thumbnailFallback: ytThumb("ibgccWqthsw", "hqdefault"),
    blurb:
      "Episode 2, chapters 1-10: the water wheel, the grid it built, and the long argument between centralised and distributed power.",
  },
  {
    id: "ekJnwDb7ssw",
    title: "The Long Ping, Episode 1: What Survives 10,000 Years",
    kind: "Episode",
    watchUrl: "https://www.youtube.com/watch?v=ekJnwDb7ssw",
    thumbnail: ytThumb("ekJnwDb7ssw", "maxresdefault"),
    thumbnailFallback: ytThumb("ekJnwDb7ssw", "hqdefault"),
    blurb:
      "Episode 1: if everyone maintaining your world disappeared tonight, what would still be true in ten thousand years? Five hours on preservation, memory, and designing for the carrier, not the receiver.",
  },
];

export const shortVideos: FeaturedVideo[] = [
  {
    id: "rgoEwYYb0xk",
    title: "The Night Texas Chose Who Goes Dark",
    kind: "Short",
    watchUrl: "https://youtube.com/shorts/rgoEwYYb0xk",
    thumbnail: ytThumb("rgoEwYYb0xk", "hqdefault"),
    blurb: "From The Grid Problem: Texas, February 2021, and the night the grid decided who kept the lights.",
  },
  {
    id: "h295JI_3_b4",
    title: "90 Seconds to Collapse an Entire Grid | The Long Ping",
    kind: "Short",
    watchUrl: "https://youtube.com/shorts/h295JI_3_b4",
    thumbnail: ytThumb("h295JI_3_b4", "hqdefault"),
    blurb: "From The Grid Problem: Quebec, 1989. A solar storm, a grid on the edge, and ninety seconds.",
  },
  {
    id: "yGXw8zR3F_Y",
    title: "FirstEnergy's Alarm Failed and Said Nothing",
    kind: "Short",
    watchUrl: "https://youtube.com/shorts/yGXw8zR3F_Y",
    thumbnail: ytThumb("yGXw8zR3F_Y", "hqdefault"),
    blurb: "From The Grid Problem: the 2003 blackout began with an alarm that failed silently.",
  },
];

export interface SocialDestination {
  platform: string;
  label: string;
  href: string;
  blurb: string;
}

export const socialDestinations: SocialDestination[] = [
  {
    platform: "YouTube",
    label: "Ping Social",
    href: "https://www.youtube.com/channel/UCsl7RnATG9bn--EWh2davTQ",
    blurb: "The films and the Shorts. Every episode of The Long Ping, free in full.",
  },
  {
    platform: "Substack",
    label: "PING",
    href: "https://trustping.substack.com",
    blurb: "The written companion: transcripts, essays, and build notes in your inbox. No ads, ever.",
  },
  {
    platform: "Spotify",
    label: "The Long Ping",
    href: "https://open.spotify.com/episode/4sVCjSrgV7nE9LhqhOo8xY",
    blurb: "The audio edition of every episode, for the drive, the shop, and the site.",
  },
  {
    platform: "Facebook",
    label: "PING Social",
    href: "https://www.facebook.com/profile.php?id=61594275542163",
    blurb: "The PING Social page: films, clips, and the Western Colorado business community.",
  },
  {
    platform: "Instagram",
    label: "@nolanpigi",
    href: "https://www.instagram.com/nolanpigi/",
    blurb: "Reels from every episode, plus the build as it happens.",
  },
  {
    platform: "Threads",
    label: "@nolanpigi",
    href: "https://www.threads.net/@nolanpigi",
    blurb: "Short takes, hot arguments, and episode threads.",
  },
  {
    platform: "X",
    label: "@GeskeNolan",
    href: "https://x.com/GeskeNolan",
    blurb: "The daily nerd hot take, and the fastest way to argue with the show.",
  },
  {
    platform: "Rumble",
    label: "The Long Ping",
    href: "https://rumble.com/v7gyms6-the-long-ping-episode-2-the-water-wheel-problem-chapters-1-10.html",
    blurb: "The episodes on Rumble, for the audience that lives there.",
  },
  {
    platform: "RSS",
    label: "Podcast feed",
    href: "https://anchor.fm/s/118430774/podcast/rss",
    blurb: "The Long Ping in any podcast app you already trust. No account, no algorithm.",
  },
];

export const substackSubscribeUrl = "https://trustping.substack.com/subscribe";
