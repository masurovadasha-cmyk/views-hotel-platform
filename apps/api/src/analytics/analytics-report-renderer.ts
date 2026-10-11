import {createHash} from "node:crypto";

export type ReportFormat="json"|"csv";

export type RenderedReport={
  content:Buffer;
  contentType:"application/json"|"text/csv; charset=utf-8";
  extension:"json"|"csv";
  checksumSha256:string;
};

export function renderDashboardReport(
  dashboard:Record<string,unknown>,
  format:ReportFormat
):RenderedReport{
  const snapshot=withoutVolatileCache(dashboard);
  const canonical=canonicalize(snapshot);

  if(format==="json"){
    const content=Buffer.from(
      JSON.stringify(canonical,null,2)+"\n",
      "utf8"
    );
    return {
      content,
      contentType:"application/json",
      extension:"json",
      checksumSha256:checksum(content)
    };
  }

  if(format==="csv"){
    const rows:Array<[string,string]>= [["path","value"]];
    flatten(canonical,"",rows);
    const csv="\ufeff"+rows
      .map(([path,value])=>csvCell(path)+","+csvCell(safeSpreadsheetValue(value)))
      .join("\r\n")+"\r\n";
    const content=Buffer.from(csv,"utf8");
    return {
      content,
      contentType:"text/csv; charset=utf-8",
      extension:"csv",
      checksumSha256:checksum(content)
    };
  }

  throw new Error("INVALID_REPORT_FORMAT");
}

function withoutVolatileCache(value:Record<string,unknown>){
  const {cache:_cache,...rest}=value;
  return rest;
}

function canonicalize(value:unknown):unknown{
  if(value===null||typeof value!=="object")return value;
  if(Array.isArray(value))return value.map(canonicalize);

  const output:Record<string,unknown>={};
  for(const key of Object.keys(value as Record<string,unknown>).sort()){
    output[key]=canonicalize((value as Record<string,unknown>)[key]);
  }
  return output;
}

function flatten(
  value:unknown,
  path:string,
  rows:Array<[string,string]>
){
  if(value===null){
    rows.push([path,"null"]);
    return;
  }

  if(Array.isArray(value)){
    if(value.length===0){
      rows.push([path,"[]"]);
      return;
    }
    value.forEach((item,index)=>flatten(
      item,
      path+"["+index+"]",
      rows
    ));
    return;
  }

  if(typeof value==="object"){
    const entries=Object.entries(value as Record<string,unknown>);
    if(entries.length===0){
      rows.push([path,"{}"]);
      return;
    }
    for(const [key,item] of entries){
      flatten(item,path?path+"."+key:key,rows);
    }
    return;
  }

  rows.push([path,String(value)]);
}

function safeSpreadsheetValue(value:string){
  if(/^[\t\r\n ]*[=+\-@]/.test(value)){
    return "'"+value;
  }
  return value;
}

function csvCell(value:string){
  if(/[",\r\n]/.test(value)){
    return '"'+value.replace(/"/g,'""')+'"';
  }
  return value;
}

function checksum(content:Buffer){
  return createHash("sha256").update(content).digest("hex");
}
