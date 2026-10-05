"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, CalendarDays, MessageCircle, RotateCcw, Send, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import styles from "./AgentPage.module.css";

type HelpAction = { label: string; href: string } | null;
type HelpMessage = { id: number; question: string; answer: string; action: HelpAction };

const prompts = [
  "¿Cómo creo una cita?",
  "¿Se envían mensajes por WhatsApp?",
  "¿Dónde reviso los leads?",
];

function answerFor(question: string): { answer: string; action: HelpAction } {
  const normalized = question.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");

  if (/cita|agenda|reserv/.test(normalized)) {
    return {
      answer: "Abre Agenda para consultar las citas. En modo demo, puedes crear una desde Conversaciones al elegir un contacto. La ayuda no reserva ni modifica citas por su cuenta.",
      action: { label: "Abrir Agenda", href: "/agenda" },
    };
  }
  if (/whatsapp|telegram|mensaje|convers/.test(normalized)) {
    return {
      answer: "Conversaciones es una demostración local. Los mensajes que agregues allí no se transmiten por WhatsApp ni Telegram; en modo API la vista no carga mensajes ficticios.",
      action: { label: "Abrir Conversaciones", href: "/chat" },
    };
  }
  if (/lead|paciente|contact/.test(normalized)) {
    return {
      answer: "Los leads se consultan desde Pacientes, en la pestaña Leads. Desde allí puedes abrir su ficha y continuar el seguimiento disponible para tu perfil.",
      action: { label: "Ver leads", href: "/pacientes?tab=leads" },
    };
  }
  if (/ayuda|asistente|funcion|puedes|demo|ia|automatic/.test(normalized)) {
    return {
      answer: "Esta pantalla es una ayuda de demostración con respuestas predefinidas. No usa IA, no consulta APIs y no ejecuta acciones. Usa los accesos de la página para abrir Agenda, Leads o Conversaciones.",
      action: null,
    };
  }
  return {
    answer: "Puedo orientar sobre citas, leads y Conversaciones. Estas respuestas son predefinidas y no realizan cambios; elige un acceso para continuar en la pantalla correspondiente.",
    action: null,
  };
}

export function AgentPage() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [sequence, setSequence] = useState(0);

  const ask = (value: string) => {
    const cleanQuestion = value.trim();
    if (!cleanQuestion) return;
    const result = answerFor(cleanQuestion);
    setMessages((current) => [...current, { id: sequence + 1, question: cleanQuestion, ...result }]);
    setSequence((current) => current + 1);
    setQuestion("");
  };

  const submitQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    ask(question);
  };

  return (
    <section className={`page ${styles.page}`}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Centro de ayuda</p>
          <h1>Guía de flujos</h1>
          <p className={styles.subtitle}>Respuestas para los flujos de OdontoFlow.</p>
        </div>
        <Badge tone="slate">Demo local</Badge>
      </header>

      <p className={styles.disclosure} role="note">
        Asistente mock con respuestas predefinidas. No usa IA ni APIs y no ejecuta acciones.
      </p>

      <div className={styles.workspace}>
        <nav className={styles.shortcuts} aria-label="Accesos de trabajo">
          <h2>Ir a una sección</h2>
          <button type="button" onClick={() => router.push("/agenda")}>
            <span className={styles.shortcutIcon}><CalendarDays size={18} /></span>
            <span><strong>Agenda</strong><small>Consultar y organizar citas</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => router.push("/pacientes?tab=leads")}>
            <span className={styles.shortcutIcon}><Users size={18} /></span>
            <span><strong>Leads</strong><small>Revisar contactos interesados</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => router.push("/chat")}>
            <span className={styles.shortcutIcon}><MessageCircle size={18} /></span>
            <span><strong>Conversaciones</strong><small>Mensajes locales de demo</small></span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </nav>

        <section className={styles.assistant} aria-labelledby="assistant-title">
          <header className={styles.assistantHeader}>
            <div><h2 id="assistant-title">Asistente de ayuda</h2><p>Consulta cómo continuar un flujo.</p></div>
            {messages.length > 0 && <Button compact icon={RotateCcw} onClick={() => setMessages([])}>Borrar conversación</Button>}
          </header>

          <div className={styles.transcript} role="log" aria-live="polite" aria-label="Conversación con el asistente mock">
            {messages.length === 0 ? (
              <div className={styles.welcome}>
                <span className={styles.welcomeIcon}><MessageCircle size={21} /></span>
                <div><strong>¿Qué necesitas resolver?</strong><p>Prueba una consulta frecuente o escribe tu pregunta.</p></div>
                <div className={styles.promptList}>
                  {prompts.map((prompt) => <button type="button" key={prompt} onClick={() => ask(prompt)}>{prompt}<ArrowRight size={15} /></button>)}
                </div>
              </div>
            ) : messages.map((message) => (
              <article className={styles.exchange} key={message.id}>
                <p className={styles.question}>{message.question}</p>
                <div className={styles.answer}>
                  <span className={styles.answerLabel}>Ayuda demo</span>
                  <p>{message.answer}</p>
                  {message.action && <Button compact onClick={() => router.push(message.action!.href)}>{message.action.label}<ArrowRight size={15} /></Button>}
                </div>
              </article>
            ))}
          </div>

          <form className={styles.composer} onSubmit={submitQuestion}>
            <input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={240} aria-label="Pregunta para la ayuda demo" placeholder="Escribe una pregunta sobre citas, leads o mensajes" />
            <Button type="submit" variant="primary" icon={Send} aria-label="Consultar ayuda demo" disabled={!question.trim()} />
          </form>
        </section>
      </div>
    </section>
  );
}
