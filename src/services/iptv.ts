export const TELUGU_M3U =
  "https://iptv-org.github.io/iptv/languages/telugu.m3u";

export async function loadChannels() {
  try {
    const res = await fetch(TELUGU_M3U);
    const text = await res.text();

    return text.split("#EXTINF").slice(1).map(e => ({
      name: e.match(/,(.*)/)?.[1],
      logo: e.match(/tvg-logo="(.*?)"/)?.[1],
      url: e.split("\n")[1],
      group: e.match(/group-title="(.*?)"/)?.[1] || "Live"
    }));

  } catch {
    return [{
      name: "Fallback Channel",
      logo: "",
      url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      group: "Demo"
    }];
  }
}
