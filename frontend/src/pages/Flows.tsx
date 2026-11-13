import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ACTORS, FLOWS, type Flow } from "../data/flows";
import { usePageTitle } from "../components/ui";

const Who = ({ a }: { a: string }) => (
  <span className="fc-who" style={{ ["--who" as string]: ACTORS[a][1] }}>
    {ACTORS[a][0]}
  </span>
);

function FlowCard({ f }: { f: Flow }) {
  const actors = [...new Set(f.steps.map((s) => s.a))];
  return (
    <div className="panel">
      <div className="panel-b grid" style={{ gap: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <span className="tag">{f.ref}</span>
          <span className="small muted">{f.steps.length} steps</span>
        </div>
        <Link to={`/flows/${f.id}`} style={{ color: "inherit", textDecoration: "none" }}>
          <h2>{f.title}</h2>
        </Link>
        <p className="small muted" style={{ margin: 0 }}>
          {f.sub}
        </p>
        <div className="row" style={{ gap: 6 }}>
          {actors.map((a) => (
            <Who key={a} a={a} />
          ))}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <Link className="btn sm pri" to={`/flows/${f.id}`}>
            Open flow
          </Link>
          {f.try && (
            <Link className="btn sm" to={f.try[0]}>
              Try it in the console
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Library() {
  usePageTitle("Flows", "Full Plan section 12 · click a flow, then a step");
  return (
    <>
      <div className="panel">
        <div className="panel-b row small" style={{ gap: 14 }}>
          <b>Who does each step:</b>
          {Object.keys(ACTORS).map((a) => (
            <Who key={a} a={a} />
          ))}
          <span className="spacer" />
          <Link className="btn sm" to="/triggers">
            Triggers A–R
          </Link>
        </div>
      </div>
      <div className="grid g3">
        {FLOWS.map((f) => (
          <FlowCard key={f.id} f={f} />
        ))}
      </div>
    </>
  );
}

function FlowView({ f }: { f: Flow }) {
  usePageTitle(f.title, "Flow · Full Plan " + f.ref);
  const [i, setI] = useState(0);
  const s = f.steps[i] ?? f.steps[0];
  const at = FLOWS.indexOf(f);
  const prev = FLOWS[at - 1];
  const next = FLOWS[at + 1];
  return (
    <>
      <div className="row">
        <Link className="btn sm" to="/flows">
          ← All flows
        </Link>
        {prev && (
          <Link className="btn sm" to={`/flows/${prev.id}`}>
            ‹ {prev.title}
          </Link>
        )}
        {next && (
          <Link className="btn sm" to={`/flows/${next.id}`}>
            {next.title} ›
          </Link>
        )}
        <span className="spacer" />
        {f.try && (
          <Link className="btn" to={f.try[0]}>
            Try it in the console
          </Link>
        )}
      </div>
      <div className="panel">
        <div className="panel-b small">
          {f.sub}
          {f.try && <span className="muted"> · {f.try[1]}</span>}
        </div>
      </div>
      <div className="fc-wrap">
        <div className="panel">
          <div className="panel-b fc">
            {f.steps.map((st, j) => (
              <div key={j}>
                <div className="fc-row">
                  <button
                    className={`fc-node ${st.k === "q" ? "q" : ""} ${st.k === "end" ? "end" : ""} ${j === i ? "on" : ""}`}
                    style={{ ["--who" as string]: ACTORS[st.a][1] }}
                    onClick={() => setI(j)}
                    aria-pressed={j === i}
                  >
                    <Who a={st.a} />
                    <b>
                      {st.k === "q" ? "◆ " : ""}
                      {st.t}
                    </b>
                  </button>
                  {st.br && (
                    <div className="fc-branch">
                      <span className="fc-lbl">{st.br.l} →</span>
                      <div className="fc-side">
                        {st.br.t} {st.br.go && <Link to={`/flows/${st.br.go}`}>Open flow</Link>}
                      </div>
                    </div>
                  )}
                </div>
                {j < f.steps.length - 1 && (
                  <div className="fc-arrow">
                    <span>{st.n ?? ""}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="panel fc-detail">
          <div className="panel-h">
            <span className="mono small muted">
              Step {i + 1} of {f.steps.length}
            </span>
            <span className="spacer" />
            <button className="btn sm" disabled={i === 0} onClick={() => setI(i - 1)}>
              ‹ Back
            </button>
            <button
              className="btn sm"
              disabled={i >= f.steps.length - 1}
              onClick={() => setI(i + 1)}
            >
              Next ›
            </button>
          </div>
          <div className="panel-b grid" style={{ gap: 12 }}>
            <Who a={s.a} />
            <h2>{s.t}</h2>
            {s.d && <p style={{ margin: 0 }}>{s.d}</p>}
            {s.br && (
              <div className="check">
                <i className="w">!</i>
                <span>
                  <b>If {s.br.l}:</b> {s.br.t}
                </span>
              </div>
            )}
            {(s.data || s.crm) && (
              <dl className="kv">
                {s.data && (
                  <>
                    <dt>Data written</dt>
                    <dd className="mono small">{s.data}</dd>
                  </>
                )}
                {s.crm && (
                  <>
                    <dt>CRM call</dt>
                    <dd className="mono small">
                      {s.crm} <span className="muted">(via outbox)</span>
                    </dd>
                  </>
                )}
              </dl>
            )}
            {s.msg && (
              <div>
                <div className="eyebrow">Customer sees</div>
                <div className="bub out" style={{ maxWidth: "100%", marginTop: 6 }}>
                  {s.msg}
                </div>
              </div>
            )}
            {s.go && (
              <Link className="btn sm" to={`/flows/${s.go}`}>
                Continue in the next flow ›
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function Flows() {
  const { id } = useParams();
  const f = FLOWS.find((x) => x.id === id);
  return f ? <FlowView key={f.id} f={f} /> : <Library />;
}
