import { memo } from "react";
import type { LogEntry, PointRecord } from "../../../server/src/protocol";

/* Tabela dinâmica: uma linha é inserida a cada ponto e todas são removidas na revanche */
export const PointsTable = memo(function PointsTable({ history }: { history: PointRecord[] }) {
  return (
    <section className="card side-card">
      <h2>Pontos da partida</h2>
      <table className="points-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Marcou</th>
            <th>Placar</th>
          </tr>
        </thead>
        <tbody>
          {history.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={3}>Nenhum ponto ainda</td>
            </tr>
          ) : (
            history.map((point) => (
              <tr key={point.number} className={`row-in ${point.scorer}`}>
                <td>{point.number}</td>
                <td>{point.scorerName}</td>
                <td>
                  {point.left} x {point.right}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
});

/* Lista dinâmica: eventos entram no fim e os mais antigos são removidos pelo servidor */
export const EventLog = memo(function EventLog({ log }: { log: LogEntry[] }) {
  return (
    <section className="card side-card">
      <h2>Últimos eventos</h2>
      <ul className="event-log">
        {log.map((entry) => (
          <li key={entry.id} className="row-in">
            {entry.text}
          </li>
        ))}
      </ul>
    </section>
  );
});
