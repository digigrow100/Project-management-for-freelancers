'use client';
export default function PaymentError({ reset }: {
    reset: () => void;
}) { return <section className="website-empty" role="alert"><h1>Payment review was not confirmed</h1><p>Refresh the list and check its current status before retrying. Approving the same notice twice never grants another website.</p><button className="hms-dash-primary" onClick={reset}>Reload payment list</button></section>; }
