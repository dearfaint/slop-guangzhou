import { sirenLevel } from './vehicle-model.ts';
export class PoliceSiren {
 private context?:AudioContext;private oscillator?:OscillatorNode;private gain?:GainNode;
 private visibility=()=>{if(document.hidden)void this.context?.suspend();else if(this.enabled)void this.context?.resume().catch(()=>{});};
 enabled=false;
 constructor(){document.addEventListener('visibilitychange',this.visibility);}
 async setEnabled(enabled:boolean){
  if(!enabled){this.enabled=false;if(this.gain)this.gain.gain.value=0;await this.context?.suspend();return;}
  if(!this.context){
   this.context=new AudioContext();this.gain=this.context.createGain();this.gain.gain.value=0;
   this.oscillator=this.context.createOscillator();this.oscillator.type='triangle';this.oscillator.connect(this.gain);this.gain.connect(this.context.destination);this.oscillator.start();
  }
  await this.context.resume();this.enabled=true;
 }
 update(distance:number,time:number){
  if(!this.enabled||!this.context||!this.gain||!this.oscillator)return;
  const now=this.context.currentTime;
  this.oscillator.frequency.setTargetAtTime(780+420*Math.sin(time*Math.PI),now,.035);
  this.gain.gain.setTargetAtTime(document.hidden?0:sirenLevel(distance),now,.08);
 }
 dispose(){document.removeEventListener('visibilitychange',this.visibility);this.enabled=false;this.oscillator?.stop();void this.context?.close();}
}
