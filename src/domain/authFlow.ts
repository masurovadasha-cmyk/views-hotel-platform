export type AuthState="anonymous"|"requesting"|"link_sent"|"verifying"|"authenticated"|"error";

export function nextAuthState(state:AuthState,event:"request"|"sent"|"verify"|"success"|"fail"|"logout"):AuthState{
  if(event==="logout")return "anonymous";
  if(event==="fail")return "error";
  if(state==="anonymous"&&event==="request")return "requesting";
  if(state==="requesting"&&event==="sent")return "link_sent";
  if((state==="link_sent"||state==="anonymous")&&event==="verify")return "verifying";
  if(state==="verifying"&&event==="success")return "authenticated";
  return state;
}
