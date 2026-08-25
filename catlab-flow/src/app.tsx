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
  { id: "dbk", position: { x: 0, y: 20 }, data: { label: "🧪 Kit4Kids DBK\nDBK-001 / -002 / -010" }, style: nodeStyle("#32c999") },
  { id: "floodboy", position: { x: 0, y: 150 }, data: { label: "🌊 FloodBoy\n44 stations" }, style: nodeStyle("#4f8cff") },
  { id: "ancs", position: { x: 0, y: 280 }, data: { label: "📱 ancs-display\nESP32-S3 · .167" }, style: nodeStyle("#ff6e9c") },
  { id: "remote", position: { x: 300, y: 90 }, data: { label: "☁️ mqtt.laris.co:1883\nfleet broker · ~109 GB/day" }, style: nodeStyle("#ff8a3d") },
  // Consumers connect DIRECTLY to the remote broker — verified from their own
  // options (broker: mqtt://mqtt.laris.co:1883), not through the local one.
  { id: "mqttboard", position: { x: 640, y: -40 }, data: { label: "📋 mqtt-board\n334 topics · 5 patterns" }, style: nodeStyle("#8b98a9") },
  { id: "watchboy", position: { x: 640, y: 60 }, data: { label: "👁️ watchboy\nSSE · liveness tiers" }, style: nodeStyle("#8b98a9") },
  { id: "writer", position: { x: 640, y: 175 }, data: { label: "🔧 mqtt-bridge-writer\nwrites bridge.conf" }, style: nodeStyle("#ffd089") },
  { id: "local", position: { x: 980, y: 175 }, data: { label: "🏠 core_mosquitto\nlocal broker · logins: []\n⚠ NO consumers yet" }, style: { ...nodeStyle("#7c4dff"), borderStyle: "dashed" } },
  // ANCS reaches HA over the ESPHome native API — never MQTT.
  { id: "ha", position: { x: 640, y: 300 }, data: { label: "🏡 Home Assistant\nentity registry" }, style: nodeStyle("#4f8cff") },
  { id: "mcp", position: { x: 980, y: 300 }, data: { label: "🤖 mcp_server\n/api/mcp/assist" }, style: nodeStyle("#32c999") },
  { id: "claude", position: { x: 1290, y: 300 }, data: { label: "💬 Claude Code\nGetLiveContext" }, style: nodeStyle("#32c999") },
  { id: "display", position: { x: 1290, y: 90 }, data: { label: "🖥️ Bigger display\nJC3248W535 — not built" }, style: { ...nodeStyle("#ff6e9c"), borderStyle: "dashed" } },
];

const lbl = { fill: "#8b98a9", fontSize: 10.5 };

const edges: Edge[] = [
  { id: "e1", source: "dbk", target: "remote", label: "DUSTBOY/DBK/#", style: { stroke: "#32c999" }, labelStyle: lbl },
  { id: "e2", source: "floodboy", target: "remote", label: "FloodBoy/#", style: { stroke: "#4f8cff" }, labelStyle: lbl },
  // These two bypass the bridge entirely — direct to the fleet broker.
  { id: "e3", source: "remote", target: "mqttboard", label: "direct", labelStyle: lbl },
  { id: "e4", source: "remote", target: "watchboy", label: "direct", labelStyle: lbl },
  { id: "e5", source: "remote", target: "writer", label: "bridged in", labelStyle: lbl },
  { id: "e6", source: "writer", target: "local", label: "/share/mosquitto/*.conf", labelStyle: lbl },
  // ancs-display does NOT use MQTT for HA — it is adopted over the native API.
  { id: "e7", source: "ancs", target: "ha", label: "ESPHome API :6053", style: { stroke: "#ff6e9c" }, labelStyle: lbl },
  { id: "e8", source: "ha", target: "mcp", label: "exposed entities", labelStyle: lbl },
  { id: "e9", source: "mcp", target: "claude", label: "Streamable HTTP", style: { stroke: "#32c999" }, labelStyle: lbl },
  { id: "e10", source: "mqttboard", target: "display", style: { strokeDasharray: "4 3", stroke: "#ff6e9c" }, label: "not built", labelStyle: { fill: "#ff6e9c", fontSize: 10.5 } },
];

function App() {
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#0d1117" }}>
      <div style={{ position: "absolute", top: 12, left: 16, zIndex: 5, color: "#f4f7fb", fontFamily: "Inter, sans-serif" }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>🔀 catlab-flow</div>
        <div style={{ fontSize: 11.5, color: "#8b98a9", maxWidth: 430 }}>
          Verified topology — every edge read from an add-on's own options or a real
          subscribe test. <span style={{ color: "#ffd089" }}>mqtt-board and watchboy
          connect straight to the fleet broker</span>, so the local broker currently
          has no consumers. Dashed = not built.
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
