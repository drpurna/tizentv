import { create } from "zustand";

export const useStore = create<any>((set) => ({
  channels: [],
  focusIndex: 0,
  currentUrl: null,

  setChannels: (c: any) => set({ channels: c }),
  setFocus: (i: number) => set({ focusIndex: i }),
  setUrl: (u: string) => set({ currentUrl: u })
}));
