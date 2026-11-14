// Keep seated characters readable. Larger teams extend the office horizontally.
export function officeLayout(memberCount:number){
  const count=Math.max(1,Math.min(8,Math.floor(memberCount)));
  const clusters=Math.ceil(count/2);
  return {clusters,minWidth:clusters<=2?1120:clusters===3?1220:2000,height:650};
}
