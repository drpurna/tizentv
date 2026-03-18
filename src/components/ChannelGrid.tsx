import { useStore } from "../store/useStore";
import { useRemote } from "../hooks/useRemote";
import VideoPlayer from "./VideoPlayer";

export default function ChannelGrid() {
  const { channels, focusIndex, currentUrl } = useStore();
  useRemote();

  return (
    <div style={{ flex: 1 }}>
      {currentUrl && <VideoPlayer url={currentUrl} />}

      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 20,
        padding: 20
      }}>
        {channels.map((c: any, i: number) => (
          <div
            key={i}
            data-index={i}
            className={focusIndex === i ? "active" : ""}
            style={{
              width: 200,
              transform: focusIndex === i ? "scale(1.2)" : "scale(1)"
            }}
          >
            <img src={c.logo} width="100%" />
            <p>{c.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
