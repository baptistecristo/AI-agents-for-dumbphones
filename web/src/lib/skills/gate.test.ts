import { describe, expect, it } from "vitest";
import { requiresVerification } from "./gate";

describe("requiresVerification", () => {
  it("protects reads of stored personal data and send/spend actions", () => {
    for (const n of [
      "list_events",
      "create_event",
      "move_event",
      "list_reminders",
      "did_i_already",
      "mark_done",
      "find_contact",
      "recall",
      "send_sms",
      "place_call",
    ])
      expect(requiresVerification(n)).toBe(true);
  });

  it("leaves light writes, generic queries, and the auth tools free", () => {
    for (const n of ["get_weather", "get_directions", "set_reminder", "remember", "request_code", "verify_code"])
      expect(requiresVerification(n)).toBe(false);
  });

  it("defaults unknown tools to free (they carry no data effect by themselves)", () => {
    expect(requiresVerification("totally_unknown_tool")).toBe(false);
  });
});
