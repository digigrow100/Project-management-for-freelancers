"use client";

import { useEffect, useState } from "react";
import { FRAMEWORKS, type Framework } from "@/lib/hosting/apps/validate";

const STEPS = ["Source", "Build", "Environment", "Domain", "Deploy"];
const BLURBS: Record<Framework, string> = {
  nextjs: "Next.js. Built on the server and started with npm start.",
  react: "React, Vite or Create React App. Published as static files.",
  vue: "Vue or Vite. Published as static files.",
  nuxt: "Nuxt. The Nitro server listens on port 3000.",
  node: "A Node app with an npm start script.",
  static: "HTML, CSS and files served as they are.",
  dockerfile: "The Dockerfile already in the repository.",
  image: "A Docker image to pull and run. No build.",
};

export function NewAppWizard({
  action, base, clients = [], initialStep = 0,
}: {
  action: (form: FormData) => void | Promise<void>;
  base: string;
  clients?: { id: string; name: string }[];
  initialStep?: number;
}) {
  const [step, setStep] = useState(initialStep);
  const [kind, setKind] = useState<"git" | "image">("git");
  const [framework, setFramework] = useState<Framework>("nextjs");
  useEffect(() => {
    if (kind === "image") setFramework("image");
    else setFramework((current) => current === "image" ? "nextjs" : current);
  }, [kind]);
  return <form className="hms-dash hms-wizard" action={action}>
    <header className="hms-dash-head"><div><p className="hms-kicker">New app</p><h1>Deploy a website</h1></div></header>
    <ol className="hms-steps">{STEPS.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
    <input type="hidden" name="return_base" value={base} />
    <fieldset hidden={step !== 0}>
      <label>App name<input name="name" required pattern="[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?" placeholder="acme-web" /></label>
      <label>Display name<input name="display_name" placeholder="Acme website" /></label>
      <div className="hms-choice"><label><input type="radio" name="source_kind" value="git" checked={kind === "git"} onChange={() => setKind("git")} />Git repository</label><label><input type="radio" name="source_kind" value="image" checked={kind === "image"} onChange={() => setKind("image")} />Docker image</label></div>
      {kind === "git" ? <><label>Repository URL<input name="source_url" placeholder="https://github.com/acme/web" /></label><label>Branch<input name="git_ref" placeholder="main" /></label><label>Deploy token<input name="git_token" type="password" autoComplete="off" placeholder="Only for a private repository" /></label><p className="hms-muted">Leave the token empty for a public repository. A token is encrypted and never shown again. Do not paste it into the URL.</p></> : <label>Image<input name="source_url" placeholder="ghcr.io/acme/web:1" /></label>}
    </fieldset>
    <fieldset hidden={step !== 1}>
      <div className="hms-frameworks">{FRAMEWORKS.map((item) => <label key={item}><input type="radio" name="framework" value={item} checked={framework === item} onChange={() => setFramework(item)} /><strong>{item}</strong><small>{BLURBS[item]}</small></label>)}</div>
      {framework === "dockerfile" ? <label>Dockerfile path<input name="dockerfile" defaultValue="Dockerfile" /></label> : null}
      <div className="hms-inline"><label>Port<input name="port" inputMode="numeric" placeholder="auto" /></label><label>CPU<input name="cpu" defaultValue="1" /></label><label>Memory MB<input name="memory_mb" defaultValue="512" /></label></div>
    </fieldset>
    <fieldset hidden={step !== 2}>
      <label>Environment variables<textarea name="env_text" rows={6} placeholder={"NEXT_PUBLIC_SITE=https://example.com"} /></label>
      <p className="hms-muted">One NAME=value on each line. These are encrypted at rest. They are not shown after you save them.</p>
    </fieldset>
    <fieldset hidden={step !== 3}>
      <label>Domain<input name="domain" placeholder="example.com" /></label>
      <label>www redirect<select name="redirect" defaultValue="none"><option value="none">No redirect</option><option value="www_to_apex">Redirect www to the apex</option><option value="apex_to_www">Redirect the apex to www</option></select></label>
      <p className="hms-muted">You can skip this and add the domain after the first deploy. The next screen shows the exact A or CNAME record.</p>
    </fieldset>
    <fieldset hidden={step !== 4}>
      {clients.length ? <label>Assign to a client<select name="client_id"><option value="">Unassigned</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label> : null}
      <p>The agent will clone or pull, build, and start a container on the proxy network. Nothing is marked live until DNS and the certificate check succeed.</p>
    </fieldset>
    <div className="hms-wizard-nav">{step > 0 ? <button type="button" className="hms-dash-secondary" onClick={() => setStep(step - 1)}>Back</button> : <span />}{step < 4 ? <button type="button" className="hms-dash-primary" onClick={() => setStep(step + 1)}>Continue</button> : <button className="hms-dash-primary" type="submit">Deploy</button>}</div>
  </form>;
}
