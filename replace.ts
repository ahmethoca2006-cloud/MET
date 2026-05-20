import fs from "fs";

let code = fs.readFileSync("src/App.tsx", "utf8");
code = code.replace(/bg-slate-950/g, "bg-black");
code = code.replace(/bg-slate-900\/50/g, "bg-black");
code = code.replace(/bg-slate-900\/60/g, "bg-black/60");
code = code.replace(/bg-slate-900\/80/g, "bg-black/80");
code = code.replace(/bg-slate-900/g, "bg-black");
code = code.replace(/bg-slate-800/g, "bg-[#111]");
code = code.replace(/hover:bg-slate-700/g, "hover:bg-[#222]");
code = code.replace(/border-slate-800/g, "border-[#333]");
code = code.replace(/border-slate-700/g, "border-[#444]");
fs.writeFileSync("src/App.tsx", code);
console.log("Done");
