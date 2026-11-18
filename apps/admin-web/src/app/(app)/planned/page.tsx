export default function Planned() {
  const items = ["Editing organization details", "Per-project routing rules", "Provider credentials and health checks", "Legal documents", "Support ticket oversight", "Webhook and delivery monitoring"];
  return (
    <>
      <div className="pagehead"><h1>Not built yet</h1><p>These areas are part of the product plan but have no screens or API in this version.</p></div>
      <div className="card"><ul>{items.map((i) => <li key={i}>{i}</li>)}</ul></div>
    </>
  );
}
