import { describe, expect, it } from "vitest";
import { anthropicTools } from "./anthropic-tools";
import { agentTools } from "./tools";

describe("anthropicTools", () => {
  it("dérive chaque outil Vapi au format Anthropic (name/description/input_schema)", () => {
    const vapi = agentTools();
    const anthropic = anthropicTools();
    expect(anthropic).toHaveLength(vapi.length);
    anthropic.forEach((tool, i) => {
      expect(tool.name).toBe(vapi[i].function.name);
      expect(tool.description).toBe(vapi[i].function.description);
      expect(tool.input_schema).toEqual(vapi[i].function.parameters);
      expect(tool.input_schema).toHaveProperty("type", "object");
    });
  });

  it("expose les outils dont la boucle texte a besoin (code + une écriture)", () => {
    const names = anthropicTools().map((t) => t.name);
    expect(names).toContain("verify_code");
    expect(names).toContain("send_sms");
    expect(names).toContain("get_weather");
  });
});
