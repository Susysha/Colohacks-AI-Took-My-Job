import { Link, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import SenderPage from "./pages/SenderPage.jsx";
import ReceiverPage from "./pages/ReceiverPage.jsx";
import OfflineDecoderPage from "./pages/OfflineDecoderPage.jsx";

export default function App() {
  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Structured Inter-Hospital Handoff</p>
          <h1>MediRelay</h1>
        </div>
        <nav className="topnav">
          <Link to="/">Home</Link>
          <Link to="/sender">Doctor</Link>
          <Link to="/admin">Hospital Admin</Link>
          <Link to="/offline">Offline Decode</Link>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sender" element={<SenderPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/r/:shortCode" element={<ReceiverPage />} />
        <Route path="/offline" element={<OfflineDecoderPage />} />
      </Routes>
    </div>
  );
}
