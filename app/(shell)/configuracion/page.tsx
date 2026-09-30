import { Bot, Building2, Clock3, FileText, MapPin, MessageCircle, ShieldCheck, Stethoscope, UsersRound } from "lucide-react";

const sections = [
  { title: "Información de la clínica", description: "Datos generales, identidad y canales de contacto.", icon: Building2 },
  { title: "Usuarios y roles", description: "Equipo administrativo, secretarias y asignación de roles.", icon: UsersRound },
  { title: "Horarios de atención", description: "Jornadas, días de atención y excepciones.", icon: Clock3 },
  { title: "Sedes", description: "Ubicaciones y datos de cada sede de la clínica.", icon: MapPin },
  { title: "Servicios", description: "Catálogo de tratamientos y servicios disponibles.", icon: Stethoscope },
  { title: "Permisos", description: "Acceso a módulos y acciones según el rol.", icon: ShieldCheck },
  { title: "Plantillas", description: "Mensajes de bienvenida, confirmaciones y recordatorios.", icon: FileText },
  { title: "Integración WhatsApp", description: "Conexión del canal y parámetros de integración.", icon: MessageCircle },
  { title: "Agente IA", description: "Instrucciones, atención automática y criterios de derivación.", icon: Bot },
];

export default function SettingsPage() {
  return <section className="page settings-page">
    <div className="page-heading"><div><h1>Configuración</h1><p>Administración global de la clínica</p></div></div>
    <div className="settings-intro"><ShieldCheck size={22} aria-hidden="true" /><div><strong>Espacio del administrador</strong><p>Vista previa de las áreas de configuración. La edición y el control de permisos aún no están conectados.</p></div></div>
    <div className="settings-grid">{sections.map(({ title, description, icon: Icon }) => <article className="settings-card" key={title}><Icon size={24} aria-hidden="true" /><h2>{title}</h2><p>{description}</p><span>Próximamente</span></article>)}</div>
  </section>;
}
