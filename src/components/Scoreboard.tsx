import { useState } from 'react'

type Bases = { first: boolean; second: boolean; third: boolean }

export function Scoreboard() {
  const [home, setHome] = useState(0)
  const [away, setAway] = useState(0)
  const [bases, setBases] = useState<Bases>({ first: false, second: false, third: false })
  const [outs, setOuts] = useState(0)
  const [inning, setInning] = useState(1)
  const [top, setTop] = useState(true) // true = alta, false = baja
  // Desglose de outs y jugadas situacionales
  const [k, setK] = useState(0)
  const [gb, setGB] = useState(0)
  const [fb, setFB] = useState(0)
  const [ld, setLD] = useState(0)
  const [dp, setDP] = useState(0)
  const [sf, setSF] = useState(0)

  function addRun(team: 'home' | 'away') {
    if (team === 'home') setHome(h => h + 1)
    else setAway(a => a + 1)
  }

  function toggleBase(which: keyof Bases) {
    setBases(b => ({ ...b, [which]: !b[which] }))
  }

  function addOut() {
    setOuts(o => {
      if (o + 1 >= 3) {
        // cambia mitad de inning
        setTop(t => !t)
        return 0
      }
      return o + 1
    })
  }

  function nextInning() {
    setInning(i => i + 1)
    setTop(true)
    setOuts(0)
    setBases({ first: false, second: false, third: false })
  }

  return (
    <section className="card scoreboard" aria-label="Marcador de bA©isbol">
      <header>
        <h1 className="h1">Baseball Simulator</h1>
        <p className="muted">Inning {inning} A· {top ? 'Alta' : 'Baja'} A· Outs: {outs}</p>
      </header>

      <div className="teamRow">
        <span className="name">Home</span>
        <span className="score" aria-live="polite">{home}</span>
        <button className="button" onClick={() => addRun('home')}>+1</button>
      </div>

      <div className="teamRow">
        <span className="name">Away</span>
        <span className="score" aria-live="polite">{away}</span>
        <button className="button secondary" onClick={() => addRun('away')}>+1</button>
      </div>

      <div>
        <h2 className="h2">Bases</h2>
        <div className="bases">
          <div className={`base second ${bases.second ? 'active' : ''}`} />
          <div className={`base third  ${bases.third  ? 'active' : ''}`} />
          <div className={`base first  ${bases.first  ? 'active' : ''}`} />
          <div className={`base home`} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button className="button" onClick={() => toggleBase('first')}>1B</button>
          <button className="button" onClick={() => toggleBase('second')}>2B</button>
          <button className="button" onClick={() => toggleBase('third')}>3B</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="button" onClick={addOut}>Out</button>
        <button className="button" onClick={nextInning}>Siguiente inning</button>
      </div>
      
      {/* Desglose de outs y jugadas situacionales */}
      <div className="card" style={{ marginTop: 12, padding: 12 }}>
        <h3 className="h2">Detalle de outs</h3>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span>K: {k}</span>
            <button className="button small" onClick={() => { setK(k+1); setOuts(o=> (o+1)%3) }}>+K</button>
            <span>GB: {gb}</span>
            <button className="button small" onClick={() => { setGB(gb+1); setOuts(o=> (o+1)%3) }}>+GB</button>
            <span>FB: {fb}</span>
            <button className="button small" onClick={() => { setFB(fb+1); setOuts(o=> (o+1)%3) }}>+FB</button>
            <span>LD: {ld}</span>
            <button className="button small" onClick={() => { setLD(ld+1); setOuts(o=> (o+1)%3) }}>+LD</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span>DP: {dp}</span>
            <button className="button small" onClick={() => { setDP(dp+1); /* 2 outs */ setOuts(o=> (o+2)%3) }}>+DP</button>
            <span>SF: {sf}</span>
            <button className="button small" onClick={() => { setSF(sf+1); setOuts(o=> (o+1)%3) }}>+SF</button>
          </div>
          <div>
            <button className="button secondary" onClick={() => { setK(0); setGB(0); setFB(0); setLD(0); setDP(0); setSF(0); }}>Reset detalle</button>
          </div>
        </div>
      </div>
    </section>
  )
}

