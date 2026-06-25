import { Navigate, Route, Routes } from "react-router-dom";
import JoinPage from "./pages/JoinPage";
import RoomPage from "./pages/RoomPage";
import "./App.css";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/join" replace />} />
      <Route path="/join" element={<JoinPage />} />
      <Route path="/room/:roomName" element={<RoomPage />} />
      <Route path="*" element={<Navigate to="/join" replace />} />
    </Routes>
  );
}

export default App;
