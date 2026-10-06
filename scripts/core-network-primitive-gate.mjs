import {readdir,readFile} from "node:fs/promises";
import {join,relative,sep} from "node:path";
import {pathToFileURL} from "node:url";
import ts from "typescript";

const ROOT="apps/api/src";
const SAFE_NET=new Set(["BlockList","isIP","isIPv4","isIPv6"]);
const GLOBALS=new Set(["globalThis","global","window","self"]);
const GLOBAL_NETWORK=new Map([
  ["fetch","DIRECT_FETCH_FORBIDDEN"],
  ["WebSocket","DIRECT_WEBSOCKET_FORBIDDEN"],
  ["EventSource","DIRECT_EVENTSOURCE_FORBIDDEN"]
]);

function moduleCode(value){
  const name=value.replace(/^node:/,"");
  if(["http","https","http2"].includes(name))return "DIRECT_HTTP_IMPORT_FORBIDDEN";
  if(name==="net")return "DIRECT_NET_IMPORT_FORBIDDEN";
  if(name==="tls")return "DIRECT_TLS_IMPORT_FORBIDDEN";
  if(name==="dns"||name==="dns/promises")return "DIRECT_DNS_IMPORT_FORBIDDEN";
  if(name==="dgram")return "DIRECT_DGRAM_IMPORT_FORBIDDEN";
  if(["child_process","worker_threads","module","vm"].includes(name))return "NETWORK_ESCAPE_MODULE_FORBIDDEN";
  if(/^(undici|axios|got|node-fetch|cross-fetch|ws)(\/|$)/.test(name))return "DIRECT_HTTP_CLIENT_PACKAGE_FORBIDDEN";
  return null;
}

function text(node){
  return node&&(ts.isStringLiteralLike(node)||ts.isIdentifier(node))?node.text:null;
}

function member(node){
  if(ts.isPropertyAccessExpression(node))return {base:node.expression,key:node.name.text};
  if(ts.isElementAccessExpression(node))return {base:node.expression,key:text(node.argumentExpression)};
  return null;
}

// This is a source-policy linter, not a sandbox. The Docker network boundary
// remains authoritative, including for dependencies and arbitrary dynamic code.
export function inspectCoreNetworkSource(source,file="source.ts"){
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,
    file.endsWith(".tsx")?ts.ScriptKind.TSX:ts.ScriptKind.TS);
  const codes=new Set();
  const add=code=>{if(code)codes.add(code)};
  if(ast.parseDiagnostics.length)add("SOURCE_PARSE_FAILED");

  function checkModule(name,names=null){
    const code=moduleCode(name);
    if(code==="DIRECT_NET_IMPORT_FORBIDDEN"&&names?.length&&
       names.every(value=>SAFE_NET.has(value)))return;
    add(code);
  }

  function visit(node){
    // ImportTypeNode and other type syntax cannot open a runtime connection.
    if(ts.isTypeNode(node))return;
    if(ts.isImportDeclaration(node)){
      const clause=node.importClause;
      if(clause?.isTypeOnly)return;
      const bindings=clause?.namedBindings;
      const names=bindings&&ts.isNamedImports(bindings)&&!clause.name
        ?bindings.elements.filter(x=>!x.isTypeOnly).map(x=>text(x.propertyName||x.name))
        :null;
      checkModule(node.moduleSpecifier.text,names);
      return;
    }
    if(ts.isExportDeclaration(node)&&node.moduleSpecifier){
      if(node.isTypeOnly)return;
      const names=node.exportClause&&ts.isNamedExports(node.exportClause)
        ?node.exportClause.elements.filter(x=>!x.isTypeOnly).map(x=>text(x.propertyName||x.name))
        :null;
      checkModule(node.moduleSpecifier.text,names);
      return;
    }
    if(ts.isImportEqualsDeclaration(node)&&ts.isExternalModuleReference(node.moduleReference)){
      if(!node.isTypeOnly)checkModule(text(node.moduleReference.expression)||"");
      return;
    }
    if(ts.isCallExpression(node)){
      const callee=node.expression;
      const name=text(callee);
      if(callee.kind===ts.SyntaxKind.ImportKeyword||name==="require"){
        const arg=node.arguments[0];
        if(arg&&ts.isStringLiteralLike(arg))checkModule(arg.text);
        else add("DYNAMIC_MODULE_SPECIFIER_FORBIDDEN");
      }
      if(["eval","Function"].includes(name))add("DYNAMIC_CODE_FORBIDDEN");
    }
    if(ts.isNewExpression(node)&&text(node.expression)==="Function")add("DYNAMIC_CODE_FORBIDDEN");
    if(ts.isIdentifier(node)&&GLOBAL_NETWORK.has(node.text)){
      const parent=node.parent;
      // Declarations and object property names are not reads of the global.
      const declarationName=parent?.name===node&&(
        ts.isVariableDeclaration(parent)||ts.isParameter(parent)||
        ts.isFunctionDeclaration(parent)||ts.isMethodDeclaration(parent)||
        ts.isPropertyAssignment(parent)||ts.isPropertyDeclaration(parent)||
        ts.isBindingElement(parent));
      const propertyName=parent&&ts.isPropertyAccessExpression(parent)&&parent.name===node;
      if(!declarationName&&!propertyName)add(GLOBAL_NETWORK.get(node.text));
    }
    const access=member(node);
    if(access&&GLOBALS.has(text(access.base)))add(GLOBAL_NETWORK.get(access.key));
    if(access&&text(access.base)==="process"&&["getBuiltinModule","binding"].includes(access.key))
      add("NETWORK_ESCAPE_MODULE_FORBIDDEN");
    if(ts.isVariableDeclaration(node)&&node.initializer&&GLOBALS.has(text(node.initializer))&&
       ts.isObjectBindingPattern(node.name)){
      for(const item of node.name.elements)add(GLOBAL_NETWORK.get(text(item.propertyName||item.name)));
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);
  return [...codes].sort().map(code=>({code,file}));
}

export async function scanCoreNetworkPrimitives(root=ROOT,read=readFile,list=readdir){
  const files=[];
  async function walk(dir){
    for(const entry of await list(dir,{withFileTypes:true})){
      const path=join(dir,entry.name);
      if(entry.isSymbolicLink?.())throw new Error("CORE_SOURCE_SYMLINK_FORBIDDEN");
      if(entry.isDirectory())await walk(path);
      else if(entry.isFile()&&/\.tsx?$/.test(entry.name))files.push(path);
    }
  }
  await walk(root);
  const findings=[];
  let scannedFiles=0;
  for(const file of files.sort()){
    const normalized=relative(root,file).split(sep).join("/");
    if(normalized.startsWith("security/egress/")||/\.(test|spec|d)\.tsx?$/.test(normalized))continue;
    scannedFiles++;
    findings.push(...inspectCoreNetworkSource(await read(file,"utf8"),normalized));
  }
  if(!scannedFiles)throw new Error("CORE_SOURCE_FILES_REQUIRED");
  return {ok:findings.length===0,schemaVersion:2,parser:"typescript-ast",scannedFiles,findings};
}

export async function runCoreNetworkPrimitiveGate(argv=process.argv.slice(2),output=process.stdout){
  let root=ROOT;
  for(const arg of argv){
    if(!arg.startsWith("--root=")||!arg.slice(7).trim())throw new Error("INVALID_ARGUMENT");
    root=arg.slice(7).trim();
  }
  const result=await scanCoreNetworkPrimitives(root);
  output.write(JSON.stringify(result)+"\n");
  return result.ok?0:1;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  runCoreNetworkPrimitiveGate().then(code=>{process.exitCode=code},()=>{
    process.stderr.write(JSON.stringify({ok:false,error:"CORE_NETWORK_PRIMITIVE_GATE_ERROR"})+"\n");
    process.exitCode=2;
  });
}
