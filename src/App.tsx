import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { AgendaPage } from "./pages/AgendaPage";
import { AgentPage } from "./pages/AgentPage";
import { CashPage } from "./pages/CashPage";
import { ChatPage } from "./pages/ChatPage";
import { InventoryPage } from "./pages/InventoryPage";
import { PatientsPage } from "./pages/PatientsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/agenda" replace />} />
        <Route path="agenda" element={<AgendaPage />} />
        <Route path="agente" element={<AgentPage />} />
        <Route path="pacientes" element={<PatientsPage />} />
        <Route path="caja" element={<CashPage />} />
        <Route path="inventario" element={<InventoryPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="*" element={<Navigate to="/agenda" replace />} />
      </Route>
    </Routes>
  );
}
