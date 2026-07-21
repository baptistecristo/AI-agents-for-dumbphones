/**
 * The filter's model, borrowed from the host.
 *
 * Stages 2 and 3 need one text completion each. Rather than asking the user for
 * a second API key, this uses the agent's own model through the runtime, which
 * means the notification filter costs whatever their agent already costs.
 */

import type { TextModel } from "../filter/classifier.js";
import type { GatewayLogger } from "../plugin/gateway.js";
import type { PluginRuntime } from "../plugin/runtime.js";

export interface CreateTextModelParams {
  runtime: PluginRuntime;
  model?: string;
  log?: GatewayLogger;
}

/**
 * Adapt `runtime.llm.complete` to the filter's `TextModel`.
 *
 * A model failure returns empty text, which every parser in the filter reads as
 * "no". That is a deliberate direction to fail in. Failing the other way would
 * turn an LLM outage into an SMS bill, and the rules stage still runs, so an
 * explicitly allow-listed sender is forwarded whether or not the model answers.
 * What goes quiet during an outage is only the ambiguous middle.
 */
export function createTextModel(params: CreateTextModelParams): TextModel {
  const { runtime, log } = params;

  return async (prompt: string): Promise<string> => {
    try {
      const result = await runtime.llm.complete({
        messages: [{ role: "user", content: prompt }],
        purpose: "sms-ovh notification filter",
        maxTokens: 256,
        temperature: 0,
        ...(params.model === undefined ? {} : { model: params.model }),
      });
      return result.text;
    } catch (error) {
      log?.warn?.(
        `notification filter model call failed, treating as no: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return "";
    }
  };
}
