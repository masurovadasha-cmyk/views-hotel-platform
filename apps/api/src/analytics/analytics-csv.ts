const formulaPrefix=/^[=+\-@]/;

export function csvCell(value:unknown){
  if(value===null||value===undefined)return "";
  let raw=String(value);
  if(formulaPrefix.test(raw)){
    raw="'"+raw;
  }
  if(/[",\r\n]/.test(raw)){
    return '"'+raw.replace(/"/g,'""')+'"';
  }
  return raw;
}

export function csvRows(
  headers:string[],
  rows:Array<Record<string,unknown>>
){
  const lines=[
    headers.map(csvCell).join(","),
    ...rows.map(row=>headers.map(header=>csvCell(row[header])).join(","))
  ];
  return lines.join("\r\n")+"\r\n";
}
