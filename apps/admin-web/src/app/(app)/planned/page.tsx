export default function Planned() {
  const items = ["Editing organization details", "Per-project routing rules", "Provider credentials and health checks", "Legal document publishing (needs counsel review first)", "Ticket replies from admin (done in the support console)"];
  return (
    <>
      <div className="pagehead"><h1>Not built yet</h1><p>These areas are part of the product plan but have no screens or API in this version.</p></div>
      <div className="card"><ul>{items.map((i) => <li key={i}>{i}</li>)}</ul></div>
    </>
  );
}
