export function optimisticUpdate<T extends {version:number}>(current:T,expectedVersion:number,patch:Partial<T>){
  if(current.version!==expectedVersion)throw new Error("VERSION_CONFLICT");
  return {...current,...patch,version:current.version+1};
}
