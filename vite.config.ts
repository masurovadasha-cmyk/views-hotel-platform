import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import {execFileSync} from 'node:child_process';
import release from './release.config.json';
const releaseMetadata:Plugin={name:'views-release-metadata',generateBundle(){
 const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const sourceDirty=!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();
 this.emitFile({type:'asset',fileName:'release.json',source:JSON.stringify({...release,sourceCommit,sourceDirty,emailConnected:false,corePublic:false})});
}};
const androidBuildTarget:Plugin={
  name:"android-build-target",
  generateBundle(){this.emitFile({type:"asset",fileName:"android-build.json",source:JSON.stringify({schemaVersion:1,target:"chrome74",mode:"static-demo"})});}
};
export default defineConfig(({mode})=>({
  plugins:[react(),releaseMetadata,...(mode==="android"?[androidBuildTarget]:[])],
  define:{'import.meta.env.VITE_RELEASE_REVIEW':JSON.stringify(mode==='review'||mode==='android'?'true':'false')},
  build:{outDir:mode==="android"?"dist-android":"dist",sourcemap:true,...(mode==="android"?{target:"chrome74"}:{})}
}));
