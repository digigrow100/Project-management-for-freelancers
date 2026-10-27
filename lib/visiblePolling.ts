/** Browser polling only. No auth/session or server data is cached here. */
export function startVisiblePolling<T>(url:string,onData:(data:T)=>void,interval=60000) {
  let stopped=false,busy=false,failures=0;
  let timer:ReturnType<typeof setTimeout>|undefined;
  let controller:AbortController|undefined;
  let nextAt=0;
  function schedule(delay:number){
    clearTimeout(timer);
    if(stopped)return;
    nextAt=Date.now()+delay;
    if(document.visibilityState==='visible')timer=setTimeout(()=>void poll(),delay);
  }
  async function poll(){
    if(stopped||busy||document.visibilityState!=='visible')return;
    busy=true;controller=new AbortController();let delay=interval,timedOut=false;
    const current=controller;
    const timeout=setTimeout(()=>{timedOut=true;current.abort();},20000);
    try{
      const response=await fetch(url,{cache:'no-store',signal:current.signal});
      if(response.status===401||response.status===403){stop();return;}
      if(!response.ok){
        failures++;delay=Math.min(900000,interval*2**Math.min(failures,8));
        if(response.status===402)delay=Math.max(delay,900000);
        const retry=response.headers.get('Retry-After');
        if(retry){const seconds=Number(retry);const wait=Number.isFinite(seconds)?seconds*1000:Date.parse(retry)-Date.now();if(Number.isFinite(wait)&&wait>0)delay=Math.max(delay,Math.min(wait,3600000));}
      }else{
        const data=await response.json() as T;
        if(!stopped&&!current.signal.aborted&&document.visibilityState==='visible'){onData(data);failures=0;}
      }
    }catch{
      if(!current.signal.aborted||timedOut){failures++;delay=Math.min(900000,interval*2**Math.min(failures,8));}
    }finally{
      clearTimeout(timeout);busy=false;
      if(controller===current)controller=undefined;
      schedule(delay);
    }
  }
  function visibility(){
    clearTimeout(timer);
    if(document.visibilityState!=='visible')controller?.abort();
    else if(!busy){if(Date.now()<nextAt)schedule(nextAt-Date.now());else void poll();}
  }
  function stop(){stopped=true;clearTimeout(timer);controller?.abort();document.removeEventListener('visibilitychange',visibility);}
  document.addEventListener('visibilitychange',visibility);
  // Initial data already comes from the authenticated server render.
  schedule(interval);
  return stop;
}
