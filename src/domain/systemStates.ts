export type SystemState="loading"|"ready"|"empty"|"error"|"offline"|"read_only";
export function canMutate(state:SystemState){return state==="ready"}
export function stateMessage(state:SystemState){
  return {
    loading:"Loading…",ready:"Ready",empty:"No items found",error:"Something went wrong",
    offline:"You're offline",read_only:"You can view but not make changes."
  }[state];
}
