/* eslint-disable @next/next/no-img-element -- MFA QR is a private data URI. */
"use client";
import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { securityAction } from "./actions";
function Fields({children}:{children:React.ReactNode}){const {pending}=useFormStatus();return <fieldset disabled={pending} className="security-fields">{children}</fieldset>;}
function Submit({children,danger=false}:{children:React.ReactNode;danger?:boolean}){const {pending}=useFormStatus();return <button className={danger?'security-button security-danger':'security-button'} disabled={pending}>{pending?'Please wait…':children}</button>;}
export function SecurityForm({factors,manage=false}:{factors:{id:string;name:string}[];manage?:boolean}){
 const [state,action]=useFormState(securityAction,{});
 const [removing,setRemoving]=useState(false);
 const enrolling=!!state.qr&&!!state.factorId;
 const enabled=factors.length>0;
 return <form action={action} className="security-form"><Fields>
 {manage&&<input type="hidden" name="manage" value="yes"/>}
 {state.error&&<p role="alert" className="security-alert security-error">{state.error}</p>}
 {manage&&enabled&&!removing?<>
 <div className="security-status"><span className="security-dot"/><div><strong>Authenticator enabled</strong><p>Your account has an extra layer of protection.</p></div></div>
 <div className="security-device"><span aria-hidden="true">▣</span><div><strong>{factors[0]?.name}</strong><p>Use your authenticator app for sign-in codes.</p></div></div>
 <button type="button" className="security-remove" onClick={()=>setRemoving(true)}>Remove authenticator</button>
 </>:<>
 {enrolling?<div className="security-setup"><p>Scan this code with Google Authenticator, Microsoft Authenticator, or another authenticator app.</p><div className="security-qr"><img src={state.qr?.startsWith('data:')?state.qr:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(state.qr??'')}`} width={200} height={200} alt="Scan to set up your authenticator"/></div><p className="security-hint">Then enter the six-digit code shown in your app.</p></div>:removing?<p className="security-alert">Enter a fresh code to remove your authenticator. Hosting administrators will need to set one up again before opening Hosting.</p>:<p className="security-description">{enabled?'Open your authenticator app and enter your current code to continue.':'Protect your account with a code from your phone. Setup takes about a minute.'}</p>}
 {enrolling||enabled?<>
 <input type="hidden" name="action" value={removing?'remove':'verify'}/>
 {enrolling?<input type="hidden" name="factor_id" value={state.factorId}/>:<label className="security-label">Authenticator<select name="factor_id" className="security-input">{factors.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
 <label className="security-label" htmlFor="mfa-code">Verification code</label>
 <input id="mfa-code" name="code" className="security-input security-code" placeholder="000000" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required aria-describedby="code-help"/>
 <p id="code-help" className="security-hint">Codes change regularly. Use the latest one.</p>
 {removing&&<label className="security-confirm"><input type="checkbox" name="confirm" value="yes" required/>I want to remove this authenticator.</label>}
 <Submit danger={removing}>{removing?'Confirm removal':enrolling?'Enable authenticator':'Verify and continue'}</Submit>
 {removing&&<button type="button" className="security-link" onClick={()=>setRemoving(false)}>Cancel</button>}
 </>:<><input type="hidden" name="action" value="enroll"/><div className="security-steps"><p><b>1</b> Open an authenticator app</p><p><b>2</b> Scan your private QR code</p><p><b>3</b> Enter a code to finish</p></div><Submit>Set up authenticator</Submit></>}
 </>}
 </Fields></form>;
}
