import { createContext, useContext } from "react";

const RoadmapContext = createContext(null);

export function useRoadmap() {
  return useContext(RoadmapContext);
}

export function RoadmapProvider({ value, children }) {
  return (
    <RoadmapContext.Provider value={value}>
      {children}
    </RoadmapContext.Provider>
  );
}
