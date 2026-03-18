import { useEffect } from "react";
import { useStore } from "../store/useStore";

export function useRemote() {
  const { focusIndex, setFocus, channels, setUrl } = useStore();

  useEffect(() => {
    const handler = (e: any) => {
      if (e.keyCode === 39) setFocus(focusIndex + 1);
      if (e.keyCode === 37) setFocus(Math.max(0, focusIndex - 1));
      if (e.keyCode === 13) {
        const ch = channels[focusIndex];
        if (ch) setUrl(ch.url);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusIndex, channels]);
}
