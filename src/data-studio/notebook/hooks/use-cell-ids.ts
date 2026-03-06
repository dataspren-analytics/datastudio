import { shallow } from "zustand/shallow";
import { useStore, selectCellIds } from "../store";

export function useCellIds(): string[] {
  return useStore(selectCellIds, shallow);
}
