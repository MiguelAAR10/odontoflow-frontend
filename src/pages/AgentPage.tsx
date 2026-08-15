import { useEffect, useMemo, useState } from "react";
import { Bot, CalendarDays, CheckCircle2, Clock3, MessageCircleMore, Settings, Users } from "lucide-react";
import { getAgentDashboard } from "../api";
import { Badge, statusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { KpiCard } from "../components/KpiCard";
import { Modal } from "../components/Modal";
import type { AgentActivity, Automation, HumanQueueItem } from "../types";

const activityIcons = { clock: Clock3, check: CheckCircle2, message: MessageCircleMore, users: Users };

export function AgentPage() {
  const [activity, setActivity] = useState<AgentActivity[]>([]);
  const [queue, setQueue] = useState<HumanQueueItem[]>([]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [tab, setTab] = useState("Todas");
  const [day, setDay] = useState("Hoy");
  const [configOpen, setConfigOpen] = useState(false);
  const [taken, setTaken] = useState<HumanQueueItem | null>(null);

  useEffect(() => { void getAgentDashboard().then((data) => { setActivity(data.activity); setQueue(data.queue); setAutomations(data.automations); }); }, []);
  const filtered = useMemo(() => tab === "Todas" ? activity : activity.filter((item) => item.kind === tab), [activity, tab]);

  const takeConversation = (item: HumanQueueItem) => {
    setQueue((current) => current.filter((queued) => queued.id !== item.id));
    setTaken(item);
  };

  return (
    <section className="page">
      <div className="page-heading page-heading--with-actions">
        <div><h1>Agente IA</h1><p>Seguimiento automático de pacientes y citas</p></div>
        <div className="heading-actions"><span className="agent-active"><i />Activo</span><Button icon={Settings} onClick={() => setConfigOpen(true)}>Configurar agente</Button></div>
      </div>
      <div className="kpi-grid">
        <KpiCard icon={MessageCircleMore} value={24} label="Conversaciones hoy" tone="blue" />
        <KpiCard icon={CalendarDays} value={8} label="Citas generadas" tone="cyan" />
        <KpiCard icon={Clock3} value={5} label="Esperando respuesta" tone="amber" />
        <KpiCard icon={Users} value={3} label="Derivados a una persona" tone="purple" />
      </div>

      <div className="agent-workspace">
        <div className="agent-left">
          <section className="panel agent-activity">
            <div className="panel-header"><h2>Actividad del agente</h2><div className="tabs">{["Todas", "Citas", "Leads"].map((label) => <button key={label} onClick={() => setTab(label)} className={tab === label ? "tab--active" : ""}>{label}</button>)}</div><select value={day} onChange={(event) => setDay(event.target.value)} aria-label="Filtrar por fecha"><option>Hoy</option><option>Ayer</option><option>Esta semana</option></select></div>
            <div className="activity-list">
              {filtered.length ? filtered.map((item) => {
                const Icon = activityIcons[item.icon];
                return <div className="activity-row" key={`${item.time}-${item.patient}`}>
                  <time>{item.time}</time><Icon className={`text-${item.tone}`} size={24} />
                  <strong>{item.action}</strong><span className="person-inline"><span className={`avatar avatar--${item.tone}`}>{item.initials}</span>{item.patient}</span>
                  <span className="whatsapp-inline"><MessageCircleMore size={18} />{item.channel}</span><Badge tone={statusTone(item.status)}>{item.status}</Badge>
                </div>;
              }) : <div className="empty-state">No hay actividad para este filtro.</div>}
            </div>
          </section>

          <section className="panel automations-panel">
            <h2>Automatizaciones de hoy</h2>
            <div className="automation-flow">
              {automations.map((item, index) => <article className={`automation-step automation-step--${item.state}`} key={`${item.time}-${item.title}`}>
                <strong>{item.time}</strong><span>{item.title}</span><footer>{item.state === "done" ? <CheckCircle2 /> : <Clock3 />}{item.note}</footer>{index < automations.length - 1 && <i className="automation-link" />}
              </article>)}
            </div>
          </section>
        </div>

        <section className="panel human-panel">
          <h2>Atención humana <span className="count-badge">{queue.length}</span></h2>
          <div className="human-list">
            {queue.length ? queue.map((item) => <article className="human-card" key={item.id}>
              <span className={`avatar avatar--${item.tone}`}>{item.initials}</span>
              <div><strong>{item.name}</strong><span>{item.reason}</span><small><Clock3 size={14} />{item.waiting}</small></div>
              <Button compact onClick={() => takeConversation(item)}>Tomar conversación</Button>
            </article>) : <div className="empty-state"><CheckCircle2 size={30} /><strong>Cola atendida</strong><span>No hay conversaciones pendientes.</span></div>}
          </div>
        </section>
      </div>

      <Modal title="Configurar agente" open={configOpen} onClose={() => setConfigOpen(false)}>
        <div className="settings-list">
          <label><span><strong>Confirmaciones automáticas</strong><small>Contactar un día antes de la cita</small></span><input type="checkbox" defaultChecked /></label>
          <label><span><strong>Segundo intento</strong><small>Reintentar con pacientes sin respuesta</small></span><input type="checkbox" defaultChecked /></label>
          <label><span><strong>Derivación humana</strong><small>Transferir casos sensibles al equipo</small></span><input type="checkbox" defaultChecked /></label>
          <div className="form-actions"><Button onClick={() => setConfigOpen(false)}>Cancelar</Button><Button variant="primary" icon={Bot} onClick={() => setConfigOpen(false)}>Guardar configuración</Button></div>
        </div>
      </Modal>
      <Modal title="Conversación asignada" open={Boolean(taken)} onClose={() => setTaken(null)} size="small">
        {taken && <div className="confirmation-message"><CheckCircle2 /><p>Ahora estás atendiendo la conversación de <strong>{taken.name}</strong>.</p><Button variant="primary" onClick={() => setTaken(null)}>Entendido</Button></div>}
      </Modal>
    </section>
  );
}
