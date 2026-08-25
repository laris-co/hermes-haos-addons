// kit4kids-rules — a Blockly rule builder that compiles to the REAL ESPHome
// lambda syntax used in dustboy-kit/esp32c3-pm25-monitor's pms7003.yaml.
// Nothing here writes to a device; it teaches the shape of the actual firmware
// logic by generating text a student can paste into their own config.
import * as Blockly from "blockly/core";
import "blockly/blocks";               // registers controls_if, logic_compare, math_number, ...
import * as En from "blockly/msg/en";
import { javascriptGenerator, Order } from "blockly/javascript";

Blockly.setLocale(En as unknown as Record<string, string>);

// --- custom blocks: mirror what pms7003.yaml's on_value lambda actually does ---
Blockly.Blocks["pm25_reading"] = {
  init(this: Blockly.Block) {
    this.appendDummyInput().appendField("PM2.5 reading");
    this.setOutput(true, "Number");
    this.setColour(200);
    this.setTooltip("The live pm_2_5 sensor value (µg/m³)");
  },
};
javascriptGenerator.forBlock["pm25_reading"] = () => ["x", Order.ATOMIC];

Blockly.Blocks["set_led"] = {
  init(this: Blockly.Block) {
    this.appendDummyInput()
      .appendField("set LED")
      .appendField(
        new Blockly.FieldDropdown([
          ["green (GOOD)", "GOOD"],
          ["yellow (FAIR)", "FAIR"],
          ["red (BAD)", "BAD"],
        ]),
        "LEVEL",
      );
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(20);
    this.setTooltip("Sets air_quality_level and the status LED colour");
  },
};
const LED_RGB: Record<string, string> = {
  GOOD: "0.0f, 0.70f, 0.0f",
  FAIR: "0.70f, 0.70f, 0.0f",
  BAD: "0.86f, 0.0f, 0.0f",
};
javascriptGenerator.forBlock["set_led"] = (block: Blockly.Block) => {
  const level = block.getFieldValue("LEVEL") as string;
  return (
    `id(air_quality_level).publish_state("${level}");\n` +
    `led.set_rgb(${LED_RGB[level]});\n`
  );
};

const TOOLBOX = {
  kind: "flyoutToolbox",
  contents: [
    { kind: "block", type: "controls_if" },
    { kind: "block", type: "logic_compare" },
    { kind: "block", type: "math_number", fields: { NUM: 25 } },
    { kind: "block", type: "pm25_reading" },
    { kind: "block", type: "set_led" },
  ],
};

const STARTER = {
  blocks: {
    languageVersion: 0,
    blocks: [
      {
        type: "controls_if",
        x: 30,
        y: 30,
        inputs: {
          IF0: {
            block: {
              type: "logic_compare",
              fields: { OP: "LTE" },
              inputs: {
                A: { block: { type: "pm25_reading" } },
                B: { block: { type: "math_number", fields: { NUM: 25 } } },
              },
            },
          },
          DO0: { block: { type: "set_led", fields: { LEVEL: "GOOD" } } },
        },
      },
    ],
  },
};

function compile(ws: Blockly.WorkspaceSvg): string {
  const body = javascriptGenerator.workspaceToCode(ws);
  if (!body.trim()) return "// drag a block in to generate code";
  return (
    "// generated — paste inside pms7003.yaml's pm_2_5 on_value lambda\n" +
    body
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => "  " + l)
      .join("\n")
  );
}

function boot() {
  const div = document.getElementById("blockly-div") as HTMLDivElement;
  const out = document.getElementById("code-output") as HTMLPreElement;
  (window as any).__debug = { steps: [] as string[] };
  const log = (s: string) => (window as any).__debug.steps.push(s);
  try {
    log("inject:start");
    const ws = Blockly.inject(div, {
      toolbox: TOOLBOX,
      trashcan: true,
      zoom: { controls: true, wheel: true, startScale: 0.9 },
    });
    (window as any).__debug.ws = ws;
    log("inject:ok");
    Blockly.serialization.workspaces.load(STARTER, ws);
    log("load:ok blocks=" + ws.getAllBlocks(false).length);
    const render = () => {
      const code = compile(ws);
      out.textContent = code;
      log("render:ok len=" + code.length);
    };
    ws.addChangeListener((e: Blockly.Events.Abstract) => {
      if (e.isUiEvent) return;
      render();
    });
    render();
    window.addEventListener("resize", () => Blockly.svgResize(ws));
  } catch (err) {
    log("ERROR: " + String(err) + " " + ((err as Error)?.stack ?? ""));
    out.textContent = "// build error, see window.__debug";
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
