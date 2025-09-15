export function Diamond({
  bases,
}: {
  bases: { first: boolean; second: boolean; third: boolean };
}) {
  return (
    <div className="bases">
      <div className={`base second ${bases.second ? "active" : ""}`} />
      <div className={`base third  ${bases.third ? "active" : ""}`} />
      <div className={`base first  ${bases.first ? "active" : ""}`} />
      <div className="base home" />
    </div>
  );
}

