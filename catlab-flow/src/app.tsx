// catlab-flow — a React Flow diagram of catlab's REAL MQTT topology, as built
// and verified tonight. Static by design for v1: every node/edge here is a
// fact from a real config file or a real subscribe test, not live polling.
import { createRoot } from "react-dom/client";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Edge,
  type Node,
} from "reactflow";
import "reactflow/dist/style.css";

const nodeStyle = (accent: string) => ({
  background: "#111722",
  color: "#f4f7fb",
  border: `1px solid ${accent}`,
  borderRadius: 10,
  padding: "10px 14px",
  fontSize: 12.5,
  fontFamily: "Inter, sans-serif",
  minWidth: 150,
});

const nodes: Node[] = [
  { id: "dbk", position: { x: 0, y: 0 }, data: { label: "🧪 Kit4Kids DBK boards\nDBK-001 / -002 / -010" }, style: nodeStyle("#32c999") },
  { id: "floodboy", position: { x: 0, y: 140 }, data: { label: "🌊 FloodBoy fleet\n44 stations" }, style: nodeStyle("#4f8cff") },
  { id: "remote", position: { x: 320, y: 70 }, data: { label: "☁️ mqtt.laris.co:1883\nfleet broker" }, style: nodeStyle("#ff8a3d") },
  { id: "writer", position: { x: 620, y: 70 }, data: { label: "🔧 mqtt-bridge-writer\nrenders bridge.conf\n(bare # refused in code)" }, style: nodeStyle("#ffd089") },
  { id: "local", position: { x: 920, y: 70 }, data: { label: "🏠 core_mosquitto\ncatlab local broker" }, style: nodeStyle("#7c4dff") },
  { id: "mqttboard", position: { x: 1220, y: -20 }, data: { label: "📋 mqtt-board\n334 topics" }, style: nodeStyle("#8b98a9") },
  { id: "haentities", position: { x: 1220, y: 60 }, data: { label: "🔍 ha-entities\nHA state + registry" }, style: nodeStyle("#8b98a9") },
  { id: "mcp", position: { x: 1220, y: 150 }, data: { label: "🤖 mcp_server\n/api/mcp/assist" }, style: nodeStyle("#8b98a9") },
  { id: "display", position: { x: 1520, y: 70 }, data: { label: "🖥️ Bigger display\n(esp32-oracle / kru32-oracle\nJC3248W535 — not built yet)" }, style: { ...nodeStyle("#ff6e9c"), borderStyle: "dashed" } },
];

const edges: Edge[] = [
  { id: "e-dbk-remote", source: "dbk", target: "remote", label: "DUSTBOY/DBK/#", style: { stroke: "#32c999" }, labelStyle: { fill: "#8b98a9", fontSize: 10.5 } },
  { id: "e-fb-remote", source: "floodboy", target: "remote", label: "FloodBoy/#", style: { stroke: "#4f8cff" }, labelStyle: { fill: "#8b98a9", fontSize: 10.5 } },
  { id: "e-remote-writer", source: "remote", target: "writer", label: "reads bridge.conf", labelStyle: { fill: "#8b98a9", fontSize: 10.5 } },
  { id: "e-writer-local", source: "writer", target: "local", label: "writes /share/mosquitto/*.conf", labelStyle: { fill: "#8b98a9", fontSize: 10.5 } },
  { id: "e-local-board", source: "local", target: "mqttboard" },
  { id: "e-local-ha", source: "local", target: "haentities" },
  { id: "e-local-mcp", source: "local", target: "mcp", style: { strokeDasharray: "4 3" } },
  { id: "e-board-display", source: "mqttboard", target: "display", style: { strokeDasharray: "4 3", stroke: "#ff6e9c" }, label: "not yet built", labelStyle: { fill: "#ff6e9c", fontSize: 10.5 } },
];

function App() {
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0d1117" }}>
      <div style={{ position: "absolute", top: 12, left: 16, zIndex: 5, color: "#f4f7fb", fontFamily: "Inter, sans-serif" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>🔀 catlab-flow</div>
        <div style={{ fontSize: 11.5, color: "#8b98a9", maxWidth: 380 }}>
          The real MQTT topology built tonight — every node is a config file or a
          verified subscribe test, not live polling (v1). Dashed = not built yet.
        </div>
      </div>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1c2430" gap={18} />
        <Controls />
        <MiniMap
          style={{ background: "#111722" }}
          nodeColor={() => "#32c999"}
          maskColor="rgba(13,17,23,.75)"
        />
      </ReactFlow>
    </div>
  );
}

(window as any).__debug = { steps: [] as string[] };
const log = (s: string) => (window as any).__debug.steps.push(s);
window.addEventListener("error", (e) => log("window.onerror: " + e.message + " @ " + e.filename + ":" + e.lineno));

try {
  log("mount:start");
  const el = document.getElementById("root");
  if (!el) throw new Error("no #root element");
  createRoot(el).render(<App />);
  log("mount:ok");
} catch (err) {
  log("ERROR: " + String(err) + " " + ((err as Error)?.stack ?? ""));
}
