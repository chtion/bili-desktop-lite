'use strict';
const {spawn}=require('node:child_process');

// Use the account already configured in Git when the user checks a private Release.
// The credential only lives in this process, and Git cannot prompt during a check.
function readGitHubCredential(repository,cwd) {
  return new Promise(resolve=>{
    const child=spawn('git',['credential','fill'],{
      cwd,windowsHide:true,stdio:['pipe','pipe','ignore'],
      env:{...process.env,GIT_TERMINAL_PROMPT:'0',GCM_INTERACTIVE:'never',GIT_TRACE:'0',GCM_TRACE:'0',GIT_TRACE_CURL:'0'}
    });
    let output='',finished=false;
    const finish=value=>{if(finished)return;finished=true;clearTimeout(timeout);output='';resolve(value);};
    const timeout=setTimeout(()=>{child.kill();finish(null);},6500);
    child.once('error',()=>finish(null));
    child.stdin.on('error',()=>{});
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',chunk=>{
      if(finished)return;
      output+=chunk;
      if(output.length>16384){child.kill();finish(null);}
    });
    child.once('close',code=>{
      const match=code===0?output.match(/^password=([^\r\n]+)$/m):null;
      finish(match?.[1]||null);
    });
    child.stdin.end(`protocol=https\nhost=github.com\npath=${repository}.git\n\n`);
  });
}
module.exports={readGitHubCredential};
