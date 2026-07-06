import { Navigate, Route, Routes } from "react-router-dom";
import Login from "./pages/Login";
import LawfulUse from "./pages/LawfulUse";
import Dashboard from "./pages/Dashboard";
import Cases from "./pages/Cases";
import Entities from "./pages/Entities";
import Collections from "./pages/Collections";
import Alerts from "./pages/Alerts";
import Reports from "./pages/Reports";
import GlobalAudit from "./pages/GlobalAudit";
import Resources from "./pages/Resources";
import Integrations from "./pages/Integrations";
import Settings from "./pages/Settings";
import Admin from "./pages/Admin";
import NewCaseWizard from "./pages/NewCaseWizard";
import ScanProgress from "./pages/ScanProgress";
import CaseLayout from "./pages/case/CaseLayout";
import Overview from "./pages/case/Overview";
import GraphView from "./pages/case/GraphView";
import Identity from "./pages/case/Identity";
import Conclusion from "./pages/case/Conclusion";
import Behaviour from "./pages/case/Behaviour";
import Timeline from "./pages/case/Timeline";
import MapView from "./pages/case/MapView";
import Evidence from "./pages/case/Evidence";
import Report from "./pages/case/Report";
import AuditLog from "./pages/case/AuditLog";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";

const P = ({ children }) => <ProtectedRoute>{children}</ProtectedRoute>;

export default function App() {
  const { isAuthed } = useAuth();
  return (
    <Routes>
      <Route path="/" element={<Navigate to={isAuthed ? "/dashboard" : "/login"} replace />} />
      <Route path="/login" element={<Login />} />
      <Route path="/lawful-use" element={<P><LawfulUse /></P>} />

      <Route path="/dashboard" element={<P><Dashboard /></P>} />
      <Route path="/cases" element={<P><Cases /></P>} />
      <Route path="/entities" element={<P><Entities /></P>} />
      <Route path="/collections" element={<P><Collections /></P>} />
      <Route path="/alerts" element={<P><Alerts /></P>} />
      <Route path="/reports" element={<P><Reports /></P>} />
      <Route path="/audit" element={<P><GlobalAudit /></P>} />
      <Route path="/integrations" element={<P><Integrations /></P>} />
      <Route path="/resources" element={<P><Resources /></P>} />
      <Route path="/settings" element={<P><Settings /></P>} />
      <Route path="/admin" element={<P><Admin /></P>} />

      <Route path="/cases/new" element={<P><NewCaseWizard /></P>} />
      <Route path="/cases/:caseId/scan" element={<P><ScanProgress /></P>} />

      <Route path="/cases/:caseId" element={<P><CaseLayout /></P>}>
        <Route index element={<Navigate to="overview" replace />} />
        <Route path="overview" element={<Overview />} />
        <Route path="graph" element={<GraphView />} />
        <Route path="conclusion" element={<Conclusion />} />
        <Route path="identity" element={<Identity />} />
        <Route path="behaviour" element={<Behaviour />} />
        <Route path="timeline" element={<Timeline />} />
        <Route path="map" element={<MapView />} />
        <Route path="evidence" element={<Evidence />} />
        <Route path="report" element={<Report />} />
        <Route path="audit" element={<AuditLog />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
