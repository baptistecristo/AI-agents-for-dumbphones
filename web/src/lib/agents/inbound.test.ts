import { describe, expect, it } from "vitest";
import {
  VOICE_SPEED_DEFAULT,
  VOICE_SPEED_MAX,
  VOICE_SPEED_MIN,
  clampVoiceSpeed,
} from "./inbound";

// Ce qui est en jeu : une valeur hors de [0.7, 1.2] fait refuser la voix par
// ElevenLabs, donc rate l'appel entrant. Rien ne doit sortir de la plage.
describe("clampVoiceSpeed", () => {
  it("laisse passer les débits déjà valides", () => {
    for (const speed of [VOICE_SPEED_MIN, 0.85, 1.0, 1.1, VOICE_SPEED_MAX])
      expect(clampVoiceSpeed(speed)).toBe(speed);
  });

  it("ramène les valeurs hors plage sur les bornes", () => {
    for (const tooSlow of [0.69, 0.5, 0, -3]) expect(clampVoiceSpeed(tooSlow)).toBe(VOICE_SPEED_MIN);
    for (const tooFast of [1.21, 2, 9, 1000]) expect(clampVoiceSpeed(tooFast)).toBe(VOICE_SPEED_MAX);
  });

  it("accepte un numeric renvoyé en chaîne par la base ou par le formulaire", () => {
    expect(clampVoiceSpeed("0.85")).toBe(0.85);
    expect(clampVoiceSpeed("1")).toBe(1);
    expect(clampVoiceSpeed("9")).toBe(VOICE_SPEED_MAX);
  });

  it("retombe sur le débit normal pour tout ce qui n'est pas un nombre", () => {
    for (const junk of [null, undefined, "", "   ", "vite", NaN, Infinity, -Infinity, {}, []])
      expect(clampVoiceSpeed(junk)).toBe(VOICE_SPEED_DEFAULT);
  });
});
