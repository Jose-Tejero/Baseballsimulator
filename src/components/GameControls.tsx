type GameControlsProps = {
  auto: boolean;
  onStep: () => void;
  onAutoFree: () => void;
  onAutoHalf: () => void;
  onAutoGame: () => void;
  onStopAuto: () => void;
  onReset: () => void;
  delay: number;
  onDelayChange: (value: number) => void;
};

export function GameControls({
  auto,
  onStep,
  onAutoFree,
  onAutoHalf,
  onAutoGame,
  onStopAuto,
  onReset,
  delay,
  onDelayChange,
}: GameControlsProps) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="button" onClick={onStep}>
          Jugar 1 turno
        </button>
        {!auto ? (
          <>
            <button className="button secondary" onClick={onAutoFree}>
              Auto (libre)
            </button>
            <button className="button secondary" onClick={onAutoHalf}>
              Auto (media)
            </button>
            <button className="button secondary" onClick={onAutoGame}>
              Auto (juego)
            </button>
          </>
        ) : (
          <button className="button" onClick={onStopAuto}>
            Detener auto
          </button>
        )}
        <button className="button" onClick={onReset}>
          Reset
        </button>
      </div>
      <div className="field">
        <label>
          <strong>Velocidad auto (ms por turno): {delay}</strong>
        </label>
        <input
          type="range"
          min={50}
          max={1500}
          step={50}
          value={delay}
          onChange={(event) => onDelayChange(Number(event.target.value))}
        />
      </div>
    </div>
  );
}
