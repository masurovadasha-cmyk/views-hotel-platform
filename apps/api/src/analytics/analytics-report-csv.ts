type DashboardLike={
  schemaVersion?:number;
  scope?:Record<string,unknown>;
  period?:Record<string,unknown>;
  freshness?:Record<string,unknown>;
  kpisByCurrency?:Array<Record<string,unknown>>;
  lifecycleByCurrency?:Array<Record<string,unknown>>;
  marketplaceByCurrency?:Array<Record<string,unknown>>;
  geography?:Array<Record<string,unknown>>;
  channelSegmentBreakdown?:Array<Record<string,unknown>>;
  comparison?:Record<string,unknown>;
};

export function dashboardSummaryCsv(summary:DashboardLike){
  const rows:string[][]=[
    ["section","currency","dimension","metric","value"]
  ];

  addMetricObjects(rows,"hospitality",summary.kpisByCurrency??[],row=>String(row.currency??""));
  addMetricObjects(rows,"lifecycle",summary.lifecycleByCurrency??[],row=>String(row.currency??""));
  addMetricObjects(rows,"marketplace",summary.marketplaceByCurrency??[],row=>String(row.currency??""));

  for(const row of summary.geography??[]){
    const currency=String(row.currency??"");
    const dimension=[
      ["country",row.countryCode],
      ["region",row.regionCode],
      ["city",row.city]
    ]
      .filter(([,v])=>v!==null&&v!==undefined&&String(v)!=="")
      .map(([k,v])=>k+"="+String(v))
      .join(";");
    addObjectMetrics(rows,"geography",currency,dimension,row);
  }

  for(const row of summary.channelSegmentBreakdown??[]){
    const currency=String(row.currency??"");
    const dimension=[
      ["bookingChannel",row.bookingChannel],
      ["marketSegment",row.marketSegment]
    ]
      .map(([k,v])=>k+"="+(v===null||v===undefined?"":String(v)))
      .join(";");
    addObjectMetrics(rows,"channel_segment",currency,dimension,row);
  }

  return rows.map(row=>row.map(csvCell).join(",")).join("\r\n")+"\r\n";
}

function addMetricObjects(
  rows:string[][],
  section:string,
  values:Array<Record<string,unknown>>,
  currency:(row:Record<string,unknown>)=>string
){
  for(const row of values){
    addObjectMetrics(rows,section,currency(row),"",row);
  }
}

function addObjectMetrics(
  rows:string[][],
  section:string,
  currency:string,
  dimension:string,
  value:Record<string,unknown>
){
  const skip=new Set([
    "currency","countryCode","regionCode","city",
    "bookingChannel","marketSegment"
  ]);

  for(const key of Object.keys(value).sort()){
    if(skip.has(key))continue;
    const scalar=value[key];
    if(
      scalar===null||
      typeof scalar==="string"||
      typeof scalar==="number"||
      typeof scalar==="boolean"
    ){
      rows.push([
        section,currency,dimension,key,
        scalar===null?"":String(scalar)
      ]);
    }
  }
}

function csvCell(value:string){
  if(/[",\r\n]/.test(value)){
    return '"'+value.replace(/"/g,'""')+'"';
  }
  return value;
}
