import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
const androidBuildTarget:Plugin={
  name:"android-build-target",
  generateBundle(){this.emitFile({type:"asset",fileName:"android-build.json",source:JSON.stringify({schemaVersion:1,target:"chrome74",mode:"static-demo"})});}
};
export default defineConfig(({mode})=>({
  plugins:[react(),...(mode==="android"?[androidBuildTarget]:[])],
  build:{sourcemap:true,...(mode==="android"?{target:"chrome74"}:{})}
}));
