export function Row({ name, value }: { name: string; value: number }) {
  return (
    <div className="teamRow">
      <span className="name">{name}</span>
      <span className="score" aria-live="polite">
        {value}
      </span>
    </div>
  );
}

