import { describe, expect, it } from "vitest";
import { requiresVerification } from "./gate";

describe("requiresVerification", () => {
  it("protects the calendar, contacts, recalled notes, and send/spend actions", () => {
    for (const n of ["list_events", "create_event", "move_event", "find_contact", "recall", "send_sms", "place_call"])
      expect(requiresVerification(n)).toBe(true);
  });

  it("leaves reminders free: requiring a code to answer did_i_already costs more than it protects", () => {
    for (const n of ["list_reminders", "did_i_already", "mark_done"]) expect(requiresVerification(n)).toBe(false);
  });

  it("leaves light writes, generic queries, and the auth tools free", () => {
    for (const n of ["get_weather", "get_directions", "set_reminder", "remember", "request_code", "verify_code"])
      expect(requiresVerification(n)).toBe(false);
  });

  it("defaults unknown tools to free (they carry no data effect by themselves)", () => {
    expect(requiresVerification("totally_unknown_tool")).toBe(false);
  });
});
